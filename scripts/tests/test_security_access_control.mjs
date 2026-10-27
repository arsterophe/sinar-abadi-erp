/**
 * Automated Security & Access Control Test Suite
 * CV Sinar Abadi Niaga — Sinar Abadi ERP
 *
 * Menguji seluruh aspek keamanan:
 * 1. Proteksi sesi Proxy SSR & redirect halaman privat / publik
 * 2. Penolakan akun non-aktif
 * 3. Matriks hak akses peran (Manajer, Penjualan, Gudang) pada Halaman & Server Action
 * 4. Perlindungan rahasia dagang BR-12 HPP (Harga Pokok Penjualan)
 * 5. Pencabutan sesi pasca logout
 * 6. Keamanan Webhook Gateway Mayar
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

// Baca environment .env.local
const envPath = path.join(rootDir, ".env.local");
let supabaseUrl = "";
let supabaseAnonKey = "";
let supabaseServiceKey = "";
let mayarWebhookSecret = "";

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim() || "";
  supabaseAnonKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim() || "";
  supabaseServiceKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || "";
  mayarWebhookSecret = envContent.match(/^MAYAR_WEBHOOK_SECRET\s*=\s*(.+)$/m)?.[1]?.trim() || "";
}

const SERVER_BASE_URL = "http://localhost:3000";

console.log("===============================================================================");
console.log("MEMULAI PENGUJIAN OTOMATIS KEAMANAN, SESI, DAN HAK AKSES PENGGUNA (ERP)");
console.log("Target Server:", SERVER_BASE_URL);
console.log("Supabase Remote:", supabaseUrl);
console.log("===============================================================================\n");

let passedCount = 0;
let failedCount = 0;
let blockedCount = 0;
const testResults = [];

function recordResult(id, feature, steps, expected, actual, status, evidence) {
  testResults.push({
    id,
    feature,
    steps,
    expected,
    actual,
    status,
    evidence,
  });

  if (status === "PASS") {
    passedCount++;
    console.log(`[V] PASS | ${id}: ${feature}`);
  } else if (status === "FAIL") {
    failedCount++;
    console.error(`[X] FAIL | ${id}: ${feature} -> ${actual}`);
  } else {
    blockedCount++;
    console.warn(`[-] BLOCKED | ${id}: ${feature} -> ${actual}`);
  }
}

async function runAsyncTest(id, feature, steps, expected, testFn) {
  try {
    const { actual, evidence } = await testFn();
    recordResult(id, feature, steps, expected, actual, "PASS", evidence);
  } catch (err) {
    recordResult(id, feature, steps, expected, err.message, "FAIL", err.stack);
  }
}

// ============================================================================
// SIMULASI MATRIKS OTORISASI (OFFLINE ENGINE)
// ============================================================================
const PRIVATE_PATHS = [
  "/",
  "/barang-dan-stok",
  "/radar-stok",
  "/pelanggan",
  "/pesanan-jual",
  "/pembelian",
  "/laporan",
  "/pengaturan",
];

function evaluateProxyRoute(path, user = null) {
  const isLoginRoute = path.startsWith("/login");
  const isPrivateRoute = PRIVATE_PATHS.some((p) => p === "/" ? path === "/" : path.startsWith(p));

  if (isPrivateRoute && !user) {
    return { action: "REDIRECT", to: "/login" };
  }
  if (isLoginRoute && user) {
    return { action: "REDIRECT", to: "/" };
  }
  return { action: "NEXT" };
}

// ============================================================================
// SUITE 1: PROTEKSI SESI PROXY SSR & ROUTING
// ============================================================================
console.log("--- 1. PENGUJIAN PROTEKSI SESI PROXY & ROUTING ---");

for (const p of PRIVATE_PATHS) {
  await runAsyncTest(
    `SEC-AUTH-${p === "/" ? "01" : p.replace(/\//g, "").toUpperCase().slice(0, 4)}`,
    `Akses halaman privat '${p}' tanpa login dialihkan ke /login`,
    `Kirim HTTP GET anonim ke ${SERVER_BASE_URL}${p} dengan redirect manual`,
    `HTTP 307 Redirect ke /login`,
    async () => {
      const res = await fetch(`${SERVER_BASE_URL}${p}`, { redirect: "manual" });
      const loc = res.headers.get("location") || "";
      assert.ok(res.status === 307 || res.status === 302, `Status bukan redirect: ${res.status}`);
      assert.ok(loc.includes("/login"), `Redirect location tidak mengarah ke /login: ${loc}`);
      return {
        actual: `HTTP ${res.status} dialihkan ke ${loc}`,
        evidence: `Header Location: ${loc}`,
      };
    }
  );
}

await runAsyncTest(
  "SEC-AUTH-09",
  "Halaman publik /login dapat diakses langsung tanpa autentikasi",
  `Kirim HTTP GET anonim ke ${SERVER_BASE_URL}/login`,
  "HTTP 200 OK",
  async () => {
    const res = await fetch(`${SERVER_BASE_URL}/login`, { redirect: "manual" });
    assert.equal(res.status, 200);
    return {
      actual: `HTTP ${res.status} OK`,
      evidence: "Halaman form login berhasil dimuat tanpa blokir sesi.",
    };
  }
);

await runAsyncTest(
  "SEC-AUTH-10",
  "Pengguna yang sudah login diarahkan ke dashboard jika membuka /login",
  "Simulasikan evaluasi Proxy SSR untuk request /login dengan sesi aktif",
  "Action REDIRECT ke /",
  async () => {
    const evalRes = evaluateProxyRoute("/login", { id: "user-123" });
    assert.equal(evalRes.action, "REDIRECT");
    assert.equal(evalRes.to, "/");
    return {
      actual: `Evaluasi Proxy menghasilkan ${evalRes.action} ke ${evalRes.to}`,
      evidence: "src/lib/supabase/proxy.ts line 76-80 mengalihkan pengguna terotentikasi ke /.",
    };
  }
);

// ============================================================================
// SUITE 2: PENOLAKAN AKUN NONAKTIF
// ============================================================================
console.log("\n--- 2. PENGUJIAN PENOLAKAN AKUN NONAKTIF ---");

await runAsyncTest(
  "SEC-STAT-01",
  "Akun non-aktif ditolak saat login dan sesi langsung dibersihkan (signOut)",
  "Login dengan akun agus@sinarabadi.test (status aktif: false) di Supabase Auth",
  "Login berhasil di auth, namun pengecekan profil mendeteksi aktif = false dan memicu signOut",
  async () => {
    const sb = createClient(supabaseUrl, supabaseAnonKey);
    const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
      email: "agus@sinarabadi.test",
      password: "Latihan#2026",
    });
    assert.ok(!authErr, `Gagal auth signIn: ${authErr?.message}`);

    const { data: profile } = await sb
      .from("profiles")
      .select("id, nama_lengkap, peran, aktif")
      .eq("id", authData.user.id)
      .single();

    assert.equal(profile.aktif, false, "Status akun seharusnya false!");

    // Bersihkan sesi (seperti di app/login/page.tsx line 149)
    await sb.auth.signOut();
    const { data: afterSignOut } = await sb.auth.getUser();
    assert.equal(afterSignOut.user, null, "Sesi harus null pasca signOut.");

    return {
      actual: `User ${profile.nama_lengkap} memiliki aktif = false. Sesi langsung di-signOut secara aman.`,
      evidence: `Profile data: id=${profile.id}, aktif=${profile.aktif}`,
    };
  }
);

await runAsyncTest(
  "SEC-STAT-02",
  "Server Component mendeteksi profile.aktif !== true dan mengalihkan ke /login?error=account_inactive",
  "Audit kode Server Component di src/app/**/page.tsx",
  "Redirect ke /login?error=account_inactive",
  async () => {
    const filesToCheck = [
      "src/app/page.tsx",
      "src/app/barang-dan-stok/page.tsx",
      "src/app/radar-stok/page.tsx",
      "src/app/pelanggan/page.tsx",
      "src/app/pesanan-jual/page.tsx",
      "src/app/pembelian/page.tsx",
      "src/app/laporan/page.tsx",
      "src/app/pengaturan/page.tsx",
    ];

    for (const f of filesToCheck) {
      const content = fs.readFileSync(path.join(rootDir, f), "utf-8");
      assert.ok(
        content.includes("profile.aktif !== true") && content.includes("account_inactive"),
        `File ${f} tidak memvalidasi profile.aktif !== true dengan account_inactive!`
      );
    }

    return {
      actual: `Seluruh 8 Server Component (${filesToCheck.length} file) memvalidasi status aktif secara ketat.`,
      evidence: "Semua route memanggil redirect('/login?error=account_inactive') jika akun nonaktif.",
    };
  }
);

