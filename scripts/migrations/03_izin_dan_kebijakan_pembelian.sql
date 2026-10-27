-- =============================================================================
-- MIGRASI BASIS DATA 03 (FINAL AUDIT - ARSITEKTUR KEAMANAN ENTERPRISE):
-- IZIN, KEBIJAKAN RLS, RESTRIKSI KOLOM, RPC MUTASI STATUS, AUDIT TRIGGER, & VIEW
-- CV SINAR ABADI NIAGA - SISTEM ERP DISTRIBUSI
-- Dokumen Acuan: PRD Bab 3, 4 (BR-09, BR-10, BR-11, BR-12), Bab 6.2 & 7
-- =============================================================================

-- FAKTA METADATA AKTUAL DATABASE SAAT INI:
-- 1. Role 'authenticated' SUDAH memiliki SELECT pada: audit_log, mutasi_stok, pemasok.
-- 2. Role 'authenticated' BELUM memiliki SELECT, INSERT, atau UPDATE pada tabel: pembelian.
-- 3. Policy SELECT sudah ada di database:
--    - pembelian: "pembelian_read_warehouse_manager"
--    - pemasok:   "pemasok_read_warehouse_manager"
--    - audit_log: "audit_read_manager"
-- 4. mutasi_stok & barang memiliki policy SELECT permissive yang sudah berjalan.
-- KETENTUAN AUDIT: JANGAN menghapus, menimpa, atau menduplikasi policy yang sudah ada!

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. HAK AKSES TABEL PEMBELIAN & MUTASI STOK
-- -----------------------------------------------------------------------------
-- Cabut seluruh akses default dari PUBLIC, anon, dan authenticated
REVOKE ALL ON TABLE public.pembelian FROM PUBLIC, anon, authenticated;

-- Berikan HANYA izin INSERT (pengajuan PO baru) ke role authenticated
GRANT INSERT ON TABLE public.pembelian TO authenticated;

-- PENEGAKAN KEAMANAN MUTLAK (CEGAH BYPASS STATUS & MANIPULASI DATA VIA REST API):
-- Cabut seluruh izin UPDATE, DELETE, TRUNCATE, TRIGGER, dan REFERENCES langsung
-- pada tabel pembelian dari authenticated, anon, dan PUBLIC!
-- Dengan ini, TIDAK ADA pengguna (baik staf gudang maupun manajer) yang dapat
-- mengirimkan request langsung PATCH/PUT/DELETE ke REST API PostgREST (/rest/v1/pembelian)
-- atau melakukan TRUNCATE / manipulasi trigger tabel langsung.
-- Seluruh mutasi status (persetujuan, penolakan, pembatalan, dan penerimaan fisik)
-- WAJIB dan HANYA DAPAT dieksekusi melalui fungsi RPC SECURITY DEFINER khusus.
REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.pembelian FROM authenticated, anon, PUBLIC;

-- PROTEKSI BR-12 PADA LEVEL TABEL POSTGRESQL (COLUMN-LEVEL PRIVILEGE):
-- Kolom 'harga_beli_satuan' DILARANG di-grant langsung ke role 'authenticated'!
-- Permintaan REST API langsung: GET /rest/v1/pembelian?select=nomor,harga_beli_satuan
-- akan ditolak seketika oleh PostgreSQL ENGINE dengan error:
-- "42501 permission denied for column harga_beli_satuan of relation pembelian"
-- Manajer membaca harga_beli_satuan melalui Security Barrier View public.v_pembelian.
GRANT SELECT (
  id,
  nomor,
  pemasok_id,
  barang_id,
  jumlah_dipesan,
  jumlah_diterima,
  status,
  alasan_tolak,
  diajukan_oleh,
  diajukan_pada,
  diputuskan_oleh,
  diputuskan_pada,
  diterima_oleh,
  diterima_pada
) ON TABLE public.pembelian TO authenticated;

-- Pastikan RLS aktif pada tabel pembelian
ALTER TABLE public.pembelian ENABLE ROW LEVEL SECURITY;

-- Proteksi tabel mutasi_stok: pastikan INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER langsung dilarang
REVOKE ALL ON TABLE public.mutasi_stok FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.mutasi_stok FROM authenticated, anon, PUBLIC;


-- -----------------------------------------------------------------------------
-- 2. SEQUENCE & CONSTRAINT UNIK NOMOR PO (CONCURRENCY-SAFE)
-- -----------------------------------------------------------------------------
-- Hindari pembuatan index unik baru yang redundan jika constraint unik (seperti pembelian_nomor_key)
-- atau index unik pada kolom nomor sudah terpasang di database
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'pembelian'
      AND con.contype = 'u'
      AND ARRAY['nomor'::name] <@ (
        SELECT pg_catalog.array_agg(att.attname::name)
        FROM pg_attribute att
        WHERE att.attrelid = con.conrelid
          AND att.attnum = ANY(con.conkey)
      )
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_index idx
    JOIN pg_class rel ON rel.oid = idx.indrelid
    JOIN pg_class i ON i.oid = idx.indexrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'pembelian'
      AND idx.indisunique = true
      AND (
        i.relname IN ('pembelian_nomor_key', 'pembelian_nomor_unik_idx')
        OR ARRAY['nomor'::name] <@ (
          SELECT pg_catalog.array_agg(att.attname::name)
          FROM pg_attribute att
          WHERE att.attrelid = rel.oid
            AND att.attnum = ANY(pg_catalog.string_to_array(idx.indkey::text, ' ')::int[])
        )
      )
  ) THEN
    CREATE UNIQUE INDEX pembelian_nomor_unik_idx ON public.pembelian (nomor);
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.seq_pembelian_nomor;

-- Cabut akses langsung sequence dari role client:
-- Alokasi nomor PO HANYA boleh dieksekusi melalui RPC / trigger SECURITY DEFINER!
REVOKE ALL ON SEQUENCE public.seq_pembelian_nomor FROM PUBLIC, anon, authenticated;

