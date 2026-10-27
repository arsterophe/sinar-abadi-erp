/**
 * Unit Test Isolasi Proteksi Sesi Proxy Next.js 16 (Offline / In-Memory)
 * Memverifikasi konsistensi pencocokan rute privat, publik, webhook, dan redirect login.
 */

import assert from "node:assert/strict";

console.log("===============================================================================");
console.log("MEMULAI UNIT TEST PROTEKSI SESI PROXY (OFFLINE / IN-MEMORY)");
console.log("===============================================================================\n");

let passedCount = 0;
let failedCount = 0;

function runTest(testName, testFn) {
  try {
    testFn();
    console.log(`[V] LULUS | ${testName}`);
    passedCount++;
  } catch (error) {
    console.error(`[X] GAGAL | ${testName}`);
    console.error(`    Pesan: ${error.message}\n`);
    failedCount++;
  }
}

// Simulasi logika matcher dan rute updateSession dari src/lib/supabase/proxy.ts
function evaluateProxyRoute(path, user = null) {
  const isLoginRoute = path.startsWith("/login");

  const isPrivateRoute =
    path === "/" ||
    path.startsWith("/barang-dan-stok") ||
    path.startsWith("/radar-stok") ||
    path.startsWith("/pelanggan") ||
    path.startsWith("/pesanan-jual") ||
    path.startsWith("/pembelian") ||
    path.startsWith("/laporan") ||
    path.startsWith("/pengaturan");

  if (isPrivateRoute && !user) {
    return { action: "REDIRECT", to: "/login" };
  }

  if (isLoginRoute && user) {
    return { action: "REDIRECT", to: "/" };
  }

  return { action: "NEXT" };
}

// 1. Uji Rute Privat Tanpa Autentikasi (Wajib Redirect ke /login)
const PRIVATE_PATHS = [
  "/",
  "/barang-dan-stok",
  "/barang-dan-stok/tambah",
  "/radar-stok",
  "/pelanggan",
  "/pelanggan/detail",
  "/pesanan-jual",
  "/pesanan-jual/PJ-20261026-001",
  "/pembelian",
  "/pembelian/tambah",
  "/laporan",
  "/pengaturan",
  "/pengaturan/pengguna",
];

for (const p of PRIVATE_PATHS) {
  runTest(`1. Proteksi Anonim: Rute privat '${p}' mengarahkan ke /login`, () => {
    const res = evaluateProxyRoute(p, null);
    assert.equal(res.action, "REDIRECT");
    assert.equal(res.to, "/login");
  });
}

// 2. Uji Rute Publik Tanpa Autentikasi (DILARANG Redirect ke /login)
const PUBLIC_PATHS = [
  "/login",
  "/login?error=account_inactive",
  "/api/webhooks/mayar",
];

for (const p of PUBLIC_PATHS) {
  runTest(`2. Akses Publik: Rute '${p}' tidak diblokir tanpa login`, () => {
    const res = evaluateProxyRoute(p, null);
    assert.equal(res.action, "NEXT");
  });
}

// 3. Uji Rute Login Saat Pengguna Sudah Terautentikasi (Wajib Redirect ke Dashboard /)
runTest("3. Redirect Autentikasi: Pengguna aktif di /login dialihkan ke dashboard /", () => {
  const mockUser = { id: "user-123", email: "manager@sinarabadi.com" };
  const res = evaluateProxyRoute("/login", mockUser);
  assert.equal(res.action, "REDIRECT");
  assert.equal(res.to, "/");
});

// 4. Uji Rute Privat Saat Pengguna Sudah Terautentikasi (Diteruskan ke Server Component)
for (const p of PRIVATE_PATHS) {
  runTest(`4. Akses Sah: Pengguna login pada '${p}' diteruskan (NEXT) ke Server Component`, () => {
    const mockUser = { id: "user-123", email: "user@sinarabadi.com" };
    const res = evaluateProxyRoute(p, mockUser);
    assert.equal(res.action, "NEXT");
  });
}

// 5. Uji Webhook Tetap Diteruskan Saat Ada Sesi Maupun Tanpa Sesi
runTest("5. Integritas Webhook: Webhook Mayar diteruskan tanpa gangguan sesi", () => {
  const resAnon = evaluateProxyRoute("/api/webhooks/mayar", null);
  assert.equal(resAnon.action, "NEXT");

  const resAuth = evaluateProxyRoute("/api/webhooks/mayar", { id: "user-123" });
  assert.equal(resAuth.action, "NEXT");
});

console.log("\n===============================================================================");
console.log(`RINGKASAN UNIT TEST PROXY: ${passedCount}/${passedCount + failedCount} LULUS (${((passedCount / (passedCount + failedCount)) * 100).toFixed(0)}%)`);
console.log("===============================================================================\n");

if (failedCount > 0) {
  process.exit(1);
}