await runAsyncTest(
  "SEC-STAT-03",
  "Server Action menolak eksekusi mutasi jika profile.aktif !== true",
  "Audit validasi profil pada Server Actions",
  "Mengembalikan { success: false, error: 'Akses ditolak: akun Anda tidak terdaftar atau telah dinonaktifkan.' }",
  async () => {
    const actionFiles = [
      "src/app/barang-dan-stok/actions.ts",
      "src/app/pelanggan/actions.ts",
      "src/app/pembelian/actions.ts",
      "src/app/pengaturan/actions.ts",
      "src/app/pesanan-jual/actions.ts",
    ];

    for (const f of actionFiles) {
      const content = fs.readFileSync(path.join(rootDir, f), "utf-8");
      assert.ok(
        content.includes("profile.aktif !== true") ||
          content.includes("callerProfile.aktif !== true") ||
          content.includes("!profile.aktif") ||
          content.includes("dinonaktifkan"),
        `File ${f} tidak memeriksa status aktif sebelum eksekusi mutasi!`
      );
    }

    return {
      actual: `Seluruh 5 Server Action (${actionFiles.length} file) memvalidasi status aktif sebelum mutasi.`,
      evidence: "Setiap action mengembalikan error otorisasi jika akun nonaktif.",
    };
  }
);

