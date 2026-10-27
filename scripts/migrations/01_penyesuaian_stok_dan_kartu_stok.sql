-- =============================================================================
-- MIGRASI BASIS DATA: PENYESUAIAN STOK & KARTU STOK
-- CV SINAR ABADI NIAGA - SISTEM ERP DISTRIBUSI
-- Dokumen Acuan: PRD Bab 4, 7, 8 & Aturan Bisnis BR-01, BR-11, BR-12
-- =============================================================================

-- 1. FUNGSI TRANSAKSI ATOMIK PENYESUAIAN STOK
-- Menjamin ACID: Pembaruan stok barang dan pencatatan mutasi stok berhasil bersama
-- atau gagal bersama-sama (mencegah inkonsistensi saldo stok).
-- Menggunakan SELECT ... FOR UPDATE untuk mengunci baris barang secara eksklusif
-- demi mencegah LOST UPDATE saat beberapa staf gudang/manajer melakukan penyesuaian bersamaan.

CREATE OR REPLACE FUNCTION public.proses_penyesuaian_stok(
  p_barang_id UUID,
  p_jumlah INTEGER,
  p_alasan TEXT,
  p_nomor_dokumen TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_user_aktif BOOLEAN;
  v_barang_nama TEXT;
  v_barang_kode TEXT;
  v_barang_aktif BOOLEAN;
  v_stok_lama INTEGER;
  v_stok_baru INTEGER;
  v_doc_no TEXT;
  v_mutasi_id BIGINT;
BEGIN
  -- 1. Dapatkan identitas pengguna terotentikasi dari sesi Supabase Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: sesi telah berakhir atau belum terautentikasi.';
  END IF;

  -- 2. Verifikasi profil dan wewenang peran (PRD Bab 4 & 7)
  -- Hanya peran 'manajer' dan 'gudang' yang berhak melakukan penyesuaian stok.
  SELECT peran, aktif INTO v_user_role, v_user_aktif
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_user_role IS NULL OR v_user_aktif IS NOT TRUE THEN
    RAISE EXCEPTION 'Akses ditolak: akun tidak ditemukan atau telah dinonaktifkan.';
  END IF;

  IF v_user_role NOT IN ('manajer', 'gudang') THEN
    RAISE EXCEPTION 'Akses ditolak: peran "%" tidak memiliki wewenang melakukan penyesuaian stok. Hanya Staf Gudang dan Manajer yang berhak.', v_user_role;
  END IF;

  -- 3. Validasi parameter input
  IF p_barang_id IS NULL THEN
    RAISE EXCEPTION 'Barang wajib dipilih.';
  END IF;

  IF p_jumlah IS NULL OR p_jumlah = 0 THEN
    RAISE EXCEPTION 'Jumlah penyesuaian tidak boleh nol (0).';
  END IF;

  IF p_alasan IS NULL OR length(trim(p_alasan)) < 10 THEN
    RAISE EXCEPTION 'Alasan penyesuaian stok wajib diisi minimal 10 karakter.';
  END IF;

  -- 4. Kunci baris barang secara eksklusif (ROW-LEVEL LOCK) untuk mencegah LOST UPDATE
  SELECT kode, nama, stok, aktif
  INTO v_barang_kode, v_barang_nama, v_stok_lama, v_barang_aktif
  FROM public.barang
  WHERE id = p_barang_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang dengan ID % tidak ditemukan pada database sistem.', p_barang_id;
  END IF;

  IF v_barang_aktif IS NOT TRUE THEN
    RAISE EXCEPTION 'Barang "%" (%) berstatus nonaktif dan tidak dapat disesuaikan stoknya.', v_barang_nama, v_barang_kode;
  END IF;

  -- 5. Hitung stok sesudah dan validasi aturan non-negatif (BR-01)
  v_stok_baru := v_stok_lama + p_jumlah;
  IF v_stok_baru < 0 THEN
    RAISE EXCEPTION 'Penyesuaian ditolak: stok tidak boleh negatif (BR-01). Stok saat ini: %, pengurangan: % (hasil: %).',
      v_stok_lama, abs(p_jumlah), v_stok_baru;
  END IF;

  -- 6. Tentukan nomor dokumen referensi
  IF p_nomor_dokumen IS NOT NULL AND length(trim(p_nomor_dokumen)) > 0 THEN
    v_doc_no := trim(p_nomor_dokumen);
  ELSE
    v_doc_no := 'ADJ-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));
  END IF;

  -- 7. Perbarui saldo stok barang secara atomik
  UPDATE public.barang
  SET stok = v_stok_baru,
      diperbarui_pada = now()
  WHERE id = p_barang_id;

  -- 8. Tulis tepat 1 baris catatan ke public.mutasi_stok (BR-11)
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
    p_barang_id,
    'penyesuaian',
    p_jumlah,
    v_stok_baru,
    v_doc_no,
    trim(p_alasan),
    v_user_id,
    now()
  ) RETURNING id INTO v_mutasi_id;

  -- 9. Catat jejak audit log secara wajib (BR-12)
  -- Kegagalan penulisan audit log akan membatalkan (rollback) seluruh transaksi penyesuaian stok.
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
    'penyesuaian_stok',
    'barang',
    p_barang_id,
    jsonb_build_object('stok', v_stok_lama),
    jsonb_build_object(
      'stok', v_stok_baru,
      'perubahan', p_jumlah,
      'alasan', trim(p_alasan),
      'nomor_dokumen', v_doc_no
    ),
    now()
  );

  -- 10. Kembalikan payload konfirmasi transaksi
  RETURN jsonb_build_object(
    'success', true,
    'barang_id', p_barang_id,
    'kode_barang', v_barang_kode,
    'nama_barang', v_barang_nama,
    'stok_sebelum', v_stok_lama,
    'stok_sesudah', v_stok_baru,
    'perubahan', p_jumlah,
    'nomor_dokumen', v_doc_no,
    'mutasi_id', v_mutasi_id
  );
END;
$$;

-- Cabut izin default dari PUBLIC dan anon untuk keamanan ketat (defense-in-depth)
REVOKE ALL ON FUNCTION public.proses_penyesuaian_stok(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;

-- Berikan izin eksekusi RPC hanya untuk pengguna terotentikasi
GRANT EXECUTE ON FUNCTION public.proses_penyesuaian_stok(UUID, INTEGER, TEXT, TEXT) TO authenticated;

