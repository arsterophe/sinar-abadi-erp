# Panduan & Urutan Pengujian Staging: Integrasi Gateway Mayar (Migrasi 04)

Dokumen ini merupakan panduan dan protokol resmi untuk pengujian terisolasi draf migrasi `scripts/migrations/04_integrasi_mayar_dan_konkurensi.sql` pada basis data *staging* Supabase baru.

> **Prinsip Keamanan & Isolasi Staging:**
> 1. **Dilarang keras menyalin kredensial, token, API key, service-role key, atau data produksi** ke database staging.
> 2. **Dilarang menggunakan UUID pengguna riil** dari basis data produksi. Gunakan akun uji dan UUID khusus staging.
> 3. Database staging adalah proyek Supabase baru yang terisolasi 100% dari basis data operasional/development aktif.

---

## 1. Urutan Penerapan & Analisis Dependensi Prasyarat

Setiap tahap memiliki prasyarat objek basis data yang harus tersedia sebelum skrip berikutnya dieksekusi:

```
[Tahap 1: DDL Skema Dasar]       scripts/schema_dasar.sql
            │                    (Dependensi: auth.users bawaan Supabase, ekstensi pgcrypto)
            ▼
[Tahap 2: Akun Uji Staging]      Registrasi 3 Akun Staging di auth.users & public.profiles
            │                    (Dependensi: Tabel public.profiles)
            ▼
[Tahap 3: Migrasi 01]            scripts/migrations/01_penyesuaian_stok_dan_kartu_stok.sql
            │                    (Dependensi: profiles, barang, mutasi_stok, audit_log)
            ▼
[Tahap 4: Migrasi 02]            scripts/migrations/02_izin_dan_kebijakan_pelanggan.sql
            │                    (Dependensi: profiles, pelanggan, audit_log, auth.uid())
            ▼
[Tahap 5: Migrasi 03]            scripts/migrations/03_izin_dan_kebijakan_pembelian.sql
            │                    (Dependensi: profiles, pemasok, barang, pembelian, mutasi_stok, audit_log)
            ▼
[Tahap 6: Data Dummy Staging]    Pemuatan Data Master & Pesanan Jual Khusus Staging
            │                    (Dependensi: profiles, pelanggan, barang, pesanan_jual)
            ▼
[Tahap 7: Eksekusi Migrasi 04]   scripts/migrations/04_integrasi_mayar_dan_konkurensi.sql
            │                    (Dependensi: pesanan_jual, profiles, audit_log, service_role)
            ▼
[Tahap 8: Eksekusi Kasus Uji]    Verifikasi Konkurensi, Hak Akses, Audit Atomik, & Rollback
```

### Tabel Rincian Dependensi Setiap Tahap

| Tahap | Berkas / Objek | Objek Prasyarat yang Wajib Ada | Objek yang Dihasilkan / Diubah |
| :--- | :--- | :--- | :--- |
| **Tahap 1** | `scripts/schema_dasar.sql` | Skema `auth.users` (Supabase Auth default), ekstensi `pgcrypto`. | 9 tabel dasar (`profiles`, `pemasok`, `pelanggan`, `barang`, `pembelian`, `pesanan_jual`, `item_pesanan_jual`, `mutasi_stok`, `audit_log`), constraint PK/FK/CHECK, dan 13 index pendukung. |
| **Tahap 2** | Akun Uji Staging | Tabel `auth.users` dan `public.profiles`. | 3 entri profil dengan peran `'manajer'`, `'penjualan'`, `'gudang'`. |
| **Tahap 3** | Migrasi 01 | Tabel `profiles`, `barang`, `mutasi_stok`, `audit_log`. | RPC `public.proses_penyesuaian_stok(UUID, INTEGER, TEXT, TEXT)`. |
| **Tahap 4** | Migrasi 02 | Tabel `profiles`, `pelanggan`, `audit_log`, fungsi `auth.uid()`. | RLS & Policy `pelanggan` & `audit_log`, trigger `trg_proteksi_batas_kredit_pelanggan`, RPC `tambah_pelanggan`. |
| **Tahap 5** | Migrasi 03 | Tabel `profiles`, `pemasok`, `barang`, `pembelian`, `mutasi_stok`, `audit_log`. | Hak akses kolom `pembelian`, RLS `pembelian`, view `v_pembelian`, sequence/tabel `alokasi_nomor_po`, 5 RPC mutasi PO. *(Catatan: Policy SELECT dasar pembelian di database fresh staging).* |
| **Tahap 6** | Data Dummy Staging | Tabel `pelanggan`, `pesanan_jual`, akun profil staging. | Data uji pesanan berstatus `'dikirim'` dan `'draf'` yang siap diuji tagihannya. |
| **Tahap 7** | Migrasi 04 | Tabel `pesanan_jual`, `profiles`, `audit_log`, peran database `service_role`. | Kolom `mayar_claim_token` & `mayar_claim_at`, RPC `klaim_tagihan_mayar`, `simpan_tagihan_mayar`, `lepas_klaim_tagihan_mayar`, `rekonsiliasi_klaim_mayar`. |

