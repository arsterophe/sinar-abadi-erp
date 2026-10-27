-- =============================================================================
-- SKRIP PEMERIKSAAN PRA-MIGRASI (READ-ONLY) UNTUK MIGRASI 03
-- Modul: Pembelian, Izin, Kebijakan RLS, Trigger, Sequence, dan View
-- CV Sinar Abadi Niaga - ERP Distribusi
-- =============================================================================
-- INSTRUKSI & PERINGATAN EKSEKUSI:
-- 1. Skrip ini 100% READ-ONLY (hanya berisi SELECT, tanpa DDL, DML, RPC, nextval, atau setval).
-- 2. Mayoritas query (Bagian 1, 2, 3 Pre-Check, 3C-E, 4-8) adalah query katalog sistem (pg_*, information_schema)
--    yang aman dieksekusi sekalipun objek yang diperiksa belum ada di database.
-- 3. PERHATIAN KHUSUS BAGIAN 3 (Query 3A & 3B):
--    Query 3A dan 3B membaca data langsung dari tabel fisik 'public.pembelian'.
--    Jika dieksekusi secara batch utuh ("Run All") pada database yang BELUM memiliki tabel 'public.pembelian',
--    PostgreSQL Engine akan berhenti dengan error "relation public.pembelian does not exist".
--    Oleh karena itu:
--    - Periksa hasil Query 3 Pre-Check terlebih dahulu.
--    - Jalankan Query 3A dan 3B secara terpisah (blok selektif) HANYA setelah ketersediaan
--      tabel public.pembelian dan kolom-kolomnya terkonfirmasi.
-- 4. TIDAK mengubah skema, TIDAK mengubah data, dan TIDAK mengubah hak akses apa pun.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PEMERIKSAAN KEBERADAAN & DEFINISI VIEW v_pembelian
-- Yang perlu diperhatikan:
-- - Jika view BELUM ADA (0 baris): Sangat aman, CREATE OR REPLACE VIEW akan membuat view baru.
-- - Jika view SUDAH ADA: Periksa daftar kolomnya. Di PostgreSQL, CREATE OR REPLACE VIEW
--   akan ERROR jika susunan kolom lama berbeda atau ada kolom lama yang hilang.
--   Jika kolom lama berbeda, view lama harus di-DROP secara sadar terlebih dahulu.
-- -----------------------------------------------------------------------------
SELECT 
  table_schema,
  table_name,
  view_definition,
  check_option,
  is_updatable
FROM information_schema.views
WHERE table_schema = 'public' 
  AND table_name = 'v_pembelian';

-- Periksa kolom view v_pembelian jika sudah ada:
SELECT 
  column_name, 
  data_type, 
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'v_pembelian'
ORDER BY ordinal_position;


