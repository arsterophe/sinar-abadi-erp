-- =============================================================================
-- MIGRASI 05: RPC PELUNASAN ATOMIK DAN AUDIT LOG MAYAR (CV SINAR ABADI NIAGA)
-- Target Proyek: Supabase Production (ref: wvjccwatzmvjtoguaugh)
-- File: scripts/migrations/05_rpc_pelunasan_atomik_mayar.sql
-- Status: DRAFT PENINJAUAN (JANGAN DIJALANKAN TANPA PERSETUJUAN EKSPLISIT)
-- =============================================================================
-- Tujuan:
-- Menyediakan satu fungsi RPC database transaksi tunggal (atomik) untuk
-- memproses pembayaran Mayar terverifikasi:
-- 1. Mengunci baris pesanan secara eksklusif (FOR UPDATE) berdasarkan ID pesanan
--    dan ID pembayaran Mayar untuk mencegah race condition.
-- 2. Memvalidasi status pesanan ('dikirim') dan kesesuaian nominal (anti-fraud).
-- 3. Memperbarui status pesanan menjadi 'lunas' dan mayar_status = 'paid'.
-- 4. Mencatat jejak audit ke public.audit_log dalam transaksi yang sama.
-- 5. Menjamin idempotensi mutlak jika webhook dipanggil berulang kali.
-- 6. Otorisasi ketat: Hanya service_role (backend server terpercaya) via PostgREST JWT claim.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. BERSIHKAN FUNCTION LAMA DENGAN SELURUH VARIASI OVERLOAD
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.selesaikan_pembayaran_mayar(TEXT, NUMERIC, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.selesaikan_pembayaran_mayar(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.selesaikan_pembayaran_mayar(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID);

-- -----------------------------------------------------------------------------
-- 2. DEFINISI RPC: selesaikan_pembayaran_mayar
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.selesaikan_pembayaran_mayar(
  p_pesanan_id UUID,
  p_payment_id TEXT,
  p_verified_amount NUMERIC,
  p_verified_status TEXT,
  p_transaction_id TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_pelaku_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role TEXT;
  v_pesanan RECORD;
  v_clean_payment_id TEXT;
  v_clean_status TEXT;
  v_pelaku_id UUID;
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  -- 1. Verifikasi Batas Kepercayaan Pemanggil (Trusted Server Identity Only)
  -- Menggunakan pola pemeriksaan role teruji dari Migrasi 04 (simpan_tagihan_mayar):
  -- Memeriksa role dari JWT claim PostgREST atau sesi koneksi superuser DBA langsung.
  -- CATATAN KEAMANAN: Jangan mengandalkan pg_catalog.current_user pada fungsi SECURITY DEFINER
  -- karena konteksnya secara otomatis beralih menjadi pemilik fungsi (postgres).
  v_caller_role := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''), '');
  IF v_caller_role <> 'service_role' THEN
    IF NOT (pg_catalog.session_user IN ('postgres', 'supabase_admin') AND v_caller_role = '') THEN
      RAISE EXCEPTION 'Akses ditolak: Fungsi ini adalah fungsi privat server dan hanya dapat dieksekusi oleh service_role.';
    END IF;
  END IF;

  -- 2. Sanitasi & Validasi Input Parameter
  IF p_pesanan_id IS NULL THEN
    RAISE EXCEPTION 'Parameter p_pesanan_id wajib diisi.';
  END IF;

  v_clean_payment_id := pg_catalog.trim(COALESCE(p_payment_id, ''));
  IF v_clean_payment_id = '' THEN
    RAISE EXCEPTION 'Parameter p_payment_id wajib diisi.';
  END IF;

  IF p_verified_amount IS NULL OR p_verified_amount <= 0 THEN
    RAISE EXCEPTION 'Parameter p_verified_amount wajib bernilai positif.';
  END IF;

  -- Validasi status terverifikasi dari gateway secara eksplisit
  -- Batas Kepercayaan: RPC tidak mempercayai nama parameter; status harus bernilai paid sesuai kontrak resmi Mayar V1
  v_clean_status := pg_catalog.lower(pg_catalog.trim(COALESCE(p_verified_status, '')));
  IF v_clean_status <> 'paid' THEN
    RAISE EXCEPTION 'Parameter p_verified_status tidak valid (harus "paid"). Diterima: %', v_clean_status;
  END IF;

  -- 3. Kunci Baris Pesanan Secara Eksklusif (FOR UPDATE) Berdasarkan ID Pesanan & Payment ID
  -- Mengunci baris berdasarkan Primary Key (id) yang terindeks unik dan memverifikasi
  -- bahwa mayar_payment_id persis cocok dengan tagihan yang diterbitkan.
  -- Menjamin konkurensi: Jika 2 webhook paralel tiba bersamaan, request kedua akan
  -- menunggu hingga transaksi pertama selesai, lalu membaca status 'lunas' dan keluar idempoten.
  SELECT id, nomor, status, total, mayar_payment_id, mayar_status, dilunasi_pada, dibuat_oleh
  INTO v_pesanan
  FROM public.pesanan_jual
  WHERE id = p_pesanan_id AND mayar_payment_id = v_clean_payment_id
  FOR UPDATE;

  -- 4. Validasi Keberadaan & Kecocokan Relasi Pesanan-Invoice
  IF v_pesanan.id IS NULL THEN
    RAISE EXCEPTION 'Pesanan dengan ID "%" dan mayar_payment_id "%" tidak ditemukan atau tidak cocok.',
      p_pesanan_id, v_clean_payment_id;
  END IF;

  -- 5. Validasi Integritas Nominal (Anti-Fraud Eksak Tanpa Toleransi Pembulatan)
  -- Nominal gateway wajib cocok persis dengan total pesanan sebelum evaluasi apa pun (termasuk sebelum idempotensi)
  IF v_pesanan.total <> p_verified_amount THEN
    RAISE EXCEPTION 'Integritas nominal gagal: Total pesanan (Rp%) tidak cocok dengan nominal terverifikasi gateway (Rp%). Pelunasan dibatalkan demi keamanan audit.',
      v_pesanan.total, p_verified_amount;
  END IF;

  -- 6. Idempotensi Mutlak (PRD BR-07)
  -- Jika pesanan sudah berstatus 'lunas' dan nominal terverifikasi cocok, kembalikan respons idempoten tanpa duplikasi audit log.
  IF v_pesanan.status = 'lunas' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', pg_catalog.format('Pesanan %s sudah berstatus lunas sebelumnya. Tidak ada perubahan dilakukan.', v_pesanan.nomor),
      'data', pg_catalog.jsonb_build_object(
        'id', v_pesanan.id,
        'nomor', v_pesanan.nomor,
        'status', 'lunas',
        'dilunasi_pada', v_pesanan.dilunasi_pada
      )
    );
  END IF;

  -- 7. Validasi Transisi Status (Hanya 'dikirim' yang dapat dilunasi sesuai PRD BR-07)
  IF v_pesanan.status <> 'dikirim' THEN
    RAISE EXCEPTION 'Pelunasan ditolak: Status pesanan saat ini adalah "%". Hanya pesanan berstatus "dikirim" yang dapat dicatat lunas.', v_pesanan.status;
  END IF;

  -- 8. Eksekusi Pembaruan Status Pesanan Menjadi 'lunas'
  UPDATE public.pesanan_jual
  SET status = 'lunas',
      dilunasi_pada = v_now,
      mayar_status = 'paid'
  WHERE id = v_pesanan.id;

  -- 9. Pencatatan Jejak Audit Log Atomik (PRD BR-12)
  -- Memenuhi constraint skema database production:
  -- pelaku_id: UUID NOT NULL REFERENCES public.profiles(id)
  -- data_id: UUID NOT NULL
  -- nilai_baru: JSONB NOT NULL
  v_pelaku_id := COALESCE(p_pelaku_id, v_pesanan.dibuat_oleh);
  IF v_pelaku_id IS NULL THEN
    RAISE EXCEPTION 'Integritas audit gagal: Identitas pelaku audit tidak ditemukan untuk pesanan %.', v_pesanan.nomor;
  END IF;

  INSERT INTO public.audit_log (
    pelaku_id,
    aksi,
    nama_tabel,
    data_id,
    nilai_lama,
    nilai_baru,
    dibuat_pada
  ) VALUES (
    v_pelaku_id,
    'pelunasan_mayar',
    'pesanan_jual',
    v_pesanan.id,
    pg_catalog.jsonb_build_object(
      'status', v_pesanan.status,
      'mayar_status', COALESCE(v_pesanan.mayar_status, 'unpaid')
    ),
    pg_catalog.jsonb_build_object(
      'status', 'lunas',
      'mayar_status', 'paid',
      'dilunasi_pada', v_now,
      'mayar_payment_id', v_clean_payment_id,
      'mayar_transaction_id', p_transaction_id,
      'metode_pembayaran', p_payment_method,
      'total', v_pesanan.total,
      'sumber_aksi', 'webhook_mayar_otomatis'
    ),
    v_now
  );

  -- 10. Kembalikan Respons Sukses Atomik
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'idempotent', false,
    'message', pg_catalog.format('Pesanan %s berhasil diverifikasi dan dicatat lunas secara atomik.', v_pesanan.nomor),
    'data', pg_catalog.jsonb_build_object(
      'id', v_pesanan.id,
      'nomor', v_pesanan.nomor,
      'status', 'lunas',
      'dilunasi_pada', v_now
    )
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. HAK AKSES KETAT (REVOKE DARI PUBLIC/ANON/AUTHENTICATED, GRANT KE SERVICE_ROLE)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.selesaikan_pembayaran_mayar(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.selesaikan_pembayaran_mayar(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.selesaikan_pembayaran_mayar(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID) IS 'RPC atomik internal berwenang penuh untuk memproses pelunasan pesanan jual dan audit log sekaligus dalam satu transaksi database.';

COMMIT;
