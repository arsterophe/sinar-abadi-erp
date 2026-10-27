-- =============================================================================
-- Migrasi 07: Perbaikan Allowlist Domain Sandbox Mayar (myr.lat)
-- File: scripts/migrations/07_allowlist_domain_sandbox_mayar.sql
-- =============================================================================
-- TUJUAN:
-- Memperbaiki validasi URL pembayaran Mayar pada RPC 'simpan_tagihan_mayar' dan
-- 'rekonsiliasi_klaim_mayar' agar domain portal checkout resmi Sandbox Mayar
-- (*.myr.lat) diizinkan tanpa perlu melakukan manipulasi/normalisasi hostname.
--
-- PERUBAHAN REGEX VALIDASI URL:
-- SEBELUM (Migrasi 06):
--   ^https://([a-zA-Z0-9\-]+\.)*(mayar\.link|mayar\.club|mayar\.id|myr\.id)/
--
-- SESUDAH (Migrasi 07 Final - Selaras Kebijakan Aplikasi):
--   ^https://(erp-sinar-abadi-ale\.myr\.lat|([a-zA-Z0-9-]+\.)*(mayar\.(link|club|id)|myr\.id))/invoices/[a-zA-Z0-9_-]+$
--
-- PENEGAKAN KEAMANAN & AKSES KETAT:
-- 1. Protokol WAJIB HTTPS (menolak http://).
-- 2. Hostname Sandbox DIBATASI KETAT hanya ke tenant resmi yang dikonfigurasi (erp-sinar-abadi-ale.myr.lat).
--    Menolak hostname arbitrer seperti attacker.myr.lat atau *.myr.lat lainnya.
-- 3. Domain Produksi tetap mendukung mayar.link, mayar.club, mayar.id, myr.id dan subdomain resminya.
-- 4. Path WAJIB sesuai format faktur checkout resmi: /invoices/{short_code}.
--    Menolak URL customer portal sintetis /{uuid}, path kosong, atau path traversal.
-- 5. Menolak URL dengan userinfo/kredensial (admin:secret@...) dan port khusus (:8080).
-- 6. Tetap SECURITY DEFINER dengan SET search_path = ''.
-- 7. Tetap mewajibkan pemanggil 'service_role' dan pelaku audit peran 'manajer'.
-- 8. Hak eksekusi tetap di-REVOKE dari PUBLIC, anon, authenticated dan HANYA di-GRANT ke service_role.
-- 9. Menjaga signature parameter dan return type 100% kompatibel dengan implementasi aktif.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. RPC: simpan_tagihan_mayar
-- -----------------------------------------------------------------------------
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
  v_caller_role TEXT := '';
  v_raw_claims TEXT;
  v_pelaku_role TEXT;
  v_pelaku_aktif BOOLEAN;
  v_pesanan RECORD;
  v_clean_payment_id TEXT;
  v_clean_payment_url TEXT;
  v_clean_status TEXT;
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  -- 1. Verifikasi Batas Kepercayaan Pemanggil (Trusted Server Identity Only)
  v_caller_role := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''), '');

  IF v_caller_role = '' THEN
    v_raw_claims := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '');
    IF v_raw_claims IS NOT NULL THEN
      BEGIN
        v_caller_role := COALESCE(NULLIF(v_raw_claims::jsonb ->> 'role', ''), '');
      EXCEPTION WHEN OTHERS THEN
        v_caller_role := '';
      END;
    END IF;
  END IF;

  IF v_caller_role <> 'service_role' THEN
    IF NOT (session_user IN ('postgres', 'supabase_admin') AND v_caller_role = '') THEN
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

  -- Validasi URL Pembayaran Ketat (Hanya Tenant Sandbox Resmi & Domain Produksi Resmi Mayar, Format Wajib /invoices/{short_code})
  IF v_clean_payment_url !~* '^https://(erp-sinar-abadi-ale\.myr\.lat|([a-zA-Z0-9-]+\.)*(mayar\.(link|club|id)|myr\.id))/invoices/[a-zA-Z0-9_-]+$' THEN
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

  -- 11. Catat Audit Log Minimum Secara Atomik (BR-12: URL Tidak Disimpan di Audit Log)
  INSERT INTO public.audit_log (
    pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru, dibuat_pada
  ) VALUES (
    p_pelaku_id,
    'buat_tagihan_mayar',
    'pesanan_jual',
    p_pesanan_id,
    pg_catalog.jsonb_build_object('mayar_payment_id', v_pesanan.mayar_payment_id, 'mayar_status', v_pesanan.mayar_status, 'claim_token', v_pesanan.mayar_claim_token),
    pg_catalog.jsonb_build_object('mayar_payment_id', v_clean_payment_id, 'mayar_status', 'unpaid', 'nominal', p_nominal),
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

-- Izin Hak Akses simpan_tagihan_mayar (HANYA service_role)
REVOKE ALL ON FUNCTION public.simpan_tagihan_mayar(UUID, UUID, TEXT, TEXT, NUMERIC, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.simpan_tagihan_mayar(UUID, UUID, TEXT, TEXT, NUMERIC, UUID, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. RPC: rekonsiliasi_klaim_mayar
-- -----------------------------------------------------------------------------
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
  v_caller_role TEXT := '';
  v_raw_claims TEXT;
  v_pelaku_role TEXT;
  v_pelaku_aktif BOOLEAN;
  v_pesanan RECORD;
  v_clean_alasan TEXT;
  v_clean_payment_id TEXT;
  v_clean_payment_url TEXT;
  v_clean_status TEXT;
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  -- 1. Verifikasi Batas Kepercayaan Pemanggil (Trusted Server Identity Only)
  v_caller_role := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''), '');

  IF v_caller_role = '' THEN
    v_raw_claims := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '');
    IF v_raw_claims IS NOT NULL THEN
      BEGIN
        v_caller_role := COALESCE(NULLIF(v_raw_claims::jsonb ->> 'role', ''), '');
      EXCEPTION WHEN OTHERS THEN
        v_caller_role := '';
      END;
    END IF;
  END IF;

  IF v_caller_role <> 'service_role' THEN
    IF NOT (session_user IN ('postgres', 'supabase_admin') AND v_caller_role = '') THEN
      RAISE EXCEPTION 'Akses ditolak: Fungsi ini adalah fungsi privat server dan hanya dapat dieksekusi oleh service_role.';
    END IF;
  END IF;

  -- 2. Validasi Identitas Pelaku Audit
  IF p_pelaku_id IS NULL THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: ID pelaku audit wajib disertakan oleh server.';
  END IF;

  SELECT peran, aktif INTO v_pelaku_role, v_pelaku_aktif
  FROM public.profiles
  WHERE id = p_pelaku_id;

  IF v_pelaku_role IS NULL OR v_pelaku_aktif IS NOT TRUE THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: Akun pelaku audit tidak ditemukan atau telah dinonaktifkan.';
  END IF;

  IF v_pelaku_role <> 'manajer' THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: Pelaku audit harus memiliki peran Manajer aktif.';
  END IF;

  -- 3. Validasi Alasan Audit
  v_clean_alasan := pg_catalog.btrim(COALESCE(p_alasan, 'Rekonsiliasi klaim oleh Manajer'));
  IF pg_catalog.length(v_clean_alasan) < 5 THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: Alasan audit rekonsiliasi wajib diisi minimal 5 karakter.';
  END IF;

  -- 4. Kunci Baris Pesanan
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
    RAISE EXCEPTION 'Rekonsiliasi ditolak: Status pesanan sudah berubah menjadi "%".', v_pesanan.status;
  END IF;

  -- 6. Validasi Kondisi Token dan Waktu Klaim
  IF (v_pesanan.mayar_claim_token IS NOT NULL AND v_pesanan.mayar_claim_at IS NULL)
     OR (v_pesanan.mayar_claim_token IS NULL AND v_pesanan.mayar_claim_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: Kondisi klaim konkurensi tidak konsisten pada basis data. Hubungi administrator.';
  END IF;

  -- 7. Pesanan Wajib Sedang Mengalami Klaim Menggantung
  IF v_pesanan.mayar_claim_token IS NULL OR v_pesanan.mayar_claim_at IS NULL THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: Pesanan tidak memiliki klaim aktif atau menggantung.';
  END IF;

  -- 8. Validasi Kedaluwarsa Sewa (>= 60 detik)
  IF (v_now - v_pesanan.mayar_claim_at) < interval '60 seconds' THEN
    RAISE EXCEPTION 'Rekonsiliasi ditolak: Klaim masih dalam durasi sewa aktif (< 60 detik). Tunggu hingga batas waktu sewa berakhir.';
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

    -- Validasi URL Pembayaran Ketat (Hanya Tenant Sandbox Resmi & Domain Produksi Resmi Mayar, Format Wajib /invoices/{short_code})
    IF v_clean_payment_url !~* '^https://(erp-sinar-abadi-ale\.myr\.lat|([a-zA-Z0-9-]+\.)*(mayar\.(link|club|id)|myr\.id))/invoices/[a-zA-Z0-9_-]+$' THEN
      RAISE EXCEPTION 'Penautan ditolak: URL pembayaran tidak valid atau bukan berasal dari domain resmi Mayar.';
    END IF;

    IF v_clean_status NOT IN ('unpaid', 'paid') THEN
      RAISE EXCEPTION 'Penautan ditolak: Status invoice Mayar harus "unpaid" atau "paid". Status "%" tidak valid.', p_payment_status;
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

-- Izin Hak Akses rekonsiliasi_klaim_mayar (HANYA service_role)
REVOKE ALL ON FUNCTION public.rekonsiliasi_klaim_mayar(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rekonsiliasi_klaim_mayar(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT) TO service_role;

COMMIT;