-- -----------------------------------------------------------------------------
-- 2. PEMERIKSAAN SKEMA & KOLOM PRASYARAT (5 TABEL UTAMA)
-- Tabel: pembelian, profiles, barang, mutasi_stok, audit_log
-- Berdasarkan referensi eksplisit migrasi 03 (BR-09, BR-10, BR-11, BR-12, PRD Bab 7)
-- Yang perlu diperhatikan:
-- - Kolom berstatus 'KRITIKAL' wajib ada sebelum migrasi (menghalangi DDL atau pengajuan PO).
-- - Kolom berstatus 'PERINGATAN' dibutuhkan saat alur penerimaan barang fisik di kemudian hari.
-- -----------------------------------------------------------------------------
-- A. Validasi keberadaan seluruh kolom prasyarat pada 5 tabel terkait:
WITH expected_columns AS (
  SELECT * FROM (VALUES
    -- 1. TABEL public.pembelian (Wajib sebelum migrasi: DDL tabel, RLS, integritas PO, dan view)
    ('pembelian', 'id', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),
    ('pembelian', 'nomor', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),
    ('pembelian', 'pemasok_id', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),
    ('pembelian', 'barang_id', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),
    ('pembelian', 'jumlah_dipesan', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),
    ('pembelian', 'jumlah_diterima', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),
    ('pembelian', 'harga_beli_satuan', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),
    ('pembelian', 'status', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),
    ('pembelian', 'alasan_tolak', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),
    ('pembelian', 'diajukan_oleh', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),
    ('pembelian', 'diajukan_pada', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),
    ('pembelian', 'diputuskan_oleh', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),
    ('pembelian', 'diputuskan_pada', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),
    ('pembelian', 'diterima_oleh', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),
    ('pembelian', 'diterima_pada', 'WAJIB PRA-MIGRASI (DDL & Integritas Tabel PO)'),

    -- 2. TABEL public.profiles (Wajib sebelum migrasi: Otorisasi RLS, fungsi pengajuan PO, dan view v_pembelian)
    ('profiles', 'id', 'WAJIB PRA-MIGRASI (Otorisasi RLS & Keamanan Pengajuan PO)'),
    ('profiles', 'peran', 'WAJIB PRA-MIGRASI (Otorisasi RLS & Keamanan Pengajuan PO)'),
    ('profiles', 'aktif', 'WAJIB PRA-MIGRASI (Otorisasi RLS & Keamanan Pengajuan PO)'),

    -- 3. TABEL public.audit_log (Wajib sebelum migrasi: Ditulis langsung oleh trigger trg_audit_tambah_pembelian saat PO dibuat)
    ('audit_log', 'pelaku_id', 'WAJIB PRA-MIGRASI (Trigger Audit Otomatis Pembuatan PO)'),
    ('audit_log', 'aksi', 'WAJIB PRA-MIGRASI (Trigger Audit Otomatis Pembuatan PO)'),
    ('audit_log', 'nama_tabel', 'WAJIB PRA-MIGRASI (Trigger Audit Otomatis Pembuatan PO)'),
    ('audit_log', 'data_id', 'WAJIB PRA-MIGRASI (Trigger Audit Otomatis Pembuatan PO)'),
    ('audit_log', 'nilai_lama', 'WAJIB PRA-MIGRASI (Trigger Audit Otomatis Pembuatan PO)'),
    ('audit_log', 'nilai_baru', 'WAJIB PRA-MIGRASI (Trigger Audit Otomatis Pembuatan PO)'),
    ('audit_log', 'dibuat_pada', 'WAJIB PRA-MIGRASI (Trigger Audit Otomatis Pembuatan PO)'),

    -- 4. TABEL public.barang (Dibutuhkan saat runtime penerimaan fisik barang: penambahan stok & update harga pokok)
    ('barang', 'id', 'RUNTIME PENERIMAAN BARANG FISIK (Mutasi Stok & HPP)'),
    ('barang', 'kode', 'RUNTIME PENERIMAAN BARANG FISIK (Mutasi Stok & HPP)'),
    ('barang', 'nama', 'RUNTIME PENERIMAAN BARANG FISIK (Mutasi Stok & HPP)'),
    ('barang', 'stok', 'RUNTIME PENERIMAAN BARANG FISIK (Mutasi Stok & HPP)'),
    ('barang', 'harga_pokok', 'RUNTIME PENERIMAAN BARANG FISIK (Mutasi Stok & HPP)'),
    ('barang', 'diperbarui_pada', 'RUNTIME PENERIMAAN BARANG FISIK (Mutasi Stok & HPP)'),

    -- 5. TABEL public.mutasi_stok (Dibutuhkan saat runtime penerimaan fisik barang: pencatatan kartu stok jenis masuk)
    ('mutasi_stok', 'barang_id', 'RUNTIME PENERIMAAN BARANG FISIK (Pencatatan Kartu Stok)'),
    ('mutasi_stok', 'jenis', 'RUNTIME PENERIMAAN BARANG FISIK (Pencatatan Kartu Stok)'),
    ('mutasi_stok', 'jumlah', 'RUNTIME PENERIMAAN BARANG FISIK (Pencatatan Kartu Stok)'),
    ('mutasi_stok', 'stok_sesudah', 'RUNTIME PENERIMAAN BARANG FISIK (Pencatatan Kartu Stok)'),
    ('mutasi_stok', 'nomor_dokumen', 'RUNTIME PENERIMAAN BARANG FISIK (Pencatatan Kartu Stok)'),
    ('mutasi_stok', 'alasan', 'RUNTIME PENERIMAAN BARANG FISIK (Pencatatan Kartu Stok)'),
    ('mutasi_stok', 'dibuat_oleh', 'RUNTIME PENERIMAAN BARANG FISIK (Pencatatan Kartu Stok)'),
    ('mutasi_stok', 'dibuat_pada', 'RUNTIME PENERIMAAN BARANG FISIK (Pencatatan Kartu Stok)')
  ) AS t(table_name, column_name, tahap_kebutuhan)
)
SELECT 
  ec.table_name,
  ec.column_name,
  ec.tahap_kebutuhan,
  ic.data_type,
  ic.is_nullable,
  CASE 
    WHEN ic.column_name IS NOT NULL THEN 'ADA' 
    WHEN ec.tahap_kebutuhan LIKE 'WAJIB PRA-MIGRASI%' THEN 'TIDAK DITEMUKAN (KRITIKAL: BLOCKER DDL / PENGAJUAN PO)'
    ELSE 'TIDAK DITEMUKAN (PERINGATAN: BLOCKER RUNTIME PENERIMAAN FISIK)'
  END AS status_kolom