---

## 2. Prasyarat Akun Uji Staging (Non-Produksi)

Buat 3 akun terisolasi pada panel Supabase Auth staging (Authentication > Users > Add User), lalu masukkan ke tabel `public.profiles`:

```sql
-- Dijalankan pada SQL Editor database staging setelah 3 pengguna terdaftar di auth.users:
-- (Ganti ID dengan UUID aktual dari auth.users staging atau gunakan UUID tertera di bawah jika membuat manual)

INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Manajer Staging Uji', 'manajer', TRUE),
  ('22222222-2222-4222-8222-222222222222', 'Penjualan Staging Uji', 'penjualan', TRUE),
  ('33333333-3333-4333-8333-333333333333', 'Gudang Staging Uji', 'gudang', TRUE)
ON CONFLICT (id) DO UPDATE 
SET nama_lengkap = EXCLUDED.nama_lengkap,
    peran = EXCLUDED.peran,
    aktif = TRUE;
```

---

## 3. Data Uji Khusus Staging (Data Transaksi Non-Produksi)

Jalankan data dummy berikut pada Tahap 6 untuk menyiapkan pesanan uji:

```sql
-- 1. Master Pelanggan Uji Staging
INSERT INTO public.pelanggan (id, kode, nama_toko, telepon, batas_kredit, termin_hari, aktif, dibuat_oleh)
VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'PLG-STAGE-01',
  'Toko Kelontong Uji Staging',
  '0812-0000-0001',
  10000000,
  14,
  TRUE,
  '11111111-1111-4111-8111-111111111111'
) ON CONFLICT (id) DO NOTHING;

-- 2. Master Barang Uji Staging
INSERT INTO public.barang (id, kode, nama, satuan, harga_jual, harga_pokok, stok, stok_minimum, aktif)
VALUES (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'BRG-STAGE-01',
  'Beras Pandan Wangi 5kg (Uji)',
  'sak',
  75000,
  68000,
  100,
  10,
  TRUE
) ON CONFLICT (id) DO NOTHING;

-- 3. Pesanan Jual Uji Berstatus 'dikirim' (Total Rp1.500.000 - Siap Tagih Mayar)
INSERT INTO public.pesanan_jual (
  id, nomor, pelanggan_id, status, total, dibuat_oleh, dikirim_pada, jatuh_tempo
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'SO-STAGE-001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'dikirim',
  1500000,
  '22222222-2222-4222-8222-222222222222',
  NOW(),
  CURRENT_DATE + INTERVAL '14 days'
) ON CONFLICT (id) DO NOTHING;

-- 4. Pesanan Jual Pembanding Berstatus 'draf' (Untuk Uji Penolakan Status)
INSERT INTO public.pesanan_jual (
  id, nomor, pelanggan_id, status, total, dibuat_oleh
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'SO-STAGE-DRAF',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'draf',
  500000,
  '22222222-2222-4222-8222-222222222222'
) ON CONFLICT (id) DO NOTHING;
```

---

## 4. Pemeriksaan Bertahap Setiap Fase (Verification Gate)

Setelah menjalankan masing-masing skrip, lakukan kueri verifikasi berikut sebelum melangkah ke tahap selanjutnya:

| Tahap | Pemeriksaan Keberhasilan | Kueri SQL Verifikasi | Kriteria Lolos |
| :--- | :--- | :--- | :--- |
| **Pasca-Tahap 1**<br>(Skema Dasar) | Memastikan 9 tabel inti dan relasi constraint telah terbentuk. | `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('profiles','pemasok','pelanggan','barang','pembelian','pesanan_jual','item_pesanan_jual','mutasi_stok','audit_log');` | Hasil = 9. |
| **Pasca-Tahap 2**<br>(Akun Uji) | Memastikan 3 profil akun uji aktif dan siap terotentikasi. | `SELECT id, peran, aktif FROM public.profiles WHERE id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');` | Mengembalikan 3 baris lengkap (`manajer`, `penjualan`, `gudang`). |
| **Pasca-Tahap 3**<br>(Migrasi 01) | Fungsi penyesuaian stok terdaftar dan dapat dipanggil. | `SELECT to_regproc('public.proses_penyesuaian_stok');` | Nilai tidak `NULL`. |
| **Pasca-Tahap 4**<br>(Migrasi 02) | RLS dan trigger batas kredit pelanggan terpasang. | `SELECT tgname FROM pg_trigger WHERE tgname = 'trg_proteksi_batas_kredit_pelanggan';` | Mengembalikan 1 baris. |
| **Pasca-Tahap 5**<br>(Migrasi 03) | View pengadaan barang terpasang aman. | `SELECT to_regclass('public.v_pembelian');` | Nilai tidak `NULL`. |
| **Pasca-Tahap 7**<br>(Migrasi 04) | Kolom klaim terpasang pada `pesanan_jual` & 4 RPC Mayar terdaftar. | `SELECT column_name FROM information_schema.columns WHERE table_name='pesanan_jual' AND column_name IN ('mayar_claim_token','mayar_claim_at');`<br>`SELECT routine_name FROM information_schema.routines WHERE specific_schema='public' AND routine_name IN ('klaim_tagihan_mayar','simpan_tagihan_mayar','lepas_klaim_tagihan_mayar','rekonsiliasi_klaim_mayar');` | Kolom = 2 baris.<br>Routines = 4 baris. |

---

## 5. Rangkaian Kasus Uji Migrasi 04 (Test Cases)

Semua kasus uji berikut dijalankan pada Tahap 8 di database staging:

### Kasus Uji 1: Penolakan Akses Berdasarkan Peran (Role-Based Rejection)
- **Tujuan:** Memastikan Staf Penjualan, Staf Gudang, dan pengguna publik/anonim dilarang memicu klaim tagihan.
- **Skenario:**
  1. Login / simulasikan sesi pengguna Staf Penjualan (`22222222-2222-4222-8222-222222222222`):
     ```sql
     SET LOCAL ROLE authenticated;
     SET LOCAL "request.jwt.claim.sub" = '22222222-2222-4222-8222-222222222222';
     SET LOCAL "request.jwt.claim.role" = 'authenticated';

     SELECT public.klaim_tagihan_mayar('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
     ```
  2. Simulasikan sesi pengguna anonim:
     ```sql
     SET LOCAL ROLE anon;
     SELECT public.klaim_tagihan_mayar('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
     ```
- **Hasil yang Diharapkan:**
  - Skenario 1 melempar exception: `Akses ditolak: Hanya Manajer aktif yang berwenang membuat tagihan Mayar.`
  - Skenario 2 menghasilkan error: `permission denied for function klaim_tagihan_mayar`.
- **Evaluasi:** **Lolos** jika pengguna non-manajer ditolak secara konsisten di tingkat database engine.

---

### Kasus Uji 2: Penolakan Status Pesanan Tidak Sah
- **Tujuan:** Memastikan pembuatan tagihan ditolak mutlak jika status pesanan bukan `'dikirim'` (misalnya status `'draf'`, `'dikonfirmasi'`, `'lunas'`, atau `'dibatalkan'`).
- **Skenario:**
  1. Simulasikan sesi Manajer (`11111111-1111-4111-8111-111111111111`):
     ```sql
     SET LOCAL ROLE authenticated;
     SET LOCAL "request.jwt.claim.sub" = '11111111-1111-4111-8111-111111111111';
     SET LOCAL "request.jwt.claim.role" = 'authenticated';

     SELECT public.klaim_tagihan_mayar('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
     ```