-- Sinkronkan sequence dengan nomor PO terbesar aktual dari tabel pembelian (bukan hanya data seed)
-- Memeriksa last_value DAN is_called langsung dari relasi sequence (bukan pg_sequences.last_value semata).
-- Jika ada PO aktual (misal PO-00019 -> v_max_po = 19), sequence diset valuenya menjadi 19 (is_called = true -> nextval 20).
-- Jika sequence sudah pernah berjalan lebih tinggi (misal 25), nilainya dipertahankan (tidak mundur).
DO $$
DECLARE
  v_max_po BIGINT;
  v_seq_last BIGINT;
  v_seq_called BOOLEAN;
BEGIN
  -- 1. Hitung nomor PO tertinggi yang benar-benar ada saat ini di tabel pembelian
  -- Hanya ekstrak nomor dari format standar resmi (PO-XXXXX) untuk mencegah cast error dan overflow

SELECT COALESCE(
  MAX(
    NULLIF(
      (pg_catalog.substring(nomor, '^PO-([0-9]{1,12})$')),
      ''
    )::bigint
  ),
  0
)
INTO v_max_po
FROM public.pembelian;


  -- 2. Baca status aktual sequence langsung dari relasi sequence
  SELECT last_value, is_called
  INTO v_seq_last, v_seq_called
  FROM public.seq_pembelian_nomor;

  -- 3. Selaraskan: Sequence harus >= nomor PO tertinggi aktual (tidak pernah dimundurkan)
  IF v_max_po > 0 THEN
    -- Jika sequence belum pernah dipanggil, ATAU nilainya masih lebih kecil/sama dengan data aktual
    IF NOT v_seq_called OR v_seq_last <= v_max_po THEN
      PERFORM setval('public.seq_pembelian_nomor', v_max_po, true);
    END IF;
  ELSE
    -- Jika tabel pembelian kosong dan sequence belum pernah dipanggil
    IF NOT v_seq_called THEN
      PERFORM setval('public.seq_pembelian_nomor', 1, false);
    END IF;
  END IF;
END $$;

-- Pastikan tidak ada default implisit yang memanggil sequence secara sepihak atau melewati alur registrasi
ALTER TABLE public.pembelian ALTER COLUMN nomor DROP DEFAULT;

-- TABEL INTERNAL REGISTRASI ALOKASI NOMOR PO:
-- Menjamin nomor PO yang dikirim oleh client benar-benar telah dialokasikan oleh sequence
-- dan mencegah pengguna menyisipkan nomor loncat/arbitrer via request langsung.
CREATE TABLE IF NOT EXISTS public.alokasi_nomor_po (
  nomor TEXT PRIMARY KEY,
  dialokasikan_oleh UUID NOT NULL REFERENCES auth.users(id),
  dialokasikan_pada TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  kedaluwarsa_pada TIMESTAMPTZ NOT NULL DEFAULT (pg_catalog.now() + INTERVAL '2 hours'),
  digunakan BOOLEAN NOT NULL DEFAULT FALSE
);

REVOKE ALL ON TABLE public.alokasi_nomor_po FROM PUBLIC, anon, authenticated;

-- RPC helper untuk mengalokasikan nomor PO atomik berikutnya
-- Dilindungi validasi autentikasi dan peran (hanya 'manajer' dan 'gudang' yang berhak memanggil)
CREATE OR REPLACE FUNCTION public.ambil_nomor_po_berikutnya()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_user_aktif BOOLEAN;
  v_nomor TEXT;
  v_seq_val BIGINT;
  v_attempt INTEGER := 0;
BEGIN
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Sesi tidak terautentikasi atau telah berakhir.';
  END IF;

  SELECT peran, aktif INTO v_user_role, v_user_aktif
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_user_role IS NULL OR v_user_aktif IS NOT TRUE THEN
    RAISE EXCEPTION 'Akses ditolak: Akun pengguna tidak ditemukan atau berstatus nonaktif.';
  END IF;

  IF v_user_role NOT IN ('manajer', 'gudang') THEN
    RAISE EXCEPTION 'Akses ditolak: Peran "%" tidak berwenang mengalokasikan nomor PO (PRD Bab 7).', v_user_role;
  END IF;

  -- Alokasikan nomor berikutnya dari sequence secara atomik & cegah collision
  -- Memeriksa eksistensi pada pembelian dan alokasi_nomor_po tanpa memandang status digunakan.
  -- Menangani potensi bentrok unique saat konkurensi dengan retry terbatas dan aman.
  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 100 THEN
      RAISE EXCEPTION 'Gagal mengalokasikan nomor PO: Batas percobaan alokasi terlampaui karena bentrok konkurensi.';
    END IF;

    -- Ambil nomor berikutnya dari sequence (strictly monotonic, tidak pernah mundur)
    v_seq_val := pg_catalog.nextval('public.seq_pembelian_nomor');
    -- Format PO-XXXXX dengan perlindungan terhadap pemotongan karakter bila digit >= 100.000
    v_nomor := 'PO-' || pg_catalog.lpad(v_seq_val::text, pg_catalog.greatest(5, pg_catalog.length(v_seq_val::text)), '0');

    -- Lewati jika nomor sudah pernah tercatat di pembelian atau alokasi_nomor_po (tanpa memandang status digunakan)
    IF EXISTS (SELECT 1 FROM public.pembelian WHERE nomor = v_nomor)
       OR EXISTS (SELECT 1 FROM public.alokasi_nomor_po WHERE nomor = v_nomor) THEN
      CONTINUE;
    END IF;

    -- Coba daftarkan alokasi ke alokasi_nomor_po; tangani unique_violation saat transaksi bersamaan
    BEGIN
      INSERT INTO public.alokasi_nomor_po (
        nomor, dialokasikan_oleh, dialokasikan_pada, kedaluwarsa_pada, digunakan
      ) VALUES (
        v_nomor, v_user_id, pg_catalog.now(), pg_catalog.now() + INTERVAL '2 hours', FALSE
      );

      -- Alokasi berhasil terdaftar untuk akun ini, keluar dari loop
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        -- Bentrok konkurensi terdeteksi; coba nomor sequence berikutnya
        CONTINUE;
    END;
  END LOOP;

  RETURN v_nomor;