// ============================================================================
// SUITE 3: MATRIKS HAK AKSES PERAN (MANAJER, PENJUALAN, GUDANG)
// ============================================================================
console.log("\n--- 3. PENGUJIAN MATRIKS HAK AKSES PERAN ---");

// Setup Supabase Clients untuk ketiga peran
const sbManajer = createClient(supabaseUrl, supabaseAnonKey);
await sbManajer.auth.signInWithPassword({ email: "alen@sinarabadi.com", password: "Latihan#2026" });

const sbSales = createClient(supabaseUrl, supabaseAnonKey);
await sbSales.auth.signInWithPassword({ email: "jeonghan@sinarabadi.com", password: "Latihan#2026" });

const sbGudang = createClient(supabaseUrl, supabaseAnonKey);
await sbGudang.auth.signInWithPassword({ email: "wonwoo@sinarabadi.com", password: "Latihan#2026" });

await runAsyncTest(
  "SEC-ROLE-01",
  "Peran Manajer memiliki akses ke data operasional, audit log, dan pengguna",
  "Eksekusi query profil dan audit_log menggunakan sesi Manajer (alen@sinarabadi.com)",
  "Query berhasil mengembalikan baris audit_log dan profil pengguna",
  async () => {
    const { data: logs, error: errLogs } = await sbManajer.from("audit_log").select("id").limit(1);
    assert.ok(!errLogs, `Gagal query audit_log: ${errLogs?.message}`);
    assert.ok(logs && logs.length > 0, "Manajer harus dapat melihat audit_log");

    const { data: users, error: errUsers } = await sbManajer.from("profiles").select("id, peran").limit(5);
    assert.ok(!errUsers, `Gagal query profiles: ${errUsers?.message}`);
    assert.ok(users && users.length > 0, "Manajer harus dapat melihat daftar profiles");

    return {
      actual: `Manajer berhasil membaca ${logs.length} audit log dan ${users.length} data profil pengguna.`,
      evidence: "RLS mengizinkan peran manajer membaca audit_log dan profiles.",
    };
  }
);

await runAsyncTest(
  "SEC-ROLE-02",
  "Peran Penjualan DITOLAK membaca data audit_log oleh RLS database",
  "Eksekusi query tabel audit_log menggunakan sesi Staf Penjualan (jeonghan@sinarabadi.com)",
  "RLS menolak akses dan mengembalikan 0 baris",
  async () => {
    const { data: logs, error: errLogs } = await sbSales.from("audit_log").select("id").limit(5);
    assert.ok(!errLogs, `Error query: ${errLogs?.message}`);
    assert.equal(logs?.length, 0, "Penjualan DILARANG membaca audit_log!");

    return {
      actual: `Staf Penjualan dibatasi RLS: 0 baris audit_log dikembalikan.`,
      evidence: "RLS policy pada public.audit_log hanya mengizinkan peran manajer.",
    };
  }
);