FROM expected_columns ec
LEFT JOIN information_schema.columns ic 
  ON ic.table_schema = 'public' 
 AND ic.table_name = ec.table_name 
 AND ic.column_name = ec.column_name
ORDER BY 
  CASE WHEN ec.tahap_kebutuhan LIKE 'WAJIB%' THEN 1 ELSE 2 END,
  ec.table_name, 
  ec.column_name;

-- B. Skema detail kolom tabel public.pembelian:
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'pembelian'
ORDER BY ordinal_position;


-- -----------------------------------------------------------------------------
-- 3. PEMERIKSAAN SEQUENCE & DATA NOMOR PO AKTUAL (STANDAR VS DIGIT PANJANG VS NON-STANDAR)
-- Yang perlu diperhatikan:
-- - Format Standar 1-12 digit: 'PO-XXXXX' (regex '^PO-[0-9]{1,12}$', misal PO-00001 s/d PO-00019).
--   Format ini adalah acuan sinkronisasi sequence bigint pada migrasi 03 (baris 132).
-- - Format Standar > 12 digit: 'PO-' dengan digit >= 13 (regex '^PO-[0-9]{13,}$').
--   Format ini AKAN DIABAIKAN oleh sinkronisasi sequence migrasi 03 karena dibatasi {1,12}.
-- - Format Non-Standar Lainnya: nomor tanpa strip (PO0001), teks bebas (PO-MANUAL), atau NULL.
-- - PERINGATAN PENTING RUN ALL:
--   Query 3 Pre-Check di bawah adalah query katalog yang aman dari error tabel tidak ada.
--   Namun Query 3A dan 3B membaca langsung tabel fisik 'public.pembelian'.
--   Jika skrip dijalankan seluruhnya sekaligus ("Run All") pada database yang BELUM memiliki tabel
--   'public.pembelian', eksekusi batch akan ERROR pada baris Query 3A/3B.
--   Jalankan Query 3A dan 3B secara terpisah HANYA jika tabel_pembelian_tersedia = TRUE.
-- -----------------------------------------------------------------------------
-- Pre-Check: Pemeriksaan ketersediaan tabel public.pembelian dan kolom prasyarat data (id, nomor, status):
SELECT 
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'pembelian'
  ) AS tabel_pembelian_tersedia,
  EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pembelian' AND column_name = 'id'
  ) AS kolom_id_tersedia,
  EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pembelian' AND column_name = 'nomor'
  ) AS kolom_nomor_tersedia,
  EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pembelian' AND column_name = 'status'
  ) AS kolom_status_tersedia,
  CASE 
    WHEN to_regclass('public.pembelian') IS NOT NULL THEN 
      'TABEL TERSEDIA: Query 3A dan 3B dapat dieksekusi secara terpisah/selektif.'
    ELSE 
      'PERINGATAN KRITIKAL: Tabel public.pembelian BELUM TERSEDIA! JANGAN jalankan Query 3A dan 3B (akan memicu error relation does not exist).'
  END AS petunjuk_eksekusi;


-- =============================================================================
-- BLOK QUERY DATA FISIK (JALANKAN TERPISAH HANYA SETELAH PRE-CHECK TERPENUHI)
-- JANGAN jalankan query 3A & 3B dengan "Run All" jika tabel_pembelian_tersedia = FALSE!
-- =============================================================================