- **Hasil yang Diharapkan:**
  - Exception: `Pembuatan tagihan ditolak: Status pesanan saat ini adalah "draf". Hanya pesanan "dikirim" yang dapat dibuatkan tagihan Mayar.`
- **Evaluasi:** **Lolos** jika pesanan berstatus selain 'dikirim' gagal diklaim.

---

### Kasus Uji 3: Klaim Sah & Konkurensi Bersamaan (Race Condition < 60 Detik)
- **Tujuan:** Memastikan dua panggilan bersamaan (misal double-click atau permintaan paralel) tidak menerbitkan dua klaim aktif atau dua tagihan di gateway.
- **Skenario:**
  1. Panggilan Pertama (Manajer):
     ```sql
     SET LOCAL ROLE authenticated;
     SET LOCAL "request.jwt.claim.sub" = '11111111-1111-4111-8111-111111111111';
     SET LOCAL "request.jwt.claim.role" = 'authenticated';

     SELECT public.klaim_tagihan_mayar('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
     ```
  2. Panggilan Kedua (< 60 detik sesudahnya pada pesanan yang sama):
     ```sql
     SELECT public.klaim_tagihan_mayar('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
     ```
- **Hasil yang Diharapkan:**
  - Panggilan 1 mengembalikan JSON: `{"status": "CLAIMED", "claim_token": "<UUID-TOKEN>", "total": 1500000, ...}`.
  - Panggilan 2 mengembalikan JSON: `{"status": "IN_PROGRESS", "message": "Pembuatan tagihan sedang diproses oleh permintaan lain. Mohon tunggu beberapa saat."}`. Token lama tidak tertimpa.
- **Evaluasi:** **Lolos** jika panggilan kedua terblokir oleh lock sewa aktif tanpa merusak token panggilan pertama.

---

### Kasus Uji 4: Penanganan Klaim Kedaluwarsa yang Menggantung (Stale Claim >= 60 Detik)
- **Tujuan:** Memastikan jika batas sewa 60 detik terlampaui tanpa invoice tersimpan (misal jaringan gateway putus), sistem **tidak otomatis** menerbitkan klaim/invoice baru untuk mencegah double charging.
- **Skenario:**
  1. Simulasikan sewa kedaluwarsa di database:
     ```sql
     UPDATE public.pesanan_jual
     SET mayar_claim_at = NOW() - INTERVAL '75 seconds'
     WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
     ```
  2. Panggil klaim kembali sebagai Manajer:
     ```sql
     SET LOCAL ROLE authenticated;
     SET LOCAL "request.jwt.claim.sub" = '11111111-1111-4111-8111-111111111111';
     SET LOCAL "request.jwt.claim.role" = 'authenticated';

     SELECT public.klaim_tagihan_mayar('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
     ```
- **Hasil yang Diharapkan:**
  - Mengembalikan JSON: `{"status": "IN_DOUBT_STALE", "message": "Proses pembuatan tagihan sebelumnya terputus atau batas waktu sewa (60 detik) terlampaui. Periksa dashboard Mayar atau jalankan rekonsiliasi klaim sebelum mencoba kembali."}`.
  - Database **menolak** membuat sewa baru sebelum dilakukan rekonsiliasi.
- **Evaluasi:** **Lolos** jika status stale terdeteksi dan penerbitan invoice baru dicegah.

---

### Kasus Uji 5: Proteksi RPC Privat `simpan_tagihan_mayar`
- **Tujuan:** Memastikan fungsi penyimpan invoice Mayar tidak dapat dieksekusi langsung oleh pengguna terautentikasi (Manajer/Penjualan/Gudang) via PostgREST/DevTools browser.
- **Skenario:**
  1. Panggil `simpan_tagihan_mayar` dalam sesi Manajer (`authenticated`):
     ```sql
     SET LOCAL ROLE authenticated;
     SET LOCAL "request.jwt.claim.sub" = '11111111-1111-4111-8111-111111111111';
     SET LOCAL "request.jwt.claim.role" = 'authenticated';

     SELECT public.simpan_tagihan_mayar(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
       gen_random_uuid(),
       'PAY-STAGE-001',
       'https://subdomain.mayar.link/pl/stage-001',
       1500000,
       '11111111-1111-4111-8111-111111111111',
       'unpaid'
     );
     ```