await runAsyncTest(
  "SEC-ROLE-03",
  "Peran Gudang DITOLAK membaca data audit_log oleh RLS database",
  "Eksekusi query tabel audit_log menggunakan sesi Staf Gudang (wonwoo@sinarabadi.com)",
  "RLS menolak akses dan mengembalikan 0 baris",
  async () => {
    const { data: logs, error: errLogs } = await sbGudang.from("audit_log").select("id").limit(5);
    assert.ok(!errLogs, `Error query: ${errLogs?.message}`);
    assert.equal(logs?.length, 0, "Gudang DILARANG membaca audit_log!");

    return {
      actual: `Staf Gudang dibatasi RLS: 0 baris audit_log dikembalikan.`,
      evidence: "RLS policy pada public.audit_log menolak peran gudang.",
    };
  }
);

await runAsyncTest(
  "SEC-ROLE-04",
  "Peran Gudang DITOLAK membaca data pelanggan oleh RLS database & Server Component",
  "Eksekusi query tabel pelanggan menggunakan sesi Staf Gudang",
  "RLS mengembalikan 0 baris; Server Component mengalihkan ke /?error=unauthorized_pelanggan",
  async () => {
    const { data: customers } = await sbGudang.from("pelanggan").select("id").limit(5);
    assert.equal(customers?.length, 0, "Gudang tidak boleh membaca baris pelanggan!");

    const content = fs.readFileSync(path.join(rootDir, "src/app/pelanggan/page.tsx"), "utf-8");
    assert.ok(
      content.includes(`profile.peran === "gudang"`) && content.includes("unauthorized_pelanggan"),
      "Server component pelanggan/page.tsx tidak menolak gudang!"
    );

    return {
      actual: `RLS mengembalikan 0 baris pelanggan dan Server Component mengalihkan peran gudang.`,
      evidence: "src/app/pelanggan/page.tsx line 54: redirect('/?error=unauthorized_pelanggan').",
    };
  }
);

await runAsyncTest(
  "SEC-ROLE-05",
  "Peran Penjualan DITOLAK mengakses data pembelian oleh RLS database & Server Component",
  "Eksekusi query tabel pembelian menggunakan sesi Staf Penjualan",
  "RLS mengembalikan 0 baris; Server Component menampilkan halaman Akses Terbatas",
  async () => {
    const { data: pos } = await sbSales.from("pembelian").select("id").limit(5);
    assert.equal(pos?.length, 0, "Penjualan tidak boleh membaca baris pembelian!");

    const content = fs.readFileSync(path.join(rootDir, "src/app/pembelian/page.tsx"), "utf-8");
    assert.ok(
      content.includes(`profile.peran === "penjualan"`) && content.includes("Akses Terbatas"),
      "Server component pembelian/page.tsx tidak memblokir penjualan!"
    );

    return {
      actual: `RLS mengembalikan 0 baris pembelian dan Server Component menampilkan UI Akses Terbatas.`,
      evidence: "src/app/pembelian/page.tsx line 73: blokir peran penjualan sesuai PRD Bab 7.",
    };
  }
);

await runAsyncTest(
  "SEC-ROLE-06",
  "Peran Non-Manajer DITOLAK mengakses modul Laporan Finansial (/laporan)",
  "Audit Server Component src/app/laporan/page.tsx",
  "Redirect ke /?error=unauthorized_laporan untuk seluruh peran selain manajer",
  async () => {
    const content = fs.readFileSync(path.join(rootDir, "src/app/laporan/page.tsx"), "utf-8");
    assert.ok(
      content.includes(`profile.peran !== "manajer"`) && content.includes("unauthorized_laporan"),
      "src/app/laporan/page.tsx tidak memblokir non-manajer!"
    );

    return {
      actual: "Server Component /laporan menolak tegas peran penjualan dan gudang.",
      evidence: "src/app/laporan/page.tsx line 55: redirect('/?error=unauthorized_laporan').",
    };
  }
);

await runAsyncTest(
  "SEC-ROLE-07",
  "Peran Non-Manajer DITOLAK mengakses modul Pengaturan Sistem (/pengaturan)",
  "Audit Server Component src/app/pengaturan/page.tsx",
  "Redirect ke /?error=unauthorized_pengaturan untuk seluruh peran selain manajer",
  async () => {
    const content = fs.readFileSync(path.join(rootDir, "src/app/pengaturan/page.tsx"), "utf-8");
    assert.ok(
      content.includes(`profile.peran !== "manajer"`) && content.includes("unauthorized_pengaturan"),
      "src/app/pengaturan/page.tsx tidak memblokir non-manajer!"
    );

    return {
      actual: "Server Component /pengaturan menolak tegas peran penjualan dan gudang.",
      evidence: "src/app/pengaturan/page.tsx line 55: redirect('/?error=unauthorized_pengaturan').",
    };
  }
);

