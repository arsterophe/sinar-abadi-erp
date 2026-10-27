-- =============================================================================
-- MIGRASI 08: PENEGAKAN KEAMANAN PELUNASAN MANUAL & PEMBAYARAN MAYAR
-- Proyek: Sinar Abadi ERP (CV Sinar Abadi Niaga)
-- File: scripts/migrations/08_penegakan_pelunasan_manual_dan_mayar.sql
-- Status: DRAFT REKOMENDASI (Dapat Dijalankan di Supabase SQL Editor)
-- Dokumen Acuan: PRD Bab 4 (BR-07, BR-12), PRD Bab 6.1, Bab 7
-- =============================================================================
-- TUJUAN MIGRASI:
-- 1. Memperkuat fungsi RPC 'catat_pembayaran' (SECURITY DEFINER) agar memvalidasi:
--    a. Otorisasi pemanggil: Wajib pengguna terautentikasi (auth.uid() NOT NULL)
--       dengan peran 'manajer' aktif (profiles.aktif = TRUE).
--    b. Status pesanan: Wajib 'dikirim' (pesanan berstatus draf, dikonfirmasi,
--       atau dibatalkan ditolak).
--    c. Proteksi Anti-Bypass Tagihan Mayar: Jika pesanan memiliki tagihan Mayar
--       (mayar_payment_id IS NOT NULL), pelunasan manual melalui catat_pembayaran
--       DITOLAK keras kecuali status pembayaran Mayar telah terverifikasi 'paid'.
--       Ini mencegah pengguna menandai lunas tanpa verifikasi gateway pembayaran.
--    d. Idempotensi transaksi: Jika pesanan sudah lunas, fungsi keluar tanpa error.
--    e. Pencatatan Audit Log Wajib (BR-12): Nilai lama dan nilai baru dicatat
--       dalam satu transaksi database atomik (ACID).
-- 2. Menegaskan hak akses PostgreSQL (Table-level & Function-level GRANTS):
--    - REVOKE UPDATE pada tabel pesanan_jual dari PUBLIC, anon, dan authenticated
--      (seluruh mutasi status wajib melalui RPC transaksi resmi).
--    - GRANT EXECUTE pada catat_pembayaran HANYA untuk role 'authenticated'.
--    - REVOKE EXECUTE dari PUBLIC dan anon.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. PENEGASAN PRIVILEGE TABEL (CEGAH DIRECT UPDATE PADA TABEL TRANSAKSI)
-- -----------------------------------------------------------------------------
-- Cabut izin UPDATE langsung pada tabel public.pesanan_jual dari authenticated dan anon.
-- Seluruh mutasi status wajib melewati RPC transaksi atomik (SECURITY DEFINER).
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.pesanan_jual FROM PUBLIC, anon;

-- Pastikan izin SELECT tetap dimiliki oleh pengguna login untuk membaca pesanan
GRANT SELECT ON TABLE public.pesanan_jual TO authenticated;


-- -----------------------------------------------------------------------------
-- 2. REKONSTRUKSI FUNGSI RPC: catat_pembayaran (SECURITY DEFINER)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.catat_pembayaran(
  p_pesanan_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_caller_active BOOLEAN;
  v_pesanan RECORD;
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_nilai_lama JSONB;
  v_nilai_baru JSONB;
BEGIN
  -- 1. Otorisasi Pemanggil: Wajib Autentikasi dan Peran Manajer Aktif (BR-07, BR-12)
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu';
  END IF;

  SELECT peran, aktif INTO v_caller_role, v_caller_active
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role <> 'manajer' OR v_caller_active <> TRUE THEN
    RAISE EXCEPTION 'Hanya Manajer yang boleh mencatat pembayaran';
  END IF;

  -- 2. Validasi Parameter ID Pesanan
  IF p_pesanan_id IS NULL THEN
    RAISE EXCEPTION 'Parameter p_pesanan_id wajib diisi';
  END IF;

  -- 3. Kunci Baris Pesanan Secara Eksklusif (FOR UPDATE) untuk Mencegah Race Condition
  SELECT *
  INTO v_pesanan
  FROM public.pesanan_jual
  WHERE id = p_pesanan_id
  FOR UPDATE;

  IF v_pesanan.id IS NULL THEN
    RAISE EXCEPTION 'Pesanan tidak ditemukan';
  END IF;

  -- 4. Idempotensi Mutlak: Jika sudah berstatus lunas, keluar secara aman tanpa duplikasi audit log
  IF v_pesanan.status = 'lunas' THEN
    RETURN;
  END IF;

  -- 5. Validasi Status Awal: Wajib 'dikirim' (BR-07)
  IF v_pesanan.status <> 'dikirim' THEN
    RAISE EXCEPTION 'Hanya pesanan berstatus dikirim yang dapat dilunasi';
  END IF;

  -- 6. Proteksi Integrasi Gateway Digital Mayar:
  -- Jika pesanan memiliki tagihan Mayar aktif (mayar_payment_id IS NOT NULL),
  -- pelunasan TIDAK BOLEH dilakukan sembarangan sebelum status pembayaran Mayar
  -- terverifikasi sah ('paid') oleh gateway Mayar.
  IF v_pesanan.mayar_payment_id IS NOT NULL AND COALESCE(v_pesanan.mayar_status, '') <> 'paid' THEN
    RAISE EXCEPTION 'Pelunasan ditolak: Pesanan memiliki tagihan Mayar aktif (%) yang belum terverifikasi lunas di gateway pembayaran.',
      v_pesanan.mayar_payment_id;
  END IF;

  -- 7. Susun Nilai Lama untuk Jejak Audit
  v_nilai_lama := pg_catalog.to_jsonb(v_pesanan);

  -- 8. Mutasi Status Pesanan Menjadi 'lunas'
  UPDATE public.pesanan_jual
  SET status = 'lunas',
      dilunasi_pada = v_now
  WHERE id = p_pesanan_id;

  -- 9. Ambil Snapshot Baris Terbaru untuk Nilai Baru Audit
  SELECT *
  INTO v_pesanan
  FROM public.pesanan_jual
  WHERE id = p_pesanan_id;

  v_nilai_baru := pg_catalog.to_jsonb(v_pesanan);

  -- 10. Catat Jejak Audit ke public.audit_log Secara Wajib (BR-12)
  INSERT INTO public.audit_log (
    pelaku_id,
    aksi,
    nama_tabel,
    data_id,
    nilai_lama,
    nilai_baru,
    dibuat_pada
  ) VALUES (
    v_caller_id,
    'catat_pembayaran',
    'pesanan_jual',
    p_pesanan_id,
    v_nilai_lama,
    v_nilai_baru,
    v_now
  );

END;
$$;

COMMENT ON FUNCTION public.catat_pembayaran(UUID) IS 
'Mencatat pelunasan manual tagihan pelanggan (tunai/tempo) secara atomik. Eksklusif Manajer aktif (BR-07, BR-12). Melarang pelunasan jika tagihan Mayar belum terverifikasi paid.';


-- -----------------------------------------------------------------------------
-- 3. HAK AKSES EKSEKUSI FUNGSI (FUNCTION ACL)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.catat_pembayaran(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catat_pembayaran(UUID) TO authenticated;

COMMIT;
