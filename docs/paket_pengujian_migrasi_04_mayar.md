# Paket Pengujian Migrasi 04: Integrasi Gateway Mayar & Konkurensi

Dokumen ini adalah panduan praktis dan operasional untuk menyiapkan database *staging* terpisah, memvalidasi dependensi skema, menguji draf migrasi `scripts/migrations/04_integrasi_mayar_dan_konkurensi.sql`, serta panduan implementasi lanjutan (webhook, rekonsiliasi, dan deployment).

---

## 1. Analisis Dependensi Skema & Ketersediaan Sumber DDL

### A. Objek yang Tersedia di Berkas Proyek:
- **Fungsi Stok & Mutasi:** `scripts/migrations/01_penyesuaian_stok_dan_kartu_stok.sql` (RPC `proses_penyesuaian_stok`).
- **RLS & Izin Pelanggan:** `scripts/migrations/02_izin_dan_kebijakan_pelanggan.sql` (kebijakan RLS tabel `pelanggan` dan izin `audit_log`).
- **Skema PO, Trigger & View Pembelian:** `scripts/migrations/03_izin_dan_kebijakan_pembelian.sql` (tabel `alokasi_nomor_po`, view `v_pembelian`, trigger, dan RPC pembelian).
- **Data Uji Lengkap (Seed):** `scripts/seed_data_export.sql` (data awal untuk pemasok, pelanggan, barang, pesanan jual, pembelian, mutasi stok, dan audit log).
- **Draf Migrasi Mayar:** `scripts/migrations/04_integrasi_mayar_dan_konkurensi.sql` (kolom klaim dan 4 RPC Mayar).

### B. Kekurangan Krusial yang Belum Ada di File Repositori:
- **DDL Inisial Pembuatan Tabel Utama (`CREATE TABLE`) TIDAK ADA di Git:**
  Repositori tidak memiliki skrip pembuatan tabel awal untuk 8 tabel fondasi:
  `public.profiles`, `public.pelanggan`, `public.pemasok`, `public.barang`, `public.pesanan_jual`, `public.item_pesanan_jual`, `public.mutasi_stok`, dan `public.pembelian`.
- **Cara Mengatasi Kekurangan Ini Secara Aman:**
  Pengguna perlu mengekspor DDL skema publik dari database Supabase aktif saat ini:
  - *Metode 1 (Supabase Dashboard):* Buka **Database** -> **Schema Visualizer** atau **SQL Editor**, salin struktur skema dasar.
  - *Metode 2 (Supabase CLI / pg_dump):* Jalankan `supabase db dump --schema-only` atau `pg_dump -h <host> -U postgres -d postgres --schema-only > schema_dasar.sql` terhadap database aktif (hanya mengekspor struktur skema, tanpa data).

---

## 2. Urutan Pembangunan Database Staging yang Valid

Ikuti urutan langkah berikut saat menyiapkan proyek Supabase staging terpisah:

```
[1. Buat Proyek Staging Baru di Supabase]
                 │
                 ▼
[2. Terapkan Skema Dasar (Export dari DB Aktif)]
                 │
                 ▼
[3. Jalankan Migrasi 01 (Stok & Kartu Stok)]
                 │
                 ▼
[4. Jalankan Migrasi 02 (Pelanggan & RLS)]
                 │
                 ▼
[5. Jalankan Migrasi 03 (Pembelian & PO)]
                 │
                 ▼
[6. Buat 3 Akun Profil Terverifikasi di Staging]
                 │
                 ▼
[7. Jalankan scripts/seed_data_export.sql]
                 │
                 ▼
[8. Uji Eksekusi scripts/migrations/04_integrasi_mayar_dan_konkurensi.sql]
```

### Rincian Langkah 6: Pembuatan Profil Prasyarat Seed Data
Skrip `scripts/seed_data_export.sql` memiliki blok *pre-flight check* ketat yang mewajibkan 3 UUID profil berikut sudah ada di `public.profiles` sebelum data dapat dimasukkan:
1. **Alen (Manajer):** `7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc`
2. **Jeonghan (Staf Penjualan):** `c6bf5e70-7620-4434-b58e-d3123b2d4e91`
3. **Wonwoo (Staf Gudang):** `551b03db-5f3e-435b-b1ce-059ebefc712b`

*Catatan:* Jika tabel `public.profiles` di staging memiliki foreign key constraint ke `auth.users(id)`, daftarkan ketiga akun tersebut melalui Supabase Auth terlebih dahulu atau sesuaikan UUID pengguna uji.

---

## 3. Data Minimum untuk Pengujian Migrasi 04