-- A. Ringkasan data PO aktual di tabel pembelian (Pemisahan 1-12 digit, >12 digit, dan Non-Standar):
-- Syarat Eksekusi: tabel_pembelian_tersedia = TRUE dan kolom_nomor_tersedia = TRUE
SELECT 
  COUNT(*) AS total_po,
  -- 1. Format Standar Resmi 1-12 digit (sesuai batasan sinkronisasi sequence migrasi 03 baris 132):
  COUNT(*) FILTER (WHERE nomor ~ '^PO-[0-9]{1,12}$') AS total_po_standar_1_12_digit,
  MAX(CASE WHEN nomor ~ '^PO-[0-9]{1,12}$' THEN (substring(nomor from '^PO-([0-9]{1,12})$'))::bigint ELSE NULL END) AS max_po_standar_bigint,
  MIN(CASE WHEN nomor ~ '^PO-[0-9]{1,12}$' THEN (substring(nomor from '^PO-([0-9]{1,12})$'))::bigint ELSE NULL END) AS min_po_standar_bigint,

  -- 2. Format Standar Digit Panjang (> 12 digit, diabaikan oleh sinkronisasi sequence migrasi 03):
  COUNT(*) FILTER (WHERE nomor ~ '^PO-[0-9]{13,}$') AS total_po_standar_gt_12_digit,
  MAX(CASE WHEN nomor ~ '^PO-[0-9]{13,}$' THEN (substring(nomor from '^PO-([0-9]+)$'))::numeric ELSE NULL END) AS max_po_gt_12_digit_numeric,

  -- 3. Format Non-Standar Lainnya (tanpa strip, teks bebas, prefix lain, atau NULL):
  COUNT(*) FILTER (WHERE nomor !~ '^PO-[0-9]+$' OR nomor IS NULL) AS total_po_non_standar,

  -- Nilai raw tertinggi & terendah keseluruhan:
  MAX(nomor) AS max_nomor_raw,
  MIN(nomor) AS min_nomor_raw
FROM public.pembelian;

-- B. Sampel nomor PO berformat non-standar dan digit panjang > 12 digit (jika ada):
-- Syarat Eksekusi: tabel_pembelian_tersedia = TRUE dan kolom id, nomor, status tersedia
SELECT 
  id,
  nomor,
  status,
  CASE 
    WHEN nomor IS NULL THEN 'NULL'
    WHEN nomor ~ '^PO-[0-9]{13,}$' THEN 'STANDAR_GT_12_DIGIT (Diabaikan Sync Sequence Migrasi 03)'
    ELSE 'NON_STANDAR'
  END AS kategori_nomor
FROM public.pembelian
WHERE nomor !~ '^PO-[0-9]{1,12}$' OR nomor IS NULL
ORDER BY nomor ASC NULLS FIRST
LIMIT 50;

-- =============================================================================
-- AKHIR BLOK QUERY DATA FISIK (Kembali ke pemeriksaan katalog sistem yang aman)
-- =============================================================================

-- C. Cek apakah sequence seq_pembelian_nomor sudah pernah dibuat:
SELECT 
  sequence_schema,
  sequence_name,
  data_type,
  start_value,
  minimum_value,
  maximum_value
FROM information_schema.sequences
WHERE sequence_schema = 'public'
  AND sequence_name = 'seq_pembelian_nomor';

-- D. Cek status sequence aktual di pg_sequences (jika ada):
SELECT 
  schemaname, 
  sequencename, 
  last_value, 
  start_value
FROM pg_sequences
WHERE schemaname = 'public' 
  AND sequencename = 'seq_pembelian_nomor';

-- E. Cek keberadaan tabel registrasi alokasi nomor alokasi_nomor_po (jika sudah ada):
SELECT 
  table_schema,
  table_name,
  is_insertable_into
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'alokasi_nomor_po';


-- -----------------------------------------------------------------------------
-- 4. PEMERIKSAAN CONSTRAINT & INDEKS PADA TABEL pembelian
-- Yang perlu diperhatikan:
-- - Pastikan foreign key ke pemasok(id), barang(id), profiles(id) sudah terpasang.
-- - Periksa apakah index unik pada nomor PO (pembelian_nomor_unik_idx) sudah ada.
-- -----------------------------------------------------------------------------
-- A. Constraints:
SELECT 
  con.conname AS constraint_name,
  con.contype AS constraint_type, -- p=primary key, f=foreign key, u=unique, c=check
  pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public' 
  AND rel.relname = 'pembelian'
ORDER BY con.contype, con.conname;

-- B. Indeks:
SELECT 
  indexname, 
  indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'pembelian';


-- -----------------------------------------------------------------------------
-- 5. PEMERIKSAAN TRIGGER PADA TABEL pembelian
-- Yang perlu diperhatikan:
-- - Periksa apakah ada trigger lama yang berpotensi konflik dengan 
--   trg_proteksi_integritas_pembelian atau trg_audit_tambah_pembelian.
-- -----------------------------------------------------------------------------
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_orientation,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public' 
  AND event_object_table = 'pembelian'
