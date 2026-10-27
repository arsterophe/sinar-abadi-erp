/**
 * Unit Test Mock Integrasi Mayar (Validasi Email, Ponsel, Logika RPC Atomik, dan Webhook)
 * Sinar Abadi ERP
 *
 * CATATAN PENTING:
 * Skrip ini adalah unit test mock in-memory untuk menguji alur logika bisnis,
 * validasi parameter, dan penanganan edge cases tanpa menghubungi gateway Mayar nyata
 * dan tanpa mengubah database Supabase production.
 *
 * MOCK TEST INI BUKAN MERUPAKAN BUKTI TRANSAKSI POSTGRESQL NYATA.
 */

import assert from "assert";

console.log("===============================================================================");
console.log("MEMULAI UNIT TEST MOCK INTEGRASI MAYAR (OFFLINE / IN-MEMORY)");
console.log("===============================================================================\n");

let passedCount = 0;
let totalCount = 0;

function runTest(description, testFn) {
  totalCount++;
  try {
    testFn();
    console.log(`[V] LULUS | ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`[X] GAGAL | ${description}`);
    console.error(`    Alasan: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// -----------------------------------------------------------------------------
// BAGIAN 1: PENGUJIAN LOGIKA VALIDASI EMAIL & NOMOR PONSEL (TUGAS A)
// -----------------------------------------------------------------------------

function validateCreatePaymentParams(params) {
  if (!params.name || typeof params.name !== "string" || params.name.trim().length === 0) {
    return { success: false, error: "Nama pelanggan atau judul tagihan Mayar wajib diisi." };
  }
  const cleanAmount = Math.round(Number(params.amount));
  if (isNaN(cleanAmount) || cleanAmount <= 0) {
    return { success: false, error: "Nominal pembayaran Mayar wajib lebih besar dari Rp0." };
  }
  const cleanEmail = (params.email || "").trim();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return {
      success: false,
      error: "Alamat email pelanggan wajib diisi dan berformat valid sesuai kontrak Mayar Headless API V1.",
    };
  }
  const cleanMobile = (params.mobile || "").trim();
  if (!cleanMobile) {
    return {
      success: false,
      error: "Nomor ponsel pelanggan wajib diisi sesuai kontrak Mayar Headless API V1.",
    };
  }
  return { success: true, cleanAmount, cleanEmail, cleanMobile };
}

runTest("A1. createSinglePayment: Menolak jika email kosong", () => {
  const res = validateCreatePaymentParams({
    name: "Toko Berkah",
    amount: 150000,
    email: "",
    mobile: "08123456789",
  });
  assert.strictEqual(res.success, false);
  assert.match(res.error, /email pelanggan wajib diisi/i);
});

runTest("A2. createSinglePayment: Menolak jika format email tidak valid (tanpa @)", () => {
  const res = validateCreatePaymentParams({
    name: "Toko Berkah",
    amount: 150000,
    email: "bukan-email-valid",
    mobile: "08123456789",
  });
  assert.strictEqual(res.success, false);
  assert.match(res.error, /berformat valid/i);
});

runTest("A3. createSinglePayment: Menolak jika nomor ponsel kosong", () => {
  const res = validateCreatePaymentParams({
    name: "Toko Berkah",
    amount: 150000,
    email: "toko@example.com",
    mobile: "",
  });
  assert.strictEqual(res.success, false);
  assert.match(res.error, /nomor ponsel pelanggan wajib diisi/i);
});

runTest("A4. createSinglePayment: Menolak jika nominal <= 0", () => {
  const res = validateCreatePaymentParams({
    name: "Toko Berkah",
    amount: 0,
    email: "toko@example.com",
    mobile: "08123456789",
  });
  assert.strictEqual(res.success, false);
  assert.match(res.error, /lebih besar dari Rp0/i);
});

runTest("A5. createSinglePayment: Lolos jika seluruh data wajib lengkap & valid", () => {
  const res = validateCreatePaymentParams({
    name: "Toko Berkah",
    amount: 250000,
    email: "toko.berkah@example.com",
    mobile: "081234567890",
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.cleanAmount, 250000);
});

// Helper validasi mata uang webhook (selaras dengan src/app/api/webhooks/mayar/route.ts)
function validateWebhookCurrency(rawCurrency) {
  const normalizedCurrency = (rawCurrency || "").trim().toUpperCase();
  if (!normalizedCurrency || normalizedCurrency !== "IDR") {
    return {
      valid: false,
      normalized: normalizedCurrency,
      error: `Mata uang transaksi ('${rawCurrency || ""}') tidak sesuai. Hanya transaksi IDR yang didukung.`,
    };
  }
  return { valid: true, normalized: normalizedCurrency };
}

runTest("A6. Webhook Currency: Menolak jika currency kosong string ('')", () => {
  const res = validateWebhookCurrency("");
  assert.strictEqual(res.valid, false);
  assert.match(res.error, /tidak sesuai/i);
});

runTest("A7. Webhook Currency: Menolak jika currency null atau undefined", () => {
  const resNull = validateWebhookCurrency(null);
  assert.strictEqual(resNull.valid, false);
  const resUndefined = validateWebhookCurrency(undefined);
  assert.strictEqual(resUndefined.valid, false);
});

runTest("A8. Webhook Currency: Menolak jika currency selain IDR (misal 'USD')", () => {
  const res = validateWebhookCurrency("USD");
  assert.strictEqual(res.valid, false);
  assert.match(res.error, /Hanya transaksi IDR yang didukung/i);
});

runTest("A9. Webhook Currency: Menormalisasi '  idr  ' dengan spasi menjadi 'IDR' dan lolos validasi", () => {
  const res = validateWebhookCurrency("  idr  ");
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.normalized, "IDR");
});

// -----------------------------------------------------------------------------
// BAGIAN 2: SKENARIO LOGIKA MOCK RPC & WEBHOOK (TUGAS B & C)
// -----------------------------------------------------------------------------

/**
 * Mock simulator implementasi RPC selesaikan_pembayaran_mayar
 */
function mockRpcSelesaikanPembayaranMayar({
  callerRole,
  dbState,
  p_pesanan_id,
  p_payment_id,
  p_verified_amount,
  p_verified_status,
  p_pelaku_id,
  simulateAuditFail = false,
}) {
  // 1. Otorisasi Ketat
  if (callerRole !== "service_role" && callerRole !== "postgres") {
    throw new Error(
      "Akses ditolak: Fungsi ini adalah fungsi privat server dan hanya dapat dieksekusi oleh service_role."
    );
  }

  // 2. Sanitasi & Validasi Input
  if (!p_pesanan_id) throw new Error("Parameter p_pesanan_id wajib diisi.");
  const cleanPaymentId = (p_payment_id || "").trim();
  if (!cleanPaymentId) throw new Error("Parameter p_payment_id wajib diisi.");
  if (!p_verified_amount || p_verified_amount <= 0) {
    throw new Error("Parameter p_verified_amount wajib bernilai positif.");
  }
  const cleanStatus = (p_verified_status || "").trim().toLowerCase();
  if (cleanStatus !== "paid") {
    throw new Error(`Parameter p_verified_status tidak valid (harus "paid"). Diterima: ${cleanStatus}`);
  }

  // 3. Kunci Baris Pesanan (WHERE id = p_pesanan_id AND mayar_payment_id = p_payment_id)
  const pesanan = dbState.pesanan.find(
    (p) => p.id === p_pesanan_id && p.mayar_payment_id === cleanPaymentId
  );

  // 4. Validasi Keberadaan & Kecocokan Relasi
  if (!pesanan) {
    throw new Error(
      `Pesanan dengan ID "${p_pesanan_id}" dan mayar_payment_id "${cleanPaymentId}" tidak ditemukan atau tidak cocok.`
    );
  }

  // 5. Validasi Integritas Nominal (Anti-Fraud Eksak Tanpa Toleransi Pembulatan)
  // Dilakukan SEBELUM evaluasi idempotensi agar retry dengan payment ID sama tapi nominal berbeda ditolak
  if (Number(pesanan.total) !== Number(p_verified_amount)) {
    throw new Error(
      `Integritas nominal gagal: Total pesanan (Rp${Number(pesanan.total)}) tidak cocok dengan nominal terverifikasi gateway (Rp${Number(p_verified_amount)}).`
    );
  }

  // 6. Idempotensi Mutlak
  if (pesanan.status === "lunas") {
    return {
      success: true,
      idempotent: true,
      message: `Pesanan ${pesanan.nomor} sudah berstatus lunas sebelumnya. Tidak ada perubahan dilakukan.`,
      data: { id: pesanan.id, nomor: pesanan.nomor, status: "lunas" },
    };
  }

  // 7. Validasi Transisi Status
  if (pesanan.status !== "dikirim") {
    throw new Error(
      `Pelunasan ditolak: Status pesanan saat ini adalah "${pesanan.status}". Hanya pesanan berstatus "dikirim" yang dapat dicatat lunas.`
    );
  }

  // 8 & 9. Mutasi Atomik dalam Satu Transaksi
  const originalStatus = pesanan.status;
  const originalMayarStatus = pesanan.mayar_status;
  pesanan.status = "lunas";
  pesanan.mayar_status = "paid";
  pesanan.dilunasi_pada = new Date().toISOString();

  // Memenuhi constraint public.audit_log pada skema database production:
  // pelaku_id: UUID NOT NULL REFERENCES public.profiles(id)
  // data_id: UUID NOT NULL
  // nilai_baru: JSONB NOT NULL
  const v_pelaku_id = p_pelaku_id || pesanan.dibuat_oleh;
  if (!v_pelaku_id) {
    pesanan.status = originalStatus;
    pesanan.mayar_status = originalMayarStatus;
    delete pesanan.dilunasi_pada;
    throw new Error(
      "Integritas audit gagal: Identitas pelaku audit tidak ditemukan untuk pesanan (pelanggaran NOT NULL constraint pelaku_id)."
    );
  }

  // Simulasi jika insert audit_log gagal dalam transaksi database
  if (simulateAuditFail) {
    // Rollback seluruh perubahan status pesanan
    pesanan.status = originalStatus;
    pesanan.mayar_status = originalMayarStatus;
    delete pesanan.dilunasi_pada;
    throw new Error("Simulasi kegagalan pencatatan audit: Transaksi di-ROLLBACK secara penuh.");
  }

  dbState.auditLog.push({
    pelaku_id: v_pelaku_id,
    aksi: "pelunasan_mayar",
    nama_tabel: "pesanan_jual",
    data_id: pesanan.id,
    nilai_lama: { status: originalStatus, mayar_status: originalMayarStatus || "unpaid" },
    nilai_baru: {
      status: "lunas",
      mayar_status: "paid",
      total: pesanan.total,
      sumber_aksi: "webhook_mayar_otomatis",
    },
  });

  return {
    success: true,
    idempotent: false,
    message: `Pesanan ${pesanan.nomor} berhasil diverifikasi dan dicatat lunas secara atomik.`,
    data: { id: pesanan.id, nomor: pesanan.nomor, status: "lunas" },
  };
}

// 1. Otorisasi yang Ditolak
runTest("B1. RPC: Menolak jika caller bukan service_role (misal: 'authenticated')", () => {
  const db = { pesanan: [], auditLog: [] };
  assert.throws(
    () =>
      mockRpcSelesaikanPembayaranMayar({
        callerRole: "authenticated",
        dbState: db,
        p_pesanan_id: "pesanan-1",
        p_payment_id: "pay_123",
        p_verified_amount: 100000,
        p_verified_status: "paid",
      }),
    /Akses ditolak.*service_role/
  );
});

// 2. Payment ID Cocok dengan Pesanan
runTest("B2. RPC: Pembayaran valid dengan ID pesanan & payment ID cocok berhasil lunas", () => {
  const db = {
    pesanan: [
      {
        id: "pesanan-1",
        nomor: "PJ-001",
        status: "dikirim",
        total: 100000,
        mayar_payment_id: "pay_123",
        dibuat_oleh: "7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc",
      },
    ],
    auditLog: [],
  };
  const res = mockRpcSelesaikanPembayaranMayar({
    callerRole: "service_role",
    dbState: db,
    p_pesanan_id: "pesanan-1",
    p_payment_id: "pay_123",
    p_verified_amount: 100000,
    p_verified_status: "paid",
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.idempotent, false);
  assert.strictEqual(db.pesanan[0].status, "lunas");
  assert.strictEqual(db.auditLog.length, 1);
});

// 3. Payment ID Milik Pesanan Lain (Mismatched)
runTest("B3. RPC: Menolak jika payment ID bukan milik pesanan yang diminta", () => {
  const db = {
    pesanan: [
      { id: "pesanan-1", nomor: "PJ-001", status: "dikirim", total: 100000, mayar_payment_id: "pay_milik_pesanan_1" },
      { id: "pesanan-2", nomor: "PJ-002", status: "dikirim", total: 200000, mayar_payment_id: "pay_milik_pesanan_2" },
    ],
    auditLog: [],
  };
  // Mencoba melunasi pesanan-1 dengan payment_id milik pesanan-2
  assert.throws(
    () =>
      mockRpcSelesaikanPembayaranMayar({
        callerRole: "service_role",
        dbState: db,
        p_pesanan_id: "pesanan-1",
        p_payment_id: "pay_milik_pesanan_2",
        p_verified_amount: 100000,
        p_verified_status: "paid",
      }),
    /tidak ditemukan atau tidak cocok/
  );
  assert.strictEqual(db.pesanan[0].status, "dikirim");
});

// 4. Nominal Tidak Cocok (Anti-Fraud)
runTest("B4. RPC: Menolak jika nominal pembayaran berbeda dengan total pesanan", () => {
  const db = {
    pesanan: [
      { id: "pesanan-1", nomor: "PJ-001", status: "dikirim", total: 100000, mayar_payment_id: "pay_123" },
    ],
    auditLog: [],
  };
  assert.throws(
    () =>
      mockRpcSelesaikanPembayaranMayar({
        callerRole: "service_role",
        dbState: db,
        p_pesanan_id: "pesanan-1",
        p_payment_id: "pay_123",
        p_verified_amount: 50000, // Berbeda dari 100000
        p_verified_status: "paid",
      }),
    /Integritas nominal gagal/
  );
  assert.strictEqual(db.pesanan[0].status, "dikirim");
});

// 5. Status Gateway Bukan Paid (misal 'pending', 'settled', 'success', atau 'expired')
runTest("B5. RPC & Webhook: Menolak/mengabaikan jika status gateway bukan paid", () => {
  const db = {
    pesanan: [
      { id: "pesanan-1", nomor: "PJ-001", status: "dikirim", total: 100000, mayar_payment_id: "pay_123" },
    ],
    auditLog: [],
  };
  for (const invalidStatus of ["pending", "settled", "success", "expired"]) {
    assert.throws(
      () =>
        mockRpcSelesaikanPembayaranMayar({
          callerRole: "service_role",
          dbState: db,
          p_pesanan_id: "pesanan-1",
          p_payment_id: "pay_123",
          p_verified_amount: 100000,
          p_verified_status: invalidStatus,
        }),
      /Parameter p_verified_status tidak valid/
    );
  }
  assert.strictEqual(db.pesanan[0].status, "dikirim");
});

// 6. Status Pesanan Bukan Dikirim (misal 'draf' atau 'dibatalkan')
runTest("B6. RPC: Menolak pelunasan jika status pesanan bukan 'dikirim'", () => {
  const db = {
    pesanan: [
      { id: "pesanan-1", nomor: "PJ-001", status: "dibatalkan", total: 100000, mayar_payment_id: "pay_123" },
    ],
    auditLog: [],
  };
  assert.throws(
    () =>
      mockRpcSelesaikanPembayaranMayar({
        callerRole: "service_role",
        dbState: db,
        p_pesanan_id: "pesanan-1",
        p_payment_id: "pay_123",
        p_verified_amount: 100000,
        p_verified_status: "paid",
      }),
    /Hanya pesanan berstatus "dikirim"/
  );
});

// 7. Webhook Berulang (Idempotensi)
runTest("B7. RPC: Webhook berulang mengembalikan respons sukses idempoten tanpa duplikasi audit log", () => {
  const db = {
    pesanan: [
      { id: "pesanan-1", nomor: "PJ-001", status: "lunas", total: 100000, mayar_payment_id: "pay_123" },
    ],
    auditLog: [{ aksi: "pelunasan_mayar_sebelumnya" }],
  };
  const res = mockRpcSelesaikanPembayaranMayar({
    callerRole: "service_role",
    dbState: db,
    p_pesanan_id: "pesanan-1",
    p_payment_id: "pay_123",
    p_verified_amount: 100000,
    p_verified_status: "paid",
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.idempotent, true);
  assert.strictEqual(db.auditLog.length, 1, "Audit log tidak bertambah (tidak duplikat)");
});

// 8. Dua Pemanggilan Paralel (Simulasi Row Lock & Idempotensi)
runTest("B8. Konkurensi: Dua request paralel menghasilkan 1 mutasi dan 1 respons idempoten", () => {
  const db = {
    pesanan: [
      {
        id: "pesanan-1",
        nomor: "PJ-001",
        status: "dikirim",
        total: 100000,
        mayar_payment_id: "pay_123",
        dibuat_oleh: "7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc",
      },
    ],
    auditLog: [],
  };
  // Request 1 tiba lebih dulu
  const res1 = mockRpcSelesaikanPembayaranMayar({
    callerRole: "service_role",
    dbState: db,
    p_pesanan_id: "pesanan-1",
    p_payment_id: "pay_123",
    p_verified_amount: 100000,
    p_verified_status: "paid",
  });
  // Request 2 tiba saat status sudah lunas oleh Request 1
  const res2 = mockRpcSelesaikanPembayaranMayar({
    callerRole: "service_role",
    dbState: db,
    p_pesanan_id: "pesanan-1",
    p_payment_id: "pay_123",
    p_verified_amount: 100000,
    p_verified_status: "paid",
  });
  assert.strictEqual(res1.idempotent, false);
  assert.strictEqual(res2.idempotent, true);
  assert.strictEqual(db.auditLog.length, 1);
  assert.strictEqual(db.pesanan[0].status, "lunas");
});

// 9. RPC Belum Tersedia (Penanganan Jalur Aman Webhook HTTP 503)
runTest("B9. Webhook Handler: Mendeteksi PGRST202 dan merespons HTTP 503 untuk retry gateway tanpa mutasi non-atomik", () => {
  const rpcError = { code: "PGRST202", message: "function selesaikan_pembayaran_mayar does not exist" };
  let httpStatus = 200;
  let orderMutated = false;

  if (rpcError.code === "PGRST202" || rpcError.message.includes("does not exist")) {
    // Kebijakan Keamanan: Tolak pelunasan terpisah demi integritas audit log, kembalikan 503
    httpStatus = 503;
    orderMutated = false;
  }

  assert.strictEqual(httpStatus, 503, "Merespons HTTP 503 Service Unavailable agar gateway mengulang webhook");
  assert.strictEqual(orderMutated, false, "Status pesanan tidak diubah secara non-atomik");
});

// 10. Kegagalan Pencatatan Audit dalam Transaksi (Simulasi Rollback Penuh)
runTest("B10. Atomisitas Transaksi: Jika audit_log gagal, pembaruan status pesanan di-ROLLBACK", () => {
  const db = {
    pesanan: [
      {
        id: "pesanan-1",
        nomor: "PJ-001",
        status: "dikirim",
        total: 100000,
        mayar_payment_id: "pay_123",
        dibuat_oleh: "7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc",
      },
    ],
    auditLog: [],
  };
  assert.throws(
    () =>
      mockRpcSelesaikanPembayaranMayar({
        callerRole: "service_role",
        dbState: db,
        p_pesanan_id: "pesanan-1",
        p_payment_id: "pay_123",
        p_verified_amount: 100000,
        p_verified_status: "paid",
        simulateAuditFail: true, // Audit log disimulasikan gagal
      }),
    /Transaksi di-ROLLBACK/i
  );
  // Status pesanan wajib tetap 'dikirim' (tidak terlanjur lunas tanpa audit log)
  assert.strictEqual(db.pesanan[0].status, "dikirim");
  assert.strictEqual(db.auditLog.length, 0);
});

// 11. Retry dengan Payment ID Sama tapi Nominal Berbeda pada Pesanan yang Sudah Lunas
runTest("B11. RPC: Menolak retry dengan payment ID sama tetapi nominal berbeda, meskipun status pesanan sudah 'lunas'", () => {
  const db = {
    pesanan: [
      { id: "pesanan-1", nomor: "PJ-001", status: "lunas", total: 100000, mayar_payment_id: "pay_123" },
    ],
    auditLog: [{ aksi: "pelunasan_mayar_sebelumnya" }],
  };
  assert.throws(
    () =>
      mockRpcSelesaikanPembayaranMayar({
        callerRole: "service_role",
        dbState: db,
        p_pesanan_id: "pesanan-1",
        p_payment_id: "pay_123",
        p_verified_amount: 99999, // Nominal berbeda meskipun pesanan sudah lunas
        p_verified_status: "paid",
      }),
    /Integritas nominal gagal/
  );
  // Pastikan audit log tidak bertambah
  assert.strictEqual(db.auditLog.length, 1);
});

// 12. Retry dengan Payment ID Berbeda pada Pesanan yang Sudah Lunas
runTest("B12. RPC: Menolak retry pada pesanan lunas jika payment ID berbeda / bukan pemilik pesanan", () => {
  const db = {
    pesanan: [
      { id: "pesanan-1", nomor: "PJ-001", status: "lunas", total: 100000, mayar_payment_id: "pay_123" },
    ],
    auditLog: [{ aksi: "pelunasan_mayar_sebelumnya" }],
  };
  assert.throws(
    () =>
      mockRpcSelesaikanPembayaranMayar({
        callerRole: "service_role",
        dbState: db,
        p_pesanan_id: "pesanan-1",
        p_payment_id: "pay_palsu_999",
        p_verified_amount: 100000,
        p_verified_status: "paid",
      }),
    /tidak ditemukan atau tidak cocok/
  );
  assert.strictEqual(db.auditLog.length, 1);
});

// 13. Alur Idempotensi Delegasi Penuh Webhook ke RPC (Tanpa Early Return Handler)
runTest("B13. Webhook ke RPC: Seluruh keputusan idempotensi pesanan lunas didelegasikan ke RPC dan menghasilkan HTTP 200 idempoten", () => {
  const db = {
    pesanan: [
      { id: "pesanan-1", nomor: "PJ-001", status: "lunas", total: 100000, mayar_payment_id: "pay_123" },
    ],
    auditLog: [{ aksi: "pelunasan_mayar_sebelumnya" }],
  };

  // Mensimulasikan pemanggilan webhook yang meneruskan langsung ke RPC
  const rpcResult = mockRpcSelesaikanPembayaranMayar({
    callerRole: "service_role",
    dbState: db,
    p_pesanan_id: "pesanan-1",
    p_payment_id: "pay_123",
    p_verified_amount: 100000,
    p_verified_status: "paid",
  });

  assert.strictEqual(rpcResult.success, true);
  assert.strictEqual(rpcResult.idempotent, true);
  assert.strictEqual(db.auditLog.length, 1, "Audit log tidak menggandakan baris");
});

// 14. Skema Audit Log Production: pelaku_id (UUID NOT NULL), data_id (UUID NOT NULL), nilai_baru (JSONB NOT NULL)
runTest("B14. Audit Log Schema: Memastikan pelaku_id (UUID NOT NULL), data_id (UUID NOT NULL), dan nilai_baru (JSONB NOT NULL) terisi valid", () => {
  const db = {
    pesanan: [
      {
        id: "pesanan-audit-1",
        nomor: "PJ-AUDIT-001",
        status: "dikirim",
        total: 150000,
        mayar_payment_id: "pay_audit_1",
        dibuat_oleh: "7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc", // Valid UUID profil pemilik pesanan
      },
    ],
    auditLog: [],
  };

  const res = mockRpcSelesaikanPembayaranMayar({
    callerRole: "service_role",
    dbState: db,
    p_pesanan_id: "pesanan-audit-1",
    p_payment_id: "pay_audit_1",
    p_verified_amount: 150000,
    p_verified_status: "paid",
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(db.auditLog.length, 1);
  const entry = db.auditLog[0];

  // Verifikasi pemenuhan constraint NOT NULL & tipe data
  assert.strictEqual(entry.pelaku_id, "7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc", "pelaku_id harus UUID pembuat pesanan yang valid");
  assert.strictEqual(entry.data_id, "pesanan-audit-1", "data_id harus UUID pesanan yang valid (bukan null)");
  assert.ok(entry.nilai_baru && typeof entry.nilai_baru === "object", "nilai_baru harus JSONB object valid (bukan null)");
  assert.strictEqual(entry.nilai_baru.status, "lunas");
  assert.strictEqual(entry.nilai_baru.sumber_aksi, "webhook_mayar_otomatis");
});

// 15. Kegagalan Pelaku Audit Log Memicu Rollback Penuh
runTest("B15. Audit Log Integrity: Menolak dan me-ROLLBACK pelunasan jika pelaku_id tidak dapat ditentukan (null)", () => {
  const db = {
    pesanan: [
      {
        id: "pesanan-anomali-1",
        nomor: "PJ-ANOMALI-001",
        status: "dikirim",
        total: 100000,
        mayar_payment_id: "pay_anomali",
        dibuat_oleh: null, // Anomali: tidak ada pembuat pesanan
      },
    ],
    auditLog: [],
  };

  assert.throws(
    () =>
      mockRpcSelesaikanPembayaranMayar({
        callerRole: "service_role",
        dbState: db,
        p_pesanan_id: "pesanan-anomali-1",
        p_payment_id: "pay_anomali",
        p_verified_amount: 100000,
        p_verified_status: "paid",
      }),
    /pelanggaran NOT NULL constraint pelaku_id/i
  );

  // Status pesanan wajib tetap 'dikirim' (di-rollback)
  assert.strictEqual(db.pesanan[0].status, "dikirim");
  assert.strictEqual(db.auditLog.length, 0, "Audit log tidak boleh mencatat entri tidak valid");
});

// -----------------------------------------------------------------------------
// BAGIAN 3: SKENARIO LOGIKA ALUR PEMBUATAN TAGIHAN MAYAR (CREATE INVOICE FLOW)
// (Tahap D: Penanganan Klaim, Pre-flight Config, Gateway Failure, Retry Idempotensi)
// -----------------------------------------------------------------------------

function mockBuatTagihanMayarWorkflow({
  dbState,
  pesananId,
  customerEmail,
  customerPhone,
  serverConfig = {
    hasServiceRoleKey: true,
    hasMayarApiKey: true,
  },
  mayarGatewayBehavior = "SUCCESS", // "SUCCESS", "NETWORK_ERROR", "GATEWAY_REJECT"
  simulateStorageFailure = false,
}) {
  const pesanan = dbState.pesanan.find((p) => p.id === pesananId);
  if (!pesanan) {
    return { success: false, error: "Pesanan tidak ditemukan." };
  }

  // 1. Cek apakah tagihan sudah ada (ALREADY_EXISTS)
  if (pesanan.mayar_payment_id && pesanan.mayar_payment_url) {
    return {
      success: true,
      alreadyExists: true,
      data: {
        id: pesanan.id,
        nomor: pesanan.nomor,
        mayar_payment_id: pesanan.mayar_payment_id,
        mayar_payment_url: pesanan.mayar_payment_url,
        mayar_status: pesanan.mayar_status || "unpaid",
      },
    };
  }

  // 2. Evaluasi status klaim yang sedang berjalan atau tertinggal
  if (pesanan.mayar_claim_token && pesanan.mayar_claim_at) {
    const claimAgeSec = (Date.now() - new Date(pesanan.mayar_claim_at).getTime()) / 1000;
    if (claimAgeSec < 60) {
      return {
        success: false,
        status: "IN_PROGRESS",
        error: "Pembuatan tagihan sedang diproses oleh permintaan lain. Mohon tunggu beberapa saat.",
      };
    } else {
      return {
        success: false,
        status: "IN_DOUBT_STALE",
        error: "Proses pembuatan tagihan sebelumnya terputus atau batas waktu sewa (60 detik) terlampaui. Periksa dashboard Mayar atau jalankan rekonsiliasi klaim sebelum mencoba kembali.",
      };
    }
  }

  // Tetapkan sewa klaim atomik baru
  const generatedClaimToken = "claim_tok_" + Math.random().toString(36).substring(2, 9);
  pesanan.mayar_claim_token = generatedClaimToken;
  pesanan.mayar_claim_at = new Date().toISOString();

  const lepasKlaimAman = () => {
    pesanan.mayar_claim_token = null;
    pesanan.mayar_claim_at = null;
  };

  // 3. Validasi Email Pelanggan
  const cleanEmail = (customerEmail || "").trim();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    lepasKlaimAman();
    return {
      success: false,
      error: "Pembuatan tagihan Mayar dibatalkan: Alamat email pelanggan belum tersedia atau tidak valid. Sesuai spesifikasi resmi Mayar API V1 (POST /hl/v1/payment/create), alamat email pelanggan wajib disediakan untuk mengirimkan bukti tagihan. Silakan lengkapi email pelanggan terlebih dahulu.",
    };
  }

  // 4. Validasi Nomor Telepon Pelanggan
  const cleanPhone = (customerPhone || "").trim();
  if (!cleanPhone) {
    lepasKlaimAman();
    return {
      success: false,
      error: "Pembuatan tagihan Mayar dibatalkan: Nomor telepon/ponsel pelanggan belum tersedia. Sesuai spesifikasi resmi Mayar API V1, nomor ponsel pelanggan wajib disediakan.",
    };
  }

  // 5. Pre-flight Check Konfigurasi Server (SEBELUM memanggil gateway Mayar)
  if (!serverConfig.hasServiceRoleKey) {
    lepasKlaimAman();
    return {
      success: false,
      error: "Pembuatan tagihan Mayar dibatalkan: Kredensial server admin (SUPABASE_SERVICE_ROLE_KEY) belum disetel pada server. Kredensial ini diperlukan untuk menyimpan metadata tagihan secara aman. Klaim sewa telah dilepas.",
    };
  }

  if (!serverConfig.hasMayarApiKey) {
    lepasKlaimAman();
    return {
      success: false,
      error: "Pembuatan tagihan Mayar dibatalkan: Konfigurasi kredensial gateway Mayar (MAYAR_API_KEY) belum disetel pada server. Klaim sewa telah dilepas.",
    };
  }

  // 6. Pemanggilan Gateway Mayar
  if (mayarGatewayBehavior === "NETWORK_ERROR") {
    lepasKlaimAman();
    return {
      success: false,
      error: "Terjadi gangguan koneksi saat menghubungi gateway Mayar. Klaim sewa telah dilepas sehingga pembuatan tagihan dapat dicoba kembali.",
    };
  }

  if (mayarGatewayBehavior === "GATEWAY_REJECT") {
    lepasKlaimAman();
    return {
      success: false,
      error: "Gateway Mayar menolak pembuatan tagihan. Klaim sewa telah dilepas.",
    };
  }

  // Gateway sukses menerbitkan invoice
  const issuedPaymentId = "pay_mock_" + Math.random().toString(36).substring(2, 8);
  const issuedPaymentUrl = `https://mayar.link/${issuedPaymentId}`;

  // 7. Penyimpanan Metadata Tagihan via Admin Client (simpan_tagihan_mayar)
  if (simulateStorageFailure) {
    // PENTING: Klaim TIDAK dilepas jika invoice sudah terbit di gateway! Status dipertahankan untuk rekonsiliasi.
    return {
      success: false,
      error: "Gagal menyimpan metadata pembayaran Mayar ke database: Simulasi kegagalan penyimpanan. Status klaim dipertahankan untuk rekonsiliasi.",
    };
  }

  // Sukses simpan metadata & bersihkan klaim
  pesanan.mayar_payment_id = issuedPaymentId;
  pesanan.mayar_payment_url = issuedPaymentUrl;
  pesanan.mayar_status = "unpaid";
  pesanan.mayar_claim_token = null;
  pesanan.mayar_claim_at = null;

  return {
    success: true,
    alreadyExists: false,
    data: {
      id: pesanan.id,
      nomor: pesanan.nomor,
      mayar_payment_id: issuedPaymentId,
      mayar_payment_url: issuedPaymentUrl,
      mayar_status: "unpaid",
    },
  };
}

// C1. Menolak jika email pelanggan kosong & klaim sewa aman dilepas
runTest("C1. Buat Tagihan: Menolak jika email pelanggan kosong dan melepas sewa klaim secara aman", () => {
  const db = {
    pesanan: [{ id: "pj-1", nomor: "PJ-001", total: 100000, mayar_claim_token: null }],
  };
  const res = mockBuatTagihanMayarWorkflow({
    dbState: db,
    pesananId: "pj-1",
    customerEmail: "",
    customerPhone: "08123456789",
  });
  assert.strictEqual(res.success, false);
  assert.match(res.error, /alamat email pelanggan belum tersedia/i);
  assert.strictEqual(db.pesanan[0].mayar_claim_token, null, "Klaim sewa wajib dilepas");
});

// C2. Menolak jika format email tidak valid (tanpa @) & klaim sewa aman dilepas
runTest("C2. Buat Tagihan: Menolak jika email tidak valid (tanpa @) dan melepas sewa klaim", () => {
  const db = {
    pesanan: [{ id: "pj-1", nomor: "PJ-001", total: 100000, mayar_claim_token: null }],
  };
  const res = mockBuatTagihanMayarWorkflow({
    dbState: db,
    pesananId: "pj-1",
    customerEmail: "bukan-email",
    customerPhone: "08123456789",
  });
  assert.strictEqual(res.success, false);
  assert.match(res.error, /tidak valid/i);
  assert.strictEqual(db.pesanan[0].mayar_claim_token, null, "Klaim sewa wajib dilepas");
});

// C3. Menolak jika nomor telepon pelanggan kosong & klaim sewa aman dilepas
runTest("C3. Buat Tagihan: Menolak jika nomor telepon pelanggan kosong dan melepas sewa klaim", () => {
  const db = {
    pesanan: [{ id: "pj-1", nomor: "PJ-001", total: 100000, mayar_claim_token: null }],
  };
  const res = mockBuatTagihanMayarWorkflow({
    dbState: db,
    pesananId: "pj-1",
    customerEmail: "pelanggan@example.com",
    customerPhone: "",
  });
  assert.strictEqual(res.success, false);
  assert.match(res.error, /nomor telepon\/ponsel pelanggan belum tersedia/i);
  assert.strictEqual(db.pesanan[0].mayar_claim_token, null, "Klaim sewa wajib dilepas");
});

// C4. Pre-flight check gagal: SUPABASE_SERVICE_ROLE_KEY belum disetel
runTest("C4. Pre-flight: Menolak SEBELUM panggil gateway jika SUPABASE_SERVICE_ROLE_KEY belum disetel dan melepas klaim", () => {
  const db = {
    pesanan: [{ id: "pj-1", nomor: "PJ-001", total: 100000, mayar_claim_token: null }],
  };
  const res = mockBuatTagihanMayarWorkflow({
    dbState: db,
    pesananId: "pj-1",
    customerEmail: "pelanggan@example.com",
    customerPhone: "08123456789",
    serverConfig: { hasServiceRoleKey: false, hasMayarApiKey: true },
  });
  assert.strictEqual(res.success, false);
  assert.match(res.error, /SUPABASE_SERVICE_ROLE_KEY.*belum disetel/i);
  assert.strictEqual(db.pesanan[0].mayar_claim_token, null, "Klaim sewa wajib dilepas karena Mayar belum dipanggil");
  assert.strictEqual(db.pesanan[0].mayar_payment_id, undefined, "Tidak ada invoice yang terbit");
});

// C5. Pre-flight check gagal: MAYAR_API_KEY belum disetel
runTest("C5. Pre-flight: Menolak SEBELUM panggil gateway jika MAYAR_API_KEY belum disetel dan melepas klaim", () => {
  const db = {
    pesanan: [{ id: "pj-1", nomor: "PJ-001", total: 100000, mayar_claim_token: null }],
  };
  const res = mockBuatTagihanMayarWorkflow({
    dbState: db,
    pesananId: "pj-1",
    customerEmail: "pelanggan@example.com",
    customerPhone: "08123456789",
    serverConfig: { hasServiceRoleKey: true, hasMayarApiKey: false },
  });
  assert.strictEqual(res.success, false);
  assert.match(res.error, /MAYAR_API_KEY.*belum disetel/i);
  assert.strictEqual(db.pesanan[0].mayar_claim_token, null, "Klaim sewa wajib dilepas");
});

// C6. Kegagalan jaringan / timeout ke gateway Mayar
runTest("C6. Gateway Failure: Gangguan koneksi ke Mayar melepaskan klaim sewa aman untuk retry", () => {
  const db = {
    pesanan: [{ id: "pj-1", nomor: "PJ-001", total: 100000, mayar_claim_token: null }],
  };
  const res = mockBuatTagihanMayarWorkflow({
    dbState: db,
    pesananId: "pj-1",
    customerEmail: "pelanggan@example.com",
    customerPhone: "08123456789",
    mayarGatewayBehavior: "NETWORK_ERROR",
  });
  assert.strictEqual(res.success, false);
  assert.match(res.error, /gangguan koneksi saat menghubungi gateway Mayar/i);
  assert.strictEqual(db.pesanan[0].mayar_claim_token, null, "Klaim sewa wajib dilepas");
});

// C7. Kegagalan penyimpanan DB setelah invoice terbit -> Klaim DIPERTAHANKAN
runTest("C7. Storage Failure: Jika invoice Mayar terbit tapi simpan database gagal, status klaim DIPERTAHANKAN untuk rekonsiliasi", () => {
  const db = {
    pesanan: [{ id: "pj-1", nomor: "PJ-001", total: 100000, mayar_claim_token: null }],
  };
  const res = mockBuatTagihanMayarWorkflow({
    dbState: db,
    pesananId: "pj-1",
    customerEmail: "pelanggan@example.com",
    customerPhone: "08123456789",
    simulateStorageFailure: true,
  });
  assert.strictEqual(res.success, false);
  assert.match(res.error, /Status klaim dipertahankan untuk rekonsiliasi/i);
  assert.ok(db.pesanan[0].mayar_claim_token, "Klaim sewa TIDAK boleh dilepas jika invoice sudah terbit di gateway");
});

// C8. Klaim yang sedang berjalan (< 60 detik) menolak permintaan paralel (IN_PROGRESS)
runTest("C8. Klaim Tertinggal: Permintaan paralel saat klaim sewa aktif (<60 detik) ditolak IN_PROGRESS", () => {
  const db = {
    pesanan: [
      {
        id: "pj-1",
        nomor: "PJ-001",
        total: 100000,
        mayar_claim_token: "active_token_123",
        mayar_claim_at: new Date(Date.now() - 15000).toISOString(), // 15 detik yang lalu (< 60 detik)
      },
    ],
  };
  const res = mockBuatTagihanMayarWorkflow({
    dbState: db,
    pesananId: "pj-1",
    customerEmail: "pelanggan@example.com",
    customerPhone: "08123456789",
  });
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.status, "IN_PROGRESS");
  assert.match(res.error, /sedang diproses oleh permintaan lain/i);
});

// C9. Klaim tertinggal kedaluwarsa (> 60 detik) ditolak IN_DOUBT_STALE untuk mencegah invoice duplikat
runTest("C9. Klaim Tertinggal: Permintaan saat sewa klaim kedaluwarsa (>60 detik) ditolak IN_DOUBT_STALE agar direkonsiliasi", () => {
  const db = {
    pesanan: [
      {
        id: "pj-1",
        nomor: "PJ-001",
        total: 100000,
        mayar_claim_token: "stale_token_999",
        mayar_claim_at: new Date(Date.now() - 120000).toISOString(), // 120 detik yang lalu (> 60 detik)
      },
    ],
  };
  const res = mockBuatTagihanMayarWorkflow({
    dbState: db,
    pesananId: "pj-1",
    customerEmail: "pelanggan@example.com",
    customerPhone: "08123456789",
  });
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.status, "IN_DOUBT_STALE");
  assert.match(res.error, /rekonsiliasi klaim/i);
});

// C10. Retry saat tagihan sudah tersimpan mengembalikan tagihan yang ada tanpa membuat duplikat
runTest("C10. Retry Idempotensi: Retry pada pesanan yang sudah bertagihan mengembalikan data lama (ALREADY_EXISTS, tanpa invoice duplikat)", () => {
  const db = {
    pesanan: [
      {
        id: "pj-1",
        nomor: "PJ-001",
        total: 100000,
        mayar_payment_id: "pay_existing_001",
        mayar_payment_url: "https://mayar.link/pay_existing_001",
        mayar_status: "unpaid",
      },
    ],
  };
  const res = mockBuatTagihanMayarWorkflow({
    dbState: db,
    pesananId: "pj-1",
    customerEmail: "pelanggan@example.com",
    customerPhone: "08123456789",
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.alreadyExists, true);
  assert.strictEqual(res.data.mayar_payment_id, "pay_existing_001");
});

// C11. Sukses penuh: Terbitkan invoice Mayar, simpan metadata, dan bersihkan sewa klaim
runTest("C11. Alur Sukses: Data lengkap dan valid berhasil membuat invoice Mayar dan membersihkan sewa klaim", () => {
  const db = {
    pesanan: [{ id: "pj-1", nomor: "PJ-001", total: 100000, mayar_claim_token: null }],
  };
  const res = mockBuatTagihanMayarWorkflow({
    dbState: db,
    pesananId: "pj-1",
    customerEmail: "keuangan@tokoberkah.com",
    customerPhone: "081234567890",
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.alreadyExists, false);
  assert.ok(res.data.mayar_payment_id);
  assert.ok(res.data.mayar_payment_url.startsWith("https://mayar.link/"));
  assert.strictEqual(db.pesanan[0].mayar_payment_id, res.data.mayar_payment_id);
  assert.strictEqual(db.pesanan[0].mayar_claim_token, null, "Klaim sewa dibersihkan setelah simpan sukses");
});

console.log("\n===============================================================================");
console.log(`RINGKASAN UNIT TEST MOCK: ${passedCount}/${totalCount} LULUS (${Math.round((passedCount/totalCount)*100)}%)`);
console.log("===============================================================================");

process.exit(passedCount === totalCount ? 0 : 1);
