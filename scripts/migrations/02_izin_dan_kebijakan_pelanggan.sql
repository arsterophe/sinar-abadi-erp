-- =============================================================================
-- MIGRASI BASIS DATA: IZIN, KEBIJAKAN RLS, & TRIGGER PROTEKSI TABEL PELANGGAN
-- CV SINAR ABADI NIAGA - SISTEM ERP DISTRIBUSI
-- Dokumen Acuan: PRD Bab 4, 7 & Aturan Bisnis BR-05, BR-12
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PENEGASAN PRIVILEGE TABEL POSTGRESQL (TABLE-LEVEL GRANTS)
-- -----------------------------------------------------------------------------
-- Memperbaiki error "42501 permission denied for table pelanggan" saat UPDATE/INSERT.
-- Hanya role 'authenticated' (pengguna login via Supabase Auth) yang diberi hak operasional.
-- Hak akses untuk 'anon' dan 'PUBLIC' secara ketat dicabut (REVOKE).
-- Hak DELETE TIDAK diberikan kepada peran apa pun (master data hanya dinonaktifkan via kolom aktif).
REVOKE ALL ON TABLE public.pelanggan FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pelanggan TO authenticated;

-- Pastikan izin penulisan audit log tersedia untuk pencatatan riwayat BR-12
REVOKE ALL ON TABLE public.audit_log FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.audit_log TO authenticated;


-- -----------------------------------------------------------------------------
-- 2. PENGAKTIFAN ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.pelanggan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 3. KEBIJAKAN RLS: SELECT (BACA DATA PELANGGAN)
-- -----------------------------------------------------------------------------
-- Hanya pengguna terautentikasi dengan akun aktif berperan 'manajer' atau 'penjualan'.
-- Staf Gudang DITOLAK mengakses data pelanggan (PRD Bab 7).
DROP POLICY IF EXISTS "pelanggan_select_policy" ON public.pelanggan;
CREATE POLICY "pelanggan_select_policy"
ON public.pelanggan
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.aktif = TRUE
      AND profiles.peran IN ('manajer', 'penjualan')
  )
);


-- -----------------------------------------------------------------------------
-- 4. KEBIJAKAN RLS: INSERT (TAMBAH PELANGGAN BARU - DIRECT INSERT FALLBACK)
-- -----------------------------------------------------------------------------
-- Menjaga keamanan saat direct INSERT dilakukan (misal fallback dari server action).
-- Hanya 'manajer' dan 'penjualan' aktif yang berhak mendaftarkan pelanggan baru.
-- BR-05: Staf Penjualan WAJIB batas_kredit = 0 (tunai).
-- Hanya Manajer yang berhak menetapkan batas_kredit > 0 saat pendaftaran.
DROP POLICY IF EXISTS "pelanggan_insert_policy" ON public.pelanggan;
CREATE POLICY "pelanggan_insert_policy"
ON public.pelanggan
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.aktif = TRUE
      AND (
        profiles.peran = 'manajer'
        OR (profiles.peran = 'penjualan' AND COALESCE(batas_kredit, 0) = 0)
      )
  )
);


-- -----------------------------------------------------------------------------
-- 5. KEBIJAKAN RLS: UPDATE (EDIT DATA PELANGGAN)
-- -----------------------------------------------------------------------------
-- Memastikan hanya peran 'manajer' dan 'penjualan' aktif yang dapat mengupdate data.
-- Gudang dan akun non-aktif ditolak secara mutlak pada lapis RLS.
DROP POLICY IF EXISTS "pelanggan_update_policy" ON public.pelanggan;
CREATE POLICY "pelanggan_update_policy"
ON public.pelanggan
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.aktif = TRUE
      AND profiles.peran IN ('manajer', 'penjualan')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.aktif = TRUE
      AND profiles.peran IN ('manajer', 'penjualan')
  )
);


-- -----------------------------------------------------------------------------
-- 6. TRIGGER KEAMANAN: PROTEKSI KOLOM & BATAS KREDIT (BR-05 & BR-12)
-- -----------------------------------------------------------------------------
-- Menggantikan subquery RLS yang rentan rekursi/inkonsistensi.
-- Trigger BEFORE UPDATE ini menjamin di tingkat database engine bahwa:
-- 1. Kolom 'kode' bersifat permanen dan tidak boleh diubah oleh peran apa pun.
-- 2. Metadata pembuatan ('dibuat_oleh' dan 'dibuat_pada') tidak boleh dimanipulasi.
-- 3. Jika kolom 'batas_kredit' berubah, pemanggil WAJIB akun aktif dengan peran 'manajer'.
-- 4. Jika staf penjualan (atau pihak mana pun selain manajer) mencoba mengubah batas_kredit,
--    baik via UI maupun via request langsung (direct API/curl), transaksi langsung dibatalkan (RAISE EXCEPTION).
CREATE OR REPLACE FUNCTION public.trg_proteksi_batas_kredit_pelanggan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_role TEXT;
  v_user_aktif BOOLEAN;