- **Hasil yang Diharapkan:**
  - Error PostgreSQL `42501 permission denied for function simpan_tagihan_mayar`.
- **Evaluasi:** **Lolos** jika akses langsung client browser ditolak total.

---

### Kasus Uji 6: Penyimpanan Sah via `service_role`, Sanitasi URL, & Audit Log Atomik
- **Tujuan:** Memverifikasi penyimpanan metadata Mayar yang sah dari Server Action, pembersihan token klaim, kepatuhan domain URL, dan pencatatan audit log tanpa menyimpan URL mentah.
- **Skenario:**
  1. Dapatkan token klaim yang sah untuk pesanan uji:
     ```sql
     UPDATE public.pesanan_jual
     SET mayar_claim_token = gen_random_uuid(), mayar_claim_at = NOW()
     WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
     ```
  2. Eksekusi fungsi sebagai `service_role`:
     ```sql
     SET LOCAL ROLE service_role;
     SET LOCAL "request.jwt.claim.role" = 'service_role';

     SELECT public.simpan_tagihan_mayar(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
       (SELECT mayar_claim_token FROM public.pesanan_jual WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
       'PAY-STAGE-SUCCESS-001',
       'https://sinarabadi.mayar.link/pl/inv-001',
       1500000,
       '11111111-1111-4111-8111-111111111111',
       'unpaid'
     );
     ```
  3. Periksa tabel `pesanan_jual` dan `audit_log`:
     ```sql
     SELECT id, status, total, mayar_payment_id, mayar_payment_url, mayar_status, mayar_claim_token, mayar_claim_at
     FROM public.pesanan_jual WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

     SELECT pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru
     FROM public.audit_log WHERE data_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' ORDER BY dibuat_pada DESC LIMIT 1;
     ```
- **Hasil yang Diharapkan:**
  - Fungsi mengembalikan `success: true`.
  - Pada `pesanan_jual`: `mayar_payment_id` = `'PAY-STAGE-SUCCESS-001'`, `mayar_status` = `'unpaid'`, status pesanan tetap `'dikirim'`, sewa klaim kembali `NULL`.
  - Pada `audit_log`: Baris baru tercatat otomatis dengan `aksi = 'buat_tagihan_mayar'`. Nilai baru memuat `mayar_payment_id` dan `total`, **tetapi tidak memuat `mayar_payment_url`** demi keamanan jejak audit (BR-12).
- **Evaluasi:** **Lolos** jika metadata tersimpan dan audit tercatat secara atomik.

---

### Kasus Uji 7: Rollback Transaksi pada Ketidaksesuaian Nominal
- **Tujuan:** Memastikan integritas finansial: jika nominal tagihan Mayar berbeda dari total pesanan di database, transaksi langsung dibatalkan (rollback) tanpa jejak perubahan parsial.
- **Skenario:**
  1. Siapkan sewa klaim baru pada pesanan uji.
  2. Panggil `simpan_tagihan_mayar` via `service_role` dengan nominal salah (misal Rp1.000.000 bukan Rp1.500.000):
     ```sql
     SET LOCAL ROLE service_role;
     SET LOCAL "request.jwt.claim.role" = 'service_role';

     SELECT public.simpan_tagihan_mayar(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
       (SELECT mayar_claim_token FROM public.pesanan_jual WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
       'PAY-STAGE-FAKE',
       'https://sinarabadi.mayar.link/pl/inv-fake',
       1000000, -- Nominal tidak cocok!
       '11111111-1111-4111-8111-111111111111',
       'unpaid'
     );
     ```
- **Hasil yang Diharapkan:**
  - Exception: `Penyimpanan ditolak: Nominal tagihan Mayar (1000000) tidak sesuai dengan total pesanan (1500000).`
  - Periksa `pesanan_jual`: data lama tidak berubah, tidak ada tagihan tersimpan.
- **Evaluasi:** **Lolos** jika perbedaan nominal ditolak mutlak dan transaksi di-rollback bersih.

