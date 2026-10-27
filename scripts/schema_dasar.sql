-- =============================================================================
-- SKEMA DASAR DATABASE: CV SINAR ABADI NIAGA (SISTEM ERP DISTRIBUSI)
-- File: scripts/schema_dasar.sql
-- Status: Rekonstruksi Skema Dasar dari Sumber Terverifikasi Lokal
-- Sumber Acuan:
--   1. scripts/import_seed_data.py (TABLE_SCHEMAS & IMPORT_ORDER)
--   2. scripts/pemeriksaan_pra_migrasi_03_read_only.sql (Katalog Kolom Prasyarat)
--   3. Berkas Tipe TypeScript (src/types/auth.ts, barang.ts, pelanggan.ts, pembelian.ts, pesanan_jual.ts)
--   4. PRD Bab 4 (Aturan Bisnis BR-01 s/d BR-12) & ERD_ERP (.pdf / .png)
--   5. scripts/migrations/01, 02, 03 (Objek & Kolom Prasyarat)
--
-- KETENTUAN PENGGUNAAN:
-- 1. File ini HANYA memuat DDL skema dasar (CREATE TABLE, Primary Key, Foreign Key,
--    Constraint, Default Value, dan Index Dasar).
-- 2. TIDAK memuat data produksi, data seed, maupun kredensial/secret.
-- 3. TIDAK memuat kebijakan RLS, trigger, dan RPC (diterapkan terpisah oleh migrasi 01–03).
-- 4. TIDAK memuat kolom konkurensi migrasi 04 (mayar_claim_token, mayar_claim_at),
--    agar migrasi 04 dapat diuji secara bertahap dan valid di lingkungan staging.
-- =============================================================================

BEGIN;

-- Pastikan ekstensi UUID tersedia
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. TABEL: public.profiles
-- Acuan: src/types/auth.ts, PRD Bab 3, scripts/import_seed_data.py (ACTUAL_PROFILES)
-- Ketergantungan: auth.users (Supabase Auth)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nama_lengkap TEXT NOT NULL,
  peran TEXT NOT NULL CHECK (peran IN ('penjualan', 'gudang', 'manajer')),
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

COMMENT ON TABLE public.profiles IS 'Data profil internal pengguna ERP CV Sinar Abadi Niaga yang terikat dengan Supabase Auth.';