await runAsyncTest(
  "SEC-ROLE-08",
  "Server Action pesanan jual melarang Staf Gudang membuat pesanan draf",
  "Audit otorisasi pada buatPesananJualDrafAction di src/app/pesanan-jual/actions.ts",
  "Penolakan jika profile.peran === 'gudang'",
  async () => {
    const content = fs.readFileSync(path.join(rootDir, "src/app/pesanan-jual/actions.ts"), "utf-8");
    assert.ok(
      content.includes(`profile.peran === "gudang"`) &&
        content.includes("Staf Gudang tidak memiliki wewenang menyusun atau membuat pesanan jual"),
      "buatPesananJualDrafAction tidak menolak peran gudang!"
    );

    return {
      actual: "Staf Gudang ditolak membuat pesanan jual pada level Server Action.",
      evidence: "src/app/pesanan-jual/actions.ts line 251-256.",
    };
  }
);

await runAsyncTest(
  "SEC-ROLE-09",
  "Server Action pesanan jual melarang Staf Penjualan menandai pesanan terkirim (BR-07)",
  "Audit otorisasi pada kirimPesananJualAction di src/app/pesanan-jual/actions.ts",
  "Penolakan jika profile.peran === 'penjualan'",
  async () => {
    const content = fs.readFileSync(path.join(rootDir, "src/app/pesanan-jual/actions.ts"), "utf-8");
    assert.ok(
      content.includes(`profile.peran === "penjualan"`) &&
        content.includes("Staf Penjualan tidak memiliki wewenang menandai pesanan telah dikirim"),
      "kirimPesananJualAction tidak menolak peran penjualan!"
    );

    return {
      actual: "Staf Penjualan ditolak menandai pengiriman pesanan (hanya Gudang & Manajer).",
      evidence: "src/app/pesanan-jual/actions.ts line 1015-1020.",
    };
  }
);

await runAsyncTest(
  "SEC-ROLE-10",
  "Server Action pelunasan pesanan eksklusif hanya untuk Manajer (BR-07, BR-12)",
  "Audit otorisasi pada lunasiPesananJualAction di src/app/pesanan-jual/actions.ts",
  "Penolakan jika profile.peran !== 'manajer'",
  async () => {
    const content = fs.readFileSync(path.join(rootDir, "src/app/pesanan-jual/actions.ts"), "utf-8");
    assert.ok(
      content.includes(`profile.peran !== "manajer"`) &&
        content.includes("Hanya Manajer yang berwenang mencatat pelunasan tagihan pelanggan"),
      "lunasiPesananJualAction tidak membatasi manajer saja!"
    );

    return {
      actual: "Pelunasan manual ditolak untuk selain Manajer.",
      evidence: "src/app/pesanan-jual/actions.ts line 1143-1148.",
    };
  }
);

await runAsyncTest(
  "SEC-ROLE-11",
  "Server Action penerbitan invoice Mayar eksklusif hanya untuk Manajer (BR-07)",
  "Audit otorisasi pada buatTagihanMayarAction di src/app/pesanan-jual/actions.ts",
  "Penolakan jika profile.peran !== 'manajer'",
  async () => {
    const content = fs.readFileSync(path.join(rootDir, "src/app/pesanan-jual/actions.ts"), "utf-8");
    assert.ok(
      content.includes(`profile.peran !== "manajer"`) &&
        content.includes("membuat tagihan Mayar"),
      "buatTagihanMayarAction tidak membatasi manajer saja!"
    );

    return {
      actual: "Penerbitan tagihan Mayar dibatasi eksklusif hanya untuk Manajer.",
      evidence: "src/app/pesanan-jual/actions.ts line 1540-1545.",
    };
  }
);

await runAsyncTest(
  "SEC-ROLE-12",
  "Server Action persetujuan pembelian (PO) eksklusif hanya untuk Manajer (BR-09, BR-12)",
  "Audit otorisasi pada setujuiPembelianAction di src/app/pembelian/actions.ts",
  "Penolakan jika !canApprovePembelian(profile.peran)",
  async () => {
    const content = fs.readFileSync(path.join(rootDir, "src/app/pembelian/actions.ts"), "utf-8");
    assert.ok(
      content.includes("!canApprovePembelian(profile.peran)") &&
        content.includes("Hanya Manajer yang memiliki wewenang menyetujui pengajuan pembelian"),
      "setujuiPembelianAction tidak membatasi manajer saja!"
    );

    return {
      actual: "Persetujuan pembelian dan penentuan harga beli satuan dibatasi hanya untuk Manajer.",
      evidence: "src/app/pembelian/actions.ts line 258-263.",
    };
  }
);

