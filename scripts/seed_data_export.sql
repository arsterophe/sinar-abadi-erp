-- =============================================================================
-- SKRIP IMPOR DATA CONTOH RESMI: CV SINAR ABADI NIAGA
-- Dihasilkan secara otomatis dari Data_Contoh_ERP.xlsx
-- =============================================================================
-- KETENTUAN KEAMANAN & INTEGRITAS:
-- 1. Pemeriksaan FOREIGN KEY tetap AKTIF (TIDAK memakai session_replication_role).
-- 2. Trigger tabel TIDAK dimatikan secara massal.
-- 3. Seluruh tabel tujuan HARUS dalam kondisi kosong (0 baris).
-- 4. Akun profil aktual (Alen, Jeonghan, Wonwoo) WAJIB sudah ada di public.profiles.
-- 5. Transaksi ATOMIK penuh (BEGIN ... COMMIT).
-- =============================================================================

BEGIN;

-- 1. PEMERIKSAAN AWAL (PRE-FLIGHT CHECK)
DO $$
DECLARE
  v_alen_id uuid := '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc';
  v_jeonghan_id uuid := 'c6bf5e70-7620-4434-b58e-d3123b2d4e91';
  v_wonwoo_id uuid := '551b03db-5f3e-435b-b1ce-059ebefc712b';
BEGIN
  -- A. Validasi keberadaan akun profil aktual di public.profiles
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_alen_id AND peran = 'manajer') THEN
    RAISE EXCEPTION 'PRE-FLIGHT CHECK GAGAL: Akun manajer Alen (%) tidak ditemukan di public.profiles.', v_alen_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_jeonghan_id AND peran = 'penjualan') THEN
    RAISE EXCEPTION 'PRE-FLIGHT CHECK GAGAL: Akun penjualan Jeonghan (%) tidak ditemukan di public.profiles.', v_jeonghan_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_wonwoo_id AND peran = 'gudang') THEN
    RAISE EXCEPTION 'PRE-FLIGHT CHECK GAGAL: Akun gudang Wonwoo (%) tidak ditemukan di public.profiles.', v_wonwoo_id;
  END IF;

  -- B. Validasi seluruh tabel tujuan kosong untuk mencegah tabrakan data
  IF EXISTS (SELECT 1 FROM public.pemasok LIMIT 1) OR
     EXISTS (SELECT 1 FROM public.pelanggan LIMIT 1) OR
     EXISTS (SELECT 1 FROM public.barang LIMIT 1) OR
     EXISTS (SELECT 1 FROM public.pembelian LIMIT 1) OR
     EXISTS (SELECT 1 FROM public.pesanan_jual LIMIT 1) OR
     EXISTS (SELECT 1 FROM public.item_pesanan_jual LIMIT 1) OR
     EXISTS (SELECT 1 FROM public.mutasi_stok LIMIT 1) OR
     EXISTS (SELECT 1 FROM public.audit_log LIMIT 1) THEN
    RAISE EXCEPTION 'PRE-FLIGHT CHECK GAGAL: Satu atau lebih tabel tujuan sudah memiliki data. Impor dibatalkan untuk mencegah tabrakan data.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- TABEL: public.pemasok (4 baris)
-- -----------------------------------------------------------------------------
INSERT INTO public.pemasok (id, kode, nama, telepon, alamat, aktif, dibuat_pada) VALUES
  ('9c79f720-1929-5dd4-b15a-7bee0114f1e3', 'SUP-01', 'PT Agro Pangan Mandiri', '021-8840 1122', 'Jl. Raya Narogong Km 6, Bantargebang, Bekasi', TRUE, '2026-08-28 10:00:00+07'),
  ('5f18d9e0-326a-5538-b4de-56f1547ff7ad', 'SUP-02', 'CV Sumber Mie Lestari', '021-8261 3344', 'Kawasan Industri MM2100 Blok F2, Cikarang Barat', TRUE, '2026-08-28 10:00:00+07'),
  ('83e53bc5-a470-5069-9b1d-a8b2990fcdb2', 'SUP-03', 'PT Kopi Nusa Prima', '021-4682 5566', 'Jl. Pulogadung Raya No. 18, Jakarta Timur', TRUE, '2026-08-28 10:00:00+07'),
  ('fd3e13e6-b0ff-5028-baa5-a44998d2cbcd', 'SUP-04', 'UD Bersih Wangi Sentosa', '0812-9033-7788', 'Jl. Sultan Agung No. 45, Medan Satria, Bekasi', TRUE, '2026-08-28 10:00:00+07');