-- -----------------------------------------------------------------------------
-- 2. TABEL: public.pemasok
-- Acuan: scripts/import_seed_data.py (line 75–80), src/types/pembelian.ts (PemasokItem)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pemasok (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode TEXT NOT NULL UNIQUE,
  nama TEXT NOT NULL,
  telepon TEXT NULL,
  alamat TEXT NULL,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

COMMENT ON TABLE public.pemasok IS 'Master data 4 pemasok utama barang kebutuhan pokok.';

-- -----------------------------------------------------------------------------
-- 3. TABEL: public.pelanggan
-- Acuan: scripts/import_seed_data.py (line 81–86), src/types/pelanggan.ts, PRD BR-05
-- Ketergantungan: public.profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pelanggan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode TEXT NOT NULL UNIQUE,
  nama_toko TEXT NOT NULL,
  telepon TEXT NULL,
  alamat TEXT NULL,
  batas_kredit NUMERIC NOT NULL DEFAULT 0 CHECK (batas_kredit >= 0),
  termin_hari INTEGER NOT NULL DEFAULT 0 CHECK (termin_hari IN (0, 7, 14, 30)),
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  dibuat_oleh UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

COMMENT ON TABLE public.pelanggan IS 'Master data toko kelontong dan minimarket pelanggan distribusi.';

-- -----------------------------------------------------------------------------
-- 4. TABEL: public.barang
-- Acuan: scripts/import_seed_data.py (line 87–92), src/types/barang.ts, PRD BR-01
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.barang (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode TEXT NOT NULL UNIQUE,
  nama TEXT NOT NULL,
  satuan TEXT NOT NULL,
  harga_jual NUMERIC NOT NULL CHECK (harga_jual > 0),
  harga_pokok NUMERIC NOT NULL DEFAULT 0 CHECK (harga_pokok >= 0),
  stok INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
  stok_minimum INTEGER NOT NULL DEFAULT 0 CHECK (stok_minimum >= 0),
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

COMMENT ON TABLE public.barang IS 'Katalog master barang dagangan dengan batas stok dan harga.';

-- -----------------------------------------------------------------------------
-- 5. TABEL: public.pembelian
-- Acuan: scripts/import_seed_data.py (line 93–98), scripts/pemeriksaan_pra_migrasi_03_read_only.sql (line 62–76)
-- Ketergantungan: public.pemasok, public.barang, public.profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pembelian (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor TEXT NOT NULL UNIQUE,
  pemasok_id UUID NOT NULL REFERENCES public.pemasok(id),
  barang_id UUID NOT NULL REFERENCES public.barang(id),
  jumlah_dipesan INTEGER NOT NULL CHECK (jumlah_dipesan >= 1 AND jumlah_dipesan <= 10000),
  jumlah_diterima INTEGER NULL CHECK (jumlah_diterima IS NULL OR jumlah_diterima >= 0),
  harga_beli_satuan NUMERIC NULL CHECK (harga_beli_satuan IS NULL OR harga_beli_satuan > 0),
  status TEXT NOT NULL DEFAULT 'diajukan' CHECK (status IN ('diajukan', 'disetujui', 'ditolak', 'diterima', 'dibatalkan')),
  alasan_tolak TEXT NULL,
  diajukan_oleh UUID NOT NULL REFERENCES public.profiles(id),
  diajukan_pada TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  diputuskan_oleh UUID NULL REFERENCES public.profiles(id),
  diputuskan_pada TIMESTAMPTZ NULL,
  diterima_oleh UUID NULL REFERENCES public.profiles(id),
  diterima_pada TIMESTAMPTZ NULL
);

COMMENT ON TABLE public.pembelian IS 'Transaksi Purchase Order (PO) pembelian barang ke pemasok.';

-- -----------------------------------------------------------------------------
-- 6. TABEL: public.pesanan_jual
-- Acuan: scripts/import_seed_data.py (line 99–104), src/types/pesanan_jual.ts, PRD BR-07
-- Catatan: Mempertahankan kolom metadata Mayar awal (mayar_payment_id, mayar_payment_url,
-- mayar_status) yang telah ada sebelum migrasi 04. Kolom sewa klaim konkurensi
-- (mayar_claim_token, mayar_claim_at) SENGAJA TIDAK dimasukkan agar draf migrasi 04
-- dapat diuji secara bertahap.
-- Ketergantungan: public.pelanggan, public.profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pesanan_jual (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor TEXT NOT NULL UNIQUE,
  pelanggan_id UUID NOT NULL REFERENCES public.pelanggan(id),
  status TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf', 'dikonfirmasi', 'dikirim', 'lunas', 'dibatalkan')),
  total NUMERIC NOT NULL DEFAULT 0 CHECK (total >= 0),
  dibuat_oleh UUID NOT NULL REFERENCES public.profiles(id),
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  dikonfirmasi_pada TIMESTAMPTZ NULL,
  dikirim_pada TIMESTAMPTZ NULL,
  jatuh_tempo DATE NULL,
  dilunasi_pada TIMESTAMPTZ NULL,
  dibatalkan_pada TIMESTAMPTZ NULL,
  alasan_batal TEXT NULL,
  -- Metadata Pembayaran Mayar Awal (Pra-Migrasi 04)
  mayar_payment_id TEXT NULL,
  mayar_payment_url TEXT NULL,
  mayar_status TEXT NULL
  -- TODO: Kolom mayar_claim_token & mayar_claim_at ditambahkan oleh scripts/migrations/04_integrasi_mayar_dan_konkurensi.sql
);

COMMENT ON TABLE public.pesanan_jual IS 'Header transaksi pesanan penjualan (Sales Order) ke pelanggan.';

-- -----------------------------------------------------------------------------
-- 7. TABEL: public.item_pesanan_jual
-- Acuan: scripts/import_seed_data.py (line 105–110), src/types/pesanan_jual.ts, PRD BR-02, BR-03
-- Ketergantungan: public.pesanan_jual, public.barang
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_pesanan_jual (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pesanan_jual_id UUID NOT NULL REFERENCES public.pesanan_jual(id) ON DELETE CASCADE,
  barang_id UUID NOT NULL REFERENCES public.barang(id),
  jumlah INTEGER NOT NULL CHECK (jumlah >= 1),
  harga_satuan NUMERIC NOT NULL CHECK (harga_satuan >= 0),
  diskon_persen NUMERIC NOT NULL DEFAULT 0 CHECK (diskon_persen >= 0 AND diskon_persen <= 25),
  subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
  hpp_satuan NUMERIC NULL CHECK (hpp_satuan IS NULL OR hpp_satuan >= 0),
  -- BR-02: Satu barang hanya boleh muncul 1 kali dalam satu pesanan jual
  CONSTRAINT uq_item_pesanan_barang UNIQUE (pesanan_jual_id, barang_id)
);

COMMENT ON TABLE public.item_pesanan_jual IS 'Rincian item barang pada transaksi pesanan penjualan.';

-- -----------------------------------------------------------------------------
-- 8. TABEL: public.mutasi_stok
-- Acuan: scripts/import_seed_data.py (line 111–116), scripts/migrations/01, PRD BR-11
-- Ketergantungan: public.barang, public.profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mutasi_stok (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barang_id UUID NOT NULL REFERENCES public.barang(id),
  jenis TEXT NOT NULL CHECK (jenis IN ('masuk', 'keluar', 'batal', 'penyesuaian')),
  jumlah INTEGER NOT NULL,
  stok_sesudah INTEGER NOT NULL CHECK (stok_sesudah >= 0),
  nomor_dokumen TEXT NULL,
  alasan TEXT NULL,
  dibuat_oleh UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

COMMENT ON TABLE public.mutasi_stok IS 'Buku besar kartu stok barang (riwayat setiap pergerakan stok fisik).';

-- -----------------------------------------------------------------------------
-- 9. TABEL: public.audit_log
-- Acuan: scripts/import_seed_data.py (line 117–122), scripts/migrations/02 & 03, PRD BR-12
-- Ketergantungan: public.profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pelaku_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  aksi TEXT NOT NULL,
  nama_tabel TEXT NOT NULL,
  data_id UUID NULL,
  nilai_lama JSONB NULL,
  nilai_baru JSONB NULL,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

COMMENT ON TABLE public.audit_log IS 'Jejak audit sistem untuk setiap perubahan krusial pada data master dan transaksi.';

-- -----------------------------------------------------------------------------
-- INDEX PENDUKUNG PERFORMA & RELASI (FOREIGN KEY & FILTER UMUM)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pelanggan_dibuat_oleh ON public.pelanggan(dibuat_oleh);
CREATE INDEX IF NOT EXISTS idx_pembelian_pemasok_id ON public.pembelian(pemasok_id);
CREATE INDEX IF NOT EXISTS idx_pembelian_barang_id ON public.pembelian(barang_id);
CREATE INDEX IF NOT EXISTS idx_pembelian_status ON public.pembelian(status);
CREATE INDEX IF NOT EXISTS idx_pesanan_jual_pelanggan_id ON public.pesanan_jual(pelanggan_id);
CREATE INDEX IF NOT EXISTS idx_pesanan_jual_status ON public.pesanan_jual(status);
CREATE INDEX IF NOT EXISTS idx_pesanan_jual_dibuat_oleh ON public.pesanan_jual(dibuat_oleh);
CREATE INDEX IF NOT EXISTS idx_item_pesanan_pesanan_id ON public.item_pesanan_jual(pesanan_jual_id);
CREATE INDEX IF NOT EXISTS idx_item_pesanan_barang_id ON public.item_pesanan_jual(barang_id);
CREATE INDEX IF NOT EXISTS idx_mutasi_stok_barang_id ON public.mutasi_stok(barang_id);
CREATE INDEX IF NOT EXISTS idx_mutasi_stok_dibuat_pada ON public.mutasi_stok(dibuat_pada DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_nama_tabel_data_id ON public.audit_log(nama_tabel, data_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_dibuat_pada ON public.audit_log(dibuat_pada DESC);

COMMIT;