ORDER BY trigger_name;


-- -----------------------------------------------------------------------------
-- 6. PEMERIKSAAN KEBIJAKAN RLS SAAT INI PADA TABEL TERKAIT
-- Tabel: pembelian, pemasok, barang, mutasi_stok, audit_log, profiles, alokasi_nomor_po
-- Yang perlu diperhatikan:
-- - Pastikan status rowsecurity (RLS) = TRUE untuk seluruh tabel.
-- - Pastikan policy lama yang masih diperlukan TETAP ADA:
--   * pembelian: "pembelian_read_warehouse_manager"
--   * pemasok:   "pemasok_read_warehouse_manager"
--   * audit_log: "audit_read_manager"
-- - Periksa apakah policy "pembelian_insert_policy" atau "pembelian_update_policy"
--   sudah ada sebelumnya (migrasi 03 akan me-replace insert_policy dan me-drop update_policy).
-- -----------------------------------------------------------------------------
-- A. Status RLS pada tabel:
SELECT 
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('pembelian', 'pemasok', 'barang', 'mutasi_stok', 'audit_log', 'profiles', 'alokasi_nomor_po')
ORDER BY c.relname;

-- B. Daftar seluruh policy yang aktif saat ini:
SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('pembelian', 'pemasok', 'barang', 'mutasi_stok', 'audit_log', 'profiles', 'alokasi_nomor_po')
ORDER BY tablename, cmd, policyname;


-- -----------------------------------------------------------------------------
-- 7. PEMERIKSAAN HAK AKSES (PRIVILEGES) TABEL & KOLOM SAAT INI
-- Yang perlu diperhatikan:
-- - Role 'authenticated': Apakah saat ini sudah punya SELECT/INSERT/UPDATE pada pembelian?
--   (Metadata awal: authenticated belum memiliki izin pada pembelian).
-- - Kolom 'harga_beli_satuan': Pastikan TIDAK di-grant ke authenticated/anon pada tabel pembelian.
-- - Role 'anon' / 'PUBLIC': Pastikan tidak memiliki akses INSERT/UPDATE/DELETE.
-- -----------------------------------------------------------------------------
-- A. Table-level privileges:
SELECT 
  grantee,
  table_name,
  privilege_type,
  is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('pembelian', 'mutasi_stok', 'audit_log', 'alokasi_nomor_po')
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;

-- B. Column-level privileges (khusus tabel pembelian):
SELECT 
  grantee,
  table_name,
  column_name,
  privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'pembelian'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY column_name, grantee, privilege_type;


-- -----------------------------------------------------------------------------
-- 8. PEMERIKSAAN FUNGSI RPC AKTIF, FUNGSI LEGACY, DAN DEPENDENSI (pg_depend)
-- -----------------------------------------------------------------------------

-- A. Fungsi RPC dan Trigger baru yang ditargetkan oleh migrasi 03:
-- Memeriksa kepemilikan, bahasa, SECURITY DEFINER, konfigurasi search_path, dan signature
SELECT 
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS function_owner,
  l.lanname AS language,
  p.prosecdef AS is_security_definer,
  p.proconfig AS runtime_config,
  pg_get_function_arguments(p.oid) AS argument_list,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname IN (
    'setujui_pembelian',
    'tolak_pembelian',
    'batalkan_pembelian',
    'proses_penerimaan_barang_pembelian',
    'ambil_nomor_po_berikutnya',
    'fn_proteksi_integritas_pembelian',
    'fn_audit_tambah_pembelian'
  )
ORDER BY p.proname;

-- B. Izin EXECUTE pada fungsi target migrasi 03 di information_schema:
SELECT 
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'setujui_pembelian',
    'tolak_pembelian',
    'batalkan_pembelian',
    'proses_penerimaan_barang_pembelian',
    'ambil_nomor_po_berikutnya',
    'fn_proteksi_integritas_pembelian',
    'fn_audit_tambah_pembelian'
  )
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY routine_name, grantee;