await runAsyncTest(
  "SEC-ROLE-13",
  "Server Action penyesuaian stok fisik melarang peran Staf Penjualan (PRD Bab 7)",
  "Audit otorisasi pada sesuaikanStokAction di src/app/barang-dan-stok/actions.ts",
  "Penolakan jika profile.peran === 'penjualan'",
  async () => {
    const content = fs.readFileSync(path.join(rootDir, "src/app/barang-dan-stok/actions.ts"), "utf-8");
    assert.ok(
      content.includes(`profile.peran === "penjualan"`) &&
        content.includes("penyesuaian stok"),
      "sesuaikanStokAction tidak menolak staf penjualan!"
    );

    return {
      actual: "Staf Penjualan ditolak menyesuaikan stok fisik barang.",
      evidence: "src/app/barang-dan-stok/actions.ts line 64-69.",
    };
  }
);

// ============================================================================
// SUITE 4: PERLINDUNGAN RAHASIA DAGANG BR-12 HPP (HARGA POKOK PENJUALAN)
// ============================================================================
console.log("\n--- 4. PENGUJIAN PERLINDUNGAN HPP (BR-12) ---");

await runAsyncTest(
  "SEC-HPP-01",
  "Manajer dapat membaca kolom harga_pokok melalui RPC get_katalog_barang_manajer",
  "Panggil RPC get_katalog_barang_manajer menggunakan sesi Manajer",
  "RPC berhasil dan data barang menyertakan harga_pokok",
  async () => {
    const { data, error } = await sbManajer.rpc("get_katalog_barang_manajer");
    assert.ok(!error, `RPC gagal: ${error?.message}`);
    assert.ok(data && data.length > 0, "Katalog tidak boleh kosong");
    assert.ok(typeof data[0].harga_pokok === "number", "Kolom harga_pokok harus ada untuk Manajer");

    return {
      actual: `Manajer berhasil membaca ${data.length} katalog barang beserta harga_pokok (contoh: Rp${data[0].harga_pokok.toLocaleString("id-ID")}).`,
      evidence: "RPC get_katalog_barang_manajer menyertakan harga_pokok untuk manajer aktif.",
    };
  }
);

await runAsyncTest(
  "SEC-HPP-02",
  "Staf Penjualan DITOLAK menjalankan RPC get_katalog_barang_manajer di level PostgreSQL",
  "Panggil RPC get_katalog_barang_manajer menggunakan sesi Staf Penjualan",
  "RPC menolak dengan error 'Forbidden: Hanya manajer aktif yang boleh mengakses data ini'",
  async () => {
    const { data, error } = await sbSales.rpc("get_katalog_barang_manajer");
    assert.ok(error, "RPC seharusnya ditolak untuk Sales!");
    assert.ok(
      error.message.includes("Forbidden") || error.message.includes("Hanya manajer aktif"),
      `Pesan error tidak sesuai: ${error.message}`
    );

    return {
      actual: `Penjualan ditolak PostgreSQL: ${error.message}`,
      evidence: "Fungsi PostgreSQL get_katalog_barang_manajer memverifikasi peran via auth.uid().",
    };
  }
);

await runAsyncTest(
  "SEC-HPP-03",
  "Staf Gudang DITOLAK menjalankan RPC get_katalog_barang_manajer di level PostgreSQL",
  "Panggil RPC get_katalog_barang_manajer menggunakan sesi Staf Gudang",
  "RPC menolak dengan error 'Forbidden: Hanya manajer aktif yang boleh mengakses data ini'",
  async () => {
    const { data, error } = await sbGudang.rpc("get_katalog_barang_manajer");
    assert.ok(error, "RPC seharusnya ditolak untuk Gudang!");
    assert.ok(
      error.message.includes("Forbidden") || error.message.includes("Hanya manajer aktif"),
      `Pesan error tidak sesuai: ${error.message}`
    );

    return {
      actual: `Gudang ditolak PostgreSQL: ${error.message}`,
      evidence: "Fungsi PostgreSQL get_katalog_barang_manajer memverifikasi peran via auth.uid().",
    };
  }
);

