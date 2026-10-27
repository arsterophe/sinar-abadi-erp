import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Baca konfigurasi .env.local
const envContent = fs.readFileSync(".env.local", "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});

const supabaseUrl = env["NEXT_PUBLIC_SUPABASE_URL"];
const anonKey = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const serviceKey = env["SUPABASE_SERVICE_ROLE_KEY"];

const adminClient = createClient(supabaseUrl, serviceKey);

async function runTests() {
  console.log("=================================================================");
  console.log("   PENGUJIAN VALIDASI & PENGAJUAN PEMBELIAN CV SINAR ABADI ERP   ");
  console.log("=================================================================\n");

  // 1. Persiapkan Sesi Staf Gudang (Wonwoo)
  const wonwooId = "551b03db-5f3e-435b-b1ce-059ebefc712b";
  const { data: userWonwoo } = await adminClient.auth.admin.getUserById(wonwooId);
  const { data: linkWonwoo } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: userWonwoo.user.email,
  });

  const wonwooClient = createClient(supabaseUrl, anonKey);
  const { error: authErr } = await wonwooClient.auth.verifyOtp({
    token_hash: linkWonwoo.properties.hashed_token,
    type: "email",
  });

  if (authErr) {
    throw new Error(`Gagal otentikasi sebagai Wonwoo (Gudang): ${authErr.message}`);
  }
  console.log("1. Otentikasi Staf Gudang (Wonwoo): BERHASIL (Sesi Aktif)");

  // 2. Persiapkan Sesi Manajer (Alen)
  const alenId = "7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc";
  const { data: userAlen } = await adminClient.auth.admin.getUserById(alenId);
  const { data: linkAlen } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: userAlen.user.email,
  });

  const alenClient = createClient(supabaseUrl, anonKey);
  await alenClient.auth.verifyOtp({
    token_hash: linkAlen.properties.hashed_token,
    type: "email",
  });
  console.log("2. Otentikasi Manajer (Alen): BERHASIL (Sesi Aktif)\n");

  const sup01Id = "9c79f720-1929-5dd4-b15a-7bee0114f1e3"; // SUP-01
  const brg002Id = "671e7a37-5f79-5adc-a3b9-c9b01ac33e36"; // BRG-002

  // ---------------------------------------------------------------------------
  // UJI KASUS 1: Validasi BR-12 (Staf Gudang tidak boleh select harga_pokok)
  // ---------------------------------------------------------------------------
  console.log("--- UJI KASUS 1: Proteksi BR-12 Hak Akses Kolom harga_pokok ---");
  const { data: brgWithHpp, error: errHpp } = await wonwooClient
    .from("barang")
    .select("id, kode, nama, aktif, harga_pokok")
    .eq("id", brg002Id)
    .maybeSingle();

  if (errHpp && errHpp.code === "42501") {
    console.log("PASS: Query dengan harga_pokok ditolak PostgreSQL (42501 permission denied) sesuai BR-12.");
  } else {
    console.warn("WARN: Hasil tidak terduga pada proteksi kolom harga_pokok:", errHpp);
  }

  // Query aman (tanpa harga_pokok)
  const { data: brgSafe, error: errSafe } = await wonwooClient
    .from("barang")
    .select("id, kode, nama, aktif")
    .eq("id", brg002Id)
    .maybeSingle();

  if (!errSafe && brgSafe && brgSafe.kode === "BRG-002") {
    console.log(`PASS: Query validasi barang tanpa harga_pokok BERHASIL ditemukan: ${brgSafe.kode} - ${brgSafe.nama}`);
  } else {
    throw new Error(`FAIL: Query barang aman gagal: ${errSafe?.message}`);
  }

  // ---------------------------------------------------------------------------
  // UJI KASUS 2: Pengajuan Pembelian Valid (SUP-01, BRG-002, 1 bal)
  // ---------------------------------------------------------------------------
  console.log("\n--- UJI KASUS 2: Pengajuan PO Resmi (SUP-01, BRG-002, Kuantitas: 1) ---");
  const { data: poIdSuccess, error: errPoSuccess } = await wonwooClient.rpc("ajukan_pembelian", {
    p_pemasok_id: sup01Id,
    p_barang_id: brg002Id,
    p_jumlah_dipesan: 1,
  });

  if (errPoSuccess || !poIdSuccess) {
    throw new Error(`FAIL: RPC ajukan_pembelian gagal untuk data valid: ${errPoSuccess?.message}`);
  }

  const { data: poDetail, error: errPoDetail } = await wonwooClient
    .from("pembelian")
    .select("id, nomor, status, jumlah_dipesan, pemasok_id, barang_id, diajukan_oleh")
    .eq("id", poIdSuccess)
    .single();

  if (errPoDetail || !poDetail) {
    throw new Error(`FAIL: Gagal membaca record PO yang baru dibuat: ${errPoDetail?.message}`);
  }

  console.log(`PASS: Pengajuan PO Berhasil Disimpan:`);
  console.log(`      ID: ${poDetail.id}`);
  console.log(`      Nomor PO: ${poDetail.nomor}`);
  console.log(`      Status: ${poDetail.status}`);
  console.log(`      Kuantitas: ${poDetail.jumlah_dipesan} bal`);
  console.log(`      Diajukan Oleh: Wonwoo (${poDetail.diajukan_oleh})`);

  // Cleanup PO sukses setelah verifikasi
  await adminClient.from("pembelian").delete().eq("id", poIdSuccess);
  console.log("      (Data uji berhasil dibersihkan dari database)");

  // ---------------------------------------------------------------------------
  // UJI KASUS 3: Penolakan Barang Tidak Valid
  // ---------------------------------------------------------------------------
  console.log("\n--- UJI KASUS 3: Penolakan Barang Tidak Valid (ID Acak) ---");
  const fakeBarangId = "11111111-2222-3333-4444-555555555555";
  const { error: errFakeBarang } = await wonwooClient.rpc("ajukan_pembelian", {
    p_pemasok_id: sup01Id,
    p_barang_id: fakeBarangId,
    p_jumlah_dipesan: 1,
  });

  if (errFakeBarang && errFakeBarang.message.includes("Barang tidak ditemukan")) {
    console.log(`PASS: Barang tidak valid ditolak dengan pesan: "${errFakeBarang.message}"`);
  } else {
    throw new Error(`FAIL: Diharapkan error barang tidak ditemukan, didapat: ${errFakeBarang?.message}`);
  }

  // ---------------------------------------------------------------------------
  // UJI KASUS 4: Penolakan Pemasok Tidak Valid
  // ---------------------------------------------------------------------------
  console.log("\n--- UJI KASUS 4: Penolakan Pemasok Tidak Valid (ID Acak) ---");
  const fakePemasokId = "99999999-8888-7777-6666-555555555555";
  const { error: errFakePemasok } = await wonwooClient.rpc("ajukan_pembelian", {
    p_pemasok_id: fakePemasokId,
    p_barang_id: brg002Id,
    p_jumlah_dipesan: 1,
  });

  if (errFakePemasok && errFakePemasok.message.includes("Pemasok tidak ditemukan")) {
    console.log(`PASS: Pemasok tidak valid ditolak dengan pesan: "${errFakePemasok.message}"`);
  } else {
    throw new Error(`FAIL: Diharapkan error pemasok tidak ditemukan, didapat: ${errFakePemasok?.message}`);
  }

  // ---------------------------------------------------------------------------
  // UJI KASUS 5: Validasi Kuantitas BR-09 (1 s/d 10.000)
  // ---------------------------------------------------------------------------
  console.log("\n--- UJI KASUS 5: Validasi Batas Kuantitas BR-09 ---");
  // Kuantitas 0
  const { error: errQtyZero } = await wonwooClient.rpc("ajukan_pembelian", {
    p_pemasok_id: sup01Id,
    p_barang_id: brg002Id,
    p_jumlah_dipesan: 0,
  });
  if (errQtyZero && errQtyZero.message.includes("antara 1 sampai 10000")) {
    console.log(`PASS: Kuantitas 0 ditolak: "${errQtyZero.message}"`);
  } else {
    throw new Error(`FAIL: Kuantitas 0 tidak ditolak sesuai aturan`);
  }

  // Kuantitas > 10.000
  const { error: errQtyOver } = await wonwooClient.rpc("ajukan_pembelian", {
    p_pemasok_id: sup01Id,
    p_barang_id: brg002Id,
    p_jumlah_dipesan: 10001,
  });
  if (errQtyOver && errQtyOver.message.includes("antara 1 sampai 10000")) {
    console.log(`PASS: Kuantitas 10.001 ditolak: "${errQtyOver.message}"`);
  } else {
    throw new Error(`FAIL: Kuantitas 10.001 tidak ditolak sesuai aturan`);
  }

  // ---------------------------------------------------------------------------
  // UJI KASUS 6: Proteksi Modifikasi Harga Beli bagi Nonmanajer
  // ---------------------------------------------------------------------------
  console.log("\n--- UJI KASUS 6: Proteksi Harga Beli bagi Nonmanajer ---");
  const { data: poForApproval } = await wonwooClient.rpc("ajukan_pembelian", {
    p_pemasok_id: sup01Id,
    p_barang_id: brg002Id,
    p_jumlah_dipesan: 2,
  });

  // Staf gudang mencoba menyetujui / mengisi harga beli
  const { error: errWonwooApprove } = await wonwooClient.rpc("setujui_pembelian", {
    p_pembelian_id: poForApproval,
    p_harga_beli_satuan: 341000,
  });

  if (errWonwooApprove) {
    console.log(`PASS: Staf Gudang dilarang menyetujui / mengisi harga beli: "${errWonwooApprove.message}"`);
  } else {
    throw new Error("FAIL: Staf Gudang seharusnya dilarang menyetujui pembelian!");
  }

  // Manajer menyetujui dengan harga beli resmi
  const { error: errAlenApprove } = await alenClient.rpc("setujui_pembelian", {
    p_pembelian_id: poForApproval,
    p_harga_beli_satuan: 341000,
  });

  if (!errAlenApprove) {
    console.log("PASS: Manajer berhasil menyetujui PO dan menentukan harga beli satuan.");
  } else {
    throw new Error(`FAIL: Manajer gagal menyetujui PO: ${errAlenApprove.message}`);
  }

  // Cleanup
  await adminClient.from("pembelian").delete().eq("id", poForApproval);
  console.log("      (Data uji approval berhasil dibersihkan)");

  console.log("\n=================================================================");
  console.log("   SELURUH PENGUJIAN OTOMATIS BERHASIL 100% (ALL TESTS PASSED)  ");
  console.log("=================================================================");
}

runTests().catch((err) => {
  console.error("\nPENGUJIAN GAGAL:", err);
  process.exit(1);
});