BEGIN
  -- A. Proteksi kolom kode: kode pelanggan permanen dan tidak dapat diubah
  IF NEW.kode IS DISTINCT FROM OLD.kode THEN
    RAISE EXCEPTION 'Akses ditolak: kode pelanggan bersifat permanen dan tidak dapat diubah.';
  END IF;

  -- B. Proteksi metadata pembuatan
  IF NEW.dibuat_oleh IS DISTINCT FROM OLD.dibuat_oleh OR NEW.dibuat_pada IS DISTINCT FROM OLD.dibuat_pada THEN
    RAISE EXCEPTION 'Akses ditolak: metadata pembuatan pelanggan (dibuat_oleh/dibuat_pada) tidak boleh dimanipulasi.';
  END IF;

  -- C. Proteksi batas kredit: hanya Manajer yang berwenang mengubah batas kredit (BR-05 & BR-12)
  IF NEW.batas_kredit IS DISTINCT FROM OLD.batas_kredit THEN
    SELECT peran, aktif INTO v_user_role, v_user_aktif
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_user_role IS NULL OR v_user_aktif IS NOT TRUE THEN
      RAISE EXCEPTION 'Akses ditolak: sesi tidak valid, akun tidak ditemukan, atau telah dinonaktifkan.';
    END IF;

    IF v_user_role <> 'manajer' THEN
      RAISE EXCEPTION 'Akses ditolak: hanya peran Manajer yang berwenang mengubah batas kredit pelanggan (BR-05 & BR-12).';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteksi_batas_kredit_pelanggan ON public.pelanggan;
CREATE TRIGGER trg_proteksi_batas_kredit_pelanggan
BEFORE UPDATE ON public.pelanggan
FOR EACH ROW
EXECUTE FUNCTION public.trg_proteksi_batas_kredit_pelanggan();

REVOKE ALL ON FUNCTION public.trg_proteksi_batas_kredit_pelanggan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_proteksi_batas_kredit_pelanggan() TO authenticated;


-- -----------------------------------------------------------------------------
-- 7. KEBIJAKAN RLS: AUDIT LOG (PENCATATAN BR-12)
-- -----------------------------------------------------------------------------
-- Kompatibel penuh dengan pencatatan audit penyesuaian stok, pelunasan, dan pembatalan pesanan.
DROP POLICY IF EXISTS "audit_log_insert_policy" ON public.audit_log;
CREATE POLICY "audit_log_insert_policy"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  pelaku_id = auth.uid()
);

DROP POLICY IF EXISTS "audit_log_select_policy" ON public.audit_log;
CREATE POLICY "audit_log_select_policy"
ON public.audit_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.aktif = TRUE
      AND profiles.peran = 'manajer'
  )
);