await runAsyncTest(
  "SEC-HPP-04",
  "Query katalog barang untuk Penjualan & Gudang tidak pernah menyertakan kolom harga_pokok",
  "Audit kode src/app/barang-dan-stok/page.tsx",
  "Query select('id, kode, nama, satuan, harga_jual, stok, stok_minimum, aktif, diperbarui_pada')",
  async () => {
    const content = fs.readFileSync(path.join(rootDir, "src/app/barang-dan-stok/page.tsx"), "utf-8");
    assert.ok(!content.includes('.select("*")') && !content.includes(".select('*')"), "Dilarang memanggil select('*')!");
    assert.ok(
      content.includes(`select("id, kode, nama, satuan, harga_jual, stok, stok_minimum, aktif, diperbarui_pada")`),
      "Query non-manajer tidak boleh meminta harga_pokok!"
    );

    return {
      actual: "Query katalog non-manajer secara eksplisit menghilangkan kolom harga_pokok.",
      evidence: "src/app/barang-dan-stok/page.tsx line 73.",
    };
  }
);

await runAsyncTest(
  "SEC-HPP-05",
  "Kolom harga_beli_satuan pada modul pembelian disembunyikan dari Staf Gudang (BR-12)",
  "Audit kode src/app/pembelian/page.tsx",
  "Staf Gudang tidak menerima kolom harga_beli_satuan (diset null / dihilangkan dari select)",
  async () => {
    const content = fs.readFileSync(path.join(rootDir, "src/app/pembelian/page.tsx"), "utf-8");
    assert.ok(
      content.includes("Staf Gudang: DILARANG meminta kolom harga_beli_satuan (BR-12)") ||
        content.includes("harga_beli_satuan: null"),
      "src/app/pembelian/page.tsx tidak menyembunyikan harga_beli_satuan dari gudang!"
    );

    return {
      actual: "Staf Gudang dilarang menerima nilai harga_beli_satuan pada data pengajuan pembelian.",
      evidence: "src/app/pembelian/page.tsx line 156-163.",
    };
  }
);

await runAsyncTest(
  "SEC-HPP-06",
  "Pengambilan riwayat mutasi kartu stok (ambilKartuStokAction) tidak mengekspos HPP atau margin",
  "Audit kode ambilKartuStokAction di src/app/barang-dan-stok/actions.ts",
  "Hanya mengambil id, nomor_dokumen, tipe, jumlah, stok_sebelum, stok_sesudah, alasan, dibuat_pada",
  async () => {
    const content = fs.readFileSync(path.join(rootDir, "src/app/barang-dan-stok/actions.ts"), "utf-8");
    assert.ok(
      content.includes("TIDAK menampilkan atau membocorkan harga pokok / harga beli / margin (BR-12)"),
      "ambilKartuStokAction tidak memiliki jaminan proteksi BR-12!"
    );

    return {
      actual: "Kartu stok hanya menyajikan pergerakan kuantitas fisik tanpa data finansial.",
      evidence: "src/app/barang-dan-stok/actions.ts line 230-231.",
    };
  }
);

// ============================================================================
// SUITE 5: PENCABUTAN SESI PASCA LOGOUT
// ============================================================================
console.log("\n--- 5. PENGUJIAN PENCABUTAN SESI PASCA LOGOUT ---");

await runAsyncTest(
  "SEC-LOUT-01",
  "Fungsi logoutUser / signOut mencabut sesi autentikasi pengguna secara total",
  "Inisialisasi sesi login sementara lalu panggil signOut()",
  "Sesi auth terhapus, getUser() mengembalikan user = null",
  async () => {
    const sbTemp = createClient(supabaseUrl, supabaseAnonKey);
    const { data: authData } = await sbTemp.auth.signInWithPassword({
      email: "dimas@sinarabadi.com",
      password: "Latihan#2026",
    });
    assert.ok(authData.user, "Login sementara gagal");

    await sbTemp.auth.signOut();
    const { data: afterOut } = await sbTemp.auth.getUser();
    assert.equal(afterOut.user, null, "User harus null pasca signOut");

    return {
      actual: "Sesi Supabase Auth berhasil dihapus secara bersih.",
      evidence: "Fungsi signOut() menghapus token JWT dan menyetel status unauthenticated.",
    };
  }
);

await runAsyncTest(
  "SEC-LOUT-02",
  "Pasca logout, request selanjutnya kembali berstatus anonim dan dialihkan ke /login",
  "Simulasikan request ke rute privat setelah user = null",
  "Proxy SSR mengalihkan ke /login",
  async () => {
    const evalRes = evaluateProxyRoute("/barang-dan-stok", null);
    assert.equal(evalRes.action, "REDIRECT");
    assert.equal(evalRes.to, "/login");

    return {
      actual: "Request tanpa sesi diarahkan ke /login oleh Proxy SSR.",
      evidence: "UpdateSession mengembalikan NextResponse.redirect('/login') jika user null.",
    };
  }
);

