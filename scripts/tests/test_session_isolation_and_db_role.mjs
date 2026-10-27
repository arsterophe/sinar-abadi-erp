/**
 * Automated Test Suite: Investigasi & Validasi Isolasi Sesi Multi-Peran & Otorisasi Database
 * Sinar Abadi ERP - CV Sinar Abadi Niaga
 *
 * Menguji:
 * 1. Otorisasi server selalu terikat pada token sesi di cookie + profil DB (bukan UI state).
 * 2. Simulasi fenomena Cookie Jar bersama (Single Browser Profile session overwrite).
 * 3. Simulasi isolasi sesi multi-profil (3 sesi independen berjalan simultan).
 * 4. Kebal terhadap manipulasi peran di sisi UI pada Server Action dan Server Component.
 */

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const envPath = path.join(rootDir, ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");

const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim() || "";
const supabaseAnonKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim() || "";
const supabaseServiceKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || "";

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.error("Kredensial Supabase tidak lengkap di .env.local");
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("===============================================================================");
console.log("PENGUJIAN OTOMATIS: ISOLASI SESI MULTI-PERAN & OTORISASI DATABASE");
console.log("Supabase Host:", supabaseUrl);
console.log("===============================================================================\n");

let passed = 0;
let failed = 0;

function report(code, title, status, detail = "") {
  if (status === "PASS") {
    console.log(`[V] PASS | ${code}: ${title}`);
    passed++;
  } else {
    console.error(`[X] FAIL | ${code}: ${title}`);
    if (detail) console.error(`    Detail: ${detail}`);
    failed++;
  }
}

// Helper: Buat isolated client per user (mensimulasikan browser profile terpisah)
async function createIsolatedUserSession(email) {
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    throw new Error(`Gagal generate link untuk ${email}: ${linkErr?.message}`);
  }

  // Tiap client memiliki in-memory storage terpisah (mensimulasikan profil browser terpisah)
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
    },
  });

  const { data: verifyData, error: verifyErr } = await client.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });
  if (verifyErr || !verifyData.session) {
    throw new Error(`Gagal verifikasi sesi untuk ${email}: ${verifyErr?.message}`);
  }

  return {
    client,
    session: verifyData.session,
    user: verifyData.user,
  };
}