-- -----------------------------------------------------------------------------
-- 8. FUNGSI RPC TAMBAH PELANGGAN (SECURITY DEFINER DENGAN SET search_path = '')
-- -----------------------------------------------------------------------------
-- Menggunakan konfigurasi aman: SET search_path = '' dan seluruh objek dikualifikasi skemanya
-- untuk mencegah kerentanan search_path injection.
-- Memeriksa duplikasi kode, memvalidasi input wajib, dan mencatat pembuat secara otentik.
CREATE OR REPLACE FUNCTION public.tambah_pelanggan(
  p_kode TEXT,
  p_nama_toko TEXT,
  p_telepon TEXT,
  p_alamat TEXT,
  p_batas_kredit NUMERIC DEFAULT 0,
  p_termin_hari INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_user_aktif BOOLEAN;
  v_batas_kredit NUMERIC;
  v_clean_kode TEXT;
  v_clean_nama TEXT;
  v_clean_telepon TEXT;
  v_clean_alamat TEXT;
  v_new_id UUID;
BEGIN
  -- 1. Verifikasi identitas pengguna terautentikasi
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: sesi telah berakhir atau belum terautentikasi.';
  END IF;

  -- 2. Verifikasi profil dan wewenang peran
  SELECT peran, aktif INTO v_user_role, v_user_aktif
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_user_role IS NULL OR v_user_aktif IS NOT TRUE THEN
    RAISE EXCEPTION 'Akses ditolak: akun tidak ditemukan atau telah dinonaktifkan.';
  END IF;

  IF v_user_role NOT IN ('manajer', 'penjualan') THEN
    RAISE EXCEPTION 'Akses ditolak: peran "%" tidak memiliki wewenang mendaftarkan pelanggan.', v_user_role;
  END IF;

  -- 3. Sanitasi teks input
  v_clean_kode := pg_catalog.trim(pg_catalog.upper(COALESCE(p_kode, '')));
  v_clean_nama := pg_catalog.trim(COALESCE(p_nama_toko, ''));
  v_clean_telepon := pg_catalog.trim(COALESCE(p_telepon, ''));
  v_clean_alamat := pg_catalog.trim(COALESCE(p_alamat, ''));

  -- 4. Validasi input wajib
  IF pg_catalog.length(v_clean_kode) = 0 THEN
    RAISE EXCEPTION 'Kode pelanggan wajib diisi.';
  END IF;

  IF v_clean_kode !~ '^PLG-[A-Z0-9\-_]+$' THEN
    RAISE EXCEPTION 'Format kode pelanggan tidak valid. Gunakan format seperti PLG-011.';
  END IF;

  IF pg_catalog.length(v_clean_nama) = 0 THEN
    RAISE EXCEPTION 'Nama toko / pelanggan wajib diisi.';
  END IF;

  IF pg_catalog.length(v_clean_nama) > 255 THEN
    RAISE EXCEPTION 'Nama toko maksimal 255 karakter.';
  END IF;

  IF pg_catalog.length(v_clean_telepon) = 0 THEN
    RAISE EXCEPTION 'Nomor telepon wajib diisi.';
  END IF;

  IF pg_catalog.length(v_clean_telepon) < 8 OR pg_catalog.length(v_clean_telepon) > 20 THEN
    RAISE EXCEPTION 'Nomor telepon harus antara 8 hingga 20 karakter.';
  END IF;

  IF pg_catalog.length(v_clean_alamat) = 0 THEN
    RAISE EXCEPTION 'Alamat toko wajib diisi.';
  END IF;

  -- 5. Validasi pencegahan duplikasi kode pelanggan (tanpa mengasumsikan constraint semata)
  IF EXISTS (
    SELECT 1 FROM public.pelanggan
    WHERE pg_catalog.upper(kode) = v_clean_kode
  ) THEN
    RAISE EXCEPTION 'Kode pelanggan "%" sudah terdaftar di sistem. Silakan gunakan kode lain.', v_clean_kode;
  END IF;

  -- 6. Penegakan aturan bisnis batas kredit (BR-05)
  IF v_user_role = 'penjualan' THEN
    v_batas_kredit := 0;
  ELSE
    v_batas_kredit := pg_catalog.coalesce(p_batas_kredit, 0);
    IF v_batas_kredit < 0 THEN
      RAISE EXCEPTION 'Batas kredit tidak boleh bernilai negatif.';
    END IF;
  END IF;

  -- 7. Validasi termin pembayaran (BR-05: 0, 7, 14, 30 hari)
  IF p_termin_hari NOT IN (0, 7, 14, 30) THEN
    RAISE EXCEPTION 'Termin hari tidak valid: %. Pilihan sah: 0, 7, 14, 30 hari.', p_termin_hari;
  END IF;

  -- 8. Insert data pelanggan baru ke public.pelanggan dengan pembuat otentik dari auth.uid()
  INSERT INTO public.pelanggan (
    kode,
    nama_toko,
    telepon,
    alamat,
    batas_kredit,
    termin_hari,
    aktif,
    dibuat_oleh,
    dibuat_pada
  ) VALUES (
    v_clean_kode,
    v_clean_nama,
    v_clean_telepon,
    v_clean_alamat,
    v_batas_kredit,
    p_termin_hari,
    TRUE,
    v_user_id,
    pg_catalog.now()
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Cabut akses eksekusi dari PUBLIC dan anon
REVOKE ALL ON FUNCTION public.tambah_pelanggan(TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER) FROM PUBLIC, anon;

-- Izinkan eksekusi hanya untuk role authenticated
GRANT EXECUTE ON FUNCTION public.tambah_pelanggan(TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER) TO authenticated;