---

### Kasus Uji 8: Pelepasan Klaim Tagihan pada Kegagalan HTTP Pasti (`lepas_klaim_tagihan_mayar`)
- **Tujuan:** Memastikan jika Server Action menerima respon gagal pasti dari API Mayar (HTTP 400/401/422), token klaim dapat dilepas kembali oleh Manajer sehingga pesanan tidak terkunci dalam status sewa.
- **Skenario:**
  1. Dapatkan token klaim:
     ```sql
     UPDATE public.pesanan_jual
     SET mayar_claim_token = gen_random_uuid(), mayar_claim_at = NOW()
     WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
     ```
  2. Eksekusi pelepasan klaim dengan token yang cocok:
     ```sql
     SET LOCAL ROLE authenticated;
     SET LOCAL "request.jwt.claim.sub" = '11111111-1111-4111-8111-111111111111';
     SET LOCAL "request.jwt.claim.role" = 'authenticated';

     SELECT public.lepas_klaim_tagihan_mayar(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
       (SELECT mayar_claim_token FROM public.pesanan_jual WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
     );
     ```
- **Hasil yang Diharapkan:**
  - Fungsi mengembalikan `TRUE`.
  - Kolom `mayar_claim_token` dan `mayar_claim_at` pada `pesanan_jual` kembali bernilai `NULL`.
- **Evaluasi:** **Lolos** jika sewa berhasil dilepas secara bersih.

---

### Kasus Uji 9: Rekonsiliasi Klaim Menggantung (`rekonsiliasi_klaim_mayar`)
- **Tujuan:** Memverifikasi pemulihan status `IN_DOUBT_STALE` baik melalui tindakan `BATALKAN_KLAIM` maupun `TAUTKAN_INVOICE`.
- **Skenario A (BATALKAN_KLAIM):**
  1. Pasang sewa menggantung (> 60 detik).
  2. Panggil via `service_role`:
     ```sql
     SET LOCAL ROLE service_role;
     SET LOCAL "request.jwt.claim.role" = 'service_role';

     SELECT public.rekonsiliasi_klaim_mayar(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
       'BATALKAN_KLAIM',
       NULL, NULL, NULL, 'unpaid',
       '11111111-1111-4111-8111-111111111111',
       'Verifikasi dashboard Mayar: Invoice tidak terbentuk'
     );
     ```
- **Hasil yang Diharapkan:**
  - Mengembalikan `success: true`. Jejak tercatat di `audit_log` (`rekonsiliasi_batal_klaim_mayar`).
- **Skenario B (TAUTKAN_INVOICE):**
  1. Pasang sewa menggantung (> 60 detik).
  2. Panggil via `service_role` dengan menyertakan nominal yang cocok:
     ```sql
     SET LOCAL ROLE service_role;
     SET LOCAL "request.jwt.claim.role" = 'service_role';

     SELECT public.rekonsiliasi_klaim_mayar(
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
       'TAUTKAN_INVOICE',
       1500000,
       'PAY-RECON-001',
       'https://sinarabadi.mayar.link/pl/recon-001',
       'unpaid',
       '11111111-1111-4111-8111-111111111111',
       'Verifikasi dashboard Mayar: Invoice berhasil terbit'
     );
     ```
- **Hasil yang Diharapkan:**
  - Mengembalikan `success: true`. Invoice tertaut pada `pesanan_jual`, dan audit log tercatat secara atomik.
- **Evaluasi:** **Lolos** jika kedua mode rekonsiliasi bekerja aman dan mematuhi batas integritas audit.

---

## 6. Tindakan Lanjutan Pasca-Pengujian Staging

Setelah seluruh 9 kasus uji di staging berstatus **Lolos**:
1. Implementasikan Route Handler Webhook Mayar di `src/app/api/webhooks/mayar/route.ts` (`POST`).
2. Implementasikan UI / Action Rekonsiliasi Manajer untuk menangani status `IN_DOUBT_STALE`.
3. Lakukan pengujian integrasi end-to-end menggunakan kredensial Sandbox Mayar.
4. Jadwalkan eksekusi `scripts/migrations/04_integrasi_mayar_dan_konkurensi.sql` pada basis data produksi.
