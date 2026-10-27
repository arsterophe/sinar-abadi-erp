-- =============================================================================
-- SQL LANJUTAN PEMASANGAN RPC MAYAR (CV SINAR ABADI NIAGA)
-- Target Proyek: Supabase Production (ref: wvjccwatzmvjtoguaugh)
-- File: scripts/migrations/04_rpc_mayar_dan_konkurensi.sql
-- Catatan:
-- 5 kolom Mayar pada tabel public.pesanan_jual sudah terpasang di database.
-- Skrip ini hanya memasang/memperbarui 4 fungsi RPC Mayar beserta hak aksesnya.
-- Keamanan: Audit ketat SECURITY DEFINER tanpa celah current_user.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. BERSIHKAN OVERLOAD LAMA AGAR TIDAK TERJADI DUPLIKASI SIGNATURE
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.klaim_tagihan_mayar(UUID);
DROP FUNCTION IF EXISTS public.klaim_tagihan_mayar(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.simpan_tagihan_mayar(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.simpan_tagihan_mayar(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.simpan_tagihan_mayar(UUID, UUID, TEXT, TEXT, NUMERIC, UUID, TEXT);
DROP FUNCTION IF EXISTS public.lepas_klaim_tagihan_mayar(UUID);
DROP FUNCTION IF EXISTS public.lepas_klaim_tagihan_mayar(UUID, UUID);
DROP FUNCTION IF EXISTS public.rekonsiliasi_klaim_mayar(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rekonsiliasi_klaim_mayar(UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rekonsiliasi_klaim_mayar(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT);

-- -----------------------------------------------------------------------------
-- 2. RPC: klaim_tagihan_mayar
-- -----------------------------------------------------------------------------
-- Mengunci baris pesanan secara eksklusif (FOR UPDATE) sesaat di database
-- untuk memastikan hanya ada 1 request yang berhak keluar ke jaringan memanggil Mayar.
-- Dapat dipanggil oleh sesi terautentikasi (authenticated) dengan peran 'manajer'.
CREATE OR REPLACE FUNCTION public.klaim_tagihan_mayar(
  p_pesanan_id UUID
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
  v_pesanan RECORD;
  v_claim_token UUID;
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  -- 1. Verifikasi Sesi Pengguna
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Sesi tidak terautentikasi atau telah berakhir.';
  END IF;

  -- 2. Verifikasi Profil Aktif & Peran Manajer Saja (BR-07)
  SELECT peran, aktif INTO v_user_role, v_user_aktif
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_user_role IS NULL OR v_user_aktif IS NOT TRUE THEN
    RAISE EXCEPTION 'Akses ditolak: Akun pengguna tidak ditemukan atau telah dinonaktifkan.';
  END IF;

  IF v_user_role <> 'manajer' THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Manajer aktif yang berwenang membuat tagihan Mayar.';
  END IF;

  -- 3. Kunci Baris Pesanan Secara Eksklusif (Row Lock Sesaat)
  SELECT id, nomor, status, total, pelanggan_id, mayar_payment_id, mayar_payment_url, mayar_status, mayar_claim_token, mayar_claim_at
  INTO v_pesanan
  FROM public.pesanan_jual
  WHERE id = p_pesanan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pesanan jual dengan ID % tidak ditemukan pada database.', p_pesanan_id;
  END IF;

  -- 4. Validasi Status Pesanan (Wajib 'dikirim')
  IF v_pesanan.status <> 'dikirim' THEN
    RAISE EXCEPTION 'Pembuatan tagihan ditolak: Status pesanan saat ini adalah "%". Hanya pesanan "dikirim" yang dapat dibuatkan tagihan Mayar.', v_pesanan.status;
  END IF;

  -- 5. Periksa Apakah Tagihan Lama yang Valid Sudah Ada di Database
  IF v_pesanan.mayar_payment_id IS NOT NULL AND v_pesanan.mayar_payment_url IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'ALREADY_EXISTS',
      'id', v_pesanan.id,
      'nomor', v_pesanan.nomor,
      'total', v_pesanan.total,
      'mayar_payment_id', v_pesanan.mayar_payment_id,
      'mayar_payment_url', v_pesanan.mayar_payment_url,
      'mayar_status', v_pesanan.mayar_status
    );
  END IF;

  -- 6. Deteksi Anomali Metadata Parsial
  IF (v_pesanan.mayar_payment_id IS NOT NULL AND v_pesanan.mayar_payment_url IS NULL)
     OR (v_pesanan.mayar_payment_id IS NULL AND v_pesanan.mayar_payment_url IS NOT NULL) THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'DATA_ANOMALY',
      'message', 'Inkonsistensi data tagihan Mayar: Metadata pembayaran tidak lengkap (ID atau URL terisi sebagian). Hubungi administrator atau lakukan rekonsiliasi manual sebelum membuat tagihan baru.'
    );
  END IF;

  -- 7. Periksa Kondisi Token Klaim yang Tidak Konsisten
  IF (v_pesanan.mayar_claim_token IS NOT NULL AND v_pesanan.mayar_claim_at IS NULL)
     OR (v_pesanan.mayar_claim_token IS NULL AND v_pesanan.mayar_claim_at IS NOT NULL) THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'IN_DOUBT_STALE',
      'message', 'Kondisi klaim konkurensi tidak konsisten pada basis data. Harap jalankan rekonsiliasi klaim terlebih dahulu.'
    );
  END IF;

  -- 8. Periksa Konkurensi Aktif (< 60 detik)
  IF v_pesanan.mayar_claim_token IS NOT NULL 
     AND (v_now - v_pesanan.mayar_claim_at) < interval '60 seconds' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'IN_PROGRESS',
      'message', 'Pembuatan tagihan sedang diproses oleh permintaan lain. Mohon tunggu beberapa saat.'
    );
  END IF;

  -- 9. Periksa Klaim Kedaluwarsa yang Menggantung (>= 60 detik)
  IF v_pesanan.mayar_claim_token IS NOT NULL 
     AND (v_now - v_pesanan.mayar_claim_at) >= interval '60 seconds' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'IN_DOUBT_STALE',
      'message', 'Proses pembuatan tagihan sebelumnya terputus atau batas waktu sewa (60 detik) terlampaui. Periksa dashboard Mayar atau jalankan rekonsiliasi klaim sebelum mencoba kembali.'
    );
  END IF;

  -- 10. Terbitkan Token Klaim Baru (Fence Lease Token)
  v_claim_token := pg_catalog.gen_random_uuid();

  UPDATE public.pesanan_jual
  SET mayar_claim_token = v_claim_token,
      mayar_claim_at = v_now
  WHERE id = p_pesanan_id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'CLAIMED',
    'id', v_pesanan.id,
    'nomor', v_pesanan.nomor,
    'total', v_pesanan.total,
    'pelanggan_id', v_pesanan.pelanggan_id,
    'claim_token', v_claim_token
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. RPC: simpan_tagihan_mayar
-- -----------------------------------------------------------------------------
-- Menyimpan metadata invoice yang BERHASIL diterbitkan di Mayar.
-- BATAS KEAMANAN MUTLAK:
-- Hanya dapat dieksekusi oleh SERVER TRUSTED IDENTITY (service_role via JWT claim,
-- atau superuser/DBA langsung pada sesi psql/SQL Editor tanpa JWT).
-- PENTING: Penggunaan pg_catalog.current_user DILARANG karena pada fungsi
-- SECURITY DEFINER, current_user selalu berubah menjadi pemilik fungsi (postgres),
-- sehingga tidak boleh dijadikan acuan otorisasi pemanggil.
CREATE OR REPLACE FUNCTION public.simpan_tagihan_mayar(
  p_pesanan_id UUID,
  p_claim_token UUID,
  p_payment_id TEXT,
  p_payment_url TEXT,
  p_nominal NUMERIC,
  p_pelaku_id UUID,
  p_payment_status TEXT DEFAULT 'unpaid'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role TEXT;
  v_pelaku_role TEXT;
  v_pelaku_aktif BOOLEAN;
  v_pesanan RECORD;
  v_clean_payment_id TEXT;
  v_clean_payment_url TEXT;
  v_clean_status TEXT;
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  -- 1. Verifikasi Batas Kepercayaan Pemanggil (Trusted Server Identity Only)
  -- Memeriksa role dari JWT claim PostgREST atau sesi koneksi superuser DBA langsung.
  v_caller_role := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''), '');
  IF v_caller_role <> 'service_role' THEN
    IF NOT (pg_catalog.session_user IN ('postgres', 'supabase_admin') AND v_caller_role = '') THEN
      RAISE EXCEPTION 'Akses ditolak: Fungsi ini adalah fungsi privat server dan hanya dapat dieksekusi oleh service_role.';
    END IF;
  END IF;

  -- 2. Validasi Identitas Pelaku Audit yang Diteruskan oleh Server Action
  IF p_pelaku_id IS NULL THEN
    RAISE EXCEPTION 'Penyimpanan ditolak: ID pelaku audit wajib disertakan oleh server.';
  END IF;

  SELECT peran, aktif INTO v_pelaku_role, v_pelaku_aktif
  FROM public.profiles
  WHERE id = p_pelaku_id;

  IF v_pelaku_role IS NULL OR v_pelaku_aktif IS NOT TRUE THEN
    RAISE EXCEPTION 'Penyimpanan ditolak: Akun pelaku audit tidak ditemukan atau telah dinonaktifkan.';
  END IF;

  IF v_pelaku_role <> 'manajer' THEN
    RAISE EXCEPTION 'Penyimpanan ditolak: Pelaku audit harus memiliki peran Manajer aktif.';
  END IF;

  -- 3. Validasi Parameter Input
  v_clean_payment_id := pg_catalog.btrim(COALESCE(p_payment_id, ''));
  v_clean_payment_url := pg_catalog.btrim(COALESCE(p_payment_url, ''));
  v_clean_status := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_payment_status, '')));

  IF pg_catalog.length(v_clean_payment_id) = 0 THEN
    RAISE EXCEPTION 'Penyimpanan ditolak: Payment ID Mayar tidak boleh kosong.';
  END IF;

  IF v_clean_payment_url !~* '^https://([a-zA-Z0-9\-]+\.)*(mayar\.link|mayar\.club|mayar\.id)/' THEN
    RAISE EXCEPTION 'Penyimpanan ditolak: URL pembayaran tidak valid atau bukan berasal dari domain resmi Mayar.';
  END IF;

  IF v_clean_status <> 'unpaid' THEN
    RAISE EXCEPTION 'Penyimpanan ditolak: Status tagihan baru wajib "unpaid". Nilai diterima: "%".', p_payment_status;
  END IF;

  -- 4. Kunci Baris Pesanan Secara Eksklusif
  SELECT id, nomor, status, total, mayar_payment_id, mayar_payment_url, mayar_status, mayar_claim_token, mayar_claim_at
  INTO v_pesanan
  FROM public.pesanan_jual
  WHERE id = p_pesanan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pesanan dengan ID % tidak ditemukan.', p_pesanan_id;
  END IF;

  -- 5. Validasi Status Pesanan (Wajib 'dikirim')
  IF v_pesanan.status <> 'dikirim' THEN
    RAISE EXCEPTION 'Penyimpanan ditolak: Status pesanan sudah berubah menjadi "%".', v_pesanan.status;
  END IF;

  -- 6. Pastikan Tidak Ada Invoice yang Sudah Tertaut (Dilarang Menimpa)
  IF v_pesanan.mayar_payment_id IS NOT NULL OR v_pesanan.mayar_payment_url IS NOT NULL THEN
    RAISE EXCEPTION 'Penyimpanan ditolak: Pesanan sudah memiliki tagihan Mayar tertaut (ID: %). Penimpaan invoice dilarang demi integritas audit.', v_pesanan.mayar_payment_id;
  END IF;

  -- 7. Validasi Integritas Nominal
  IF p_nominal IS NULL OR v_pesanan.total <> p_nominal THEN
    RAISE EXCEPTION 'Penyimpanan ditolak: Nominal tagihan Mayar (%) tidak sesuai dengan total pesanan (%).', p_nominal, v_pesanan.total;
  END IF;

  -- 8. Validasi Kesesuaian Token Klaim (Fence Lease Token)
  IF v_pesanan.mayar_claim_token IS NULL OR v_pesanan.mayar_claim_token <> p_claim_token THEN
    RAISE EXCEPTION 'Penyimpanan ditolak: Token klaim tidak valid, kedaluwarsa, atau telah diambil alih proses lain.';
  END IF;

  -- 9. Batas Toleransi Kedaluwarsa Klaim (Grace Period Maksimum 120 Detik)
  IF v_pesanan.mayar_claim_at IS NULL OR (v_now - v_pesanan.mayar_claim_at) > interval '120 seconds' THEN
    RAISE EXCEPTION 'Penyimpanan ditolak: Batas toleransi sewa klaim (120 detik) telah terlampaui. Gunakan prosedur rekonsiliasi klaim.';
  END IF;

  -- 10. Simpan Metadata & Bersihkan Token Klaim
  UPDATE public.pesanan_jual
  SET mayar_payment_id = v_clean_payment_id,
      mayar_payment_url = v_clean_payment_url,
      mayar_status = 'unpaid',
      mayar_claim_token = NULL,
      mayar_claim_at = NULL
  WHERE id = p_pesanan_id;

  -- 11. Catat Audit Log Minimum Secara Atomik (BR-12: URL Tidak Disimpan)
  INSERT INTO public.audit_log (
    pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru, dibuat_pada
  ) VALUES (
    p_pelaku_id,
    'buat_tagihan_mayar',
    'pesanan_jual',
    p_pesanan_id,
    pg_catalog.jsonb_build_object(
      'mayar_payment_id', v_pesanan.mayar_payment_id,
      'mayar_status', v_pesanan.mayar_status
    ),
    pg_catalog.jsonb_build_object(
      'mayar_payment_id', v_clean_payment_id,
      'mayar_status', 'unpaid',
      'total', v_pesanan.total
    ),
    v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', p_pesanan_id,
    'nomor', v_pesanan.nomor,
    'mayar_payment_id', v_clean_payment_id,
    'mayar_payment_url', v_clean_payment_url,
    'mayar_status', 'unpaid'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. RPC: lepas_klaim_tagihan_mayar
-- -----------------------------------------------------------------------------
-- Melepas klaim konkurensi HANYA jika panggilan HTTP ke Mayar terbukti gagal pasti
-- (misal HTTP 400/401/403/422 sebelum invoice terbit). Dilarang untuk timeout/ambigu.
CREATE OR REPLACE FUNCTION public.lepas_klaim_tagihan_mayar(
  p_pesanan_id UUID,
  p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role TEXT;
  v_user_id UUID;
  v_user_role TEXT;
  v_user_aktif BOOLEAN;
  v_pesanan RECORD;
BEGIN
  -- 1. Validasi Parameter Input
  IF p_pesanan_id IS NULL THEN
    RAISE EXCEPTION 'Pelepasan klaim ditolak: ID pesanan wajib disertakan.';
  END IF;

  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION 'Pelepasan klaim ditolak: Token sewa klaim wajib disertakan.';
  END IF;

  -- 2. Verifikasi Autentikasi & Otorisasi Pemanggil
  -- Jika bukan service_role dan bukan sesi DBA langsung, wajib verifikasi sesi auth & manajer aktif
  v_caller_role := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''), '');
  IF v_caller_role <> 'service_role' 
     AND NOT (pg_catalog.session_user IN ('postgres', 'supabase_admin') AND v_caller_role = '') THEN
    v_user_id := (SELECT auth.uid());
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Akses ditolak: Sesi tidak terautentikasi atau telah berakhir.';
    END IF;

    SELECT peran, aktif INTO v_user_role, v_user_aktif
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL OR v_user_aktif IS NOT TRUE THEN
      RAISE EXCEPTION 'Akses ditolak: Akun pengguna tidak ditemukan atau telah dinonaktifkan.';
    END IF;

    IF v_user_role <> 'manajer' THEN
      RAISE EXCEPTION 'Akses ditolak: Hanya Manajer aktif yang berhak melepas klaim tagihan Mayar.';
    END IF;
  END IF;

  -- 3. Kunci Baris Pesanan Secara Eksklusif
  SELECT id, status, mayar_payment_id, mayar_payment_url, mayar_claim_token, mayar_claim_at
  INTO v_pesanan
  FROM public.pesanan_jual
  WHERE id = p_pesanan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pesanan jual dengan ID % tidak ditemukan pada database.', p_pesanan_id;
  END IF;

  -- 4. Validasi Status Pesanan (Wajib 'dikirim')
  IF v_pesanan.status <> 'dikirim' THEN
    RAISE EXCEPTION 'Pelepasan klaim ditolak: Status pesanan saat ini adalah "%". Hanya pesanan "dikirim" yang dapat diproses.', v_pesanan.status;
  END IF;

  -- 5. Pencegahan Tagihan Ganda: Dilarang Melepas Klaim Jika Tagihan Mayar Sudah Ada
  IF v_pesanan.mayar_payment_id IS NOT NULL OR v_pesanan.mayar_payment_url IS NOT NULL THEN
    RAISE EXCEPTION 'Pelepasan klaim ditolak: Pesanan sudah memiliki tagihan Mayar tertaut (ID: %). Pelepasan klaim dilarang demi mencegah invoice ganda.', v_pesanan.mayar_payment_id;
  END IF;

  -- 6. Validasi Kesesuaian Token Klaim (Hanya Pemilik Sewa yang Berhak Melepas)
  IF v_pesanan.mayar_claim_token IS NULL OR v_pesanan.mayar_claim_token <> p_claim_token THEN
    RAISE EXCEPTION 'Pelepasan klaim ditolak: Token klaim tidak valid, tidak cocok, atau sudah terlepas.';
  END IF;

  -- 7. Bersihkan Token & Waktu Klaim
  UPDATE public.pesanan_jual
  SET mayar_claim_token = NULL,
      mayar_claim_at = NULL
  WHERE id = p_pesanan_id
    AND mayar_claim_token = p_claim_token;

  RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC: rekonsiliasi_klaim_mayar