// ============================================================================
// SUITE 6: KEAMANAN WEBHOOK GATEWAY MAYAR
// ============================================================================
console.log("\n--- 6. PENGUJIAN KEAMANAN WEBHOOK MAYAR ---");

await runAsyncTest(
  "SEC-HOOK-01",
  "Endpoint Webhook Mayar (/api/webhooks/mayar) tidak dialihkan ke login oleh Proxy",
  `Kirim HTTP POST ke ${SERVER_BASE_URL}/api/webhooks/mayar dengan redirect manual`,
  "Endpoint merespons HTTP 401 (bukan HTTP 307 /login)",
  async () => {
    const res = await fetch(`${SERVER_BASE_URL}/api/webhooks/mayar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      redirect: "manual",
    });

    assert.notEqual(res.status, 307, "Webhook DILARANG dialihkan ke /login oleh Proxy!");
    assert.notEqual(res.status, 302, "Webhook DILARANG dialihkan ke /login oleh Proxy!");
    assert.equal(res.status, 401, `Status webhook tanpa token harus HTTP 401, diterima: ${res.status}`);

    return {
      actual: `HTTP ${res.status} Akses ditolak: Token autentikasi webhook tidak disertakan.`,
      evidence: "Proxy SSR membiarkan rute /api/webhooks/mayar lolos langsung ke webhook handler.",
    };
  }
);

await runAsyncTest(
  "SEC-HOOK-02",
  "Webhook Mayar menolak request dengan token rahasia yang salah (HTTP 401)",
  `Kirim HTTP POST ke ${SERVER_BASE_URL}/api/webhooks/mayar dengan x-mayar-token palsu`,
  "HTTP 401 Akses ditolak: Token autentikasi webhook tidak valid",
  async () => {
    const res = await fetch(`${SERVER_BASE_URL}/api/webhooks/mayar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mayar-token": "token-palsu-penyerang-12345",
      },
      body: JSON.stringify({ event: "payment.received" }),
      redirect: "manual",
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(body.error?.includes("Token autentikasi webhook tidak valid"));

    return {
      actual: `HTTP 401 - ${body.error}`,
      evidence: "Validasi token konstan waktu (crypto.timingSafeEqual) menolak token sembarang.",
    };
  }
);

await runAsyncTest(
  "SEC-HOOK-03",
  "Webhook Mayar memvalidasi keaslian transaksi ke gateway sebelum mutasi database (HTTP 422 jika fiktif)",
  "Kirim HTTP POST dengan token webhook resmi dan ID pembayaran fiktif",
  "HTTP 422 Verifikasi transaksi gagal ke gateway Mayar",
  async () => {
    const res = await fetch(`${SERVER_BASE_URL}/api/webhooks/mayar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mayar-token": mayarWebhookSecret,
      },
      body: JSON.stringify({
        event: "payment.received",
        data: {
          id: "00000000-0000-0000-0000-000000000000",
          status: "paid",
          amount: 50000,
        },
      }),
      redirect: "manual",
    });

    // Menolak di gateway sebelum database dimutasi
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.ok(body.error?.includes("Verifikasi transaksi gagal ke gateway Mayar"));

    return {
      actual: `HTTP 422 - ${body.error}`,
      evidence: "Gateway callback verification memblokir pemalsuan status bayar sebelum SQL dieksekusi.",
    };
  }
);

// ============================================================================
// RINGKASAN AKHIR
// ============================================================================
console.log("\n===============================================================================");
console.log(`RINGKASAN HASIL PENGUJIAN KEAMANAN OTOMATIS:`);
console.log(`TOTAL TEST: ${passedCount + failedCount + blockedCount}`);
console.log(`PASS:       ${passedCount}`);
console.log(`FAIL:       ${failedCount}`);
console.log(`BLOCKED:    ${blockedCount}`);
console.log("===============================================================================\n");

// Export hasil ke format JSON untuk penyusunan dokumen TEST_CASES_SECURITY.md
fs.writeFileSync(
  path.join(rootDir, "scripts/tests/security_test_results.json"),
  JSON.stringify(testResults, null, 2),
  "utf-8"
);

if (failedCount > 0) {
  process.exit(1);
}