-- -----------------------------------------------------------------------------
-- TABEL: public.pelanggan (10 baris)
-- -----------------------------------------------------------------------------
INSERT INTO public.pelanggan (id, kode, nama_toko, telepon, alamat, batas_kredit, termin_hari, aktif, dibuat_oleh, dibuat_pada) VALUES
  ('649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'PLG-001', 'Toko Berkah Jaya', '0813-1100-2201', 'Jl. Cut Mutia No. 12, Bekasi Timur', 15000000, 14, TRUE, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-08-28 11:00:00+07'),
  ('6f20e262-db32-5ce4-9a42-c4282d6e48ee', 'PLG-002', 'Minimarket Sentosa Mart', '0812-8800-1302', 'Jl. Raya Hankam No. 88, Pondok Gede', 25000000, 30, TRUE, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-08-28 11:00:00+07'),
  ('3396f1af-27e4-568b-87b3-2087fc6af8a2', 'PLG-003', 'Toko Ibu Sari', '0857-1122-3303', 'Jl. Kaliabang Tengah No. 5, Bekasi Utara', 5000000, 7, TRUE, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-08-28 11:00:00+07'),
  ('3ddee844-7e55-5815-9483-91025a6add48', 'PLG-004', 'Warung Pak Darto', '0819-3344-5504', 'Gg. Masjid No. 3, Jatiasih', 2000000, 0, TRUE, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-08-28 11:00:00+07'),
  ('aaf9c7d6-09f9-53df-8090-3fc3b7e6e69b', 'PLG-005', 'Toko Maju Bersama', '0813-5566-7705', 'Jl. Pahlawan No. 21, Rawalumbu', 10000000, 14, TRUE, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-08-28 11:00:00+07'),
  ('66cedff9-bd54-539f-84ad-71c30475dc6c', 'PLG-006', 'Toko Rejeki Lancar', '0821-7788-9906', 'Jl. Raya Pekayon No. 40, Bekasi Selatan', 8000000, 14, TRUE, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-08-28 11:00:00+07'),
  ('52647cb2-e389-5751-8c75-497e83ae35ff', 'PLG-007', 'Grosir Murah Meriah', '0812-9900-1107', 'Jl. Raya Bekasi Km 18, Cakung, Jakarta Timur', 30000000, 30, TRUE, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-08-28 11:00:00+07'),
  ('ecb2b2af-b87c-51d7-8050-ca88d487c764', 'PLG-008', 'Toko Amanah', '0856-2233-4408', 'Jl. Mustika Jaya No. 9, Bekasi Timur', 6000000, 7, TRUE, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-08-28 11:00:00+07'),
  ('32869406-4c79-5a0a-a515-caecdbcbd993', 'PLG-009', 'Toko Sumber Rezeki', '0838-4455-6609', 'Jl. Kranji Raya No. 77, Bekasi Barat', 0, 14, TRUE, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-09 11:00:00+07'),
  ('de839bb2-0d92-5cbc-a64e-554f1efe1a29', 'PLG-010', 'Toko Lama Abadi (tutup)', '0815-6677-8810', 'Jl. Juanda No. 101, Bekasi Timur', 3000000, 7, FALSE, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-08-28 11:00:00+07');

-- -----------------------------------------------------------------------------
-- TABEL: public.barang (16 baris)
-- -----------------------------------------------------------------------------
INSERT INTO public.barang (id, kode, nama, satuan, harga_jual, harga_pokok, stok, stok_minimum, aktif, diperbarui_pada) VALUES
  ('ec9ce527-ed5f-5b7e-80eb-939001450513', 'BRG-001', 'Minyak Goreng Pouch 2 L isi 6', 'dus', 226000, 208000, 80, 20, TRUE, '2026-08-28 10:00:00+07'),
  ('671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'BRG-002', 'Gula Pasir 1 kg isi 20', 'bal', 362000, 341000, 22, 15, TRUE, '2026-08-28 10:00:00+07'),
  ('8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 'BRG-003', 'Tepung Terigu 1 kg isi 12', 'dus', 138000, 125000, 43, 15, TRUE, '2026-08-28 10:00:00+07'),
  ('91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 'BRG-004', 'Beras Premium 5 kg', 'karung', 78000, 71500, 183, 30, TRUE, '2026-08-28 10:00:00+07'),
  ('8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'BRG-005', 'Mi Instan Goreng isi 40', 'dus', 118000, 108000, 158, 25, TRUE, '2026-08-28 10:00:00+07'),
  ('becad5d3-b8a2-5221-b5f4-25f84b9b2162', 'BRG-006', 'Mi Instan Kuah isi 40', 'dus', 112000, 101500, 124, 25, TRUE, '2026-08-28 10:00:00+07'),
  ('75bc9358-ec31-57bc-a48e-112d0290fafa', 'BRG-007', 'Kecap Manis 520 ml isi 12', 'dus', 186000, 166000, 75, 10, TRUE, '2026-08-28 10:00:00+07'),
  ('ab808a73-0c70-5ac2-ab3b-99c27fd0f2b7', 'BRG-008', 'Saus Sambal 340 ml isi 24', 'dus', 192000, 171000, 8, 8, TRUE, '2026-08-28 10:00:00+07'),
  ('e0980a04-82e1-5d49-a262-2bfff2d6ca95', 'BRG-009', 'Kopi Sachet 3 in 1 isi 12 renceng', 'bal', 168000, 150000, 0, 12, TRUE, '2026-08-28 10:00:00+07'),
  ('ec3d6dbd-628a-5412-81d3-54c936a3e82f', 'BRG-010', 'Teh Celup isi 25 (24 kotak)', 'dus', 156000, 139000, 21, 6, TRUE, '2026-08-28 10:00:00+07'),
  ('e2656c25-d025-5ef6-8445-00e99f71ee26', 'BRG-011', 'Susu Kental Manis 370 g isi 48', 'dus', 552000, 512000, 1, 5, TRUE, '2026-08-28 10:00:00+07'),
  ('f546ffa5-cfb6-559b-b0f3-c68d26fa2b71', 'BRG-012', 'Sabun Cuci Piring 780 ml isi 12', 'dus', 168000, 148000, 50, 6, TRUE, '2026-08-28 10:00:00+07'),
  ('e31caa3a-cde5-5372-8a44-7f5b67b41f93', 'BRG-013', 'Deterjen Bubuk 800 g isi 12', 'dus', 204000, 181000, 30, 6, TRUE, '2026-08-28 10:00:00+07'),
  ('abeb85d1-5170-5581-833b-359c01b563e4', 'BRG-014', 'Air Mineral 600 ml isi 24', 'dus', 48000, 42000, 142, 30, TRUE, '2026-08-28 10:00:00+07'),
  ('1ecac6f4-140b-58eb-bcf2-e4a6feebf600', 'BRG-015', 'Margarin 200 g isi 48', 'dus', 336000, 305000, 0, 4, TRUE, '2026-08-28 10:00:00+07'),
  ('de9ae956-f16f-5764-95d3-2ac39c201c12', 'BRG-016', 'Minyak Goreng Botol 1 L isi 12 (dihentikan)', 'dus', 228000, 210000, 0, 0, FALSE, '2026-08-28 10:00:00+07');

-- -----------------------------------------------------------------------------
-- TABEL: public.pembelian (19 baris)
-- -----------------------------------------------------------------------------
INSERT INTO public.pembelian (id, nomor, pemasok_id, barang_id, jumlah_dipesan, jumlah_diterima, harga_beli_satuan, status, alasan_tolak, diajukan_oleh, diajukan_pada, diputuskan_oleh, diputuskan_pada, diterima_oleh, diterima_pada) VALUES
  ('06303baa-6d02-54f6-9b70-c7a62df647e2', 'PO-00001', '9c79f720-1929-5dd4-b15a-7bee0114f1e3', '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 60, 60, 70500, 'diterima', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-03 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-09-03 13:00:00+07', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-05 08:00:00+07'),
  ('ccda8513-eaee-5f23-8b3f-5bdebcaf3ab0', 'PO-00002', 'fd3e13e6-b0ff-5028-baa5-a44998d2cbcd', 'abeb85d1-5170-5581-833b-359c01b563e4', 80, 80, 41500, 'diterima', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-04 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-09-04 13:00:00+07', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-07 08:00:00+07'),
  ('2f0f300a-98f8-5c94-9286-d6cb5f618566', 'PO-00003', '5f18d9e0-326a-5538-b4de-56f1547ff7ad', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 80, 80, 107000, 'diterima', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-08 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-09-08 13:00:00+07', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-10 08:00:00+07'),
  ('ca2ba3f0-47c4-50c4-9833-4e89dc1b9fcf', 'PO-00004', '9c79f720-1929-5dd4-b15a-7bee0114f1e3', 'ec9ce527-ed5f-5b7e-80eb-939001450513', 60, 60, 206000, 'diterima', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-09 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-09-09 13:00:00+07', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-11 08:00:00+07'),
  ('2e89aba8-c11c-57af-867a-e8d875a6bba7', 'PO-00005', '5f18d9e0-326a-5538-b4de-56f1547ff7ad', 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 80, 75, 101500, 'diterima', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-14 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-09-14 13:00:00+07', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-16 08:00:00+07'),
  ('64dae0e1-c4b0-5d6c-9533-95be707832a4', 'PO-00006', '9c79f720-1929-5dd4-b15a-7bee0114f1e3', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 40, 40, 341000, 'diterima', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-15 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-09-15 13:00:00+07', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-17 08:00:00+07'),
  ('30e16d6e-605c-58b0-821a-19677004bd3f', 'PO-00007', '83e53bc5-a470-5069-9b1d-a8b2990fcdb2', 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 40, NULL, NULL, 'ditolak', 'Stok kopi masih cukup untuk 3 minggu, tunda bulan depan', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-17 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-09-17 13:00:00+07', NULL, NULL),
  ('e108cdc2-782e-5274-b39e-c87dfe76bb6f', 'PO-00008', '9c79f720-1929-5dd4-b15a-7bee0114f1e3', '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 50, 50, 125000, 'diterima', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-21 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-09-21 13:00:00+07', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-23 08:00:00+07'),
  ('73a09f56-091d-5522-b18a-b14d85e7deed', 'PO-00009', '9c79f720-1929-5dd4-b15a-7bee0114f1e3', '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 60, 60, 71500, 'diterima', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-22 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-09-22 13:00:00+07', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-24 08:00:00+07'),
  ('994e9953-d616-56ff-826c-4057d5aa8bf2', 'PO-00010', 'fd3e13e6-b0ff-5028-baa5-a44998d2cbcd', 'abeb85d1-5170-5581-833b-359c01b563e4', 80, 80, 42000, 'diterima', NULL, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-09-25 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-09-25 13:00:00+07', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-28 08:00:00+07'),
  ('47be15b5-6c08-548a-86f4-62b65f16cecb', 'PO-00011', '5f18d9e0-326a-5538-b4de-56f1547ff7ad', '75bc9358-ec31-57bc-a48e-112d0290fafa', 30, 30, 166000, 'diterima', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-29 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-09-29 13:00:00+07', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-01 08:00:00+07'),
  ('e6f4cd7f-74e6-5ccb-a420-ac7759daffc9', 'PO-00012', '83e53bc5-a470-5069-9b1d-a8b2990fcdb2', 'ec3d6dbd-628a-5412-81d3-54c936a3e82f', 20, NULL, 140000, 'dibatalkan', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-30 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-09-30 13:00:00+07', NULL, NULL),
  ('02989490-f44f-5e23-bbd8-3c30b5ed5d8f', 'PO-00013', '5f18d9e0-326a-5538-b4de-56f1547ff7ad', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 80, 80, 108000, 'diterima', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-02 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-10-02 13:00:00+07', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-05 08:00:00+07'),
  ('edff02d0-6460-5630-833d-f05f55c4e4ea', 'PO-00014', '9c79f720-1929-5dd4-b15a-7bee0114f1e3', 'ec9ce527-ed5f-5b7e-80eb-939001450513', 60, 58, 208000, 'diterima', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-06 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-10-06 13:00:00+07', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-08 08:00:00+07'),
  ('bb6e7868-6500-5224-873b-2a19d0414149', 'PO-00015', 'fd3e13e6-b0ff-5028-baa5-a44998d2cbcd', 'f546ffa5-cfb6-559b-b0f3-c68d26fa2b71', 25, 25, 148000, 'diterima', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-07 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-10-07 13:00:00+07', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-09 08:00:00+07'),
  ('cce9f696-2238-50ff-82d4-3f4909fc2509', 'PO-00016', '83e53bc5-a470-5069-9b1d-a8b2990fcdb2', 'e2656c25-d025-5ef6-8445-00e99f71ee26', 15, NULL, 515000, 'disetujui', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-12 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-10-12 13:00:00+07', NULL, NULL),
  ('01df44d6-916d-554e-b362-eee23866b25f', 'PO-00017', '9c79f720-1929-5dd4-b15a-7bee0114f1e3', '1ecac6f4-140b-58eb-bcf2-e4a6feebf600', 12, NULL, 306000, 'disetujui', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-13 09:00:00+07', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-10-13 13:00:00+07', NULL, NULL),
  ('6217d1f1-6b65-5b57-a75b-f0a14ae11a7b', 'PO-00018', '5f18d9e0-326a-5538-b4de-56f1547ff7ad', 'ab808a73-0c70-5ac2-ab3b-99c27fd0f2b7', 30, NULL, NULL, 'diajukan', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-14 09:00:00+07', NULL, NULL, NULL, NULL),
  ('065c64b4-5613-51ce-9fc9-5bc7f6e65cee', 'PO-00019', 'fd3e13e6-b0ff-5028-baa5-a44998d2cbcd', 'e31caa3a-cde5-5372-8a44-7f5b67b41f93', 20, NULL, NULL, 'diajukan', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-14 09:00:00+07', NULL, NULL, NULL, NULL);

-- -----------------------------------------------------------------------------
-- TABEL: public.pesanan_jual (45 baris)
-- -----------------------------------------------------------------------------
INSERT INTO public.pesanan_jual (id, nomor, pelanggan_id, status, total, dibuat_oleh, dibuat_pada, dikonfirmasi_pada, dikirim_pada, jatuh_tempo, dilunasi_pada, dibatalkan_pada, alasan_batal) VALUES
  ('8c767893-eb9d-584e-9496-d79b57fe95b7', 'SO-00001', '6f20e262-db32-5ce4-9a42-c4282d6e48ee', 'lunas', 8611200, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-01 09:05:00+07', '2026-09-01 09:55:00+07', '2026-09-02 14:00:00+07', '2026-10-02', '2026-09-30 16:00:00+07', NULL, NULL),
  ('457923af-a620-557f-82d9-a0484a4ccebe', 'SO-00002', '6f20e262-db32-5ce4-9a42-c4282d6e48ee', 'lunas', 4975200, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-02 09:50:00+07', '2026-09-02 09:55:00+07', '2026-09-03 14:00:00+07', '2026-10-03', '2026-09-30 16:00:00+07', NULL, NULL),
  ('2e674c3e-4123-549d-ac9d-a85065e5dc49', 'SO-00003', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'lunas', 1092000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-03 09:05:00+07', '2026-09-03 09:55:00+07', '2026-09-04 14:00:00+07', '2026-09-18', '2026-09-15 16:00:00+07', NULL, NULL),
  ('b2f34183-5ad2-5514-8dd3-27cca6551273', 'SO-00004', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'lunas', 3433600, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-04 09:20:00+07', '2026-09-04 09:55:00+07', '2026-09-05 14:00:00+07', '2026-09-19', '2026-09-19 16:00:00+07', NULL, NULL),
  ('76dce0bf-c581-5f7d-bfc5-8f4e42806823', 'SO-00005', '66cedff9-bd54-539f-84ad-71c30475dc6c', 'lunas', 2192400, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-05 09:35:00+07', '2026-09-05 09:55:00+07', '2026-09-06 14:00:00+07', '2026-09-20', '2026-09-18 16:00:00+07', NULL, NULL),
  ('53d14dbe-431a-566d-a7e6-94335dd7f8ac', 'SO-00006', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'lunas', 1242000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-07 09:35:00+07', '2026-09-07 09:55:00+07', '2026-09-08 14:00:00+07', '2026-09-22', '2026-09-19 16:00:00+07', NULL, NULL),
  ('1824e36e-0e10-5511-b400-298f6c873fbd', 'SO-00007', '52647cb2-e389-5751-8c75-497e83ae35ff', 'lunas', 11711200, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-07 11:20:00+07', '2026-09-07 11:55:00+07', '2026-09-08 14:00:00+07', '2026-10-08', '2026-10-08 16:00:00+07', NULL, NULL),
  ('cf298a5b-ca39-5a0a-860f-9db0a30c7626', 'SO-00008', '52647cb2-e389-5751-8c75-497e83ae35ff', 'lunas', 3363750, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-08 09:05:00+07', '2026-09-08 09:55:00+07', '2026-09-09 14:00:00+07', '2026-10-09', '2026-10-09 16:00:00+07', NULL, NULL),
  ('a77e4b27-cf34-5ae2-babf-687f4d56e6f0', 'SO-00009', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'lunas', 1954000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-09 09:50:00+07', '2026-09-09 09:55:00+07', '2026-09-10 14:00:00+07', '2026-09-24', '2026-09-23 16:00:00+07', NULL, NULL),
  ('4e07ed3c-8d7c-5543-b44f-682709ba4ede', 'SO-00010', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'lunas', 3420000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-09 11:35:00+07', '2026-09-09 11:55:00+07', '2026-09-10 14:00:00+07', '2026-09-24', '2026-09-24 16:00:00+07', NULL, NULL),
  ('19a4ffdb-5adc-5da6-8305-c98fe3cc12c9', 'SO-00011', '3ddee844-7e55-5815-9483-91025a6add48', 'lunas', 474000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-10 09:35:00+07', '2026-09-10 09:55:00+07', '2026-09-11 14:00:00+07', '2026-09-11', '2026-09-11 16:00:00+07', NULL, NULL),
  ('354d97a2-f718-5745-92af-405bd72d6985', 'SO-00012', '3396f1af-27e4-568b-87b3-2087fc6af8a2', 'lunas', 651300, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-11 09:35:00+07', '2026-09-11 09:55:00+07', '2026-09-12 14:00:00+07', '2026-09-19', '2026-09-17 16:00:00+07', NULL, NULL),
  ('3f50277c-0f45-57d1-a50f-4b19bd6472c7', 'SO-00013', '6f20e262-db32-5ce4-9a42-c4282d6e48ee', 'lunas', 2914600, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-12 09:20:00+07', '2026-09-12 09:55:00+07', '2026-09-13 14:00:00+07', '2026-10-13', '2026-10-11 16:00:00+07', NULL, NULL),
  ('2a7e33d9-16ed-577f-88ff-1ff6281ea224', 'SO-00014', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'lunas', 3124000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-14 09:20:00+07', '2026-09-14 09:55:00+07', '2026-09-15 14:00:00+07', '2026-09-29', '2026-09-25 16:00:00+07', NULL, NULL),
  ('8da43319-b085-5712-8fa6-15bbff7940e2', 'SO-00015', 'aaf9c7d6-09f9-53df-8090-3fc3b7e6e69b', 'dikirim', 3398800, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-15 08:40:00+07', '2026-09-15 08:50:00+07', '2026-09-16 14:00:00+07', '2026-09-30', NULL, NULL, NULL),
  ('17fb99f3-a996-50ab-8c2a-ed6738895cc3', 'SO-00016', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'lunas', 3878700, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-19 09:05:00+07', '2026-09-19 09:55:00+07', '2026-09-20 14:00:00+07', '2026-10-04', '2026-10-01 16:00:00+07', NULL, NULL),
  ('da19ac2c-c57f-524d-ab7c-5453e7fe9fdc', 'SO-00017', '52647cb2-e389-5751-8c75-497e83ae35ff', 'dikirim', 7713200, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-21 09:50:00+07', '2026-09-21 09:55:00+07', '2026-09-22 14:00:00+07', '2026-10-22', NULL, NULL, NULL),
  ('a8124be5-819e-54d1-845f-989aeaf0d4e0', 'SO-00018', '6f20e262-db32-5ce4-9a42-c4282d6e48ee', 'dikirim', 2505600, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-21 11:20:00+07', '2026-09-21 11:55:00+07', '2026-09-22 14:00:00+07', '2026-10-22', NULL, NULL, NULL),
  ('0a1a50ff-4dd1-534c-8247-e7f1b231b29f', 'SO-00019', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'lunas', 2441600, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-22 09:35:00+07', '2026-09-22 09:55:00+07', '2026-09-23 14:00:00+07', '2026-10-07', '2026-10-03 16:00:00+07', NULL, NULL),
  ('0fd52099-6a0c-5271-9b8a-3dc2970b96b6', 'SO-00020', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'lunas', 1356000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-23 09:35:00+07', '2026-09-23 09:55:00+07', '2026-09-24 14:00:00+07', '2026-10-08', '2026-10-06 16:00:00+07', NULL, NULL),
  ('359e7a00-f8a5-584a-a503-d35e2b98a2fc', 'SO-00021', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'lunas', 655200, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-23 11:35:00+07', '2026-09-23 11:55:00+07', '2026-09-24 14:00:00+07', '2026-10-08', '2026-10-06 16:00:00+07', NULL, NULL),
  ('0cadd905-5bdd-5167-b034-5bc19c1228a0', 'SO-00022', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'lunas', 3571200, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-25 09:20:00+07', '2026-09-25 09:55:00+07', '2026-09-26 14:00:00+07', '2026-10-10', '2026-10-06 16:00:00+07', NULL, NULL),
  ('3d3f27db-2a8b-5612-ba30-7b088a6d4576', 'SO-00023', '3396f1af-27e4-568b-87b3-2087fc6af8a2', 'lunas', 1583250, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-28 09:50:00+07', '2026-09-28 09:55:00+07', '2026-09-29 14:00:00+07', '2026-10-06', '2026-10-03 16:00:00+07', NULL, NULL),
  ('486a9c52-7435-5349-a2c3-3789412a42de', 'SO-00024', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'lunas', 240000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-28 11:20:00+07', '2026-09-28 11:55:00+07', '2026-09-29 14:00:00+07', '2026-10-13', '2026-10-09 16:00:00+07', NULL, NULL),
  ('7f0b2ba0-8d63-59ca-9518-0d6fbf5c5b74', 'SO-00025', '52647cb2-e389-5751-8c75-497e83ae35ff', 'dikirim', 2789600, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-02 11:35:00+07', '2026-10-02 11:55:00+07', '2026-10-03 14:00:00+07', '2026-11-02', NULL, NULL, NULL),
  ('26f2ef97-0d22-588d-a440-a388ba527606', 'SO-00026', '66cedff9-bd54-539f-84ad-71c30475dc6c', 'dikirim', 7564000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-06 08:40:00+07', '2026-10-06 08:50:00+07', '2026-10-07 14:00:00+07', '2026-10-21', NULL, NULL, NULL),
  ('ff02aa9d-3b7a-543e-b617-7c5150b0ac89', 'SO-00027', '52647cb2-e389-5751-8c75-497e83ae35ff', 'dikirim', 3982000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-06 09:05:00+07', '2026-10-06 09:55:00+07', '2026-10-07 14:00:00+07', '2026-11-06', NULL, NULL, NULL),
  ('deb4a706-4323-5997-b6f5-ed15b596833e', 'SO-00028', '6f20e262-db32-5ce4-9a42-c4282d6e48ee', 'dikirim', 7710000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-07 09:50:00+07', '2026-10-07 09:55:00+07', '2026-10-08 14:00:00+07', '2026-11-07', NULL, NULL, NULL),
  ('d285b294-521c-5b05-a90f-1d772f4f4ec0', 'SO-00029', '6f20e262-db32-5ce4-9a42-c4282d6e48ee', 'dikirim', 6108000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-08 09:20:00+07', '2026-10-08 09:55:00+07', '2026-10-09 14:00:00+07', '2026-11-08', NULL, NULL, NULL),
  ('82c6ba12-0641-552c-9028-e6b218375c6f', 'SO-00030', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'dikirim', 4313200, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-09 09:35:00+07', '2026-10-09 09:55:00+07', '2026-10-10 14:00:00+07', '2026-10-24', NULL, NULL, NULL),
  ('c3f86068-49f5-5885-a603-ad2ee5d093ac', 'SO-00031', '3396f1af-27e4-568b-87b3-2087fc6af8a2', 'dikirim', 3049600, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-10 09:05:00+07', '2026-10-10 09:55:00+07', '2026-10-11 14:00:00+07', '2026-10-18', NULL, NULL, NULL),
  ('04e1590c-1736-5c73-92bd-7e510f98e413', 'SO-00032', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'dibatalkan', 1418000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-12 13:10:00+07', '2026-10-12 13:30:00+07', NULL, NULL, NULL, '2026-10-12 16:00:00+07', 'Toko membatalkan karena salah pesan barang'),
  ('fd7b44f7-79dc-5886-b7d6-5ec09e35085d', 'SO-00033', '3396f1af-27e4-568b-87b3-2087fc6af8a2', 'dibatalkan', 240000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-13 09:15:00+07', NULL, NULL, NULL, NULL, '2026-10-13 09:40:00+07', 'Dobel input'),
  ('f43e5c90-7904-5ce1-ab9b-5490daba4828', 'SO-00034', '6f20e262-db32-5ce4-9a42-c4282d6e48ee', 'dikirim', 4668000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-13 09:20:00+07', '2026-10-13 09:55:00+07', '2026-10-14 14:00:00+07', '2026-11-13', NULL, NULL, NULL),
  ('dbe37cd5-0d02-5c47-b9fd-16be14da9a4d', 'SO-00035', '52647cb2-e389-5751-8c75-497e83ae35ff', 'dikonfirmasi', 4416000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-13 13:10:00+07', '2026-10-13 13:20:00+07', NULL, NULL, NULL, NULL, NULL),
  ('60fcc970-eedd-58d2-bd64-f6a23932cfd0', 'SO-00036', '6f20e262-db32-5ce4-9a42-c4282d6e48ee', 'dikonfirmasi', 2244000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 09:30:00+07', '2026-10-14 09:45:00+07', NULL, NULL, NULL, NULL, NULL),
  ('b86e03b4-56ef-55e8-a685-1819b826e020', 'SO-00037', '52647cb2-e389-5751-8c75-497e83ae35ff', 'dikonfirmasi', 3315000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 09:30:00+07', '2026-10-14 09:45:00+07', NULL, NULL, NULL, NULL, NULL),
  ('3bdd5804-17ae-5c49-8aff-c4fdab80c8c7', 'SO-00038', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'draf', 552000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 10:00:00+07', NULL, NULL, NULL, NULL, NULL, NULL),
  ('21119920-fe2c-51a0-8360-721fb7d5e504', 'SO-00039', '52647cb2-e389-5751-8c75-497e83ae35ff', 'draf', 552000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 10:02:00+07', NULL, NULL, NULL, NULL, NULL, NULL),
  ('2375d597-efa6-5ecf-872a-aab957e9ab0b', 'SO-00040', '649a6d3a-70b8-57d0-b2c3-15db3597f81c', 'draf', 780000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 10:10:00+07', NULL, NULL, NULL, NULL, NULL, NULL),
  ('325e0bda-ded1-53f1-850c-ec697c37cf18', 'SO-00041', '66cedff9-bd54-539f-84ad-71c30475dc6c', 'draf', 1086000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 10:20:00+07', NULL, NULL, NULL, NULL, NULL, NULL),
  ('35b6d7e3-6864-5ba1-8848-424fd220ee07', 'SO-00042', 'aaf9c7d6-09f9-53df-8090-3fc3b7e6e69b', 'draf', 96000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 10:30:00+07', NULL, NULL, NULL, NULL, NULL, NULL),
  ('a20ca835-806e-544e-9247-9007f1c3b29b', 'SO-00043', 'ecb2b2af-b87c-51d7-8050-ca88d487c764', 'draf', 486000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 10:40:00+07', NULL, NULL, NULL, NULL, NULL, NULL),
  ('7f6ca835-8b37-546a-a841-c507168494bb', 'SO-00044', 'ecb2b2af-b87c-51d7-8050-ca88d487c764', 'draf', 325800, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 10:50:00+07', NULL, NULL, NULL, NULL, NULL, NULL),
  ('52057d5e-dd4c-5353-b05f-13bfec548423', 'SO-00045', '32869406-4c79-5a0a-a515-caecdbcbd993', 'draf', 48000, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 11:00:00+07', NULL, NULL, NULL, NULL, NULL, NULL);

-- -----------------------------------------------------------------------------
-- TABEL: public.item_pesanan_jual (107 baris)
-- -----------------------------------------------------------------------------
INSERT INTO public.item_pesanan_jual (id, pesanan_jual_id, barang_id, jumlah, harga_satuan, diskon_persen, subtotal, hpp_satuan) VALUES
  ('13be92e1-55c5-5b6e-920c-56a298094fdf', '8c767893-eb9d-584e-9496-d79b57fe95b7', 'ec9ce527-ed5f-5b7e-80eb-939001450513', 24, 222000, 5, 5061600, 204000),
  ('20bd5ce6-7f2c-549e-b827-58f6fd420717', '8c767893-eb9d-584e-9496-d79b57fe95b7', 'abeb85d1-5170-5581-833b-359c01b563e4', 20, 48000, 5, 912000, 41500),
  ('fa92b172-8aa0-5eb5-99a6-a3b495069868', '8c767893-eb9d-584e-9496-d79b57fe95b7', 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 13, 168000, 10, 1965600, 150000),
  ('a4414e51-e3ac-56be-8418-03d452dcbc8d', '8c767893-eb9d-584e-9496-d79b57fe95b7', 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 6, 112000, 0, 672000, 101000),
  ('7ae20244-700c-5bb7-af3a-a5fa718dedfb', '457923af-a620-557f-82d9-a0484a4ccebe', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 6, 118000, 0, 708000, 106000),
  ('1f010994-7137-5d5b-a938-8ae6b307668b', '457923af-a620-557f-82d9-a0484a4ccebe', 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 6, 168000, 10, 907200, 150000),
  ('970470d0-a874-5a97-8bc1-2d1228eb16e9', '457923af-a620-557f-82d9-a0484a4ccebe', '1ecac6f4-140b-58eb-bcf2-e4a6feebf600', 10, 336000, 0, 3360000, 305000),
  ('e195a2ea-3f10-5045-9d61-2f9acb3fa60b', '2e674c3e-4123-549d-ac9d-a85065e5dc49', '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 14, 78000, 0, 1092000, 70500),
  ('d1ae7a93-15b3-5c80-9dd8-9553dbe9b142', 'b2f34183-5ad2-5514-8dd3-27cca6551273', '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 7, 78000, 0, 546000, 70500),
  ('823094cb-2240-552d-be54-e26e98beb097', 'b2f34183-5ad2-5514-8dd3-27cca6551273', 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 9, 168000, 0, 1512000, 150000),
  ('def60c79-4490-5fd5-b21a-1ea998c2d1f3', 'b2f34183-5ad2-5514-8dd3-27cca6551273', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 4, 362000, 5, 1375600, 338000),
  ('e90f823a-3711-534f-88d5-bd6b3301a2cd', '76dce0bf-c581-5f7d-bfc5-8f4e42806823', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 3, 362000, 5, 1031700, 338000),
  ('de6b34b3-e2ff-55de-8f92-637e4773f752', '76dce0bf-c581-5f7d-bfc5-8f4e42806823', '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 7, 78000, 5, 518700, 70500),
  ('1004b6f4-e0bf-5178-8457-7331b038a803', '76dce0bf-c581-5f7d-bfc5-8f4e42806823', 'abeb85d1-5170-5581-833b-359c01b563e4', 2, 48000, 0, 96000, 41500),
  ('2e221ed2-3fee-502b-a67d-c4cfe3c74044', '76dce0bf-c581-5f7d-bfc5-8f4e42806823', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 3, 118000, 0, 354000, 106000),
  ('7131573e-ce12-5d53-9d04-1a8438cc7c14', '76dce0bf-c581-5f7d-bfc5-8f4e42806823', 'ab808a73-0c70-5ac2-ab3b-99c27fd0f2b7', 1, 192000, 0, 192000, 171000),
  ('12345dfe-ac7f-5287-bca8-ea3722ef7d15', '53d14dbe-431a-566d-a7e6-94335dd7f8ac', '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 9, 138000, 0, 1242000, 124000),
  ('b9301950-f839-51a6-a9e1-21dca7c9ddae', '1824e36e-0e10-5511-b400-298f6c873fbd', 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 22, 168000, 5, 3511200, 150000),
  ('a4c5bce5-d122-5d84-a1bb-2e891c29496e', '1824e36e-0e10-5511-b400-298f6c873fbd', 'ec9ce527-ed5f-5b7e-80eb-939001450513', 19, 222000, 0, 4218000, 204000),
  ('038b52d0-757b-5d08-8142-2a5979d2662c', '1824e36e-0e10-5511-b400-298f6c873fbd', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 11, 362000, 0, 3982000, 338000),
  ('b33accd1-1e3e-5f2e-b385-20811a38a514', 'cf298a5b-ca39-5a0a-860f-9db0a30c7626', '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 25, 138000, 2.5, 3363750, 124000),
  ('191c9c4e-12ed-5597-ab87-8ca8e50f8232', 'a77e4b27-cf34-5ae2-babf-687f4d56e6f0', 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 2, 112000, 0, 224000, 101000),
  ('a8628252-3525-5154-87d4-005c24d03b29', 'a77e4b27-cf34-5ae2-babf-687f4d56e6f0', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 1, 362000, 0, 362000, 338000),
  ('474b31d0-a9da-535b-9aa1-abc23a2249a8', 'a77e4b27-cf34-5ae2-babf-687f4d56e6f0', '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 4, 78000, 0, 312000, 70500),
  ('a2e891a9-ea64-59ab-886a-4c05e108b199', 'a77e4b27-cf34-5ae2-babf-687f4d56e6f0', 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 3, 168000, 0, 504000, 150000),
  ('6fc9e166-f0ac-5274-9c54-f6273fd9ce6b', 'a77e4b27-cf34-5ae2-babf-687f4d56e6f0', 'e2656c25-d025-5ef6-8445-00e99f71ee26', 1, 552000, 0, 552000, 512000),
  ('dfa53bc7-bda0-58b7-9836-da69269cb83c', '4e07ed3c-8d7c-5543-b44f-682709ba4ede', 'ec9ce527-ed5f-5b7e-80eb-939001450513', 14, 222000, 0, 3108000, 204000),
  ('7cce0824-e027-57bd-baae-66686fbf5e7f', '4e07ed3c-8d7c-5543-b44f-682709ba4ede', 'ec3d6dbd-628a-5412-81d3-54c936a3e82f', 2, 156000, 0, 312000, 139000),
  ('ab0d7e12-8717-5911-afb0-db52151fed70', '19a4ffdb-5adc-5da6-8305-c98fe3cc12c9', '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 1, 138000, 0, 138000, 124000),
  ('ef17c92f-3a62-57e9-a5a0-7652cf605b5b', '19a4ffdb-5adc-5da6-8305-c98fe3cc12c9', 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 3, 112000, 0, 336000, 101000),
  ('e6f6070a-d6cf-522c-9c5f-8d0962b10465', '354d97a2-f718-5745-92af-405bd72d6985', '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 1, 138000, 0, 138000, 124000),
  ('1ced5daa-de71-5acf-b942-b9c929d25093', '354d97a2-f718-5745-92af-405bd72d6985', 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 2, 168000, 10, 302400, 150000),
  ('1bc0cf82-67c1-5b50-8c50-f50b253cf268', '354d97a2-f718-5745-92af-405bd72d6985', 'ec9ce527-ed5f-5b7e-80eb-939001450513', 1, 222000, 5, 210900, 206000),
  ('1809b1ca-a188-5791-9e94-0bef6afb6c85', '3f50277c-0f45-57d1-a50f-4b19bd6472c7', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 26, 118000, 5, 2914600, 107000),
  ('41609481-0a22-541b-9426-61953eb09050', '2a7e33d9-16ed-577f-88ff-1ff6281ea224', 'abeb85d1-5170-5581-833b-359c01b563e4', 5, 48000, 5, 228000, 41500),
  ('6566d61e-e72e-58da-a1e5-f102e58958cf', '2a7e33d9-16ed-577f-88ff-1ff6281ea224', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 8, 362000, 0, 2896000, 338000),
  ('c7e91da6-b46a-5ea9-97b0-5be0d360bbc6', '8da43319-b085-5712-8fa6-15bbff7940e2', 'ec9ce527-ed5f-5b7e-80eb-939001450513', 6, 222000, 0, 1332000, 206000),
  ('2417cd36-fd55-5251-befc-785cd9b271ec', '8da43319-b085-5712-8fa6-15bbff7940e2', '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 15, 78000, 0, 1170000, 70500),
  ('1949b73d-57a0-562e-8417-c568962f7ba5', '8da43319-b085-5712-8fa6-15bbff7940e2', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 8, 118000, 5, 896800, 107000),
  ('290b7ded-66d7-5a7d-992f-273dd17a8507', '17fb99f3-a996-50ab-8c2a-ed6738895cc3', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 7, 362000, 0, 2534000, 341000),
  ('9d577c62-e390-566a-b1b4-38c6726163c1', '17fb99f3-a996-50ab-8c2a-ed6738895cc3', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 7, 118000, 0, 826000, 107000),
  ('1c024a5c-8cd7-5fb4-9e4d-839316afabec', '17fb99f3-a996-50ab-8c2a-ed6738895cc3', '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 7, 78000, 5, 518700, 70500),
  ('b5550ee0-6ad1-59bf-9848-c1b9f620e2a5', 'da19ac2c-c57f-524d-ab7c-5453e7fe9fdc', 'abeb85d1-5170-5581-833b-359c01b563e4', 4, 48000, 0, 192000, 41500),
  ('87a3c7ab-ff62-5028-bd3a-6c4cd0425199', 'da19ac2c-c57f-524d-ab7c-5453e7fe9fdc', '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 8, 138000, 5, 1048800, 124000),
  ('acc2c692-c058-51a5-8fa7-87a5b95c94e3', 'da19ac2c-c57f-524d-ab7c-5453e7fe9fdc', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 4, 118000, 5, 448400, 107000),
  ('ec318727-6738-59af-a7fb-32a067de4078', 'da19ac2c-c57f-524d-ab7c-5453e7fe9fdc', 'ec9ce527-ed5f-5b7e-80eb-939001450513', 12, 226000, 0, 2712000, 206000),
  ('7768dadc-5f31-554f-9481-af847e51802e', 'da19ac2c-c57f-524d-ab7c-5453e7fe9fdc', 'e2656c25-d025-5ef6-8445-00e99f71ee26', 6, 552000, 0, 3312000, 512000),
  ('d4f2e124-5f69-5382-9ef9-8d7cdc5cc2a7', 'a8124be5-819e-54d1-845f-989aeaf0d4e0', 'abeb85d1-5170-5581-833b-359c01b563e4', 24, 48000, 2.5, 1123200, 41500),
  ('9f2546e7-3284-5210-8651-d0d98175931c', 'a8124be5-819e-54d1-845f-989aeaf0d4e0', 'ab808a73-0c70-5ac2-ab3b-99c27fd0f2b7', 8, 192000, 10, 1382400, 171000),
  ('67494898-4ba2-5214-8990-fee5a8fa35c8', '0a1a50ff-4dd1-534c-8247-e7f1b231b29f', '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 8, 138000, 10, 993600, 124000),
  ('fa9423c6-31b5-5f2f-bfa5-e06c85e7340e', '0a1a50ff-4dd1-534c-8247-e7f1b231b29f', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 4, 362000, 0, 1448000, 341000),
  ('920bff9c-e2fb-51f2-bf61-73cf9e2b4113', '0fd52099-6a0c-5271-9b8a-3dc2970b96b6', 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 1, 112000, 0, 112000, 101500),
  ('01ee370f-3c3f-5d2f-8f1f-6989e9bda256', '0fd52099-6a0c-5271-9b8a-3dc2970b96b6', 'abeb85d1-5170-5581-833b-359c01b563e4', 1, 48000, 0, 48000, 41500),
  ('bcc5aef7-caf3-5927-ac8d-8728a8b4df0f', '0fd52099-6a0c-5271-9b8a-3dc2970b96b6', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 4, 118000, 0, 472000, 107000),
  ('4187b604-b318-52d9-9c5c-51aba1bb623c', '0fd52099-6a0c-5271-9b8a-3dc2970b96b6', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 2, 362000, 0, 724000, 341000),
  ('3c7e128b-db72-5e95-8801-a160e7b35ddc', '359e7a00-f8a5-584a-a503-d35e2b98a2fc', 'abeb85d1-5170-5581-833b-359c01b563e4', 7, 48000, 2.5, 327600, 41500),
  ('f4e93247-d69f-5ac0-a6be-2bc78e125cad', '359e7a00-f8a5-584a-a503-d35e2b98a2fc', '1ecac6f4-140b-58eb-bcf2-e4a6feebf600', 1, 336000, 2.5, 327600, 305000),
  ('e2849d74-b769-5212-8cc9-b28eae816fb5', '0cadd905-5bdd-5167-b034-5bc19c1228a0', 'ec9ce527-ed5f-5b7e-80eb-939001450513', 12, 226000, 0, 2712000, 206000),
  ('dec59050-2c3d-5fe6-85e1-056eff9c7cc7', '0cadd905-5bdd-5167-b034-5bc19c1228a0', 'abeb85d1-5170-5581-833b-359c01b563e4', 4, 48000, 2.5, 187200, 41500),
  ('041e3873-1a51-5a71-b25e-8d3b151474db', '0cadd905-5bdd-5167-b034-5bc19c1228a0', 'f546ffa5-cfb6-559b-b0f3-c68d26fa2b71', 4, 168000, 0, 672000, 147000),
  ('19c73624-d4db-5518-b11e-a4e6e26d5856', '3d3f27db-2a8b-5612-ba30-7b088a6d4576', 'abeb85d1-5170-5581-833b-359c01b563e4', 8, 48000, 0, 384000, 42000),
  ('e50ee0cd-b230-5f76-bdc5-169f0b94932b', '3d3f27db-2a8b-5612-ba30-7b088a6d4576', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 5, 118000, 2.5, 575250, 107000),
  ('2325b0de-eb84-5102-8467-3b0c1cec45ba', '3d3f27db-2a8b-5612-ba30-7b088a6d4576', 'ec3d6dbd-628a-5412-81d3-54c936a3e82f', 4, 156000, 0, 624000, 139000),
  ('68acf818-8064-5010-86a4-1ae13651995a', '486a9c52-7435-5349-a2c3-3789412a42de', 'abeb85d1-5170-5581-833b-359c01b563e4', 5, 48000, 0, 240000, 42000),
  ('557410f5-1f7f-522c-87fa-41fb63e9c4b6', '7f0b2ba0-8d63-59ca-9518-0d6fbf5c5b74', 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 19, 112000, 5, 2021600, 101500),
  ('f75a76af-7ced-5c6b-a261-1f70f7a9c08f', '7f0b2ba0-8d63-59ca-9518-0d6fbf5c5b74', 'abeb85d1-5170-5581-833b-359c01b563e4', 16, 48000, 0, 768000, 42000),
  ('c54c3483-b5ab-5b67-a3fa-61760f31a996', '26f2ef97-0d22-588d-a440-a388ba527606', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 14, 362000, 0, 5068000, 341000),
  ('85c6adcf-c763-5369-a561-a15bc35c67b6', '26f2ef97-0d22-588d-a440-a388ba527606', 'abeb85d1-5170-5581-833b-359c01b563e4', 52, 48000, 0, 2496000, 42000),
  ('182dcd1a-b3f3-59f4-839e-c294f6b5c2a4', 'ff02aa9d-3b7a-543e-b617-7c5150b0ac89', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 11, 362000, 0, 3982000, 341000),
  ('e6a06eaf-e42c-5322-94b6-43a94fe35778', 'deb4a706-4323-5997-b6f5-ed15b596833e', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 15, 118000, 5, 1681500, 108000),
  ('6ab1de41-24da-5008-b88b-0a12bbe46ba5', 'deb4a706-4323-5997-b6f5-ed15b596833e', 'ec9ce527-ed5f-5b7e-80eb-939001450513', 15, 226000, 5, 3220500, 206000),
  ('aa58fc05-3ad6-5597-a2d1-0bdd8d54f2e6', 'deb4a706-4323-5997-b6f5-ed15b596833e', '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 13, 138000, 0, 1794000, 125000),
  ('7281f334-2b55-520e-b7b1-334cae72cec1', 'deb4a706-4323-5997-b6f5-ed15b596833e', '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 13, 78000, 0, 1014000, 71500),
  ('1d0fbb77-b0e6-52fc-a400-448ab19155a0', 'd285b294-521c-5b05-a90f-1d772f4f4ec0', 'abeb85d1-5170-5581-833b-359c01b563e4', 8, 48000, 2.5, 374400, 42000),
  ('2c8b8ece-f1ed-55a5-a2f7-d4dd5a37f0ae', 'd285b294-521c-5b05-a90f-1d772f4f4ec0', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 12, 118000, 5, 1345200, 108000),
  ('a2f1fa76-1d6b-54b0-b4c0-2e361b7f9b24', 'd285b294-521c-5b05-a90f-1d772f4f4ec0', 'ec9ce527-ed5f-5b7e-80eb-939001450513', 12, 226000, 5, 2576400, 208000),
  ('4e770ec5-53ef-5478-a2f0-6efe64d96b2a', 'd285b294-521c-5b05-a90f-1d772f4f4ec0', 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 12, 112000, 0, 1344000, 101500),
  ('7f965b50-4d56-5b14-a476-532ea05841e1', 'd285b294-521c-5b05-a90f-1d772f4f4ec0', 'ec3d6dbd-628a-5412-81d3-54c936a3e82f', 3, 156000, 0, 468000, 139000),
  ('8f9ccb5e-e524-5f37-b0a9-d57ac0c39a5f', '82c6ba12-0641-552c-9028-e6b218375c6f', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 5, 362000, 0, 1810000, 341000),
  ('71784e3c-a1ee-51da-ae96-996bf5209023', '82c6ba12-0641-552c-9028-e6b218375c6f', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 14, 118000, 0, 1652000, 108000),
  ('25793b7c-e76f-5cc4-a669-942743aafdf0', '82c6ba12-0641-552c-9028-e6b218375c6f', 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 8, 112000, 5, 851200, 101500),
  ('00cce549-2b91-5917-8b13-2e493af09828', 'c3f86068-49f5-5885-a603-ad2ee5d093ac', 'abeb85d1-5170-5581-833b-359c01b563e4', 7, 48000, 0, 336000, 42000),
  ('d5ed3cca-3d8b-545d-bfed-bc948dbf75b8', 'c3f86068-49f5-5885-a603-ad2ee5d093ac', 'ec9ce527-ed5f-5b7e-80eb-939001450513', 8, 226000, 5, 1717600, 208000),
  ('bdb7ddc0-2b97-51d5-bfb2-7fdfb78481c4', 'c3f86068-49f5-5885-a603-ad2ee5d093ac', '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 6, 138000, 0, 828000, 125000),
  ('d3f7c44a-dbda-595c-80fa-d46b3e2b8ca5', 'c3f86068-49f5-5885-a603-ad2ee5d093ac', 'f546ffa5-cfb6-559b-b0f3-c68d26fa2b71', 1, 168000, 0, 168000, 148000),
  ('d4650822-8ee7-5867-8b59-708bd7257bb6', 'f43e5c90-7904-5ce1-ab9b-5490daba4828', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 8, 118000, 0, 944000, 108000),
  ('89a8df2d-3ee8-5f55-ad05-1efd02f83229', 'f43e5c90-7904-5ce1-ab9b-5490daba4828', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 8, 362000, 0, 2896000, 341000),
  ('152cdc59-47cb-55eb-8952-5e2a49346781', 'f43e5c90-7904-5ce1-ab9b-5490daba4828', '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 6, 138000, 0, 828000, 125000),
  ('c0c725af-f32a-5bb0-8421-c256ad3f7fa1', '04e1590c-1736-5c73-92bd-7e510f98e413', '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 6, 138000, 0, 828000, 125000),
  ('d12c35e2-478e-5531-8457-55bc49b56188', '04e1590c-1736-5c73-92bd-7e510f98e413', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 5, 118000, 0, 590000, 108000),
  ('3923b4a3-201a-5c1f-bb8f-8377ed79738e', 'fd7b44f7-79dc-5886-b7d6-5ec09e35085d', 'abeb85d1-5170-5581-833b-359c01b563e4', 5, 48000, 0, 240000, NULL),
  ('9bcbf619-9483-588d-96f9-32f19c36c61b', 'dbe37cd5-0d02-5c47-b9fd-16be14da9a4d', 'ab808a73-0c70-5ac2-ab3b-99c27fd0f2b7', 23, 192000, 0, 4416000, 171000),
  ('ec7f4fac-16ff-5183-92ee-74412054a524', '60fcc970-eedd-58d2-bd64-f6a23932cfd0', '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 20, 78000, 0, 1560000, 71500),
  ('e10dce58-27d4-524c-a6d8-aeb902016844', '60fcc970-eedd-58d2-bd64-f6a23932cfd0', 'abeb85d1-5170-5581-833b-359c01b563e4', 15, 48000, 5, 684000, 42000),
  ('7cf00309-49c4-5be5-bf68-1b332f1d9261', 'b86e03b4-56ef-55e8-a685-1819b826e020', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 10, 118000, 5, 1121000, 108000),
  ('84704f47-32aa-57af-a130-8b15aeb8d75d', 'b86e03b4-56ef-55e8-a685-1819b826e020', 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 10, 112000, 5, 1064000, 101500),
  ('c9518544-8688-5dc1-932b-e02a886f25fc', 'b86e03b4-56ef-55e8-a685-1819b826e020', 'ec9ce527-ed5f-5b7e-80eb-939001450513', 5, 226000, 0, 1130000, 208000),
  ('a91a8b47-f8ad-5bcd-8aa4-c080538b37b1', '3bdd5804-17ae-5c49-8aff-c4fdab80c8c7', 'e2656c25-d025-5ef6-8445-00e99f71ee26', 1, 552000, 0, 552000, NULL),
  ('3ae66f6f-a086-5362-842a-54ef256c6dfe', '21119920-fe2c-51a0-8360-721fb7d5e504', 'e2656c25-d025-5ef6-8445-00e99f71ee26', 1, 552000, 0, 552000, NULL),
  ('de41da81-af86-5f53-9d6d-f59f4951c4b4', '2375d597-efa6-5ecf-872a-aab957e9ab0b', '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 2, 138000, 0, 276000, NULL),
  ('09410ef4-9d9c-5be3-a851-a092c28902f9', '2375d597-efa6-5ecf-872a-aab957e9ab0b', 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 3, 168000, 0, 504000, NULL),
  ('d3e9b89a-3b22-5961-959a-23a5a278d67e', '325e0bda-ded1-53f1-850c-ec697c37cf18', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 3, 362000, 0, 1086000, NULL),
  ('4cf93d1a-cea3-506d-bb7b-b44e7a9e0c68', '35b6d7e3-6864-5ba1-8848-424fd220ee07', 'abeb85d1-5170-5581-833b-359c01b563e4', 2, 48000, 0, 96000, NULL),
  ('df808734-27bf-50e6-b4ac-cea1777b4bdf', 'a20ca835-806e-544e-9247-9007f1c3b29b', '75bc9358-ec31-57bc-a48e-112d0290fafa', 2, 186000, 10, 334800, NULL),
  ('c3a99068-05c2-5987-a0be-3ce00bb2fa31', 'a20ca835-806e-544e-9247-9007f1c3b29b', 'f546ffa5-cfb6-559b-b0f3-c68d26fa2b71', 1, 168000, 10, 151200, NULL),
  ('d99dc461-4445-5b0b-b53b-54d4c77c84d1', '7f6ca835-8b37-546a-a841-c507168494bb', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 1, 362000, 10, 325800, NULL),
  ('5e3d6776-90d3-5946-a2af-cddc73413c64', '52057d5e-dd4c-5353-b05f-13bfec548423', 'abeb85d1-5170-5581-833b-359c01b563e4', 1, 48000, 0, 48000, NULL);

-- -----------------------------------------------------------------------------
-- TABEL: public.mutasi_stok (128 baris)
-- -----------------------------------------------------------------------------
INSERT INTO public.mutasi_stok (id, barang_id, jenis, jumlah, stok_sesudah, nomor_dokumen, alasan, dibuat_oleh, dibuat_pada) VALUES
  (1, 'ec9ce527-ed5f-5b7e-80eb-939001450513', 'penyesuaian', 90, 90, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (2, '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'penyesuaian', 60, 60, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (3, '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 'penyesuaian', 70, 70, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (4, '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 'penyesuaian', 150, 150, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (5, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'penyesuaian', 120, 120, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (6, 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 'penyesuaian', 110, 110, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (7, '75bc9358-ec31-57bc-a48e-112d0290fafa', 'penyesuaian', 45, 45, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (8, 'ab808a73-0c70-5ac2-ab3b-99c27fd0f2b7', 'penyesuaian', 40, 40, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (9, 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 'penyesuaian', 55, 55, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (10, 'ec3d6dbd-628a-5412-81d3-54c936a3e82f', 'penyesuaian', 30, 30, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (11, 'e2656c25-d025-5ef6-8445-00e99f71ee26', 'penyesuaian', 20, 20, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (12, 'f546ffa5-cfb6-559b-b0f3-c68d26fa2b71', 'penyesuaian', 30, 30, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (13, 'e31caa3a-cde5-5372-8a44-7f5b67b41f93', 'penyesuaian', 30, 30, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (14, 'abeb85d1-5170-5581-833b-359c01b563e4', 'penyesuaian', 160, 160, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (15, '1ecac6f4-140b-58eb-bcf2-e4a6feebf600', 'penyesuaian', 16, 16, 'ADJ-260901', 'Stok awal hasil hitung fisik 1 September 2026', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-01 07:30:00+07'),
  (16, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -20, 140, 'SO-00001', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-01 09:55:00+07'),
  (17, 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 'keluar', -6, 104, 'SO-00001', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-01 09:55:00+07'),
  (18, 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 'keluar', -13, 42, 'SO-00001', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-01 09:55:00+07'),
  (19, 'ec9ce527-ed5f-5b7e-80eb-939001450513', 'keluar', -24, 66, 'SO-00001', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-01 09:55:00+07'),
  (20, '1ecac6f4-140b-58eb-bcf2-e4a6feebf600', 'keluar', -10, 6, 'SO-00002', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-02 09:55:00+07'),
  (21, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'keluar', -6, 114, 'SO-00002', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-02 09:55:00+07'),
  (22, 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 'keluar', -6, 36, 'SO-00002', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-02 09:55:00+07'),
  (23, '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 'keluar', -14, 136, 'SO-00003', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-03 09:55:00+07'),
  (24, '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'keluar', -4, 56, 'SO-00004', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-04 09:55:00+07'),
  (25, '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 'keluar', -7, 129, 'SO-00004', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-04 09:55:00+07'),
  (26, 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 'keluar', -9, 27, 'SO-00004', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-04 09:55:00+07'),
  (27, '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 'masuk', 60, 189, 'PO-00001', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-05 08:00:00+07'),
  (28, '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'keluar', -3, 53, 'SO-00005', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-05 09:55:00+07'),
  (29, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'keluar', -3, 111, 'SO-00005', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-05 09:55:00+07'),
  (30, '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 'keluar', -7, 182, 'SO-00005', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-05 09:55:00+07'),
  (31, 'ab808a73-0c70-5ac2-ab3b-99c27fd0f2b7', 'keluar', -1, 39, 'SO-00005', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-05 09:55:00+07'),
  (32, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -2, 138, 'SO-00005', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-05 09:55:00+07'),
  (33, 'abeb85d1-5170-5581-833b-359c01b563e4', 'masuk', 80, 218, 'PO-00002', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-07 08:00:00+07'),
  (34, '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 'keluar', -9, 61, 'SO-00006', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-07 09:55:00+07'),
  (35, '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'keluar', -11, 42, 'SO-00007', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-07 11:55:00+07'),
  (36, 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 'keluar', -22, 5, 'SO-00007', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-07 11:55:00+07'),
  (37, 'ec9ce527-ed5f-5b7e-80eb-939001450513', 'keluar', -19, 47, 'SO-00007', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-07 11:55:00+07'),
  (38, '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 'keluar', -25, 36, 'SO-00008', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-08 09:55:00+07'),
  (39, '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'keluar', -1, 41, 'SO-00009', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-09 09:55:00+07'),
  (40, '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 'keluar', -4, 178, 'SO-00009', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-09 09:55:00+07'),
  (41, 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 'keluar', -2, 102, 'SO-00009', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-09 09:55:00+07'),
  (42, 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 'keluar', -3, 2, 'SO-00009', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-09 09:55:00+07'),
  (43, 'e2656c25-d025-5ef6-8445-00e99f71ee26', 'keluar', -1, 19, 'SO-00009', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-09 09:55:00+07'),
  (44, 'ec3d6dbd-628a-5412-81d3-54c936a3e82f', 'keluar', -2, 28, 'SO-00010', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-09 11:55:00+07'),
  (45, 'ec9ce527-ed5f-5b7e-80eb-939001450513', 'keluar', -14, 33, 'SO-00010', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-09 11:55:00+07'),
  (46, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'masuk', 80, 191, 'PO-00003', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-10 08:00:00+07'),
  (47, '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 'keluar', -1, 35, 'SO-00011', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-10 09:55:00+07'),
  (48, 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 'keluar', -3, 99, 'SO-00011', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-10 09:55:00+07'),
  (49, 'ec9ce527-ed5f-5b7e-80eb-939001450513', 'masuk', 60, 93, 'PO-00004', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-11 08:00:00+07'),
  (50, '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 'keluar', -1, 34, 'SO-00012', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-11 09:55:00+07'),
  (51, 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', 'keluar', -2, 0, 'SO-00012', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-11 09:55:00+07'),
  (52, 'ec9ce527-ed5f-5b7e-80eb-939001450513', 'keluar', -1, 92, 'SO-00012', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-11 09:55:00+07'),
  (53, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'keluar', -26, 165, 'SO-00013', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-12 09:55:00+07'),
  (54, '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'keluar', -8, 33, 'SO-00014', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-14 09:55:00+07'),
  (55, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -5, 213, 'SO-00014', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-14 09:55:00+07'),
  (56, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'keluar', -8, 157, 'SO-00015', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-15 08:50:00+07'),
  (57, '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 'keluar', -15, 163, 'SO-00015', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-15 08:50:00+07'),
  (58, 'ec9ce527-ed5f-5b7e-80eb-939001450513', 'keluar', -6, 86, 'SO-00015', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-15 08:50:00+07'),
  (59, 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 'masuk', 75, 174, 'PO-00005', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-16 08:00:00+07'),
  (60, '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'masuk', 40, 73, 'PO-00006', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-17 08:00:00+07'),
  (61, '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'keluar', -7, 66, 'SO-00016', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-19 09:55:00+07'),
  (62, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'keluar', -7, 150, 'SO-00016', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-19 09:55:00+07'),
  (63, '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 'keluar', -7, 156, 'SO-00016', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-19 09:55:00+07'),
  (64, '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 'keluar', -8, 26, 'SO-00017', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-21 09:55:00+07'),
  (65, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'keluar', -4, 146, 'SO-00017', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-21 09:55:00+07'),
  (66, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -4, 209, 'SO-00017', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-21 09:55:00+07'),
  (67, 'e2656c25-d025-5ef6-8445-00e99f71ee26', 'keluar', -6, 13, 'SO-00017', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-21 09:55:00+07'),
  (68, 'ec9ce527-ed5f-5b7e-80eb-939001450513', 'keluar', -12, 74, 'SO-00017', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-21 09:55:00+07'),
  (69, 'ab808a73-0c70-5ac2-ab3b-99c27fd0f2b7', 'keluar', -8, 31, 'SO-00018', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-21 11:55:00+07'),
  (70, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -24, 185, 'SO-00018', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-21 11:55:00+07'),
  (71, '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'keluar', -4, 62, 'SO-00019', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-22 09:55:00+07'),
  (72, '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 'keluar', -8, 18, 'SO-00019', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-22 09:55:00+07'),
  (73, '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 'masuk', 50, 68, 'PO-00008', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-23 08:00:00+07'),
  (74, '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'keluar', -2, 60, 'SO-00020', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-23 09:55:00+07'),
  (75, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'keluar', -4, 142, 'SO-00020', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-23 09:55:00+07'),
  (76, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -1, 184, 'SO-00020', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-23 09:55:00+07'),
  (77, 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 'keluar', -1, 173, 'SO-00020', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-23 09:55:00+07'),
  (78, '1ecac6f4-140b-58eb-bcf2-e4a6feebf600', 'keluar', -1, 5, 'SO-00021', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-23 11:55:00+07'),
  (79, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -7, 177, 'SO-00021', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-23 11:55:00+07'),
  (80, '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 'masuk', 60, 216, 'PO-00009', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-24 08:00:00+07'),
  (81, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -4, 173, 'SO-00022', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-25 09:55:00+07'),
  (82, 'ec9ce527-ed5f-5b7e-80eb-939001450513', 'keluar', -12, 62, 'SO-00022', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-25 09:55:00+07'),
  (83, 'f546ffa5-cfb6-559b-b0f3-c68d26fa2b71', 'keluar', -4, 26, 'SO-00022', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-25 09:55:00+07'),
  (84, 'abeb85d1-5170-5581-833b-359c01b563e4', 'masuk', 80, 253, 'PO-00010', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-09-28 08:00:00+07'),
  (85, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'keluar', -5, 137, 'SO-00023', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-28 09:55:00+07'),
  (86, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -8, 245, 'SO-00023', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-28 09:55:00+07'),
  (87, 'ec3d6dbd-628a-5412-81d3-54c936a3e82f', 'keluar', -4, 24, 'SO-00023', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-28 09:55:00+07'),
  (88, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -5, 240, 'SO-00024', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-09-28 11:55:00+07'),
  (89, '75bc9358-ec31-57bc-a48e-112d0290fafa', 'masuk', 30, 75, 'PO-00011', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-01 08:00:00+07'),
  (90, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -16, 224, 'SO-00025', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-02 11:55:00+07'),
  (91, 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 'keluar', -19, 154, 'SO-00025', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-02 11:55:00+07'),
  (92, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'masuk', 80, 217, 'PO-00013', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-05 08:00:00+07'),
  (93, '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'keluar', -14, 46, 'SO-00026', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-06 08:50:00+07'),
  (94, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -52, 172, 'SO-00026', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-06 08:50:00+07'),
  (95, '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'keluar', -11, 35, 'SO-00027', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-06 09:55:00+07'),
  (96, '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 'keluar', -13, 55, 'SO-00028', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-07 09:55:00+07'),
  (97, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'keluar', -15, 202, 'SO-00028', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-07 09:55:00+07'),
  (98, '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 'keluar', -13, 203, 'SO-00028', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-07 09:55:00+07'),
  (99, 'ec9ce527-ed5f-5b7e-80eb-939001450513', 'keluar', -15, 47, 'SO-00028', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-07 09:55:00+07'),
  (100, 'ec9ce527-ed5f-5b7e-80eb-939001450513', 'masuk', 58, 105, 'PO-00014', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-08 08:00:00+07'),
  (101, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'keluar', -12, 190, 'SO-00029', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-08 09:55:00+07'),
  (102, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -8, 164, 'SO-00029', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-08 09:55:00+07'),
  (103, 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 'keluar', -12, 142, 'SO-00029', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-08 09:55:00+07'),
  (104, 'ec3d6dbd-628a-5412-81d3-54c936a3e82f', 'keluar', -3, 21, 'SO-00029', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-08 09:55:00+07'),
  (105, 'ec9ce527-ed5f-5b7e-80eb-939001450513', 'keluar', -12, 93, 'SO-00029', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-08 09:55:00+07'),
  (106, 'f546ffa5-cfb6-559b-b0f3-c68d26fa2b71', 'masuk', 25, 51, 'PO-00015', NULL, '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-09 08:00:00+07'),
  (107, '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'keluar', -5, 30, 'SO-00030', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-09 09:55:00+07'),
  (108, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'keluar', -14, 176, 'SO-00030', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-09 09:55:00+07'),
  (109, 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 'keluar', -8, 134, 'SO-00030', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-09 09:55:00+07'),
  (110, '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 'keluar', -6, 49, 'SO-00031', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-10 09:55:00+07'),
  (111, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -7, 157, 'SO-00031', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-10 09:55:00+07'),
  (112, 'ec9ce527-ed5f-5b7e-80eb-939001450513', 'keluar', -8, 85, 'SO-00031', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-10 09:55:00+07'),
  (113, 'f546ffa5-cfb6-559b-b0f3-c68d26fa2b71', 'keluar', -1, 50, 'SO-00031', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-10 09:55:00+07'),
  (114, '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 'keluar', -6, 43, 'SO-00032', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-12 13:30:00+07'),
  (115, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'keluar', -5, 171, 'SO-00032', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-12 13:30:00+07'),
  (116, '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 'batal', 6, 49, 'SO-00032', 'Toko membatalkan karena salah pesan barang', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-10-12 16:00:00+07'),
  (117, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'batal', 5, 176, 'SO-00032', 'Toko membatalkan karena salah pesan barang', '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', '2026-10-12 16:00:00+07'),
  (118, '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', 'keluar', -8, 22, 'SO-00034', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-13 09:55:00+07'),
  (119, '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', 'keluar', -6, 43, 'SO-00034', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-13 09:55:00+07'),
  (120, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'keluar', -8, 168, 'SO-00034', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-13 09:55:00+07'),
  (121, 'ab808a73-0c70-5ac2-ab3b-99c27fd0f2b7', 'keluar', -23, 8, 'SO-00035', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-13 13:20:00+07'),
  (122, 'e2656c25-d025-5ef6-8445-00e99f71ee26', 'penyesuaian', -12, 1, 'ADJ-261013', 'Barang penyok dan bocor saat bongkar muat', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-13 16:00:00+07'),
  (123, '1ecac6f4-140b-58eb-bcf2-e4a6feebf600', 'penyesuaian', -5, 0, 'ADJ-261013', 'Kemasan meleleh karena gudang panas, dimusnahkan', '551b03db-5f3e-435b-b1ce-059ebefc712b', '2026-10-13 16:00:00+07'),
  (124, '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', 'keluar', -20, 183, 'SO-00036', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 09:45:00+07'),
  (125, 'abeb85d1-5170-5581-833b-359c01b563e4', 'keluar', -15, 142, 'SO-00036', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 09:45:00+07'),
  (126, '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', 'keluar', -10, 158, 'SO-00037', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 09:45:00+07'),
  (127, 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', 'keluar', -10, 124, 'SO-00037', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 09:45:00+07'),
  (128, 'ec9ce527-ed5f-5b7e-80eb-939001450513', 'keluar', -5, 80, 'SO-00037', NULL, 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '2026-10-14 09:45:00+07');

-- -----------------------------------------------------------------------------
-- TABEL: public.audit_log (61 baris)
-- -----------------------------------------------------------------------------
INSERT INTO public.audit_log (id, pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru, dibuat_pada) VALUES
  (1, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'ubah_peran_akun', 'profiles', 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '{"peran": "penjualan", "aktif": false}'::jsonb, '{"peran": "penjualan", "aktif": true}'::jsonb, '2026-08-28 09:30:00+07'),
  (2, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'ubah_peran_akun', 'profiles', 'c6bf5e70-7620-4434-b58e-d3123b2d4e91', '{"peran": "penjualan", "aktif": false}'::jsonb, '{"peran": "penjualan", "aktif": true}'::jsonb, '2026-08-28 09:30:00+07'),
  (3, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'ubah_peran_akun', 'profiles', '551b03db-5f3e-435b-b1ce-059ebefc712b', '{"peran": "penjualan", "aktif": false}'::jsonb, '{"peran": "gudang", "aktif": true}'::jsonb, '2026-08-28 09:30:00+07'),
  (4, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', 'ec9ce527-ed5f-5b7e-80eb-939001450513', '{"stok": 0}'::jsonb, '{"stok": 90, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (5, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', '671e7a37-5f79-5adc-a3b9-c9b01ac33e36', '{"stok": 0}'::jsonb, '{"stok": 60, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (6, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', '8de3a5b9-010d-5526-bdba-aa0ce0ca897a', '{"stok": 0}'::jsonb, '{"stok": 70, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (7, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', '91f7a9a7-d484-54ea-bb4a-364cb5049c1e', '{"stok": 0}'::jsonb, '{"stok": 150, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (8, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', '8e5633cc-afb0-55aa-9c19-c54bf5545d3d', '{"stok": 0}'::jsonb, '{"stok": 120, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (9, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', 'becad5d3-b8a2-5221-b5f4-25f84b9b2162', '{"stok": 0}'::jsonb, '{"stok": 110, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (10, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', '75bc9358-ec31-57bc-a48e-112d0290fafa', '{"stok": 0}'::jsonb, '{"stok": 45, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (11, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', 'ab808a73-0c70-5ac2-ab3b-99c27fd0f2b7', '{"stok": 0}'::jsonb, '{"stok": 40, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (12, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', 'e0980a04-82e1-5d49-a262-2bfff2d6ca95', '{"stok": 0}'::jsonb, '{"stok": 55, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (13, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', 'ec3d6dbd-628a-5412-81d3-54c936a3e82f', '{"stok": 0}'::jsonb, '{"stok": 30, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (14, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', 'e2656c25-d025-5ef6-8445-00e99f71ee26', '{"stok": 0}'::jsonb, '{"stok": 20, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (15, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', 'f546ffa5-cfb6-559b-b0f3-c68d26fa2b71', '{"stok": 0}'::jsonb, '{"stok": 30, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (16, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', 'e31caa3a-cde5-5372-8a44-7f5b67b41f93', '{"stok": 0}'::jsonb, '{"stok": 30, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (17, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', 'abeb85d1-5170-5581-833b-359c01b563e4', '{"stok": 0}'::jsonb, '{"stok": 160, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (18, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', '1ecac6f4-140b-58eb-bcf2-e4a6feebf600', '{"stok": 0}'::jsonb, '{"stok": 16, "alasan": "Stok awal hasil hitung fisik 1 September 2026"}'::jsonb, '2026-09-01 07:30:00+07'),
  (19, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', '06303baa-6d02-54f6-9b70-c7a62df647e2', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 70500}'::jsonb, '2026-09-03 13:00:00+07'),
  (20, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', 'ccda8513-eaee-5f23-8b3f-5bdebcaf3ab0', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 41500}'::jsonb, '2026-09-04 13:00:00+07'),
  (21, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', '2f0f300a-98f8-5c94-9286-d6cb5f618566', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 107000}'::jsonb, '2026-09-08 13:00:00+07'),
  (22, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', 'ca2ba3f0-47c4-50c4-9833-4e89dc1b9fcf', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 206000}'::jsonb, '2026-09-09 13:00:00+07'),
  (23, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '19a4ffdb-5adc-5da6-8305-c98fe3cc12c9', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-09-11 16:00:00+07"}'::jsonb, '2026-09-11 16:00:00+07'),
  (24, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', '2e89aba8-c11c-57af-867a-e8d875a6bba7', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 101500}'::jsonb, '2026-09-14 13:00:00+07'),
  (25, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', '64dae0e1-c4b0-5d6c-9533-95be707832a4', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 341000}'::jsonb, '2026-09-15 13:00:00+07'),
  (26, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '2e674c3e-4123-549d-ac9d-a85065e5dc49', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-09-15 16:00:00+07"}'::jsonb, '2026-09-15 16:00:00+07'),
  (27, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'tolak_pembelian', 'pembelian', '30e16d6e-605c-58b0-821a-19677004bd3f', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "ditolak", "alasan_tolak": "Stok kopi masih cukup untuk 3 minggu, tunda bulan depan"}'::jsonb, '2026-09-17 13:00:00+07'),
  (28, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '354d97a2-f718-5745-92af-405bd72d6985', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-09-17 16:00:00+07"}'::jsonb, '2026-09-17 16:00:00+07'),
  (29, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '76dce0bf-c581-5f7d-bfc5-8f4e42806823', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-09-18 16:00:00+07"}'::jsonb, '2026-09-18 16:00:00+07'),
  (30, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', 'b2f34183-5ad2-5514-8dd3-27cca6551273', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-09-19 16:00:00+07"}'::jsonb, '2026-09-19 16:00:00+07'),
  (31, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '53d14dbe-431a-566d-a7e6-94335dd7f8ac', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-09-19 16:00:00+07"}'::jsonb, '2026-09-19 16:00:00+07'),
  (32, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'ubah_harga_jual', 'barang', 'ec9ce527-ed5f-5b7e-80eb-939001450513', '{"harga_jual": 222000}'::jsonb, '{"harga_jual": 226000}'::jsonb, '2026-09-21 08:00:00+07'),
  (33, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', 'e108cdc2-782e-5274-b39e-c87dfe76bb6f', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 125000}'::jsonb, '2026-09-21 13:00:00+07'),
  (34, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', '73a09f56-091d-5522-b18a-b14d85e7deed', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 71500}'::jsonb, '2026-09-22 13:00:00+07'),
  (35, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', 'a77e4b27-cf34-5ae2-babf-687f4d56e6f0', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-09-23 16:00:00+07"}'::jsonb, '2026-09-23 16:00:00+07'),
  (36, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '4e07ed3c-8d7c-5543-b44f-682709ba4ede', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-09-24 16:00:00+07"}'::jsonb, '2026-09-24 16:00:00+07'),
  (37, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', '994e9953-d616-56ff-826c-4057d5aa8bf2', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 42000}'::jsonb, '2026-09-25 13:00:00+07'),
  (38, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '2a7e33d9-16ed-577f-88ff-1ff6281ea224', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-09-25 16:00:00+07"}'::jsonb, '2026-09-25 16:00:00+07'),
  (39, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', '47be15b5-6c08-548a-86f4-62b65f16cecb', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 166000}'::jsonb, '2026-09-29 13:00:00+07'),
  (40, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', 'e6f4cd7f-74e6-5ccb-a420-ac7759daffc9', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 140000}'::jsonb, '2026-09-30 13:00:00+07'),
  (41, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '8c767893-eb9d-584e-9496-d79b57fe95b7', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-09-30 16:00:00+07"}'::jsonb, '2026-09-30 16:00:00+07'),
  (42, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '457923af-a620-557f-82d9-a0484a4ccebe', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-09-30 16:00:00+07"}'::jsonb, '2026-09-30 16:00:00+07'),
  (43, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'ubah_batas_kredit', 'pelanggan', '6f20e262-db32-5ce4-9a42-c4282d6e48ee', '{"batas_kredit": 20000000}'::jsonb, '{"batas_kredit": 25000000}'::jsonb, '2026-10-01 08:15:00+07'),
  (44, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '17fb99f3-a996-50ab-8c2a-ed6738895cc3', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-10-01 16:00:00+07"}'::jsonb, '2026-10-01 16:00:00+07'),
  (45, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', '02989490-f44f-5e23-bbd8-3c30b5ed5d8f', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 108000}'::jsonb, '2026-10-02 13:00:00+07'),
  (46, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '0a1a50ff-4dd1-534c-8247-e7f1b231b29f', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-10-03 16:00:00+07"}'::jsonb, '2026-10-03 16:00:00+07'),
  (47, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '3d3f27db-2a8b-5612-ba30-7b088a6d4576', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-10-03 16:00:00+07"}'::jsonb, '2026-10-03 16:00:00+07'),
  (48, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', 'edff02d0-6460-5630-833d-f05f55c4e4ea', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 208000}'::jsonb, '2026-10-06 13:00:00+07'),
  (49, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '0fd52099-6a0c-5271-9b8a-3dc2970b96b6', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-10-06 16:00:00+07"}'::jsonb, '2026-10-06 16:00:00+07'),
  (50, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '359e7a00-f8a5-584a-a503-d35e2b98a2fc', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-10-06 16:00:00+07"}'::jsonb, '2026-10-06 16:00:00+07'),
  (51, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '0cadd905-5bdd-5167-b034-5bc19c1228a0', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-10-06 16:00:00+07"}'::jsonb, '2026-10-06 16:00:00+07'),
  (52, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', 'bb6e7868-6500-5224-873b-2a19d0414149', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 148000}'::jsonb, '2026-10-07 13:00:00+07'),
  (53, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '1824e36e-0e10-5511-b400-298f6c873fbd', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-10-08 16:00:00+07"}'::jsonb, '2026-10-08 16:00:00+07'),
  (54, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', 'cf298a5b-ca39-5a0a-860f-9db0a30c7626', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-10-09 16:00:00+07"}'::jsonb, '2026-10-09 16:00:00+07'),
  (55, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '486a9c52-7435-5349-a2c3-3789412a42de', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-10-09 16:00:00+07"}'::jsonb, '2026-10-09 16:00:00+07'),
  (56, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'pelunasan', 'pesanan_jual', '3f50277c-0f45-57d1-a50f-4b19bd6472c7', '{"status": "dikirim"}'::jsonb, '{"status": "lunas", "dilunasi_pada": "2026-10-11 16:00:00+07"}'::jsonb, '2026-10-11 16:00:00+07'),
  (57, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', 'cce9f696-2238-50ff-82d4-3f4909fc2509', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 515000}'::jsonb, '2026-10-12 13:00:00+07'),
  (58, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'batal_pesanan_dikonfirmasi', 'pesanan_jual', '04e1590c-1736-5c73-92bd-7e510f98e413', '{"status": "dikonfirmasi"}'::jsonb, '{"status": "dibatalkan", "alasan_batal": "Toko membatalkan karena salah pesan barang"}'::jsonb, '2026-10-12 16:00:00+07'),
  (59, '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc', 'setujui_pembelian', 'pembelian', '01df44d6-916d-554e-b362-eee23866b25f', '{"status": "diajukan", "harga_beli_satuan": null}'::jsonb, '{"status": "disetujui", "harga_beli_satuan": 306000}'::jsonb, '2026-10-13 13:00:00+07'),
  (60, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', 'e2656c25-d025-5ef6-8445-00e99f71ee26', '{"stok": 13}'::jsonb, '{"stok": 1, "alasan": "Barang penyok dan bocor saat bongkar muat"}'::jsonb, '2026-10-13 16:00:00+07'),
  (61, '551b03db-5f3e-435b-b1ce-059ebefc712b', 'penyesuaian_stok', 'barang', '1ecac6f4-140b-58eb-bcf2-e4a6feebf600', '{"stok": 5}'::jsonb, '{"stok": 0, "alasan": "Kemasan meleleh karena gudang panas, dimusnahkan"}'::jsonb, '2026-10-13 16:00:00+07');

-- 3. SINKRONISASI SEQUENCE IDENTITY (mutasi_stok & audit_log)
SELECT setval(pg_get_serial_sequence('public.mutasi_stok', 'id'), COALESCE((SELECT MAX(id) FROM public.mutasi_stok), 1));
SELECT setval(pg_get_serial_sequence('public.audit_log', 'id'), COALESCE((SELECT MAX(id) FROM public.audit_log), 1));

-- 4. COMMIT TRANSAKSI
COMMIT;