-- -----------------------------------------------------------------------------
-- Menangani pemulihan klaim kedaluwarsa (IN_DOUBT_STALE) secara administratif
-- setelah Manajer melakukan verifikasi silang pada portal/API Mayar.
-- BATAS KEAMANAN MUTLAK:
-- Hanya dapat dieksekusi oleh SERVER TRUSTED IDENTITY (service_role via JWT claim,
-- atau superuser/DBA langsung pada sesi psql/SQL Editor tanpa JWT).
CREATE OR REPLACE FUNCTION public.rekonsiliasi_klaim_mayar(
  p_pesanan_id UUID,
  p_tindakan TEXT, -- 'BATALKAN_KLAIM' atau 'TAUTKAN_INVOICE'
  p_nominal NUMERIC DEFAULT NULL, -- Wajib untuk TAUTKAN_INVOICE
  p_payment_id TEXT DEFAULT NULL,
  p_payment_url TEXT DEFAULT NULL,
  p_payment_status TEXT DEFAULT 'unpaid',
  p_pelaku_id UUID DEFAULT NULL, -- Pelaku audit terverifikasi server
  p_alasan TEXT DEFAULT NULL      -- Alasan rekonsiliasi terdokumentasi
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role TEXT;
  v_pelaku_role TEXT;
  v_pelaku_aktif BOOLEAN;
  v_pesanan RECORD;
  v_clean_status TEXT;
  v_clean_payment_id TEXT;
  v_clean_payment_url TEXT;
  v_clean_alasan TEXT;
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  -- 1. Verifikasi Batas Kepercayaan Pemanggil (Trusted Server Identity Only)
  v_caller_role := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''), '');
  IF v_caller_role <> 'service_role' THEN
    IF NOT (pg_catalog.session_user IN ('postgres', 'supabase_admin') AND v_caller_role = '') THEN
      RAISE EXCEPTION 'Akses ditolak: Fungsi ini adalah fungsi privat server dan hanya dapat dieksekusi oleh service_role.';
    END IF;
  END IF;

  -- 2. Validasi Identitas Pelaku Audit yang Diteruskan oleh Server Action
  IF p_pelaku_id IS NULL THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: ID pelaku audit wajib disertakan oleh server.';
  END IF;

  SELECT peran, aktif INTO v_pelaku_role, v_pelaku_aktif
  FROM public.profiles
  WHERE id = p_pelaku_id;

  IF v_pelaku_role IS NULL OR v_pelaku_aktif IS NOT TRUE OR v_pelaku_role <> 'manajer' THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: Pelaku audit harus Manajer aktif yang terdaftar.';
  END IF;

  v_clean_alasan := pg_catalog.btrim(COALESCE(p_alasan, 'Rekonsiliasi klaim oleh Manajer'));
  IF pg_catalog.length(v_clean_alasan) < 5 THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: Alasan rekonsiliasi wajib diisi minimal 5 karakter untuk jejak audit.';
  END IF;

  -- 3. Kunci Baris Pesanan
  SELECT id, nomor, status, total, mayar_payment_id, mayar_payment_url, mayar_status, mayar_claim_token, mayar_claim_at
  INTO v_pesanan
  FROM public.pesanan_jual
  WHERE id = p_pesanan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pesanan jual tidak ditemukan.';
  END IF;

  -- 4. Pesanan Wajib Berstatus 'dikirim'
  IF v_pesanan.status <> 'dikirim' THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: Status pesanan saat ini adalah "%". Hanya pesanan "dikirim" yang dapat direkonsiliasi.', v_pesanan.status;
  END IF;

  -- 5. Pencegahan Tagihan Ganda: Tolak rekonsiliasi jika pesanan sudah memiliki invoice Mayar
  IF v_pesanan.mayar_payment_id IS NOT NULL OR v_pesanan.mayar_payment_url IS NOT NULL THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: Pesanan sudah memiliki tagihan Mayar tertaut (ID: %). Rekonsiliasi dilarang demi mencegah pembuatan tagihan ganda.', v_pesanan.mayar_payment_id;
  END IF;

  -- 6. Validasi Kondisi Token dan Waktu Klaim (Deteksi Inkonsistensi Parsial)
  IF (v_pesanan.mayar_claim_token IS NOT NULL AND v_pesanan.mayar_claim_at IS NULL)
     OR (v_pesanan.mayar_claim_token IS NULL AND v_pesanan.mayar_claim_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: Kondisi klaim konkurensi tidak konsisten pada basis data (token atau timestamp klaim terisi sebagian). Hubungi administrator untuk pemeriksaan integritas data.';
  END IF;

  -- 7. Pesanan Wajib Sedang Mengalami Klaim Menggantung (Keduanya Wajib Terisi)
  IF v_pesanan.mayar_claim_token IS NULL OR v_pesanan.mayar_claim_at IS NULL THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: Pesanan tidak memiliki klaim aktif atau menggantung.';
  END IF;

  -- 8. Validasi Kedaluwarsa: Rekonsiliasi HANYA boleh jika sewa klaim BENAR-BENAR KEDALUWARSA (>= 60 detik)
  IF (v_now - v_pesanan.mayar_claim_at) < interval '60 seconds' THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: Klaim masih dalam durasi sewa aktif (< 60 detik). Tunggu hingga batas waktu sewa berakhir sebelum rekonsiliasi.';
  END IF;

  -- 9. Eksekusi Tindakan Rekonsiliasi
  IF p_tindakan = 'BATALKAN_KLAIM' THEN
    IF v_pesanan.mayar_payment_id IS NOT NULL OR v_pesanan.mayar_payment_url IS NOT NULL THEN
      RAISE EXCEPTION 'Pembatalan klaim ditolak: Pesanan sudah memiliki invoice tertaut (%).', v_pesanan.mayar_payment_id;
    END IF;

    UPDATE public.pesanan_jual
    SET mayar_claim_token = NULL,
        mayar_claim_at = NULL
    WHERE id = p_pesanan_id;

    INSERT INTO public.audit_log (
      pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru, dibuat_pada
    ) VALUES (
      p_pelaku_id,
      'rekonsiliasi_batal_klaim_mayar',
      'pesanan_jual',
      p_pesanan_id,
      pg_catalog.jsonb_build_object('claim_token', v_pesanan.mayar_claim_token, 'claim_at', v_pesanan.mayar_claim_at),
      pg_catalog.jsonb_build_object('claim_token', null, 'claim_at', null, 'alasan', v_clean_alasan),
      v_now
    );

    RETURN pg_catalog.jsonb_build_object(
      'success', true, 
      'pesan', 'Klaim menggantung berhasil dibatalkan. Pesanan siap dibuatkan tagihan kembali.'
    );

  ELSIF p_tindakan = 'TAUTKAN_INVOICE' THEN
    IF v_pesanan.mayar_payment_id IS NOT NULL OR v_pesanan.mayar_payment_url IS NOT NULL THEN
      RAISE EXCEPTION 'Penautan ditolak: Pesanan sudah memiliki invoice tertaut (%).', v_pesanan.mayar_payment_id;
    END IF;

    IF p_nominal IS NULL OR v_pesanan.total <> p_nominal THEN
      RAISE EXCEPTION 'Penautan ditolak: Nominal tagihan Mayar (%) tidak sesuai dengan total pesanan (%). Penautan invoice dengan nominal berbeda dilarang.', p_nominal, v_pesanan.total;
    END IF;

    v_clean_payment_id := pg_catalog.btrim(COALESCE(p_payment_id, ''));
    v_clean_payment_url := pg_catalog.btrim(COALESCE(p_payment_url, ''));
    v_clean_status := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_payment_status, '')));

    IF pg_catalog.length(v_clean_payment_id) = 0 THEN
      RAISE EXCEPTION 'Penautan ditolak: Payment ID Mayar wajib diisi.';
    END IF;

    IF v_clean_payment_url !~* '^https://([a-zA-Z0-9\-]+\.)*(mayar\.link|mayar\.club|mayar\.id)/' THEN
      RAISE EXCEPTION 'Penautan ditolak: URL pembayaran tidak valid atau bukan berasal dari domain resmi Mayar.';
    END IF;

    IF v_clean_status NOT IN ('unpaid', 'paid') THEN
      RAISE EXCEPTION 'Penautan ditolak: Status invoice Mayar harus "unpaid" atau "paid". Status "%" tidak valid untuk penautan aktif.', p_payment_status;
    END IF;

    UPDATE public.pesanan_jual
    SET mayar_payment_id = v_clean_payment_id,
        mayar_payment_url = v_clean_payment_url,
        mayar_status = v_clean_status,
        mayar_claim_token = NULL,
        mayar_claim_at = NULL
    WHERE id = p_pesanan_id;

    INSERT INTO public.audit_log (
      pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru, dibuat_pada
    ) VALUES (
      p_pelaku_id,
      'rekonsiliasi_tautkan_mayar',
      'pesanan_jual',
      p_pesanan_id,
      pg_catalog.jsonb_build_object('mayar_payment_id', null, 'claim_token', v_pesanan.mayar_claim_token),
      pg_catalog.jsonb_build_object('mayar_payment_id', v_clean_payment_id, 'mayar_status', v_clean_status, 'total', v_pesanan.total, 'alasan', v_clean_alasan),
      v_now
    );

    RETURN pg_catalog.jsonb_build_object(
      'success', true, 
      'pesan', 'Invoice dari Mayar berhasil diverifikasi dan ditautkan ke pesanan.'
    );

  ELSE
    RAISE EXCEPTION 'Tindakan rekonsiliasi "%" tidak valid. Pilihan: "BATALKAN_KLAIM" atau "TAUTKAN_INVOICE".', p_tindakan;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. HAK AKSES EKSEKUSI (PRIVILEGES & TRUST BOUNDARY)
-- -----------------------------------------------------------------------------
-- 1. klaim_tagihan_mayar
REVOKE ALL ON FUNCTION public.klaim_tagihan_mayar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.klaim_tagihan_mayar(UUID) TO authenticated, service_role;

-- 2. lepas_klaim_tagihan_mayar
REVOKE ALL ON FUNCTION public.lepas_klaim_tagihan_mayar(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lepas_klaim_tagihan_mayar(UUID, UUID) TO authenticated, service_role;

-- 3. simpan_tagihan_mayar (HANYA service_role)
REVOKE ALL ON FUNCTION public.simpan_tagihan_mayar(UUID, UUID, TEXT, TEXT, NUMERIC, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.simpan_tagihan_mayar(UUID, UUID, TEXT, TEXT, NUMERIC, UUID, TEXT) TO service_role;

-- 4. rekonsiliasi_klaim_mayar (HANYA service_role)
REVOKE ALL ON FUNCTION public.rekonsiliasi_klaim_mayar(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rekonsiliasi_klaim_mayar(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT) TO service_role;

COMMIT;