-- C. Pemeriksaan Fungsi RPC Legacy (ajukan_pembelian, batalkan_pengajuan_pembelian, terima_pembelian):
-- Migrasi 03 (baris 609-626) akan mencabut seluruh hak akses dari PUBLIC, anon, dan authenticated.
-- Memeriksa identity arguments untuk membedakan overload fungsi secara presisi, serta status hak akses riil:
SELECT 
  p.proname AS legacy_function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_catalog.pg_get_function_arguments(p.oid) AS full_arguments,
  pg_catalog.format_type(p.prorettype, NULL) AS return_type,
  p.prosecdef AS is_security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('ajukan_pembelian', 'batalkan_pengajuan_pembelian', 'terima_pembelian')
ORDER BY p.proname, identity_arguments;

-- Izin eksplisit fungsi legacy di information_schema:
SELECT 
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('ajukan_pembelian', 'batalkan_pengajuan_pembelian', 'terima_pembelian')
  AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY routine_name, grantee;

-- D. Pemeriksaan Dependensi Katalog pg_depend untuk Fungsi yang Berpotensi di-DROP:
-- Migrasi 03 (baris 549-607) menjalankan DROP FUNCTION jika return type lama fungsi RPC
-- berbeda dari target ('text' untuk ambil_nomor_po_berikutnya, 'jsonb' untuk RPC lainnya).
-- Jika terdapat objek yang bergantung pada fungsi lama, migrasi akan GAGAL/ABORT (baris 599).
--
-- KETERBATASAN PEMERIKSAAN pg_depend:
-- 1. pg_depend HANYA mencatat relasi antar-objek internal PostgreSQL (misal view SQL, trigger,
--    atau fungsi yang secara eksplisit terikat via OID).
-- 2. pg_depend TIDAK DAPAT melacak pemanggilan berbasis dynamic SQL (EXECUTE), kode aplikasi luar
--    (Next.js Server Actions via Supabase PostgREST RPC), atau background cron jobs.
-- 3. Dependensi aplikasi client-side WAJIB diaudit secara terpisah pada kode sumber aplikasi.
SELECT 
  p.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_catalog.format_type(p.prorettype, NULL) AS return_type,
  CASE 
    WHEN (p.proname = 'ambil_nomor_po_berikutnya' AND pg_catalog.format_type(p.prorettype, NULL) <> 'text')
      OR (p.proname <> 'ambil_nomor_po_berikutnya' AND pg_catalog.format_type(p.prorettype, NULL) <> 'jsonb')
    THEN 'BERPOTENSI DI-DROP OLEH TRANSISI MIGRASI 03'
    ELSE 'AMAN (RETURN TYPE SUDAH SESUAI TARGET)'
  END AS status_transisi_migrasi,
  dep.deptype AS dependency_type,
  coalesce(
    c_view.relname,
    c.relname,
    p2.proname,
    CASE WHEN trg.tgname IS NOT NULL THEN trg.tgname || ' (pada tabel ' || coalesce(c_trg.relname, 'unknown') || ')' END,
    dep.objid::text
  ) AS dependent_object_name,
  coalesce(
    CASE 
      WHEN c_view.relname IS NOT NULL THEN 'view'
      WHEN c.relname IS NOT NULL THEN c.relkind::text
      WHEN p2.proname IS NOT NULL THEN 'function'
      WHEN trg.tgname IS NOT NULL THEN 'trigger'
      ELSE dep.classid::regclass::text
    END,
    'unknown'
  ) AS dependent_object_kind
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_depend dep ON dep.refobjid = p.oid AND dep.deptype NOT IN ('i', 'e')
LEFT JOIN pg_rewrite rw ON dep.classid = 'pg_rewrite'::regclass AND rw.oid = dep.objid
LEFT JOIN pg_class c_view ON c_view.oid = rw.ev_class
LEFT JOIN pg_class c ON dep.classid = 'pg_class'::regclass AND c.oid = dep.objid
LEFT JOIN pg_proc p2 ON dep.classid = 'pg_proc'::regclass AND p2.oid = dep.objid
LEFT JOIN pg_trigger trg ON dep.classid = 'pg_trigger'::regclass AND trg.oid = dep.objid
LEFT JOIN pg_class c_trg ON c_trg.oid = trg.tgrelid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'setujui_pembelian',
    'tolak_pembelian',
    'batalkan_pembelian',
    'proses_penerimaan_barang_pembelian',
    'ambil_nomor_po_berikutnya'
  )
ORDER BY p.proname, identity_arguments;

-- =============================================================================
-- AKHIR SKRIP PEMERIKSAAN PRA-MIGRASI
-- Salin seluruh hasil dari tab "Results" untuk dianalisis sebelum menjalankan migrasi.
-- =============================================================================