END;
$$;

REVOKE ALL ON FUNCTION public.ambil_nomor_po_berikutnya() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ambil_nomor_po_berikutnya() TO authenticated;


-- -----------------------------------------------------------------------------
-- 3. KEBIJAKAN RLS TABEL PEMBELIAN
-- -----------------------------------------------------------------------------
-- 3a. INSERT POLICY: Pengajuan PO baru oleh Staf Gudang atau Manajer (BR-09 & BR-12)
DROP POLICY IF EXISTS "pembelian_insert_policy" ON public.pembelian;
CREATE POLICY "pembelian_insert_policy"
ON public.pembelian
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.aktif = TRUE
      AND p.peran IN ('manajer', 'gudang')
      AND (p.peran = 'manajer' OR harga_beli_satuan IS NULL)
  )
  AND status = 'diajukan'
  AND diajukan_oleh = (SELECT auth.uid())
  AND jumlah_dipesan >= 1 AND jumlah_dipesan <= 10000
  AND jumlah_diterima IS NULL
  AND diputuskan_oleh IS NULL
  AND diputuskan_pada IS NULL
  AND diterima_oleh IS NULL
  AND diterima_pada IS NULL
  AND alasan_tolak IS NULL
);

-- 3b. Hapus policy UPDATE langsung (karena UPDATE langsung dicabut demi integritas RPC)
DROP POLICY IF EXISTS "pembelian_update_policy" ON public.pembelian;


