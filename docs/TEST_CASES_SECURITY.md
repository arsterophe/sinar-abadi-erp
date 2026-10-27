# DOKUMEN HASIL PENGUJIAN KEAMANAN, SESI, DAN HAK AKSES PENGGUNA

**Aplikasi:** CV Sinar Abadi Niaga — Sinar Abadi ERP  
**Lokasi Proyek:** `E:\BOTCAMP\sinar-abadi-erp`  
**Lingkungan Pengujian:** Local Development Server (`http://localhost:3000`) & Supabase Remote Auth (`wvjccwatzmvjtoguaugh`)  
**Waktu Pengujian:** 27 Oktober 2026  
**Status Pengujian:** **37 PASS / 0 FAIL / 0 BLOCKED (100% LULUS)**  

---

## 1. Ringkasan Eksekutif

Pengujian keamanan ini dijalankan secara otomatis melalui skrip [test_security_access_control.mjs](file:///e:/BOTCAMP/sinar-abadi-erp/scripts/tests/test_security_access_control.mjs) dan [test_proxy_protection.mjs](file:///e:/BOTCAMP/sinar-abadi-erp/scripts/tests/test_proxy_protection.mjs). Pengujian menerapkan prinsip *Defense-in-Depth* yang mencakup 6 pilar keamanan:

1. **Proteksi Sesi Proxy SSR (Next.js 16):** Seluruh rute privat ERP dialihkan ke `/login` jika diakses secara anonim, rute publik tetap terbuka, dan pengguna login yang mengunjungi form masuk dialihkan ke dashboard utama.
2. **Penolakan Akun Non-Aktif:** Akun dengan status `aktif: false` (misal `agus@sinarabadi.test`) ditolak saat login, disingkirkan oleh Server Component, dan dilarang mengeksekusi Server Actions.
3. **Matriks Hak Akses Berbasis Peran (RBAC):** Menegakkan pemisahan wewenang operasional antara peran `manajer`, `penjualan`, dan `gudang` pada level UI, Server Action, hingga Row Level Security (RLS) PostgreSQL.
4. **Perlindungan Rahasia Dagang (BR-12 HPP):** Menjamin nilai Harga Pokok Penjualan (`harga_pokok`), harga beli satuan pemasok (`harga_beli_satuan`), margin keuntungan, dan riwayat kartu stok tidak dapat diakses atau dibocorkan ke staf non-manajer.
5. **Pencabutan Sesi Pasca Logout:** Memastikan token JWT sesi Supabase Auth dibersihkan tuntas saat logout dan request lanjutan tidak memiliki akses privat.
6. **Keamanan Gateway Webhook Mayar:** Memastikan endpoint callback tidak terblokir proxy, memvalidasi tanda tangan token rahasia secara konstan waktu, dan memverifikasi keabsahan transaksi ke gateway sebelum memproses mutasi basis data.

---

## 2. Tabel Rinci Test Case Keamanan

| ID Test Case | Fitur yang Diuji | Langkah Pengujian | Hasil yang Diharapkan | Hasil Aktual | Status | Bukti / Keterangan |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **SEC-AUTH-01** | Akses halaman privat `/` tanpa login dialihkan ke `/login` | Kirim HTTP GET anonim ke `http://localhost:3000/` dengan redirect manual | HTTP 307 Redirect ke `/login` | HTTP 307 dialihkan ke `/login` | **PASS** | Header Location: `/login` |
| **SEC-AUTH-02** | Akses halaman privat `/barang-dan-stok` tanpa login dialihkan ke `/login` | Kirim HTTP GET anonim ke `http://localhost:3000/barang-dan-stok` dengan redirect manual | HTTP 307 Redirect ke `/login` | HTTP 307 dialihkan ke `/login` | **PASS** | Header Location: `/login` |
| **SEC-AUTH-03** | Akses halaman privat `/radar-stok` tanpa login dialihkan ke `/login` | Kirim HTTP GET anonim ke `http://localhost:3000/radar-stok` dengan redirect manual | HTTP 307 Redirect ke `/login` | HTTP 307 dialihkan ke `/login` | **PASS** | Header Location: `/login` |
| **SEC-AUTH-04** | Akses halaman privat `/pelanggan` tanpa login dialihkan ke `/login` | Kirim HTTP GET anonim ke `http://localhost:3000/pelanggan` dengan redirect manual | HTTP 307 Redirect ke `/login` | HTTP 307 dialihkan ke `/login` | **PASS** | Header Location: `/login` |
| **SEC-AUTH-05** | Akses halaman privat `/pesanan-jual` tanpa login dialihkan ke `/login` | Kirim HTTP GET anonim ke `http://localhost:3000/pesanan-jual` dengan redirect manual | HTTP 307 Redirect ke `/login` | HTTP 307 dialihkan ke `/login` | **PASS** | Header Location: `/login` |
| **SEC-AUTH-06** | Akses halaman privat `/pembelian` tanpa login dialihkan ke `/login` | Kirim HTTP GET anonim ke `http://localhost:3000/pembelian` dengan redirect manual | HTTP 307 Redirect ke `/login` | HTTP 307 dialihkan ke `/login` | **PASS** | Header Location: `/login` |
| **SEC-AUTH-07** | Akses halaman privat `/laporan` tanpa login dialihkan ke `/login` | Kirim HTTP GET anonim ke `http://localhost:3000/laporan` dengan redirect manual | HTTP 307 Redirect ke `/login` | HTTP 307 dialihkan ke `/login` | **PASS** | Header Location: `/login` |
| **SEC-AUTH-08** | Akses halaman privat `/pengaturan` tanpa login dialihkan ke `/login` | Kirim HTTP GET anonim ke `http://localhost:3000/pengaturan` dengan redirect manual | HTTP 307 Redirect ke `/login` | HTTP 307 dialihkan ke `/login` | **PASS** | Header Location: `/login` |
| **SEC-AUTH-09** | Halaman publik `/login` dapat diakses langsung tanpa autentikasi | Kirim HTTP GET anonim ke `http://localhost:3000/login` | HTTP 200 OK | HTTP 200 OK | **PASS** | Halaman form login berhasil dimuat tanpa blokir sesi. |
| **SEC-AUTH-10** | Pengguna yang sudah login diarahkan ke dashboard jika membuka `/login` | Simulasikan evaluasi Proxy SSR untuk request `/login` dengan sesi aktif | Action REDIRECT ke `/` | Evaluasi Proxy menghasilkan REDIRECT ke `/` | **PASS** | `src/lib/supabase/proxy.ts` line 76-80 mengalihkan pengguna terotentikasi ke `/`. |
| **SEC-STAT-01** | Akun non-aktif ditolak saat login dan sesi langsung dibersihkan (`signOut`) | Login dengan akun `agus@sinarabadi.test` (status `aktif: false`) di Supabase Auth | Login berhasil di auth, namun pengecekan profil mendeteksi `aktif = false` dan memicu `signOut` | User Agus Salim memiliki `aktif = false`. Sesi langsung di-signOut secara aman. | **PASS** | Profile data: `id=729c6cc9-8592-4300-bac4-696d74fcc856, aktif=false` |
| **SEC-STAT-02** | Server Component mendeteksi `profile.aktif !== true` dan mengalihkan ke `/login?error=account_inactive` | Audit kode Server Component di `src/app/**/page.tsx` | Redirect ke `/login?error=account_inactive` | Seluruh 8 Server Component (8 file) memvalidasi status aktif secara ketat. | **PASS** | Semua route memanggil `redirect('/login?error=account_inactive')` jika akun nonaktif. |
| **SEC-STAT-03** | Server Action menolak eksekusi mutasi jika `profile.aktif !== true` | Audit validasi profil pada Server Actions | Mengembalikan `{ success: false, error: 'Akses ditolak: akun Anda tidak terdaftar atau telah dinonaktifkan.' }` | Seluruh 5 Server Action (5 file) memvalidasi status aktif sebelum mutasi. | **PASS** | Setiap action mengembalikan error otorisasi jika akun nonaktif. |
| **SEC-ROLE-01** | Peran Manajer memiliki akses ke data operasional, audit log, dan pengguna | Eksekusi query profil dan `audit_log` menggunakan sesi Manajer (`alen@sinarabadi.com`) | Query berhasil mengembalikan baris audit log dan profil pengguna | Manajer berhasil membaca baris audit log dan data profil pengguna. | **PASS** | RLS mengizinkan peran manajer membaca `audit_log` dan `profiles`. |
| **SEC-ROLE-02** | Peran Penjualan DITOLAK membaca data `audit_log` oleh RLS database | Eksekusi query tabel `audit_log` menggunakan sesi Staf Penjualan (`jeonghan@sinarabadi.com`) | RLS menolak akses dan mengembalikan 0 baris | Staf Penjualan dibatasi RLS: 0 baris `audit_log` dikembalikan. | **PASS** | RLS policy pada `public.audit_log` hanya mengizinkan peran manajer. |
| **SEC-ROLE-03** | Peran Gudang DITOLAK membaca data `audit_log` oleh RLS database | Eksekusi query tabel `audit_log` menggunakan sesi Staf Gudang (`wonwoo@sinarabadi.com`) | RLS menolak akses dan mengembalikan 0 baris | Staf Gudang dibatasi RLS: 0 baris `audit_log` dikembalikan. | **PASS** | RLS policy pada `public.audit_log` menolak peran gudang. |
| **SEC-ROLE-04** | Peran Gudang DITOLAK membaca data pelanggan oleh RLS database & Server Component | Eksekusi query tabel pelanggan menggunakan sesi Staf Gudang | RLS mengembalikan 0 baris; Server Component mengalihkan ke `/?error=unauthorized_pelanggan` | RLS mengembalikan 0 baris pelanggan dan Server Component mengalihkan peran gudang. | **PASS** | `src/app/pelanggan/page.tsx` line 54: `redirect('/?error=unauthorized_pelanggan')`. |
| **SEC-ROLE-05** | Peran Penjualan DITOLAK mengakses data pembelian oleh RLS database & Server Component | Eksekusi query tabel pembelian menggunakan sesi Staf Penjualan | RLS mengembalikan 0 baris; Server Component menampilkan halaman Akses Terbatas | RLS mengembalikan 0 baris pembelian dan Server Component menampilkan UI Akses Terbatas. | **PASS** | `src/app/pembelian/page.tsx` line 73: blokir peran penjualan sesuai PRD Bab 7. |
| **SEC-ROLE-06** | Peran Non-Manajer DITOLAK mengakses modul Laporan Finansial (`/laporan`) | Audit Server Component `src/app/laporan/page.tsx` | Redirect ke `/?error=unauthorized_laporan` untuk seluruh peran selain manajer | Server Component `/laporan` menolak tegas peran penjualan dan gudang. | **PASS** | `src/app/laporan/page.tsx` line 55: `redirect('/?error=unauthorized_laporan')`. |
| **SEC-ROLE-07** | Peran Non-Manajer DITOLAK mengakses modul Pengaturan Sistem (`/pengaturan`) | Audit Server Component `src/app/pengaturan/page.tsx` | Redirect ke `/?error=unauthorized_pengaturan` untuk seluruh peran selain manajer | Server Component `/pengaturan` menolak tegas peran penjualan dan gudang. | **PASS** | `src/app/pengaturan/page.tsx` line 55: `redirect('/?error=unauthorized_pengaturan')`. |
| **SEC-ROLE-08** | Server Action pesanan jual melarang Staf Gudang membuat pesanan draf | Audit otorisasi pada `buatPesananJualDrafAction` di `src/app/pesanan-jual/actions.ts` | Penolakan jika `profile.peran === 'gudang'` | Staf Gudang ditolak membuat pesanan jual pada level Server Action. | **PASS** | `src/app/pesanan-jual/actions.ts` line 251-256. |
| **SEC-ROLE-09** | Server Action pesanan jual melarang Staf Penjualan menandai pesanan terkirim (BR-07) | Audit otorisasi pada `kirimPesananJualAction` di `src/app/pesanan-jual/actions.ts` | Penolakan jika `profile.peran === 'penjualan'` | Staf Penjualan ditolak menandai pengiriman pesanan (hanya Gudang & Manajer). | **PASS** | `src/app/pesanan-jual/actions.ts` line 1015-1020. |
| **SEC-ROLE-10** | Server Action pelunasan pesanan eksklusif hanya untuk Manajer (BR-07, BR-12) | Audit otorisasi pada `lunasiPesananJualAction` di `src/app/pesanan-jual/actions.ts` | Penolakan jika `profile.peran !== 'manajer'` | Pelunasan manual ditolak untuk selain Manajer. | **PASS** | `src/app/pesanan-jual/actions.ts` line 1143-1148. |
| **SEC-ROLE-11** | Server Action penerbitan invoice Mayar eksklusif hanya untuk Manajer (BR-07) | Audit otorisasi pada `buatTagihanMayarAction` di `src/app/pesanan-jual/actions.ts` | Penolakan jika `profile.peran !== 'manajer'` | Penerbitan tagihan Mayar dibatasi eksklusif hanya untuk Manajer. | **PASS** | `src/app/pesanan-jual/actions.ts` line 1540-1545. |
| **SEC-ROLE-12** | Server Action persetujuan pembelian (PO) eksklusif hanya untuk Manajer (BR-09, BR-12) | Audit otorisasi pada `setujuiPembelianAction` di `src/app/pembelian/actions.ts` | Penolakan jika `!canApprovePembelian(profile.peran)` | Persetujuan pembelian dan penentuan harga beli satuan dibatasi hanya untuk Manajer. | **PASS** | `src/app/pembelian/actions.ts` line 258-263. |
| **SEC-ROLE-13** | Server Action penyesuaian stok fisik melarang peran Staf Penjualan (PRD Bab 7) | Audit otorisasi pada `sesuaikanStokAction` di `src/app/barang-dan-stok/actions.ts` | Penolakan jika `profile.peran === 'penjualan'` | Staf Penjualan ditolak menyesuaikan stok fisik barang. | **PASS** | `src/app/barang-dan-stok/actions.ts` line 64-69. |
| **SEC-HPP-01** | Manajer dapat membaca kolom `harga_pokok` melalui RPC `get_katalog_barang_manajer` | Panggil RPC `get_katalog_barang_manajer` menggunakan sesi Manajer | RPC berhasil dan data barang menyertakan `harga_pokok` | Manajer berhasil membaca katalog barang beserta `harga_pokok`. | **PASS** | RPC `get_katalog_barang_manajer` menyertakan `harga_pokok` untuk manajer aktif. |
| **SEC-HPP-02** | Staf Penjualan DITOLAK menjalankan RPC `get_katalog_barang_manajer` di level PostgreSQL | Panggil RPC `get_katalog_barang_manajer` menggunakan sesi Staf Penjualan | RPC menolak dengan error `Forbidden: Hanya manajer aktif yang boleh mengakses data ini` | Penjualan ditolak PostgreSQL: Forbidden: Hanya manajer aktif yang boleh mengakses data ini | **PASS** | Fungsi PostgreSQL `get_katalog_barang_manajer` memverifikasi peran via `auth.uid()`. |
| **SEC-HPP-03** | Staf Gudang DITOLAK menjalankan RPC `get_katalog_barang_manajer` di level PostgreSQL | Panggil RPC `get_katalog_barang_manajer` menggunakan sesi Staf Gudang | RPC menolak dengan error `Forbidden: Hanya manajer aktif yang boleh mengakses data ini` | Gudang ditolak PostgreSQL: Forbidden: Hanya manajer aktif yang boleh mengakses data ini | **PASS** | Fungsi PostgreSQL `get_katalog_barang_manajer` memverifikasi peran via `auth.uid()`. |
| **SEC-HPP-04** | Query katalog barang untuk Penjualan & Gudang tidak pernah menyertakan kolom `harga_pokok` | Audit kode `src/app/barang-dan-stok/page.tsx` | Query `select('id, kode, nama, satuan, harga_jual, stok, stok_minimum, aktif, diperbarui_pada')` | Query katalog non-manajer secara eksplisit menghilangkan kolom `harga_pokok`. | **PASS** | `src/app/barang-dan-stok/page.tsx` line 73. |
| **SEC-HPP-05** | Kolom `harga_beli_satuan` pada modul pembelian disembunyikan dari Staf Gudang (BR-12) | Audit kode `src/app/pembelian/page.tsx` | Staf Gudang tidak menerima kolom `harga_beli_satuan` (diset null / dihilangkan dari select) | Staf Gudang dilarang menerima nilai `harga_beli_satuan` pada data pengajuan pembelian. | **PASS** | `src/app/pembelian/page.tsx` line 156-163. |
| **SEC-HPP-06** | Pengambilan riwayat mutasi kartu stok (`ambilKartuStokAction`) tidak mengekspos HPP atau margin | Audit kode `ambilKartuStokAction` di `src/app/barang-dan-stok/actions.ts` | Hanya mengambil `id, nomor_dokumen, tipe, jumlah, stok_sebelum, stok_sesudah, alasan, dibuat_pada` | Kartu stok hanya menyajikan pergerakan kuantitas fisik tanpa data finansial. | **PASS** | `src/app/barang-dan-stok/actions.ts` line 230-231. |
| **SEC-LOUT-01** | Fungsi `logoutUser` / `signOut` mencabut sesi autentikasi pengguna secara total | Inisialisasi sesi login sementara lalu panggil `signOut()` | Sesi auth terhapus, `getUser()` mengembalikan `user = null` | Sesi Supabase Auth berhasil dihapus secara bersih. | **PASS** | Fungsi `signOut()` menghapus token JWT dan menyetel status unauthenticated. |
| **SEC-LOUT-02** | Pasca logout, request selanjutnya kembali berstatus anonim dan dialihkan ke `/login` | Simulasikan request ke rute privat setelah `user = null` | Proxy SSR mengalihkan ke `/login` | Request tanpa sesi diarahkan ke `/login` oleh Proxy SSR. | **PASS** | `updateSession` mengembalikan `NextResponse.redirect('/login')` jika user null. |
| **SEC-HOOK-01** | Endpoint Webhook Mayar (`/api/webhooks/mayar`) tidak dialihkan ke login oleh Proxy | Kirim HTTP POST ke `http://localhost:3000/api/webhooks/mayar` dengan redirect manual | Endpoint merespons HTTP 401 (bukan HTTP 307 `/login`) | HTTP 401 Akses ditolak: Token autentikasi webhook tidak disertakan. | **PASS** | Proxy SSR membiarkan rute `/api/webhooks/mayar` lolos langsung ke webhook handler. |
| **SEC-HOOK-02** | Webhook Mayar menolak request dengan token rahasia yang salah (HTTP 401) | Kirim HTTP POST ke `http://localhost:3000/api/webhooks/mayar` dengan `x-mayar-token` palsu | HTTP 401 Akses ditolak: Token autentikasi webhook tidak valid | HTTP 401 - Akses ditolak: Token autentikasi webhook tidak valid. | **PASS** | Validasi token konstan waktu (`crypto.timingSafeEqual`) menolak token sembarang. |
| **SEC-HOOK-03** | Webhook Mayar memvalidasi keaslian transaksi ke gateway sebelum mutasi database (HTTP 422 jika fiktif) | Kirim HTTP POST dengan token webhook resmi dan ID pembayaran fiktif | HTTP 422 Verifikasi transaksi gagal ke gateway Mayar | HTTP 422 - Verifikasi transaksi gagal ke gateway Mayar: Mayar API gagal memverifikasi tagihan: Not Found | **PASS** | Gateway callback verification memblokir pemalsuan status bayar sebelum SQL dieksekusi. |

---

## 3. Matriks Hak Akses Berbasis Peran Sistem ERP

| Modul & Tindakan | Manajer | Staf Penjualan | Staf Gudang | Mekanisme Penegakan Keamanan |
| :--- | :---: | :---: | :---: | :--- |
| **Dashboard Utama (`/`)** | ✅ Lengkap (Analitik Omzet, Margin, Laba) | ✅ Penjualan (Target Penjualan & Piutang) | ✅ Gudang (Stok Menipis & Pengiriman) | Server Component menyajikan tampilan khusus per peran |
| **Katalog Barang & Stok (`/barang-dan-stok`)** | ✅ Lengkap + HPP (`harga_pokok`) | ✅ Tanpa HPP | ✅ Tanpa HPP | RPC `get_katalog_barang_manajer` & Query eksplisit (BR-12) |
| **Radar Stok (`/radar-stok`)** | ✅ Lengkap | ✅ Lengkap | ✅ Lengkap | Data pergerakan fisik barang tanpa data finansial |
| **Manajemen Pelanggan (`/pelanggan`)** | ✅ Lihat & Tambah/Edit | ✅ Lihat & Tambah/Edit | ❌ Ditolak | Server Component redirect `/?error=unauthorized_pelanggan` & RLS 0 baris |
| **Buat Pesanan Jual Draf** | ✅ Diizinkan | ✅ Diizinkan | ❌ Ditolak | Server Action `buatPesananJualDrafAction` |
| **Konfirmasi Pengiriman Pesanan** | ✅ Diizinkan | ❌ Ditolak | ✅ Diizinkan | Server Action `kirimPesananJualAction` (BR-07) |
| **Pelunasan & Mayar Invoice** | ✅ Diizinkan | ❌ Ditolak | ❌ Ditolak | Server Action `lunasiPesananJualAction` & `buatTagihanMayarAction` |
| **Modul Pembelian PO (`/pembelian`)** | ✅ Lengkap + Harga Beli Satuan | ❌ Ditolak (UI Akses Terbatas) | ✅ Pengajuan & Terima Barang (Tanpa Harga Beli) | Server Component blocking & RLS database |
| **Laporan Finansial (`/laporan`)** | ✅ Diizinkan | ❌ Ditolak | ❌ Ditolak | Server Component redirect `/?error=unauthorized_laporan` |
| **Pengaturan Sistem (`/pengaturan`)** | ✅ Diizinkan | ❌ Ditolak | ❌ Ditolak | Server Component redirect `/?error=unauthorized_pengaturan` |
| **Audit Log (`public.audit_log`)** | ✅ Dapat Membaca | ❌ 0 Baris (RLS) | ❌ 0 Baris (RLS) | Row Level Security PostgreSQL |
| **Penyesuaian Stok Fisik** | ✅ Diizinkan | ❌ Ditolak | ✅ Diizinkan | Server Action `sesuaikanStokAction` |

---

## 4. Akun Uji yang Digunakan (Tanpa Menampilkan Kredensial Rahasia)

* **Manajer:** `alen@sinarabadi.com` (`Hendra Wijaya`, aktif: `true`)
* **Staf Penjualan:** `jeonghan@sinarabadi.com` (`Jeonghan`, aktif: `true`) & `dimas@sinarabadi.com` (`Dimas Prasetyo`, aktif: `true`)
* **Staf Gudang:** `wonwoo@sinarabadi.com` (`Joko Susanto`, aktif: `true`)
* **Akun Nonaktif:** `agus@sinarabadi.test` (`Agus Salim`, aktif: `false`)
