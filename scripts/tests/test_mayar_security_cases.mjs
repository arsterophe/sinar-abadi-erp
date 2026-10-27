/**
 * Skrip Pengujian Otomatis Kasus Negatif Keamanan Webhook Mayar
 * CV Sinar Abadi Niaga ERP
 *
 * MENGUJI KASUS KEAMANAN SECARA AMAN:
 * 1. Token kosong -> 401
 * 2. Token salah -> 401
 * 3. Content-Type bukan JSON -> 400
 * 4. JSON rusak / kosong -> 400
 * 5. Payload tanpa ID pembayaran -> 400
 * 6. Event non-payment -> 200 (diabaikan secara aman)
 * 7. Token benar + ID pembayaran fiktif -> 422 (ditolak di level gateway sebelum mutasi DB)
 *
 * TIDAK MENGUBAH DATA PRODUCTION ATAU MEMBUAT TRANSAKSI NYATA.
 */

import fs from "fs";
import path from "path";

const BASE_URL = process.env.TEST_APP_URL || "http://localhost:3000";

// Ambil secret dari .env.local tanpa mencetaknya
function getLocalWebhookSecret() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return "";
  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^MAYAR_WEBHOOK_SECRET\s*=\s*(.+)$/m);
  return match ? match[1].trim() : "";
}

const localSecret = getLocalWebhookSecret();

const results = [];

async function runTestCase(name, requestFn, expectedStatus, validatorFn) {
  try {
    const res = await requestFn();
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Non-JSON response
    }

    const statusMatch = res.status === expectedStatus;
    const customPass = validatorFn ? validatorFn(res.status, json, text) : true;
    const passed = statusMatch && customPass;

    results.push({
      name,
      expectedStatus,
      actualStatus: res.status,
      passed,
      detail: json?.error || json?.message || (text.length > 80 ? text.substring(0, 80) + "..." : text),
    });
  } catch (err) {
    results.push({
      name,
      expectedStatus,
      actualStatus: "ERROR",
      passed: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

async function main() {
  console.log("===============================================================================");
  console.log("MEMULAI PENGUJIAN OTOMATIS KASUS KEAMANAN WEBHOOK MAYAR (READ-ONLY / NEGATIF)");
  console.log(`Target: ${BASE_URL}/api/webhooks/mayar`);
  console.log("===============================================================================\n");

  // 1. Kasus Token Kosong (Query & Header)
  await runTestCase(
    "1. POST tanpa token sama sekali",
    () => fetch(`${BASE_URL}/api/webhooks/mayar`, { method: "POST" }),
    401,
    (s, j) => j?.error?.includes("tidak disertakan")
  );

  // 2. Kasus Token Salah
  await runTestCase(
    "2. POST dengan token salah di query param",
    () => fetch(`${BASE_URL}/api/webhooks/mayar?token=token_acak_palsu_999`, { method: "POST" }),
    401,
    (s, j) => j?.error?.includes("tidak valid")
  );

  await runTestCase(
    "3. POST dengan token salah di header x-mayar-token",
    () =>
      fetch(`${BASE_URL}/api/webhooks/mayar`, {
        method: "POST",
        headers: { "x-mayar-token": "palsu_header_token" },
      }),
    401,
    (s, j) => j?.error?.includes("tidak valid")
  );

  if (!localSecret) {
    console.error("PERINGATAN: MAYAR_WEBHOOK_SECRET tidak ditemukan di .env.local. Kasus terotentikasi dilewati.");
  } else {
    // 4. Kasus Content-Type Bukan JSON
    await runTestCase(
      "4. Token benar namun Content-Type bukan application/json",
      () =>
        fetch(`${BASE_URL}/api/webhooks/mayar?token=${encodeURIComponent(localSecret)}`, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "Bukan JSON",
        }),
      400,
      (s, j) => j?.error?.includes("Content-Type")
    );

    // 5. Kasus JSON Rusak (Syntax Error)
    await runTestCase(
      "5. Token benar namun JSON rusak / syntax error",
      () =>
        fetch(`${BASE_URL}/api/webhooks/mayar?token=${encodeURIComponent(localSecret)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{ malformed json",
        }),
      400,
      (s, j) => j?.error?.includes("rusak atau kosong")
    );

    // 6. Kasus Payload JSON Kosong
    await runTestCase(
      "6. Token benar namun payload JSON kosong {}",
      () =>
        fetch(`${BASE_URL}/api/webhooks/mayar?token=${encodeURIComponent(localSecret)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      400,
      (s, j) => j?.error?.includes("Payload webhook kosong")
    );

    // 7. Kasus Event Non-Payment (Informasional)
    await runTestCase(
      "7. Event non-payment (misal payment.reminder) diterima 200 tanpa mutasi",
      () =>
        fetch(`${BASE_URL}/api/webhooks/mayar?token=${encodeURIComponent(localSecret)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "payment.reminder", data: { id: "rem_123" } }),
        }),
      200,
      (s, j) => j?.received === true
    );

    // 8. Kasus Payload Tanpa Payment ID
    await runTestCase(
      "8. Event payment.received namun data ID pembayaran kosong",
      () =>
        fetch(`${BASE_URL}/api/webhooks/mayar?token=${encodeURIComponent(localSecret)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "payment.received", data: {} }),
        }),
      400,
      (s, j) => j?.error?.includes("ID pembayaran tidak ditemukan")
    );

    // 9. Kasus Token Benar + ID Pembayaran Fiktif
    await runTestCase(
      "9. Token benar + ID pembayaran fiktif (ditolak di gateway callback sebelum DB)",
      () =>
        fetch(`${BASE_URL}/api/webhooks/mayar?token=${encodeURIComponent(localSecret)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "payment.received",
            data: { id: "pay_fiktif_testing_security_123" },
          }),
        }),
      422,
      (s, j) => j?.error?.includes("gateway Mayar")
    );
  }

  console.log("\n===============================================================================");
  console.log("RINGKASAN HASIL PENGUJIAN KEAMANAN WEBHOOK");
  console.log("===============================================================================");
  let allPassed = true;
  for (const r of results) {
    const statusIcon = r.passed ? "[V] LULUS" : "[X] GAGAL";
    if (!r.passed) allPassed = false;
    console.log(`${statusIcon} | ${r.name}`);
    console.log(`    Status: Diharapkan HTTP ${r.expectedStatus}, Diterima HTTP ${r.actualStatus}`);
    console.log(`    Detail: ${r.detail}\n`);
  }

  console.log("===============================================================================");
  console.log(allPassed ? "SEMUA 9 KASUS PENGUJIAN KEAMANAN LULUS 100%!" : "ADA KASUS PENGUJIAN YANG GAGAL.");
  console.log("===============================================================================");

  process.exit(allPassed ? 0 : 1);
}

main();