-- -----------------------------------------------------------------------------
-- 4. TRIGGER PENEGAK INTEGRITAS PEMBELIAN (BEFORE INSERT OR UPDATE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_proteksi_integritas_pembelian()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_user_aktif BOOLEAN;
  v_klaim_nomor TEXT;
BEGIN
  -- A. VALIDASI & SANITASI SAAT INSERT
  IF TG_OP = 'INSERT' THEN
    v_user_id := (SELECT auth.uid());
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Akses ditolak: Sesi tidak terautentikasi atau telah berakhir.';
    END IF;

    SELECT peran, aktif INTO v_user_role, v_user_aktif
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL OR v_user_aktif IS NOT TRUE THEN
      RAISE EXCEPTION 'Akses ditolak: Akun pengguna tidak ditemukan atau berstatus nonaktif.';
    END IF;

    IF v_user_role NOT IN ('manajer', 'gudang') THEN
      RAISE EXCEPTION 'Akses ditolak: Hanya Staf Gudang dan Manajer yang berwenang mengajukan pembelian barang (BR-09).';
    END IF;

    IF NEW.status IS DISTINCT FROM 'diajukan' THEN
      RAISE EXCEPTION 'Pelanggaran integritas: Pengajuan PO baru wajib berstatus "diajukan".';
    END IF;

    NEW.diajukan_oleh := v_user_id;
    IF NEW.diajukan_pada IS NULL THEN
      NEW.diajukan_pada := pg_catalog.now();
    END IF;

    IF NEW.diputuskan_oleh IS NOT NULL OR NEW.diputuskan_pada IS NOT NULL OR NEW.alasan_tolak IS NOT NULL THEN
      RAISE EXCEPTION 'Pelanggaran integritas: Data keputusan persetujuan/penolakan tidak boleh diisi saat pembuatan PO.';
    END IF;

    IF NEW.diterima_oleh IS NOT NULL OR NEW.diterima_pada IS NOT NULL OR NEW.jumlah_diterima IS NOT NULL THEN
      RAISE EXCEPTION 'Pelanggaran integritas: Data penerimaan barang fisik tidak boleh diisi saat pembuatan PO.';
    END IF;

    IF v_user_role <> 'manajer' AND NEW.harga_beli_satuan IS NOT NULL THEN
      RAISE EXCEPTION 'Akses ditolak (BR-12): Staf Gudang tidak berwenang menetapkan harga beli satuan.';
    END IF;

    IF NEW.jumlah_dipesan IS NULL OR NEW.jumlah_dipesan < 1 OR NEW.jumlah_dipesan > 10000 THEN
      RAISE EXCEPTION 'Kuantitas pesanan harus antara 1 sampai 10.000 unit (BR-09).';
    END IF;

    -- Validasi nomor PO: Wajib dialokasikan terlebih dahulu melalui jalur resmi ambil_nomor_po_berikutnya()
    IF NEW.nomor IS NULL OR pg_catalog.length(pg_catalog.trim(NEW.nomor)) = 0 THEN
      RAISE EXCEPTION 'Pelanggaran integritas: Nomor PO wajib dialokasikan terlebih dahulu melalui alur resmi sistem (ambil_nomor_po_berikutnya).';
    END IF;

    -- Klaim alokasi nomor PO secara kondisional dan atomik (mencegah race condition antar-transaksi)
    UPDATE public.alokasi_nomor_po
    SET digunakan = TRUE
    WHERE nomor = NEW.nomor
      AND dialokasikan_oleh = v_user_id
      AND digunakan = FALSE
      AND kedaluwarsa_pada >= pg_catalog.now()
    RETURNING nomor INTO v_klaim_nomor;

    IF v_klaim_nomor IS NULL THEN
      RAISE EXCEPTION 'Pelanggaran integritas: Nomor PO "%" tidak valid, telah kedaluwarsa, telah digunakan, atau belum dialokasikan secara sah untuk akun Anda.', NEW.nomor;
    END IF;

    RETURN NEW;
  END IF;

  -- B. VALIDASI SAAT UPDATE (DIPANGGIL DARI DALAM RPC SECURITY DEFINER)
  IF TG_OP = 'UPDATE' THEN
    -- 1. Proteksi Kolom Imutabel (Gunakan IS DISTINCT FROM agar aman terhadap NULL)
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Pelanggaran integritas: ID transaksi pembelian bersifat permanen.';
    END IF;

    IF NEW.nomor IS DISTINCT FROM OLD.nomor THEN
      RAISE EXCEPTION 'Pelanggaran integritas: Nomor PO (%) tidak boleh diubah.', OLD.nomor;
    END IF;

    IF NEW.barang_id IS DISTINCT FROM OLD.barang_id THEN
      RAISE EXCEPTION 'Pelanggaran integritas: Barang yang dipesan tidak boleh diubah.';
    END IF;

    IF NEW.pemasok_id IS DISTINCT FROM OLD.pemasok_id THEN
      RAISE EXCEPTION 'Pelanggaran integritas: Mitra pemasok tidak boleh diubah.';
    END IF;

    IF NEW.diajukan_oleh IS DISTINCT FROM OLD.diajukan_oleh OR NEW.diajukan_pada IS DISTINCT FROM OLD.diajukan_pada THEN
      RAISE EXCEPTION 'Pelanggaran integritas: Data dan waktu pengajuan tidak boleh dimanipulasi.';
    END IF;

    IF NEW.jumlah_dipesan IS DISTINCT FROM OLD.jumlah_dipesan THEN
      RAISE EXCEPTION 'Pelanggaran integritas: Kuantitas dipesan (%) bersifat tetap dan tidak boleh diubah.', OLD.jumlah_dipesan;
    END IF;

    -- 2. Status final membekukan seluruh modifikasi pada baris pembelian
    IF OLD.status IN ('diterima', 'ditolak', 'dibatalkan') THEN
      RAISE EXCEPTION 'Pelanggaran alur status: Transaksi PO % saat ini berstatus "%" (status final) dan tidak dapat diubah lagi.',
        OLD.nomor, OLD.status;
    END IF;

    -- 3. Aturan Transisi Status Eksplisit (State Machine)
    IF OLD.status = 'diajukan' THEN
      IF NEW.status = 'disetujui' THEN
        -- Persetujuan: harga beli satuan wajib diisi > 0, keputusan wajib diisi
        IF NEW.harga_beli_satuan IS NULL OR NEW.harga_beli_satuan <= 0 THEN
          RAISE EXCEPTION 'Pelanggaran integritas: Persetujuan PO wajib menyertakan harga beli satuan > 0.';
        END IF;
        IF NEW.diputuskan_oleh IS NULL OR NEW.diputuskan_pada IS NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: Persetujuan PO wajib mencatat pembuat keputusan.';
        END IF;
        IF NEW.alasan_tolak IS NOT NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: PO yang disetujui tidak boleh memiliki alasan penolakan.';
        END IF;
        IF NEW.jumlah_diterima IS NOT NULL OR NEW.diterima_oleh IS NOT NULL OR NEW.diterima_pada IS NOT NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: Data penerimaan barang tidak boleh diisi saat persetujuan.';
        END IF;
      ELSIF NEW.status = 'ditolak' THEN
        -- Penolakan: alasan tolak minimal 10 karakter, keputusan wajib diisi
        IF NEW.alasan_tolak IS NULL OR pg_catalog.length(pg_catalog.trim(NEW.alasan_tolak)) < 10 THEN
          RAISE EXCEPTION 'Pelanggaran integritas: Penolakan PO wajib menyertakan alasan tolak minimal 10 karakter.';
        END IF;
        IF NEW.diputuskan_oleh IS NULL OR NEW.diputuskan_pada IS NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: Penolakan PO wajib mencatat pembuat keputusan.';
        END IF;
        IF NEW.harga_beli_satuan IS NOT NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: PO yang ditolak tidak boleh memiliki harga beli satuan.';
        END IF;
        IF NEW.jumlah_diterima IS NOT NULL OR NEW.diterima_oleh IS NOT NULL OR NEW.diterima_pada IS NOT NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: Data penerimaan barang tidak boleh diisi saat penolakan.';
        END IF;
      ELSIF NEW.status = 'dibatalkan' THEN
        -- Pembatalan saat diajukan: keputusan wajib diisi
        IF NEW.diputuskan_oleh IS NULL OR NEW.diputuskan_pada IS NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: Pembatalan PO wajib mencatat pelaku pembatalan.';
        END IF;
        IF NEW.harga_beli_satuan IS NOT NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: PO yang dibatalkan tidak boleh memiliki harga beli satuan.';
        END IF;
        IF NEW.alasan_tolak IS NOT NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: PO yang dibatalkan tidak boleh memiliki alasan penolakan.';
        END IF;
        IF NEW.jumlah_diterima IS NOT NULL OR NEW.diterima_oleh IS NOT NULL OR NEW.diterima_pada IS NOT NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: Data penerimaan barang tidak boleh diisi saat pembatalan.';
        END IF;
      ELSE
        RAISE EXCEPTION 'Pelanggaran alur status: Transisi dari "%" ke "%" tidak diizinkan oleh sistem bisnis.',
          OLD.status, NEW.status;
      END IF;

    ELSIF OLD.status = 'disetujui' THEN
      IF NEW.status = 'diterima' THEN
        -- Penerimaan fisik: jumlah diterima 1..jumlah_dipesan, pencatat penerimaan wajib diisi
        IF NEW.jumlah_diterima IS NULL OR NEW.jumlah_diterima < 1 OR NEW.jumlah_diterima > OLD.jumlah_dipesan THEN
          RAISE EXCEPTION 'Pelanggaran integritas: Jumlah barang diterima harus antara 1 sampai % unit.', OLD.jumlah_dipesan;
        END IF;
        IF NEW.diterima_oleh IS NULL OR NEW.diterima_pada IS NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: Penerimaan barang wajib mencatat petugas penerima.';
        END IF;
        -- Harga beli satuan dan keputusan tidak boleh diubah saat penerimaan fisik
        IF NEW.harga_beli_satuan IS DISTINCT FROM OLD.harga_beli_satuan THEN
          RAISE EXCEPTION 'Pelanggaran integritas: Harga beli satuan tidak boleh diubah saat penerimaan fisik barang.';
        END IF;
        IF NEW.diputuskan_oleh IS DISTINCT FROM OLD.diputuskan_oleh OR NEW.diputuskan_pada IS DISTINCT FROM OLD.diputuskan_pada THEN
          RAISE EXCEPTION 'Pelanggaran integritas: Keputusan persetujuan tidak boleh diubah saat penerimaan fisik barang.';
        END IF;
        IF NEW.alasan_tolak IS NOT NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: PO yang diterima tidak boleh memiliki alasan penolakan.';
        END IF;
      ELSIF NEW.status = 'dibatalkan' THEN
        -- Pembatalan saat disetujui: keputusan wajib diisi, fisik belum diterima
        IF NEW.diputuskan_oleh IS NULL OR NEW.diputuskan_pada IS NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: Pembatalan PO wajib mencatat pembuat keputusan.';
        END IF;
        IF NEW.harga_beli_satuan IS DISTINCT FROM OLD.harga_beli_satuan THEN
          RAISE EXCEPTION 'Pelanggaran integritas: Nilai harga beli satuan saat persetujuan tidak boleh dimanipulasi saat pembatalan.';
        END IF;
        IF NEW.jumlah_diterima IS NOT NULL OR NEW.diterima_oleh IS NOT NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: PO yang sudah menerima barang fisik tidak dapat dibatalkan.';
        END IF;
        IF NEW.alasan_tolak IS NOT NULL THEN
          RAISE EXCEPTION 'Pelanggaran integritas: PO yang dibatalkan tidak boleh memiliki alasan penolakan.';
        END IF;
      ELSE
        RAISE EXCEPTION 'Pelanggaran alur status: Transaksi PO yang telah disetujui hanya dapat beralih ke "diterima" atau "dibatalkan".';
      END IF;

    ELSE
      RAISE EXCEPTION 'Pelanggaran alur status: Status "%" tidak valid.', OLD.status;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteksi_integritas_pembelian ON public.pembelian;
CREATE TRIGGER trg_proteksi_integritas_pembelian
BEFORE INSERT OR UPDATE ON public.pembelian
FOR EACH ROW
EXECUTE FUNCTION public.fn_proteksi_integritas_pembelian();

REVOKE ALL ON FUNCTION public.fn_proteksi_integritas_pembelian() FROM PUBLIC, anon;

-- TRIGGER AUDIT OTOMATIS SAAT PEMBUATAN PO (AFTER INSERT)
-- Menjamin pencatatan jejak audit log tanpa bergantung pada hak akses client-side
CREATE OR REPLACE FUNCTION public.fn_audit_tambah_pembelian()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_log (
    pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru, dibuat_pada
  ) VALUES (
    NEW.diajukan_oleh,
    'tambah_pembelian',
    'pembelian',
    NEW.id,
    NULL,
    pg_catalog.jsonb_build_object(
      'nomor', NEW.nomor,
      'pemasok_id', NEW.pemasok_id,
      'barang_id', NEW.barang_id,
      'jumlah_dipesan', NEW.jumlah_dipesan,
      'status', NEW.status
    ),
    NEW.diajukan_pada
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_tambah_pembelian ON public.pembelian;
CREATE TRIGGER trg_audit_tambah_pembelian
AFTER INSERT ON public.pembelian
FOR EACH ROW
EXECUTE FUNCTION public.fn_audit_tambah_pembelian();

REVOKE ALL ON FUNCTION public.fn_audit_tambah_pembelian() FROM PUBLIC, anon;


-- -----------------------------------------------------------------------------
-- 5. RPC SECURITY DEFINER: STRATEGI TRANSISI RETURN TYPE & PENGENDALIAN SIKLUS HIDUP
-- Seluruh mutasi status ditangani secara atomik dengan row-level lock (FOR UPDATE).
-- -----------------------------------------------------------------------------

-- STRATEGI TRANSISI RETURN TYPE AMAN:
-- Di PostgreSQL, CREATE OR REPLACE FUNCTION akan gagal jika fungsi lama memiliki
-- return type yang berbeda (misalnya 'void' menjadi 'jsonb').
-- Blok ini memeriksa apakah fungsi sudah ada dengan argumen persis, memeriksa dependensinya
-- di pg_depend, dan hanya men-drop fungsi lama jika return type-nya bukan 'jsonb' dan
-- tidak ada objek yang bergantung padanya.
DO $$
DECLARE
  v_func_rec RECORD;
  v_dep_desc TEXT;
BEGIN
  -- Validasi & pengendalian transisi fungsi RPC inti
  FOR v_func_rec IN
    SELECT p.oid, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS id_args,
           pg_catalog.format_type(p.prorettype, NULL) AS ret_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'setujui_pembelian',
        'tolak_pembelian',
        'batalkan_pembelian',
        'proses_penerimaan_barang_pembelian',
        'ambil_nomor_po_berikutnya'
      )
  LOOP
    -- 1. Deteksi overload asing atau signature tak terduga yang dapat menyebabkan celah atau ambiguitas
    IF NOT (
      (v_func_rec.proname = 'setujui_pembelian' AND v_func_rec.id_args IN ('p_pembelian_id uuid, p_harga_beli_satuan numeric', 'uuid, numeric')) OR
      (v_func_rec.proname = 'tolak_pembelian' AND v_func_rec.id_args IN ('p_pembelian_id uuid, p_alasan_tolak text', 'uuid, text')) OR
      (v_func_rec.proname = 'batalkan_pembelian' AND v_func_rec.id_args IN ('p_pembelian_id uuid', 'uuid')) OR
      (v_func_rec.proname = 'proses_penerimaan_barang_pembelian' AND v_func_rec.id_args IN ('p_pembelian_id uuid, p_jumlah_diterima integer', 'uuid, integer')) OR
      (v_func_rec.proname = 'ambil_nomor_po_berikutnya' AND v_func_rec.id_args = '')
    ) THEN
      RAISE EXCEPTION 'Migrasi dihentikan: Ditemukan overload fungsi public.% dengan argumen tak didukung: (%). Harap tinjau signature lama sebelum migrasi.',
        v_func_rec.proname, v_func_rec.id_args;
    END IF;

    -- 2. Jika return type lama berbeda dari target (misal void -> jsonb), periksa dependensi sebelum DROP
    IF (v_func_rec.proname = 'ambil_nomor_po_berikutnya' AND v_func_rec.ret_type <> 'text')
       OR (v_func_rec.proname <> 'ambil_nomor_po_berikutnya' AND v_func_rec.ret_type <> 'jsonb') THEN

      -- Cari objek yang bergantung pada fungsi ini (resolusi nama view melalui pg_rewrite.ev_class)
      SELECT pg_catalog.string_agg(
               DISTINCT coalesce(c_view.relname, c.relname, p2.proname, dep.objid::text), ', '
             )
      INTO v_dep_desc
      FROM pg_depend dep
      LEFT JOIN pg_rewrite rw ON rw.oid = dep.objid
      LEFT JOIN pg_class c_view ON c_view.oid = rw.ev_class
      LEFT JOIN pg_class c ON c.oid = dep.objid
      LEFT JOIN pg_proc p2 ON p2.oid = dep.objid
      WHERE dep.refobjid = v_func_rec.oid
        AND dep.deptype NOT IN ('i', 'e');

      IF v_dep_desc IS NOT NULL AND pg_catalog.length(v_dep_desc) > 0 THEN
        RAISE EXCEPTION 'Migrasi dihentikan: Fungsi public.% (%) tidak dapat di-drop karena terdapat objek yang bergantung padanya: [%]. Harap selaraskan objek tersebut sebelum migrasi.',
          v_func_rec.proname, v_func_rec.id_args, v_dep_desc;
      END IF;

      -- Drop hanya fungsi dengan return type berbeda yang terbukti aman tanpa dependensi
      EXECUTE 'DROP FUNCTION public.' || quote_ident(v_func_rec.proname) || '(' || v_func_rec.id_args || ')';
    END IF;
  END LOOP;
END $$;

-- PENGAMANAN JALUR ALTERNATIF (RPC WARISAN/LEGACY):
-- Jika fungsi legacy 'ajukan_pembelian', 'batalkan_pengajuan_pembelian', atau 'terima_pembelian'
-- pernah dibuat di database versi terdahulu, cabut hak EXECUTE dari PUBLIC, anon, dan authenticated
-- agar tidak dapat dijadikan celah bypass REST API, tanpa menghapusnya (DROP) secara prematur.
DO $$
DECLARE
  v_legacy_rec RECORD;
BEGIN
  FOR v_legacy_rec IN
    SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS id_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('ajukan_pembelian', 'batalkan_pengajuan_pembelian', 'terima_pembelian')
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.' || quote_ident(v_legacy_rec.proname) || '(' || v_legacy_rec.id_args || ') FROM PUBLIC, anon, authenticated';
  END LOOP;
END $$;


-- 5a. RPC PERSETUJUAN PEMBELIAN (APPROVAL)
CREATE OR REPLACE FUNCTION public.setujui_pembelian(
  p_pembelian_id UUID,
  p_harga_beli_satuan NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_user_aktif BOOLEAN;
  v_nomor_po TEXT;
  v_status_lama TEXT;
BEGIN
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Sesi tidak terautentikasi atau telah berakhir.';
  END IF;

  SELECT peran, aktif INTO v_user_role, v_user_aktif
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_user_role IS NULL OR v_user_aktif IS NOT TRUE THEN
    RAISE EXCEPTION 'Akses ditolak: Akun pengguna tidak ditemukan atau berstatus nonaktif.';
  END IF;

  IF v_user_role <> 'manajer' THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Manajer yang berhak menyetujui pengajuan pembelian (BR-09).';
  END IF;

  IF p_harga_beli_satuan IS NULL OR p_harga_beli_satuan <= 0 THEN
    RAISE EXCEPTION 'Harga beli satuan wajib diisi dan harus bernilai lebih dari Rp0 (Bab 6.2).';
  END IF;

  -- Kunci baris pembelian secara eksklusif (ROW-LEVEL LOCK)
  SELECT nomor, status INTO v_nomor_po, v_status_lama
  FROM public.pembelian
  WHERE id = p_pembelian_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi pembelian dengan ID % tidak ditemukan pada database.', p_pembelian_id;
  END IF;

  IF v_status_lama <> 'diajukan' THEN
    RAISE EXCEPTION 'Persetujuan ditolak: Status PO % saat ini adalah "%". Hanya PO berstatus "diajukan" yang dapat disetujui.',
      v_nomor_po, v_status_lama;
  END IF;

  UPDATE public.pembelian
  SET status = 'disetujui',
      harga_beli_satuan = p_harga_beli_satuan,
      diputuskan_oleh = v_user_id,
      diputuskan_pada = pg_catalog.now()
  WHERE id = p_pembelian_id;

  INSERT INTO public.audit_log (
    pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru, dibuat_pada
  ) VALUES (
    v_user_id,
    'setujui_pembelian',
    'pembelian',
    p_pembelian_id,
    pg_catalog.jsonb_build_object('status', 'diajukan'),
    pg_catalog.jsonb_build_object('status', 'disetujui', 'harga_beli_satuan', p_harga_beli_satuan),
    pg_catalog.now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', p_pembelian_id,
    'nomor', v_nomor_po,
    'status', 'disetujui'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.setujui_pembelian(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.setujui_pembelian(UUID, NUMERIC) TO authenticated;


-- 5b. RPC PENOLAKAN PEMBELIAN (REJECTION)
CREATE OR REPLACE FUNCTION public.tolak_pembelian(
  p_pembelian_id UUID,
  p_alasan_tolak TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_user_aktif BOOLEAN;
  v_nomor_po TEXT;
  v_status_lama TEXT;
  v_clean_alasan TEXT;
BEGIN
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Sesi tidak terautentikasi atau telah berakhir.';
  END IF;

  SELECT peran, aktif INTO v_user_role, v_user_aktif
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_user_role IS NULL OR v_user_aktif IS NOT TRUE THEN
    RAISE EXCEPTION 'Akses ditolak: Akun pengguna tidak ditemukan atau berstatus nonaktif.';
  END IF;

  IF v_user_role <> 'manajer' THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Manajer yang berhak menolak pengajuan pembelian (BR-09).';
  END IF;

  v_clean_alasan := pg_catalog.trim(COALESCE(p_alasan_tolak, ''));
  IF pg_catalog.length(v_clean_alasan) < 10 THEN
    RAISE EXCEPTION 'Alasan tolak wajib diisi paling sedikit 10 karakter (BR-09).';
  END IF;

  -- Kunci baris pembelian secara eksklusif (ROW-LEVEL LOCK)
  SELECT nomor, status INTO v_nomor_po, v_status_lama
  FROM public.pembelian
  WHERE id = p_pembelian_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi pembelian dengan ID % tidak ditemukan pada database.', p_pembelian_id;
  END IF;

  IF v_status_lama <> 'diajukan' THEN
    RAISE EXCEPTION 'Penolakan ditolak: Status PO % saat ini adalah "%". Hanya PO berstatus "diajukan" yang dapat ditolak.',
      v_nomor_po, v_status_lama;
  END IF;

  UPDATE public.pembelian
  SET status = 'ditolak',
      alasan_tolak = v_clean_alasan,
      diputuskan_oleh = v_user_id,
      diputuskan_pada = pg_catalog.now()
  WHERE id = p_pembelian_id;

  INSERT INTO public.audit_log (
    pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru, dibuat_pada
  ) VALUES (
    v_user_id,
    'tolak_pembelian',
    'pembelian',
    p_pembelian_id,
    pg_catalog.jsonb_build_object('status', 'diajukan'),
    pg_catalog.jsonb_build_object('status', 'ditolak', 'alasan_tolak', v_clean_alasan),
    pg_catalog.now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', p_pembelian_id,
    'nomor', v_nomor_po,
    'status', 'ditolak'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tolak_pembelian(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tolak_pembelian(UUID, TEXT) TO authenticated;


-- 5c. RPC PEMBATALAN PEMBELIAN (CANCELLATION)
CREATE OR REPLACE FUNCTION public.batalkan_pembelian(
  p_pembelian_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_user_aktif BOOLEAN;
  v_nomor_po TEXT;
  v_status_lama TEXT;
  v_diajukan_oleh UUID;
BEGIN
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Sesi tidak terautentikasi atau telah berakhir.';
  END IF;

  SELECT peran, aktif INTO v_user_role, v_user_aktif
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_user_role IS NULL OR v_user_aktif IS NOT TRUE THEN
    RAISE EXCEPTION 'Akses ditolak: Akun pengguna tidak ditemukan atau berstatus nonaktif.';
  END IF;

  -- Kunci baris pembelian secara eksklusif (ROW-LEVEL LOCK)
  SELECT nomor, status, diajukan_oleh INTO v_nomor_po, v_status_lama, v_diajukan_oleh
  FROM public.pembelian
  WHERE id = p_pembelian_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi pembelian dengan ID % tidak ditemukan pada database.', p_pembelian_id;
  END IF;

  IF v_status_lama = 'diajukan' THEN
    -- Status 'diajukan' boleh dibatalkan oleh pembuat pengajuan atau Manajer (Bab 6.2)
    IF v_user_role <> 'manajer' AND v_diajukan_oleh <> v_user_id THEN
      RAISE EXCEPTION 'Akses ditolak: Pengajuan diajukan hanya boleh dibatalkan oleh pembuat pengajuan atau Manajer.';
    END IF;
  ELSIF v_status_lama = 'disetujui' THEN
    -- Status 'disetujui' hanya boleh dibatalkan oleh Manajer sebelum fisik diterima (Bab 6.2)
    IF v_user_role <> 'manajer' THEN
      RAISE EXCEPTION 'Akses ditolak: Pembelian yang telah disetujui hanya boleh dibatalkan oleh Manajer.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Pembatalan ditolak: Pembelian % berstatus "%" dan tidak dapat dibatalkan.',
      v_nomor_po, v_status_lama;
  END IF;

  UPDATE public.pembelian
  SET status = 'dibatalkan',
      diputuskan_oleh = v_user_id,
      diputuskan_pada = pg_catalog.now()
  WHERE id = p_pembelian_id;

  INSERT INTO public.audit_log (
    pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru, dibuat_pada
  ) VALUES (
    v_user_id,
    'batal_pembelian',
    'pembelian',
    p_pembelian_id,
    pg_catalog.jsonb_build_object('status', v_status_lama),
    pg_catalog.jsonb_build_object('status', 'dibatalkan'),
    pg_catalog.now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', p_pembelian_id,
    'nomor', v_nomor_po,
    'status', 'dibatalkan'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.batalkan_pembelian(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batalkan_pembelian(UUID) TO authenticated;


-- 5d. RPC PENERIMAAN FISIK BARANG (GOODS RECEIPT - ATOMIC ACID TRANSACTION)
CREATE OR REPLACE FUNCTION public.proses_penerimaan_barang_pembelian(
  p_pembelian_id UUID,
  p_jumlah_diterima INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_user_aktif BOOLEAN;
  v_nomor_po TEXT;
  v_barang_id UUID;
  v_jumlah_dipesan INTEGER;
  v_harga_beli NUMERIC;
  v_status_lama TEXT;
  v_jumlah_diterima_lama INTEGER;
  v_barang_nama TEXT;
  v_barang_kode TEXT;
  v_stok_lama INTEGER;
  v_stok_baru INTEGER;
  v_mutasi_id BIGINT;
BEGIN
  -- 1. Autentikasi sesi Supabase Auth
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Sesi tidak terautentikasi atau telah berakhir.';
  END IF;

  -- 2. Otorisasi peran pengguna
  SELECT peran, aktif INTO v_user_role, v_user_aktif
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_user_role IS NULL OR v_user_aktif IS NOT TRUE THEN
    RAISE EXCEPTION 'Akses ditolak: Akun pengguna tidak ditemukan atau berstatus nonaktif.';
  END IF;

  IF v_user_role NOT IN ('manajer', 'gudang') THEN
    RAISE EXCEPTION 'Akses ditolak: Peran "%" tidak memiliki izin menerima fisik barang (BR-10).', v_user_role;
  END IF;

  -- 3. Kunci dan ambil baris pembelian (ROW-LEVEL LOCK FOR UPDATE)
  SELECT nomor, barang_id, jumlah_dipesan, jumlah_diterima, harga_beli_satuan, status
  INTO v_nomor_po, v_barang_id, v_jumlah_dipesan, v_jumlah_diterima_lama, v_harga_beli, v_status_lama
  FROM public.pembelian
  WHERE id = p_pembelian_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi pembelian dengan ID % tidak ditemukan pada database.', p_pembelian_id;
  END IF;

  IF v_status_lama <> 'disetujui' THEN
    RAISE EXCEPTION 'Penerimaan ditolak: Status PO saat ini adalah "%". Hanya PO berstatus "disetujui" yang dapat diterima (BR-10).', v_status_lama;
  END IF;

  IF v_jumlah_diterima_lama IS NOT NULL THEN
    RAISE EXCEPTION 'Penerimaan ditolak: Barang fisik untuk PO % telah pernah dicatat sebelumnya (BR-10: penerimaan hanya satu kali).', v_nomor_po;
  END IF;

  -- 4. Validasi jumlah diterima nyata
  IF p_jumlah_diterima IS NULL OR p_jumlah_diterima < 1 OR p_jumlah_diterima > v_jumlah_dipesan THEN
    RAISE EXCEPTION 'Jumlah diterima harus berupa bilangan bulat antara 1 sampai % unit sesuai pesanan (BR-10).', v_jumlah_dipesan;
  END IF;

  -- 5. Kunci baris barang terkait (ROW-LEVEL LOCK FOR UPDATE)
  SELECT kode, nama, stok
  INTO v_barang_kode, v_barang_nama, v_stok_lama
  FROM public.barang
  WHERE id = v_barang_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang terkait PO % tidak ditemukan di katalog sistem.', v_nomor_po;
  END IF;

  v_stok_baru := v_stok_lama + p_jumlah_diterima;

  -- 6. Perbarui status pembelian menjadi 'diterima'
  UPDATE public.pembelian
  SET status = 'diterima',
      jumlah_diterima = p_jumlah_diterima,
      diterima_oleh = v_user_id,
      diterima_pada = pg_catalog.now()
  WHERE id = p_pembelian_id;

  -- 7. Tambah saldo stok barang & perbarui harga_pokok menjadi harga_beli_satuan (BR-10)
  UPDATE public.barang
  SET stok = v_stok_baru,
      harga_pokok = CASE
        WHEN v_harga_beli IS NOT NULL AND v_harga_beli > 0 THEN v_harga_beli
        ELSE harga_pokok
      END,
      diperbarui_pada = pg_catalog.now()
  WHERE id = v_barang_id;

  -- 8. Tulis catatan ke kartu stok (public.mutasi_stok) jenis 'masuk' (BR-11)
  INSERT INTO public.mutasi_stok (
    barang_id,
    jenis,
    jumlah,
    stok_sesudah,
    nomor_dokumen,
    alasan,
    dibuat_oleh,
    dibuat_pada
  ) VALUES (
    v_barang_id,
    'masuk',
    p_jumlah_diterima,
    v_stok_baru,
    v_nomor_po,
    'Penerimaan fisik barang PO ' || v_nomor_po,
    v_user_id,
    pg_catalog.now()
  ) RETURNING id INTO v_mutasi_id;

  -- 9. Tulis jejak audit log transaksi (BR-12)
  INSERT INTO public.audit_log (
    pelaku_id,
    aksi,
    nama_tabel,
    data_id,
    nilai_lama,
    nilai_baru,
    dibuat_pada
  ) VALUES (
    v_user_id,
    'terima_barang_pembelian',
    'pembelian',
    p_pembelian_id,
    pg_catalog.jsonb_build_object('status', 'disetujui'),
    pg_catalog.jsonb_build_object(
      'status', 'diterima',
      'jumlah_diterima', p_jumlah_diterima,
      'stok_sebelum', v_stok_lama,
      'stok_sesudah', v_stok_baru,
      'harga_pokok_diperbarui', (v_harga_beli IS NOT NULL AND v_harga_beli > 0)
    ),
    pg_catalog.now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'nomor', v_nomor_po,
    'barang_id', v_barang_id,
    'stok_sebelum', v_stok_lama,
    'stok_sesudah', v_stok_baru,
    'jumlah_diterima', p_jumlah_diterima,
    'mutasi_id', v_mutasi_id,
    'harga_pokok_baru', (CASE WHEN v_user_role = 'manajer' THEN COALESCE(v_harga_beli, 0) ELSE 0 END)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.proses_penerimaan_barang_pembelian(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proses_penerimaan_barang_pembelian(UUID, INTEGER) TO authenticated;


-- -----------------------------------------------------------------------------
-- 6. SECURITY BARRIER VIEW (MENCEGAH KEBOCORAN DATA PEMBELIAN BR-12 & PRD BAB 7)
-- - Akses baris DIBATASI HANYA untuk pengguna aktif dengan peran 'manajer' atau 'gudang'.
-- - Staf penjualan (role 'penjualan') DITOLAK membaca seluruh baris transaksi pembelian.
-- - Kolom harga_beli_satuan disamarkan menjadi NULL untuk Staf Gudang.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_pembelian
WITH (security_barrier = true)
AS
SELECT
  id,
  nomor,
  pemasok_id,
  barang_id,
  jumlah_dipesan,
  jumlah_diterima,
  CASE
    WHEN (SELECT peran FROM public.profiles WHERE id = (SELECT auth.uid())) = 'manajer'
      THEN harga_beli_satuan
    ELSE NULL
  END AS harga_beli_satuan,
  status,
  alasan_tolak,
  diajukan_oleh,
  diajukan_pada,
  diputuskan_oleh,
  diputuskan_pada,
  diterima_oleh,
  diterima_pada
FROM public.pembelian
WHERE EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = (SELECT auth.uid())
    AND p.aktif = TRUE
    AND p.peran IN ('manajer', 'gudang')
);

REVOKE ALL ON TABLE public.v_pembelian FROM PUBLIC, anon;
GRANT SELECT ON public.v_pembelian TO authenticated;

COMMIT;