async function run() {
  // ---------------------------------------------------------------------------
  // 1. VERIFIKASI AKUN 3 JENDELA DI DATABASE
  // ---------------------------------------------------------------------------
  console.log("--- 1. AUDIT PROFIL DAN PERAN AKTUAL 3 AKUN PENGGUNA ---");

  // Akun 1: alen@sinarabadi.com
  const { data: pAlen } = await adminClient
    .from("profiles")
    .select("id, nama_lengkap, peran, aktif")
    .eq("id", "7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc")
    .single();
  assert.equal(pAlen.peran, "manajer", "Alen wajib berstatus manajer");
  assert.equal(pAlen.aktif, true, "Alen wajib aktif");
  report("ACC-01", `Akun 1: ${pAlen.nama_lengkap} (alen@sinarabadi.com) -> Peran DB: ${pAlen.peran}`, "PASS");

  // Akun 2: jeonghan@sinarabadi.com
  const { data: pJeonghan } = await adminClient
    .from("profiles")
    .select("id, nama_lengkap, peran, aktif")
    .eq("id", "c6bf5e70-7620-4434-b58e-d3123b2d4e91")
    .single();
  assert.equal(pJeonghan.peran, "penjualan", "Jeonghan wajib berstatus penjualan");
  assert.equal(pJeonghan.aktif, true, "Jeonghan wajib aktif");
  report("ACC-02", `Akun 2: ${pJeonghan.nama_lengkap} (jeonghan@sinarabadi.com) -> Peran DB: ${pJeonghan.peran}`, "PASS");

  // Akun 3: wonwoo@sinarabadi.com
  const { data: pWonwoo } = await adminClient
    .from("profiles")
    .select("id, nama_lengkap, peran, aktif")
    .eq("id", "551b03db-5f3e-435b-b1ce-059ebefc712b")
    .single();
  assert.equal(pWonwoo.peran, "gudang", "Wonwoo/Joko wajib berstatus gudang");
  assert.equal(pWonwoo.aktif, true, "Wonwoo/Joko wajib aktif");
  report("ACC-03", `Akun 3: ${pWonwoo.nama_lengkap} (wonwoo@sinarabadi.com) -> Peran DB: ${pWonwoo.peran}`, "PASS");

  // ---------------------------------------------------------------------------
  // 2. SIMULASI SINGLE BROWSER PROFILE (SESI TERTINDIH KARENA COOKIE BERSAMA)
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. SIMULASI KETERBATASAN SINGLE BROWSER PROFILE (SHARED COOKIE JAR) ---");

  // Ketika pengguna membuka 3 jendela dalam 1 profil browser Chrome yang sama,
  // semua jendela berbagi 1 storage cookie bersama untuk origin localhost:3000.
  // Simulasi: Client tunggal merepresentasikan storage browser yang sama.
  const sharedBrowserStorageClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true },
  });

  // Jendela 1: Login Alen (Manajer)
  const linkAlen = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: "alen@sinarabadi.com",
  });
  await sharedBrowserStorageClient.auth.verifyOtp({
    token_hash: linkAlen.data.properties.hashed_token,
    type: "email",
  });

  const { data: state1 } = await sharedBrowserStorageClient.auth.getUser();
  assert.equal(state1.user.email, "alen@sinarabadi.com");
  report("SIM-01", "Jendela 1 login: Cookie jar memegang sesi Alen (Manajer)", "PASS");

  // Jendela 2 dibuka di profil browser yang sama: Login Jeonghan (Penjualan)
  // Ini otomatis menimpa cookie auth di cookie jar browser!
  const linkJeonghan = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: "jeonghan@sinarabadi.com",
  });
  await sharedBrowserStorageClient.auth.verifyOtp({
    token_hash: linkJeonghan.data.properties.hashed_token,
    type: "email",
  });

  // Sekarang, apa yang terjadi pada Jendela 1 saat me-refresh?
  // Jendela 1 membaca cookie jar bersama yang sudah ditimpa oleh Jendela 2!
  const { data: state2 } = await sharedBrowserStorageClient.auth.getUser();
  assert.equal(
    state2.user.email,
    "jeonghan@sinarabadi.com",
    "Cookie jar bersama terbukti menimpa sesi Alen menjadi Jeonghan!"
  );
  report("SIM-02", "Jendela 2 login: Cookie jar tertimpa menjadi Jeonghan (Window 1 ikut berubah menjadi Penjualan)", "PASS");

  // Jendela 3 dibuka di profil browser yang sama: Login Wonwoo (Gudang)
  const linkWonwoo = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: "wonwoo@sinarabadi.com",
  });
  await sharedBrowserStorageClient.auth.verifyOtp({
    token_hash: linkWonwoo.data.properties.hashed_token,
    type: "email",
  });

  // Ketiga jendela sekarang memegang sesi Wonwoo (Gudang)!
  const { data: state3 } = await sharedBrowserStorageClient.auth.getUser();
  assert.equal(
    state3.user.email,
    "wonwoo@sinarabadi.com",
    "Cookie jar bersama terbukti menimpa sesi menjadi Wonwoo!"
  );
  report("SIM-03", "Jendela 3 login: Cookie jar tertimpa menjadi Wonwoo (Semua jendela menjadi Gudang)", "PASS");

  // ---------------------------------------------------------------------------
  // 3. VALIDASI MULTI-PROFILE ISOLATION (SOLUSI RESMI & BENAR)
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. PENGUJIAN SOLUSI RESMI: ISOLASI SESI DENGAN 3 KONTEKS TERPISAH ---");

  // Dengan menggunakan profil browser terpisah (atau Chrome Profile 1, Incognito, dan Edge),
  // masing-masing jendela memiliki storage cookie terisolasi.
  const sessionAlen = await createIsolatedUserSession("alen@sinarabadi.com");
  const sessionJeonghan = await createIsolatedUserSession("jeonghan@sinarabadi.com");
  const sessionWonwoo = await createIsolatedUserSession("wonwoo@sinarabadi.com");

  // Verifikasi Jendela 1 (Alen)
  const { data: u1 } = await sessionAlen.client.auth.getUser();
  assert.equal(u1.user.email, "alen@sinarabadi.com");
  const { data: prof1 } = await sessionAlen.client
    .from("profiles")
    .select("peran")
    .eq("id", u1.user.id)
    .single();
  assert.equal(prof1.peran, "manajer");
  report("ISO-01", "Konteks 1 (Profil Manajer): Tetap stabil sebagai Alen / Manajer", "PASS");

  // Verifikasi Jendela 2 (Jeonghan)
  const { data: u2 } = await sessionJeonghan.client.auth.getUser();
  assert.equal(u2.user.email, "jeonghan@sinarabadi.com");
  const { data: prof2 } = await sessionJeonghan.client
    .from("profiles")
    .select("peran")
    .eq("id", u2.user.id)
    .single();
  assert.equal(prof2.peran, "penjualan");
  report("ISO-02", "Konteks 2 (Profil Penjualan): Tetap stabil sebagai Jeonghan / Penjualan", "PASS");

  // Verifikasi Jendela 3 (Wonwoo)
  const { data: u3 } = await sessionWonwoo.client.auth.getUser();
  assert.equal(u3.user.email, "wonwoo@sinarabadi.com");
  const { data: prof3 } = await sessionWonwoo.client
    .from("profiles")
    .select("peran")
    .eq("id", u3.user.id)
    .single();
  assert.equal(prof3.peran, "gudang");
  report("ISO-03", "Konteks 3 (Profil Gudang): Tetap stabil sebagai Wonwoo / Gudang", "PASS");

  // Uji Simultan: Lakukan query paralel dari ketiga sesi bersamaan
  const [resAlen, resJeonghan, resWonwoo] = await Promise.all([
    sessionAlen.client.from("profiles").select("nama_lengkap, peran").eq("id", u1.user.id).single(),
    sessionJeonghan.client.from("profiles").select("nama_lengkap, peran").eq("id", u2.user.id).single(),
    sessionWonwoo.client.from("profiles").select("nama_lengkap, peran").eq("id", u3.user.id).single(),
  ]);

  assert.equal(resAlen.data.peran, "manajer");
  assert.equal(resJeonghan.data.peran, "penjualan");
  assert.equal(resWonwoo.data.peran, "gudang");
  report("ISO-04", "Eksekusi Simultan: 3 sesi independen berjalan bersamaan tanpa saling menimpa", "PASS");

  // ---------------------------------------------------------------------------
  // 4. OTORISASI DATABASE TIDAK DAPAT DIPALSUKAN OLEH PILIHAN PERAN DI UI
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. PENGUJIAN KETAHANAN OTORISASI SERVER DARI MANIPULASI UI ---");

  // Memastikan bahwa otorisasi Server Components & Server Actions SELALU membaca
  // profil dari public.profiles di database, bukan dari input / state client.
  const codeServer = fs.readFileSync(path.join(rootDir, "src/lib/supabase/server.ts"), "utf-8");
  assert.ok(codeServer.includes("await cookies()"), "server.ts wajib membaca cookie sesi resmi");
  report("SEC-01", "Server client membaca cookie sesi terenkripsi (await cookies())", "PASS");

  const codeHome = fs.readFileSync(path.join(rootDir, "src/app/page.tsx"), "utf-8");
  assert.ok(codeHome.includes('eq("id", user.id)'), "page.tsx mengambil peran dari tabel profiles");
  assert.ok(codeHome.includes("profile.peran === \"manajer\""), "page.tsx memverifikasi peran database");
  report("SEC-02", "Dashboard Server Component memverifikasi peran riil database dari user.id", "PASS");

  // Validasi: Staf Penjualan (Jeonghan) DITOLAK memanggil fungsi database manajerial
  // meskipun di UI mencoba switch tampilan
  const { error: rpcErrSales } = await sessionJeonghan.client.rpc("get_katalog_barang_manajer");
  assert.ok(rpcErrSales, "Database PostgreSQL wajib menolak RPC manajer untuk staf penjualan");
  report("SEC-03", "RPC PostgreSQL get_katalog_barang_manajer menolak staf penjualan (P0001)", "PASS");

  // Validasi: Staf Gudang (Wonwoo) DITOLAK memanggil fungsi database manajerial
  const { error: rpcErrGudang } = await sessionWonwoo.client.rpc("get_katalog_barang_manajer");
  assert.ok(rpcErrGudang, "Database PostgreSQL wajib menolak RPC manajer untuk staf gudang");
  report("SEC-04", "RPC PostgreSQL get_katalog_barang_manajer menolak staf gudang (P0001)", "PASS");

  console.log("\n===============================================================================");
  console.log(`RINGKASAN UJI ISOLASI SESI & OTORISASI: ${passed}/${passed + failed} LULUS`);
  console.log("===============================================================================\n");

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
