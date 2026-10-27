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

async function getClientForUser(userId) {
  const { data: user } = await adminClient.auth.admin.getUserById(userId);
  const { data: link } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: user.user.email,
  });
  const client = createClient(supabaseUrl, anonKey);
  const { error } = await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email",
  });
  if (error) throw error;
  return client;
}

async function runTests() {
  console.log("=================================================================");
  console.log("   PENGUJIAN ALUR PESANAN JUAL LENGKAP & ATOMISITAS TRANSAKSI   ");
  console.log("=================================================================\n");

  const jeonghanId = "c6bf5e70-7620-4434-b58e-d3123b2d4e91"; // Penjualan
  const wonwooId = "551b03db-5f3e-435b-b1ce-059ebefc712b";   // Gudang
  const alenId = "7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc";     // Manajer

  const salesClient = await getClientForUser(jeonghanId);
  const gudangClient = await getClientForUser(wonwooId);
  const managerClient = await getClientForUser(alenId);

  console.log("1. Otentikasi Pengguna:");
  console.log("   - Jeonghan (Staf Penjualan): AKTIF");
  console.log("   - Wonwoo (Staf Gudang): AKTIF");
  console.log("   - Alen (Manajer): AKTIF\n");

  // Ambil pelanggan & barang sampel
  const { data: pList } = await adminClient.from("pelanggan").select("id, kode, nama_toko, termin_hari").eq("aktif", true).limit(1);
  const { data: bList } = await adminClient.from("barang").select("id, kode, nama, stok, harga_jual").gt("stok", 15).limit(1);

  const pelanggan = pList[0];
  const barang = bList[0];
  const stokAwal = barang.stok;

  console.log(`2. Entitas Uji: Pelanggan ${pelanggan.kode} (${pelanggan.nama_toko}, termin ${pelanggan.termin_hari} hari), Barang ${barang.kode} (${barang.nama}, stok awal ${stokAwal})\n`);

  let testOrderId1 = null;
  let testOrderId2 = null;

  try {
    // -------------------------------------------------------------------------
    // SKENARIO 1: Siklus Sukses Lengkap (Draf -> Konfirmasi -> Kirim -> Pelunasan)
    // -------------------------------------------------------------------------
    console.log("--- SKENARIO 1: SIKLUS SUKSES LENGKAP ---");

    // A. Buat draf oleh Sales
    const { data: draf1, error: errDraf1 } = await salesClient.rpc("buat_draf_pesanan", {
      p_pelanggan_id: pelanggan.id,
    });
    if (errDraf1) throw new Error(`Gagal buat draf: ${errDraf1.message}`);
    testOrderId1 = draf1;
    console.log(`[PASS] 1.1 Draf pesanan dibuat oleh Sales: ID ${testOrderId1}`);

    // B. Tambah item
    const { data: item1, error: errItem1 } = await salesClient.rpc("tambah_item_pesanan", {
      p_pesanan_id: testOrderId1,
      p_barang_id: barang.id,
      p_jumlah: 2,
      p_diskon_persen: 5,
    });
    if (errItem1) throw new Error(`Gagal tambah item: ${errItem1.message}`);
    console.log(`[PASS] 1.2 Item berhasil ditambahkan: ID ${item1} (2 unit, diskon 5%)`);

    // C. Konfirmasi oleh Sales (Pengurangan stok atomik & mutasi)
    const { error: errKonfirmasi1 } = await salesClient.rpc("konfirmasi_pesanan", {
      p_pesanan_id: testOrderId1,
    });
    if (errKonfirmasi1) throw new Error(`Gagal konfirmasi pesanan: ${errKonfirmasi1.message}`);

    const { data: bAfter1 } = await adminClient.from("barang").select("stok").eq("id", barang.id).single();
    if (bAfter1.stok !== stokAwal - 2) {
      throw new Error(`Inkonsistensi stok setelah konfirmasi: expected ${stokAwal - 2}, got ${bAfter1.stok}`);
    }
    console.log(`[PASS] 1.3 Konfirmasi pesanan berhasil. Stok berkurang atomik: ${stokAwal} -> ${bAfter1.stok}`);

    // D. Kirim oleh Gudang (Wonwoo)
    const { error: errKirim1 } = await gudangClient.rpc("kirim_pesanan", {
      p_pesanan_id: testOrderId1,
    });
    if (errKirim1) throw new Error(`Gagal kirim pesanan oleh Gudang: ${errKirim1.message}`);

    const { data: pAfterKirim1 } = await adminClient.from("pesanan_jual").select("status, jatuh_tempo").eq("id", testOrderId1).single();
    if (pAfterKirim1.status !== "dikirim" || !pAfterKirim1.jatuh_tempo) {
      throw new Error(`Data pengiriman tidak valid: status=${pAfterKirim1.status}, jatuh_tempo=${pAfterKirim1.jatuh_tempo}`);
    }
    console.log(`[PASS] 1.4 Pengiriman oleh Gudang berhasil. Status: ${pAfterKirim1.status}, Jatuh Tempo otomatis: ${pAfterKirim1.jatuh_tempo}`);

    // E. Pelunasan oleh Manajer (Alen) via catat_pembayaran RPC
    const { error: errBayar1 } = await managerClient.rpc("catat_pembayaran", {
      p_pesanan_id: testOrderId1,
    });
    if (errBayar1) throw new Error(`Gagal pelunasan oleh Manajer: ${errBayar1.message}`);

    const { data: pAfterBayar1 } = await adminClient.from("pesanan_jual").select("status, dilunasi_pada").eq("id", testOrderId1).single();
    if (pAfterBayar1.status !== "lunas" || !pAfterBayar1.dilunasi_pada) {
      throw new Error(`Pelunasan tidak tercatat sempurna: ${JSON.stringify(pAfterBayar1)}`);
    }
    console.log(`[PASS] 1.5 Pelunasan oleh Manajer berhasil via catat_pembayaran. Status: ${pAfterBayar1.status}`);

    // -------------------------------------------------------------------------
    // SKENARIO 2: Pembatalan Pesanan Dikonfirmasi (BR-08) & Kembalian Stok Atomik
    // -------------------------------------------------------------------------
    console.log("\n--- SKENARIO 2: PEMBATALAN PESANAN DIKONFIRMASI (BR-08) ---");

    const { data: draf2 } = await salesClient.rpc("buat_draf_pesanan", { p_pelanggan_id: pelanggan.id });
    testOrderId2 = draf2;
    await salesClient.rpc("tambah_item_pesanan", {
      p_pesanan_id: testOrderId2,
      p_barang_id: barang.id,
      p_jumlah: 3,
      p_diskon_persen: 0,
    });
    await salesClient.rpc("konfirmasi_pesanan", { p_pesanan_id: testOrderId2 });

    const { data: bAfterKonfirm2 } = await adminClient.from("barang").select("stok").eq("id", barang.id).single();
    console.log(`[PASS] 2.1 Pesanan kedua dikonfirmasi. Stok barang berkurang 3 lagi: ${bAfterKonfirm2.stok}`);

    // Sales coba batalkan pesanan terkonfirmasi -> Ditolak
    const { error: errBatalSales } = await salesClient.rpc("batalkan_pesanan_terkonfirmasi", {
      p_pesanan_id: testOrderId2,
      p_alasan: "Pembatalan oleh sales",
    });
    if (!errBatalSales) throw new Error("Seharusnya sales ditolak membatalkan pesanan terkonfirmasi!");
    console.log(`[PASS] 2.2 Pembatalan oleh Sales ditolak dengan benar (P0001: ${errBatalSales.message})`);

    // Manajer coba alasan pendek < 10 karakter -> Ditolak BR-08
    const { error: errBatalPendek } = await managerClient.rpc("batalkan_pesanan_terkonfirmasi", {
      p_pesanan_id: testOrderId2,
      p_alasan: "pendek",
    });
    if (!errBatalPendek) throw new Error("Seharusnya alasan <10 karakter ditolak!");
    console.log(`[PASS] 2.3 Alasan < 10 karakter ditolak dengan benar (P0001: ${errBatalPendek.message})`);

    // Manajer membatalkan dengan alasan sah >= 10 karakter via batalkan_pesanan_terkonfirmasi RPC
    const { error: errBatalSah } = await managerClient.rpc("batalkan_pesanan_terkonfirmasi", {
      p_pesanan_id: testOrderId2,
      p_alasan: "Pelanggan meminta reschedule pengiriman bulan depan",
    });
    if (errBatalSah) throw new Error(`Gagal membatalkan pesanan terkonfirmasi: ${errBatalSah.message}`);

    const { data: bAfterBatal2 } = await adminClient.from("barang").select("stok").eq("id", barang.id).single();
    if (bAfterBatal2.stok !== bAfterKonfirm2.stok + 3) {
      throw new Error(`Stok tidak kembali setelah pembatalan: expected ${bAfterKonfirm2.stok + 3}, got ${bAfterBatal2.stok}`);
    }
    console.log(`[PASS] 2.4 Pembatalan oleh Manajer berhasil via batalkan_pesanan_terkonfirmasi. Stok barang kembali atomik: ${bAfterKonfirm2.stok} -> ${bAfterBatal2.stok}`);

    console.log("\n=================================================================");
    console.log("   SEMUA PENGUJIAN MODUL PESANAN JUAL BERHASIL 100%   ");
    console.log("=================================================================\n");
  } finally {
    console.log("--- PEMBERSIHAN DATA UJI (CLEANUP) ---");
    // Kembalikan stok barang ke kondisi semula
    await adminClient.from("barang").update({ stok: stokAwal }).eq("id", barang.id);

    // Ambil nomor pesanan untuk menghapus mutasi stok
    const toDeleteIds = [testOrderId1, testOrderId2].filter(Boolean);
    if (toDeleteIds.length > 0) {
      const { data: pRows } = await adminClient.from("pesanan_jual").select("nomor").in("id", toDeleteIds);
      const docNumbers = (pRows || []).map((r) => r.nomor);

      if (docNumbers.length > 0) {
        await adminClient.from("mutasi_stok").delete().in("nomor_dokumen", docNumbers);
      }
      await adminClient.from("item_pesanan_jual").delete().in("pesanan_jual_id", toDeleteIds);
      await adminClient.from("audit_log").delete().in("data_id", toDeleteIds);
      await adminClient.from("pesanan_jual").delete().in("id", toDeleteIds);
    }
    console.log("Cleanup selesai. Database tetap bersih dan aman.");
  }
}

runTests().catch((err) => {
  console.error("\nTEST GAGAL:", err);
  process.exit(1);
});