Setelah `seed_data_export.sql` berhasil dijalankan, database staging akan langsung memiliki **11 pesanan jual aktif berstatus `'dikirim'`** yang siap digunakan untuk menguji alur pembuatan tagihan Mayar:
- `SO-00015` (`id`: `8da43319-b085-5712-8fa6-15bbff7940e2`, total: Rp3.398.800)
- `SO-00017` (`id`: `da19ac2c-c57f-524d-ab7c-5453e7fe9fdc`, total: Rp7.713.200)
- `SO-00018` (`id`: `a8124be5-819e-54d1-845f-989aeaf0d4e0`, total: Rp2.505.600)
- `SO-00025` (`id`: `7f0b2ba0-8d63-59ca-9518-0d6fbf5c5b74`, total: Rp2.789.600)
- `SO-00026` (`id`: `26f2ef97-0d22-588d-a440-a388ba527606`, total: Rp7.564.000)
- `SO-00027` (`id`: `ff02aa9d-3b7a-543e-b617-7c5150b0ac89`, total: Rp3.982.000)
- `SO-00028` (`id`: `deb4a706-4323-5997-b6f5-ed15b596833e`, total: Rp7.710.000)
- `SO-00029` (`id`: `d285b294-521c-5b05-a90f-1d772f4f4ec0`, total: Rp6.108.000)
- `SO-00030` (`id`: `82c6ba12-0641-552c-9028-e6b218375c6f`, total: Rp4.313.200)
- `SO-00031` (`id`: `c3f86068-49f5-5885-a603-ad2ee5d093ac`, total: Rp3.049.600)
- `SO-00034` (`id`: `f43e5c90-7904-5ce1-ab9b-5490daba4828`, total: Rp4.668.000)

Seluruh baris di atas terhubung ke pelanggan aktif dan tidak memiliki dependensi siklik atau konflik foreign key.

---

## 4. Checklist Uji Migrasi 04 di Staging

Lakukan pengujian berikut secara bertahap di lingkungan staging:

### A. Validasi DDL & Hak Akses PostgREST
- [ ] **Kolom Konkurensi:** Pastikan `mayar_claim_token` dan `mayar_claim_at` terpasang di `pesanan_jual`.
- [ ] **Privilege Separation:**
  - Role `authenticated` **diizinkan** memanggil `klaim_tagihan_mayar` dan `lepas_klaim_tagihan_mayar`.
  - Role `authenticated` dan `anon` **ditolak** (HTTP 401/403 atau error `42501`) saat memanggil RPC privat `simpan_tagihan_mayar` atau `rekonsiliasi_klaim_mayar`.
  - Role `service_role` **diizinkan** memanggil `simpan_tagihan_mayar` dan `rekonsiliasi_klaim_mayar`.

### B. Validasi Skenario Konkurensi & Klaim
- [ ] **Uji Klaim Valid:** Panggil `klaim_tagihan_mayar('8da43319-b085-5712-8fa6-15bbff7940e2')` dengan sesi Manajer -> Berhasil (`status: CLAIMED`, token UUID terbit).
- [ ] **Uji Otorisasi:** Panggil fungsi klaim dengan sesi Staf Penjualan atau Gudang -> Ditolak (`Hanya Manajer aktif yang berwenang`).
- [ ] **Uji Status Pesanan:** Panggil klaim pada pesanan draf (`SO-00038`) atau lunas (`SO-00002`) -> Ditolak (`Hanya pesanan "dikirim"`).
- [ ] **Uji Klaim Bersamaan (< 60 detik):** Kirim panggilan klaim kedua untuk pesanan yang sama saat sewa masih berjalan -> Ditolak dengan status `IN_PROGRESS`.
- [ ] **Uji Klaim Kedaluwarsa (>= 60 detik):** Simulasikan waktu sewa lewat (update `mayar_claim_at = NOW() - INTERVAL '65 seconds'`) -> Panggilan klaim mengembalikan `IN_DOUBT_STALE`.
- [ ] **Uji Idempotensi:** Pesanan yang sudah memiliki ID & URL tagihan lengkap -> Mengembalikan status `ALREADY_EXISTS`.
- [ ] **Uji Deteksi Anomali:** Pesanan dengan ID tagihan terisi namun URL null -> Mengembalikan `DATA_ANOMALY`.

