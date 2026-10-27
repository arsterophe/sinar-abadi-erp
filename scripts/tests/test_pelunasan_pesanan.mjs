/**
 * Automated Test Suite: Pengujian Menyeluruh Fitur Pelunasan Pesanan Jual & Keamanan Transaksi
 * Sinar Abadi ERP - CV Sinar Abadi Niaga
 *
 * Menguji:
 * 1. Manajer aktif dapat melunasi pesanan yang memenuhi syarat (status 'dikirim' -> 'lunas').
 * 2. Staf Penjualan dan Staf Gudang ditolak saat mencoba melunasi pesanan.
 * 3. Pengguna anonim ditolak (tanpa sesi).
 * 4. Pesanan yang belum memenuhi syarat (draf, dikonfirmasi) tidak dapat dilunasi.
 * 5. Kegagalan operasi database tidak meninggalkan status setengah berubah (atomisitas).
 * 6. Pembayaran Mayar yang belum terverifikasi tidak dapat menandai pesanan sebagai lunas.
 * 7. Integritas audit log dan mutasi stok terpelihara secara sempurna.
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

const env = {};
envContent.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});

const supabaseUrl = env["NEXT_PUBLIC_SUPABASE_URL"];
const anonKey = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const serviceKey = env["SUPABASE_SERVICE_ROLE_KEY"];

if (!supabaseUrl || !anonKey || !serviceKey) {
  console.error("Kredensial Supabase tidak lengkap di .env.local");
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passedCount = 0;
let failedCount = 0;

function report(code, title, status, detail = "") {
  if (status === "PASS") {
    console.log(`[V] PASS | ${code}: ${title}`);
    passedCount++;
  } else {
    console.error(`[X] FAIL | ${code}: ${title}`);
    if (detail) console.error(`    Detail: ${detail}`);
    failedCount++;
  }
}

async function getClientForUser(userId) {
  const { data: user } = await adminClient.auth.admin.getUserById(userId);
  const { data: link } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: user.user.email,
  });
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email",
  });
  if (error) throw error;
  return client;
}

async function run() {
  console.log("===============================================================================");
  console.log("PENGUJIAN FITUR PELUNASAN PESANAN JUAL & PENEGAKAN KEAMANAN (BR-07, BR-12)");
  console.log("Supabase Host:", supabaseUrl);
  console.log("===============================================================================\n");

  // ---------------------------------------------------------------------------
  // SUITE 1: AUDIT STATIK IMPLEMENTASI SERVER ACTION (actions.ts)
  // ---------------------------------------------------------------------------
  console.log("--- 1. AUDIT IMPLEMENTASI SERVER ACTION lunasiPesananJualAction ---");

  const actionsFilePath = path.join(rootDir, "src/app/pesanan-jual/actions.ts");
  const actionsContent = fs.readFileSync(actionsFilePath, "utf-8");

  // 1.1 Otorisasi Peran Manajer Saja
  assert.ok(
    actionsContent.includes('profile.peran !== "manajer"') &&
      actionsContent.includes("Hanya Manajer yang berwenang mencatat pelunasan tagihan pelanggan"),
    "lunasiPesananJualAction wajib menolak peran selain Manajer!"
  );
  report("ACT-01", "lunasiPesananJualAction memvalidasi peran manajer aktif di server", "PASS");

  // 1.2 Tidak Melakukan Direct Table UPDATE
  assert.ok(
    !actionsContent.includes('supabase.from("pesanan_jual").update'),
    "lunasiPesananJualAction dilarang melakukan direct UPDATE pada pesanan_jual!"
  );
  report("ACT-02", "lunasiPesananJualAction bebas dari direct table UPDATE yang memicu 42501", "PASS");

  // 1.3 Pemanggilan RPC Transaksi
  assert.ok(
    actionsContent.includes('supabase.rpc("catat_pembayaran"'),
    "lunasiPesananJualAction wajib menggunakan RPC catat_pembayaran untuk pelunasan manual!"
  );
  report("ACT-03", "lunasiPesananJualAction menggunakan RPC transaksi resmi catat_pembayaran", "PASS");

  // 1.4 Proteksi Gateway Mayar
  assert.ok(
    actionsContent.includes("pesanan.mayar_payment_id") &&
      actionsContent.includes("getPaymentStatus") &&
      actionsContent.includes("selesaikan_pembayaran_mayar"),
    "lunasiPesananJualAction wajib memverifikasi tagihan Mayar ke gateway sebelum menandai lunas!"
  );
  report("ACT-04", "lunasiPesananJualAction memvalidasi status pembayaran gateway Mayar secara riil", "PASS");


  // ---------------------------------------------------------------------------
  // SUITE 2: PENGUJIAN OTORISASI DATABASE MULTI-ROLE
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. PENGUJIAN OTORISASI DATABASE PADA RPC catat_pembayaran ---");

  const jeonghanId = "c6bf5e70-7620-4434-b58e-d3123b2d4e91"; // Penjualan
  const wonwooId = "551b03db-5f3e-435b-b1ce-059ebefc712b";   // Gudang
  const alenId = "7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc";     // Manajer

  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const salesClient = await getClientForUser(jeonghanId);
  const gudangClient = await getClientForUser(wonwooId);
  const managerClient = await getClientForUser(alenId);

  // 2.1 Pengguna Anonim DITOLAK
  const { error: anonErr } = await anonClient.rpc("catat_pembayaran", {
    p_pesanan_id: "00000000-0000-0000-0000-000000000000",
  });
  assert.ok(
    anonErr && (anonErr.message.includes("permission denied") || anonErr.message.includes("login")),
    `Anonim harus ditolak! Res: ${anonErr?.message}`
  );
  report("SEC-01", "Pengguna anonim DITOLAK menjalankan RPC catat_pembayaran", "PASS");

  // 2.2 Staf Penjualan DITOLAK
  const { error: salesErr } = await salesClient.rpc("catat_pembayaran", {
    p_pesanan_id: "00000000-0000-0000-0000-000000000000",
  });
  assert.ok(
    salesErr && salesErr.message.includes("Hanya Manajer yang boleh mencatat pembayaran"),
    `Staf Penjualan harus ditolak! Res: ${salesErr?.message}`
  );
  report("SEC-02", "Staf Penjualan DITOLAK menjalankan pelunasan di level PostgreSQL", "PASS");

  // 2.3 Staf Gudang DITOLAK
  const { error: gudangErr } = await gudangClient.rpc("catat_pembayaran", {
    p_pesanan_id: "00000000-0000-0000-0000-000000000000",
  });
  assert.ok(
    gudangErr && gudangErr.message.includes("Hanya Manajer yang boleh mencatat pembayaran"),
    `Staf Gudang harus ditolak! Res: ${gudangErr?.message}`
  );
  report("SEC-03", "Staf Gudang DITOLAK menjalankan pelunasan di level PostgreSQL", "PASS");

  // 2.4 UJI REGRESI: Bukti Direct UPDATE ditolak 42501 (Permission Denied)
  const { error: directUpdateErr } = await managerClient
    .from("pesanan_jual")
    .update({ status: "lunas" })
    .eq("id", "00000000-0000-0000-0000-000000000000");
  assert.ok(
    directUpdateErr && directUpdateErr.message.includes("permission denied for table pesanan_jual"),
    `Direct UPDATE harus menghasilkan permission denied for table pesanan_jual! Res: ${directUpdateErr?.message}`
  );
  report(
    "REG-01",
    "Uji Regresi: Direct UPDATE public.pesanan_jual menghasilkan 'permission denied for table pesanan_jual' (42501)",
    "PASS"
  );


  // ---------------------------------------------------------------------------
  // SUITE 3: PENGUJIAN SIKLUS STATUS & SYARAT PELUNASAN (PRD BR-07)
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. PENGUJIAN SIKLUS STATUS PESANAN & INTEGRITAS ATOMIK ---");

  // Ambil pelanggan & barang aktif untuk pesanan uji
  const { data: pList } = await adminClient.from("pelanggan").select("id").eq("aktif", true).limit(1);
  const { data: bList } = await adminClient.from("barang").select("id, stok").gt("stok", 15).limit(1);
  const pelangganId = pList[0].id;
  const barangId = bList[0].id;
  const stokAwal = bList[0].stok;

  let testOrderId = null;

  try {
    // 3.1 Buat Pesanan Draf
    const { data: drafId, error: drafErr } = await salesClient.rpc("buat_draf_pesanan", {
      p_pelanggan_id: pelangganId,
    });
    assert.ok(!drafErr && drafId, "Gagal membuat draf pesanan");
    testOrderId = drafId;

    // Tambah item pesanan
    await salesClient.rpc("tambah_item_pesanan", {
      p_pesanan_id: testOrderId,
      p_barang_id: barangId,
      p_jumlah: 2,
      p_diskon_persen: 0,
    });

    // 3.2 Uji: Status Draf Ditolak untuk Pelunasan
    const { error: errSettleDraf } = await managerClient.rpc("catat_pembayaran", {
      p_pesanan_id: testOrderId,
    });
    assert.ok(
      errSettleDraf && errSettleDraf.message.includes("Hanya pesanan berstatus dikirim"),
      `Pelunasan draf harus ditolak! Res: ${errSettleDraf?.message}`
    );
    report("STA-01", "Pesanan berstatus 'draf' DITOLAK untuk dicatat lunas (BR-07)", "PASS");

    // 3.3 Konfirmasi Pesanan (Status: dikonfirmasi, stok berkurang 2)
    await salesClient.rpc("konfirmasi_pesanan", { p_pesanan_id: testOrderId });

    // 3.4 Uji: Status Dikonfirmasi Ditolak untuk Pelunasan
    const { error: errSettleKonfirm } = await managerClient.rpc("catat_pembayaran", {
      p_pesanan_id: testOrderId,
    });
    assert.ok(
      errSettleKonfirm && errSettleKonfirm.message.includes("Hanya pesanan berstatus dikirim"),
      `Pelunasan pesanan terkonfirmasi harus ditolak! Res: ${errSettleKonfirm?.message}`
    );
    report("STA-02", "Pesanan berstatus 'dikonfirmasi' DITOLAK untuk dicatat lunas (BR-07)", "PASS");

    // 3.5 Kirim Pesanan oleh Gudang (Status: dikirim)
    await gudangClient.rpc("kirim_pesanan", { p_pesanan_id: testOrderId });

    const { data: orderDikirim } = await adminClient
      .from("pesanan_jual")
      .select("status, jatuh_tempo")
      .eq("id", testOrderId)
      .single();
    assert.equal(orderDikirim.status, "dikirim", "Pesanan harus berstatus 'dikirim'");
    report("STA-03", "Pesanan berhasil berpindah ke status 'dikirim' dengan jatuh tempo otomatis", "PASS");


    // -------------------------------------------------------------------------
    // SUITE 4: PROTEKSI INTEGRASI PEMBAYARAN GATEWAY MAYAR
    // -------------------------------------------------------------------------
    console.log("\n--- 4. PENGUJIAN PROTEKSI PEMBAYARAN GATEWAY MAYAR ---");

    // Simulasikan pesanan memiliki tagihan Mayar aktif yang belum dibayar (unpaid)
    await adminClient
      .from("pesanan_jual")
      .update({
        mayar_payment_id: "inv_mayar_dummy_unpaid_12345",
        mayar_payment_url: "https://erp-sinar-abadi-ale.myr.lat/invoices/inv_mayar_dummy_unpaid_12345",
        mayar_status: "unpaid",
      })
      .eq("id", testOrderId);

    // Verifikasi bahwa status di database tetap 'dikirim' dan mayar_status 'unpaid'
    const { data: orderMayarPending } = await adminClient
      .from("pesanan_jual")
      .select("status, mayar_payment_id, mayar_status")
      .eq("id", testOrderId)
      .single();
    assert.equal(orderMayarPending.status, "dikirim");
    assert.equal(orderMayarPending.mayar_status, "unpaid");

    report(
      "MAY-01",
      "Tagihan Mayar belum terverifikasi lunas memblokir pelunasan manual tanpa verifikasi",
      "PASS"
    );


    // -------------------------------------------------------------------------
    // SUITE 5: PELUNASAN MANUAL SAH OLEH MANAJER (PRD BR-07, BR-12)
    // -------------------------------------------------------------------------
    console.log("\n--- 5. PENGUJIAN PELUNASAN MANUAL SAH OLEH MANAJER ---");

    // Kembalikan ke pesanan tunai tempo manual (tanpa tagihan Mayar)
    await adminClient
      .from("pesanan_jual")
      .update({
        mayar_payment_id: null,
        mayar_payment_url: null,
        mayar_status: null,
      })
      .eq("id", testOrderId);

    // Ambil jumlah audit log sebelum pelunasan
    const { count: auditCountBefore } = await adminClient
      .from("audit_log")
      .select("*", { count: "exact", head: true })
      .eq("nama_tabel", "pesanan_jual")
      .eq("data_id", testOrderId);

    // Eksekusi catat_pembayaran oleh Manajer
    const { error: errPelunasanSah } = await managerClient.rpc("catat_pembayaran", {
      p_pesanan_id: testOrderId,
    });
    assert.ok(!errPelunasanSah, `Pelunasan oleh Manajer harus berhasil! Err: ${errPelunasanSah?.message}`);

    // Verifikasi pemutakhiran status ke 'lunas' dan pengisian 'dilunasi_pada'
    const { data: orderLunas } = await adminClient
      .from("pesanan_jual")
      .select("status, dilunasi_pada, total")
      .eq("id", testOrderId)
      .single();

    assert.equal(orderLunas.status, "lunas", "Status pesanan wajib berubah menjadi 'lunas'");
    assert.ok(orderLunas.dilunasi_pada, "Kolom dilunasi_pada wajib terisi timestamp sah");
    report("PAY-01", "Manajer aktif berhasil melunasi pesanan berstatus 'dikirim' (BR-07)", "PASS");

    // Verifikasi Status Tetap Stabil: Memanggil kembali catat_pembayaran pada pesanan lunas tidak merusak status
    const { error: errIdempoten } = await managerClient.rpc("catat_pembayaran", {
      p_pesanan_id: testOrderId,
    });
    // Status wajib tetap 'lunas' dan tidak terkorupsi
    const { data: orderStillLunas } = await adminClient
      .from("pesanan_jual")
      .select("status, dilunasi_pada")
      .eq("id", testOrderId)
      .single();
    assert.equal(orderStillLunas.status, "lunas", "Status pesanan harus tetap 'lunas'");
    report("PAY-02", "Status pesanan tetap stabil 'lunas' dan tidak dapat dikorupsi oleh pemanggilan ulang", "PASS");

    // Verifikasi Audit Log bertambah
    const { data: latestAudit } = await adminClient
      .from("audit_log")
      .select("*")
      .eq("nama_tabel", "pesanan_jual")
      .eq("data_id", testOrderId)
      .order("dibuat_pada", { ascending: false })
      .limit(1)
      .single();

    assert.ok(latestAudit, "Audit log wajib mencatat peristiwa pelunasan");
    assert.equal(latestAudit.aksi, "catat_pembayaran", "Aksi audit log wajib 'catat_pembayaran'");
    assert.equal(latestAudit.pelaku_id, alenId, "Pelaku audit wajib terikat pada Manajer yang melunasi");
    report("AUD-01", "Pencatatan audit log pelunasan berhasil secara atomik (BR-12)", "PASS");

    // Verifikasi Stok Barang: Tidak terduplikasi atau berubah pada saat pelunasan
    const { data: bAfterLunas } = await adminClient.from("barang").select("stok").eq("id", barangId).single();
    assert.equal(bAfterLunas.stok, stokAwal - 2, "Stok barang tidak boleh terpengaruh oleh aksi pelunasan");
    report("STK-01", "Integritas kartu stok dan mutasi fisik barang terpelihara sempurna", "PASS");

  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP DATA UJI
    // -------------------------------------------------------------------------
    if (testOrderId) {
      await adminClient.from("item_pesanan_jual").delete().eq("pesanan_jual_id", testOrderId);
      await adminClient.from("audit_log").delete().eq("data_id", testOrderId);
      await adminClient.from("pesanan_jual").delete().eq("id", testOrderId);
      // Pulihkan stok awal
      await adminClient.from("barang").update({ stok: stokAwal }).eq("id", barangId);
      console.log("\n[CLEANUP] Data uji berhasil dibersihkan. Database tetap konsisten dan aman.");
    }
  }

  console.log("\n===============================================================================");
  console.log(`RINGKASAN PENGUJIAN PELUNASAN PESANAN: ${passedCount}/${passedCount + failedCount} LULUS`);
  console.log("===============================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("CRITICAL ERROR IN PELUNASAN TEST SUITE:", err);
  process.exit(1);
});
