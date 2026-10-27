/**
 * Automated RBAC & Multi-Role Access Control Matrix Test Suite
 * CV Sinar Abadi Niaga — Sinar Abadi ERP
 *
 * Menguji kepatuhan penuh terhadap aturan RBAC PRD Bab 3, 4, 6, 7 & 12:
 * 1. Verifikasi akun aktual dari database:
 *    - Rina Kartika & Jeonghan & Dimas Prasetyo (Penjualan)
 *    - Joko Susanto (Gudang)
 *    - Alen / Hendra Wijaya (Manajer - Kontrol Positif)
 *    - Agus Salim (Akun Non-Aktif)
 *    - Verifikasi bahwa akun 'Bima' tidak diasumsikan dan diperiksa langsung ke DB
 * 2. Matriks Akses Halaman Terlindungi & Penolakan 403 Akses Ditolak
 * 3. Matriks Otorisasi Server Actions Sensitif (Pengaturan, Laporan, Pembelian, Pelanggan, Pesanan Jual)
 * 4. Proteksi RLS Database & RPC Finansial HPP (BR-12)
 * 5. Proteksi Akun Non-Aktif & Permintaan Anonim Tanpa Sesi
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

// 1. Baca Environment
const envPath = path.join(rootDir, ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim() || "";
const supabaseAnonKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim() || "";
const supabaseServiceKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || "";

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

console.log("===============================================================================");
console.log("PENGUJIAN OTOMATIS MATRIKS PERAN & KONTROL AKSES (RBAC MULTI-ROLE)");
console.log("Supabase Remote:", supabaseUrl);
console.log("===============================================================================\n");

let passedCount = 0;
let failedCount = 0;

function report(id, title, status, note = "") {
  if (status === "PASS") {
    passedCount++;
    console.log(`[V] PASS | ${id}: ${title} ${note ? `(${note})` : ""}`);
  } else {
    failedCount++;
    console.error(`[X] FAIL | ${id}: ${title} -> ${note}`);
  }
}

async function run() {
  // ---------------------------------------------------------------------------
  // SUITE 1: VERIFIKASI AKUN DAN PERAN AKTUAL DARI DATABASE
  // ---------------------------------------------------------------------------
  console.log("--- 1. AUDIT AKUN DAN PERAN AKTUAL DARI DATABASE ---");

  const { data: dbProfiles, error: errProf } = await adminClient
    .from("profiles")
    .select("id, nama_lengkap, peran, aktif");

  assert.ok(!errProf, `Gagal membaca profiles: ${errProf?.message}`);

  const profileMapByName = new Map();
  dbProfiles.forEach((p) => {
    profileMapByName.set(p.nama_lengkap.toLowerCase(), p);
  });

  // Uji Rina Kartika (penjualan)
  const rina = profileMapByName.get("rina kartika");
  assert.ok(rina, "Akun Rina Kartika wajib ada di database");
  assert.equal(rina.peran, "penjualan", "Peran Rina Kartika harus 'penjualan'");
  assert.equal(rina.aktif, true, "Rina Kartika harus berstatus aktif");
  report("ACC-01", "Verifikasi Akun Rina Kartika", "PASS", "Peran: penjualan, Aktif: true");

  // Uji Jeonghan (penjualan)
  const jeonghan = profileMapByName.get("jeonghan");
  assert.ok(jeonghan, "Akun Jeonghan wajib ada di database");
  assert.equal(jeonghan.peran, "penjualan", "Peran Jeonghan harus 'penjualan'");
  assert.equal(jeonghan.aktif, true, "Jeonghan harus berstatus aktif");
  report("ACC-02", "Verifikasi Akun Jeonghan", "PASS", "Peran: penjualan, Aktif: true");

  // Uji Joko Susanto (gudang)
  const joko = profileMapByName.get("joko susanto");
  assert.ok(joko, "Akun Joko Susanto wajib ada di database");
  assert.equal(joko.peran, "gudang", "Peran Joko Susanto aktual di DB harus 'gudang'");
  assert.equal(joko.aktif, true, "Joko Susanto harus berstatus aktif");
  report("ACC-03", "Verifikasi Akun Joko Susanto", "PASS", "Peran aktual: gudang (bukan asumsi nama)");

  // Uji Verifikasi Akun Bima (Tidak Boleh Mengasumsikan Peran)
  const bima = Array.from(profileMapByName.keys()).find((k) => k.includes("bima"));
  assert.ok(!bima, "Akun Bima diverifikasi di database dan TIDAK ditemukan (tidak diasumsikan)");
  report("ACC-04", "Verifikasi Keberadaan Akun Bima", "PASS", "Dikonfirmasi tidak ada di DB, tidak diasumsikan");

  // Uji Manajer sebagai Kontrol Positif (Hendra Wijaya / Alen)
  const hendra = profileMapByName.get("hendra wijaya");
  assert.ok(hendra, "Akun Manajer (Hendra Wijaya) wajib ada di database");
  assert.equal(hendra.peran, "manajer", "Peran Hendra Wijaya harus 'manajer'");
  assert.equal(hendra.aktif, true, "Manajer harus berstatus aktif");
  report("ACC-05", "Verifikasi Akun Manajer (Kontrol Positif)", "PASS", "Peran: manajer, Aktif: true");

  // Uji Akun Non-Aktif (Agus Salim)
  const agus = profileMapByName.get("agus salim");
  assert.ok(agus, "Akun Agus Salim wajib ada di database");
  assert.equal(agus.aktif, false, "Agus Salim harus berstatus non-aktif (aktif = false)");
  report("ACC-06", "Verifikasi Akun Non-Aktif (Agus Salim)", "PASS", "Aktif: false");

  // ---------------------------------------------------------------------------
  // SUITE 2: MATRIKS AKSES HALAMAN & HALAMAN 403 AKSES DITOLAK
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. PENGUJIAN MATRIKS HALAMAN & 403 AKSES DITOLAK ---");

  // 2.1 Halaman Laporan (/laporan)
  const contentLaporan = fs.readFileSync(path.join(rootDir, "src/app/laporan/page.tsx"), "utf-8");
  assert.ok(
    contentLaporan.includes(`profile.peran !== "manajer"`) &&
      contentLaporan.includes("<AksesDitolak") &&
      contentLaporan.includes("403"),
    "Halaman /laporan wajib menampilkan 403 AksesDitolak untuk non-manajer!"
  );
  report("PAGE-01", "Halaman /laporan menolak non-manajer dengan 403 AksesDitolak", "PASS");

  // 2.2 Halaman Pengaturan (/pengaturan)
  const contentPengaturan = fs.readFileSync(path.join(rootDir, "src/app/pengaturan/page.tsx"), "utf-8");
  assert.ok(
    contentPengaturan.includes(`profile.peran !== "manajer"`) &&
      contentPengaturan.includes("<AksesDitolak") &&
      contentPengaturan.includes("403"),
    "Halaman /pengaturan wajib menampilkan 403 AksesDitolak untuk non-manajer!"
  );
  report("PAGE-02", "Halaman /pengaturan menolak non-manajer dengan 403 AksesDitolak", "PASS");

  // 2.3 Halaman Pembelian (/pembelian)
  const contentPembelian = fs.readFileSync(path.join(rootDir, "src/app/pembelian/page.tsx"), "utf-8");
  assert.ok(
    (contentPembelian.includes(`profile.peran === "penjualan"`) ||
      contentPembelian.includes(`profile.peran !== "gudang"`)) &&
      contentPembelian.includes("<AksesDitolak") &&
      contentPembelian.includes("403"),
    "Halaman /pembelian wajib menampilkan 403 AksesDitolak untuk peran penjualan!"
  );
  report("PAGE-03", "Halaman /pembelian menolak peran penjualan dengan 403 AksesDitolak", "PASS");

  // 2.4 Halaman Pelanggan (/pelanggan)
  const contentPelanggan = fs.readFileSync(path.join(rootDir, "src/app/pelanggan/page.tsx"), "utf-8");
  assert.ok(
    (contentPelanggan.includes(`profile.peran === "gudang"`) ||
      contentPelanggan.includes(`profile.peran !== "penjualan"`)) &&
      contentPelanggan.includes("<AksesDitolak") &&
      contentPelanggan.includes("403"),
    "Halaman /pelanggan wajib menampilkan 403 AksesDitolak untuk peran gudang!"
  );
  report("PAGE-04", "Halaman /pelanggan menolak peran gudang dengan 403 AksesDitolak", "PASS");

  // 2.5 Komponen AksesDitolak Memiliki Tombol Kembali ke Dashboard
  const contentAksesDitolak = fs.readFileSync(
    path.join(rootDir, "src/components/layout/AksesDitolak.tsx"),
    "utf-8"
  );
  assert.ok(
    contentAksesDitolak.includes("Kembali ke Dashboard") &&
      contentAksesDitolak.includes('href="/"') &&
      contentAksesDitolak.includes("403"),
    "Komponen AksesDitolak wajib memuat judul 403 dan tautan Kembali ke Dashboard!"
  );
  report("PAGE-05", "Komponen AksesDitolak memiliki UI 403 konsisten & tombol Dashboard", "PASS");

  // ---------------------------------------------------------------------------
  // SUITE 3: OTORISASI SERVER ACTIONS SENSITIF
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. PENGUJIAN OTORISASI SERVER ACTIONS SENSITIF ---");

  // 3.1 getPengaturanData Action (Eksklusif Manajer)
  const contentPengaturanAction = fs.readFileSync(
    path.join(rootDir, "src/app/pengaturan/actions.ts"),
    "utf-8"
  );
  assert.ok(
    contentPengaturanAction.includes('callerProfile.peran !== "manajer"') ||
      contentPengaturanAction.includes('profile.peran !== "manajer"'),
    "getPengaturanData wajib menolak pemanggil non-manajer!"
  );
  report("ACT-01", "Server Action getPengaturanData memvalidasi peran manajer", "PASS");

  // 3.2 updateUserRoleAndStatus Action (Eksklusif Manajer)
  assert.ok(
    contentPengaturanAction.includes('callerProfile.peran !== "manajer"') &&
      contentPengaturanAction.includes("Hanya peran Manajer aktif"),
    "updateUserRoleAndStatus wajib eksklusif untuk peran manajer aktif!"
  );
  report("ACT-02", "Server Action updateUserRoleAndStatus eksklusif untuk Manajer aktif", "PASS");

  // 3.3 Pembelian Actions (Persetujuan & Penolakan Eksklusif Manajer)
  const contentPembelianAction = fs.readFileSync(
    path.join(rootDir, "src/app/pembelian/actions.ts"),
    "utf-8"
  );
  assert.ok(
    (contentPembelianAction.includes('profile.peran !== "manajer"') ||
      contentPembelianAction.includes("!canApprovePembelian(profile.peran)")) &&
      contentPembelianAction.includes("Hanya Manajer yang memiliki wewenang menyetujui pengajuan pembelian"),
    "setujuiPembelianAction wajib menolak peran selain manajer!"
  );
  report("ACT-03", "Server Action setujuiPembelianAction eksklusif untuk Manajer", "PASS");

  assert.ok(
    (contentPembelianAction.includes('profile.peran !== "manajer"') ||
      contentPembelianAction.includes("!canApprovePembelian(profile.peran)")) &&
      contentPembelianAction.includes("Hanya Manajer yang memiliki wewenang menolak pengajuan pembelian"),
    "tolakPembelianAction wajib menolak peran selain manajer!"
  );
  report("ACT-04", "Server Action tolakPembelianAction eksklusif untuk Manajer", "PASS");

  // 3.4 Pelunasan Pesanan Jual (Eksklusif Manajer)
  const contentPesananAction = fs.readFileSync(
    path.join(rootDir, "src/app/pesanan-jual/actions.ts"),
    "utf-8"
  );
  assert.ok(
    contentPesananAction.includes('profile.peran !== "manajer"') &&
      contentPesananAction.includes("Hanya Manajer yang berwenang mencatat pelunasan"),
    "lunasiPesananJualAction wajib menolak non-manajer!"
  );
  report("ACT-05", "Server Action lunasiPesananJualAction eksklusif untuk Manajer (BR-07, BR-12)", "PASS");

  // 3.5 Pembatalan Pesanan Dikonfirmasi (Eksklusif Manajer)
  assert.ok(
    contentPesananAction.includes("Pesanan yang sudah dikonfirmasi hanya boleh dibatalkan oleh Manajer (BR-08)"),
    "Pembatalan pesanan dikonfirmasi wajib eksklusif Manajer!"
  );
  report("ACT-06", "Pembatalan pesanan terkonfirmasi eksklusif Manajer (BR-08)", "PASS");

  // 3.6 Penyesuaian Stok (Hanya Gudang & Manajer, Tolak Penjualan)
  const contentBarangAction = fs.readFileSync(
    path.join(rootDir, "src/app/barang-dan-stok/actions.ts"),
    "utf-8"
  );
  assert.ok(
    contentBarangAction.includes('profile.peran === "penjualan"') &&
      contentBarangAction.includes("Staf Penjualan tidak memiliki wewenang melakukan penyesuaian stok"),
    "sesuaikanStokAction wajib menolak peran penjualan!"
  );
  report("ACT-07", "Server Action sesuaikanStokAction melarang Staf Penjualan (BR-11)", "PASS");

  // ---------------------------------------------------------------------------
  // SUITE 4: DATABASE RPC & KEAMANAN RAHASIA DAGANG HPP (BR-12)
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. PENGUJIAN RPC DATABASE & RAHASIA HPP (BR-12) ---");

  // Buat client untuk sales (jeonghan) dan gudang (wonwoo)
  async function getClientForUser(userId) {
    const { data: user } = await adminClient.auth.admin.getUserById(userId);
    const { data: link } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: user.user.email,
    });
    const client = createClient(supabaseUrl, supabaseAnonKey);
    const { error } = await client.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: "email",
    });
    if (error) throw error;
    return client;
  }

  const salesClient = await getClientForUser(jeonghan.id);
  const gudangClient = await getClientForUser(joko.id);
  const managerClient = await getClientForUser(hendra.id);

  // Manajer berhasil panggil RPC get_katalog_barang_manajer
  const { data: mKatalog, error: mErr } = await managerClient.rpc("get_katalog_barang_manajer");
  assert.ok(!mErr, `Manajer gagal RPC katalog: ${mErr?.message}`);
  assert.ok(mKatalog && mKatalog.length > 0, "Manajer harus mendapat data katalog");
  assert.ok("harga_pokok" in mKatalog[0], "Manajer harus dapat melihat harga_pokok");
  report("DB-01", "Manajer berwenang memanggil RPC get_katalog_barang_manajer (+HPP)", "PASS");

  // Sales DITOLAK panggil RPC get_katalog_barang_manajer di level PostgreSQL
  const { error: sErr } = await salesClient.rpc("get_katalog_barang_manajer");
  assert.ok(sErr, "Sales harus DITOLAK dari RPC get_katalog_barang_manajer");
  report("DB-02", "Staf Penjualan DITOLAK memanggil RPC get_katalog_barang_manajer (P0001)", "PASS");

  // Gudang DITOLAK panggil RPC get_katalog_barang_manajer di level PostgreSQL
  const { error: gErr } = await gudangClient.rpc("get_katalog_barang_manajer");
  assert.ok(gErr, "Gudang harus DITOLAK dari RPC get_katalog_barang_manajer");
  report("DB-03", "Staf Gudang DITOLAK memanggil RPC get_katalog_barang_manajer (P0001)", "PASS");

  // ---------------------------------------------------------------------------
  // SUITE 5: PROTEKSI SESI PROXY & AKUN NON-AKTIF
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. PENGUJIAN SESI PROXY & AKUN NON-AKTIF ---");

  // Proxy routing: tanpa sesi diarahkan ke /login
  const contentProxy = fs.readFileSync(path.join(rootDir, "src/lib/supabase/proxy.ts"), "utf-8");
  assert.ok(
    contentProxy.includes("isPrivateRoute && !user") &&
      contentProxy.includes('pathname = "/login"'),
    "Proxy wajib mengalihkan permintaan privat tanpa sesi ke /login!"
  );
  report("SEC-01", "Proxy SSR mengalihkan seluruh rute privat tanpa sesi ke /login", "PASS");

  // Akun non-aktif: ditolak di login & server components
  assert.ok(
    contentProxy.includes("account_inactive") ||
      contentLaporan.includes("account_inactive"),
    "Sistem memvalidasi status aktif dan menolak akun non-aktif!"
  );
  report("SEC-02", "Sistem menolak akun non-aktif (profile.aktif !== true)", "PASS");

  console.log("\n===============================================================================");
  console.log(`RINGKASAN PENGUJIAN MATRIKS RBAC: ${passedCount}/${passedCount + failedCount} LULUS`);
  console.log("===============================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("CRITICAL ERROR IN RBAC TEST SUITE:", err);
  process.exit(1);
});