### C. Validasi Penyimpanan Tagihan, Audit & Rollback
- [ ] **Penyimpanan Berhasil:** Panggil `simpan_tagihan_mayar` via `service_role` dengan token klaim valid, nominal persis (Rp3.398.800), status `'unpaid'`, URL Mayar resmi -> Metadata tersimpan, status pesanan tetap `'dikirim'`.
- [ ] **Pencatatan Audit Atomik:** Periksa `public.audit_log`, baris aksi `'buat_tagihan_mayar'` otomatis bertambah dengan `pelaku_id` yang sesuai.
- [ ] **Rollback Nominal Mismatch:** Panggil `simpan_tagihan_mayar` dengan nominal berbeda dari database (misal Rp100.000) -> Ditolak dan seluruh mutasi dibatalkan.
- [ ] **Tolak Penimpaan Invoice:** Pemanggilan `simpan_tagihan_mayar` ulang pada pesanan yang sudah memiliki invoice -> Ditolak demi integritas audit.

### D. Validasi Pelepasan Klaim Aman (`lepas_klaim_tagihan_mayar`)
- [ ] Pelepasan dengan token cocok (pada pesanan tanpa invoice) -> Token dan timestamp klaim kembali `NULL`.
- [ ] Pelepasan dengan token salah -> Baris tidak berubah, mengembalikan `false`.
- [ ] Pelepasan pada pesanan yang sudah memiliki tagihan tersimpan -> Ditolak (`Pesanan sudah memiliki invoice Mayar`).

---

## 5. Kontrak API Mayar yang Perlu Diverifikasi di Sandbox

Sebelum pengujian transaksi pembayaran riil:
1. **Dukungan Idempotency Header:** Verifikasi apakah `POST /hl/v1/payment/create` mendukung header `Idempotency-Key` bawaan.
2. **Karakteristik HTTP Error:** Uji respons Mayar pada skenario saldo merchant tidak aktif, limit tercapai, atau input invalid (HTTP 400 vs 422 vs 500) untuk memastikan tidak ada invoice yang terbuat secara parsial.
3. **Payload Event Webhook:** Amati payload JSON aktual event `payment.received` dari Mayar Sandbox untuk memastikan kecocokan field (khususnya field ID tagihan dan tipe data status pembayaran).

---

## 6. Rencana Kerja Implementasi Pasca-Migrasi

Segera setelah migrasi 04 terverifikasi di staging, implementasi dilanjutkan dengan urutan berikut:

### Tahap 1: Route Handler Webhook Mayar (`POST /api/webhooks/mayar`)
- Lokasi: `src/app/api/webhooks/mayar/route.ts`.
- Alur:
  1. Verifikasi header webhook (token rahasia / signature).
  2. Ekstraksi payment ID / invoice ID dari payload `payment.received`.
  3. **Verifikasi Ganda Defensif:** Panggil `getPaymentStatus(paymentId)` langsung ke API Mayar untuk memastikan status transaksi riil adalah `'paid'` dan nominal cocok dengan pesanan.
  4. Perbarui status pesanan menjadi `'lunas'`, catat `dilunasi_pada`, dan catat `audit_log` (aksi: `'pelunasan_mayar'`) via admin client.
  5. Kembalikan respons HTTP 200 OK idempoten.

### Tahap 2: Antarmuka & Action Rekonsiliasi Manajer
- Lokasi: `src/app/pesanan-jual/actions.ts` dan antarmuka `/pesanan-jual`.
- Alur:
  1. Buat Server Action `batalkanKlaimMayarAction` (memanggil RPC `rekonsiliasi_klaim_mayar` opsi `BATALKAN_KLAIM`).
  2. Buat Server Action `tautkanInvoiceMayarAction` (memverifikasi invoice ke Mayar via `getPaymentStatus`, lalu memanggil RPC `rekonsiliasi_klaim_mayar` opsi `TAUTKAN_INVOICE`).
  3. Tambahkan tombol dan modal dialog rekonsiliasi pada daftar pesanan jika terjadi status klaim menggantung (`IN_DOUBT_STALE`).

### Tahap 3: Pengujian End-to-End (E2E) di Staging
- Uji alur lengkap:
  1. Manajer membuat tagihan Mayar pada pesanan `'dikirim'`.
  2. Simulasi pembayaran pada Mayar Sandbox.
  3. Penerimaan webhook dan pembaruan pesanan otomatis menjadi `'lunas'`.
  4. Simulasi timeout/kegagalan jaringan dan eksekusi rekonsiliasi manual.

### Tahap 4: Deployment ke Database Utama
1. Pasang kredensial server di lingkungan hosting (`SUPABASE_SERVICE_ROLE_KEY`, `MAYAR_API_KEY`, `MAYAR_BASE_URL`).
2. Jalankan `scripts/migrations/04_integrasi_mayar_dan_konkurensi.sql` di database Supabase utama.
3. Daftarkan URL webhook publik aplikasi ke Dashboard Merchant Mayar.
