import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentStatus } from "@/lib/mayar/client";
import { MayarWebhookPayload } from "@/types/mayar";

/**
 * Route Handler Webhook Mayar: POST /api/webhooks/mayar
 *
 * MENEGAKKAN ATURAN INTEGRASI & KEAMANAN SISTEM (PRD Bab 6.1, 11, BR-07, BR-12):
 * 1. Verifikasi Keaslian Notifikasi (Autentikasi):
 *    - Token rahasia diverifikasi dari query parameter (?token= atau ?secret=)
 *      atau header resmi (x-mayar-token, x-mayar-secret, atau Authorization Bearer)
 *      jika MAYAR_WEBHOOK_SECRET disetel di server.
 *    - VERIFIKASI GANDA DEFENSIF (Defense-in-depth): Backend TIDAK mempercayai payload
 *      mentah dari jaringan begitu saja. Server melakukan panggilan balik (callback)
 *      langsung ke endpoint Mayar GET /hl/v1/payment/{id} untuk memastikan status riil
 *      adalah 'paid' dan nominal transaksi cocok dengan data pesanan di basis data.
 * 2. Idempotensi Mutlak (BR-07):
 *    - Jika pesanan sudah berstatus 'lunas', webhook merespons HTTP 200 OK langsung
 *      tanpa memicu pembaruan berulang atau pencatatan duplikat.
 * 3. Validasi Status Transisi:
 *    - Hanya pesanan berstatus 'dikirim' yang dapat dicatat lunas.
 * 4. Integritas Nominal:
 *    - Nominal yang diverifikasi dari server Mayar wajib cocok 100% dengan total pesanan.
 * 5. Pencatatan Audit Log Wajib (BR-12):
 *    - Dicatat ke tabel public.audit_log dengan aksi 'pelunasan_mayar'.
 */

export async function GET() {
  return NextResponse.json(
    { status: "ok", service: "Sinar Abadi ERP - Mayar Webhook Endpoint" },
    { status: 200 }
  );
}

export async function POST(req: NextRequest) {
  try {
    // 1. Autentikasi Webhook (Wajib dijalankan SEBELUM memproses payload apa pun)
    const urlToken =
      req.nextUrl.searchParams.get("token") ||
      req.nextUrl.searchParams.get("secret");
    const headerToken =
      req.headers.get("x-mayar-token") ||
      req.headers.get("x-mayar-secret") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    const receivedToken = (urlToken || headerToken || "").trim();

    // Jika token wajib tidak ada, tolak langsung dengan HTTP 401 tanpa parsing payload
    if (!receivedToken) {
      return NextResponse.json(
        { error: "Akses ditolak: Token autentikasi webhook tidak disertakan." },
        { status: 401 }
      );
    }

    const configuredSecret = (
      process.env.MAYAR_WEBHOOK_SECRET ||
      process.env.MAYAR_WEBHOOK_TOKEN ||
      ""
    ).trim();

    if (!configuredSecret) {
      console.error(
        "[MAYAR_WEBHOOK_CONFIG_ERROR] MAYAR_WEBHOOK_SECRET belum dikonfigurasi di server."
      );
      return NextResponse.json(
        { error: "Akses ditolak: Konfigurasi autentikasi webhook belum siap di server." },
        { status: 401 }
      );
    }

    // Bandingkan token rahasia secara aman (timing-safe)
    const bufReceived = Buffer.from(receivedToken);
    const bufConfigured = Buffer.from(configuredSecret);
    const isTokenValid =
      bufReceived.length === bufConfigured.length &&
      crypto.timingSafeEqual(bufReceived, bufConfigured);

    if (!isTokenValid) {
      console.warn(
        "[MAYAR_WEBHOOK_AUTH_FAILED] Akses webhook ditolak: Token autentikasi tidak cocok."
      );
      return NextResponse.json(
        { error: "Akses ditolak: Token autentikasi webhook tidak valid." },
        { status: 401 }
      );
    }

    // 2. Validasi Content-Type (Setelah autentikasi berhasil)
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        {
          error:
            "Format request tidak valid: Header Content-Type harus 'application/json'.",
        },
        { status: 400 }
      );
    }

    // 3. Parsing Payload JSON
    let body: MayarWebhookPayload | Record<string, unknown> | null = null;
    try {
      body = (await req.json()) as MayarWebhookPayload;
    } catch {
      return NextResponse.json(
        { error: "Format request tidak valid: JSON payload rusak atau kosong." },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
      return NextResponse.json(
        { error: "Format request tidak valid: Payload webhook kosong." },
        { status: 400 }
      );
    }

    // 3. Filter Event Notifikasi
    // Event resmi Mayar untuk pembayaran selesai adalah "payment.received"
    const rawBodyRecord = body as unknown as Record<string, unknown>;
    const eventType = String(
      (body as { event?: string }).event ||
        rawBodyRecord["event.received"] ||
        ""
    ).trim();

    if (
      eventType &&
      eventType !== "payment.received" &&
      eventType !== "payment.success"
    ) {
      // Event informasional lain (misal payment.reminder) diterima dengan 200 OK tanpa mutasi pesanan
      return NextResponse.json(
        {
          received: true,
          message: `Event '${eventType}' diterima namun tidak memicu pelunasan.`,
        },
        { status: 200 }
      );
    }

    // 4. Ekstraksi ID Transaksi / Payment ID
    const rawData =
      typeof body.data === "object" && body.data !== null
        ? (body.data as unknown as Record<string, unknown>)
        : rawBodyRecord;

    const paymentId = String(
      rawData.id ||
        rawData.paymentLinkId ||
        rawData.transactionId ||
        rawData.invoiceId ||
        ""
    ).trim();

    if (!paymentId) {
      console.error(
        "[MAYAR_WEBHOOK_ERROR] Payload webhook tidak memuat ID tagihan/pembayaran:",
        body
      );
      return NextResponse.json(
        { error: "ID pembayaran tidak ditemukan pada payload webhook." },
        { status: 400 }
      );
    }

    // 5. VERIFIKASI GANDA DEFENSIF (Callback Langsung ke Server Mayar)
    // Jangan mempercayai isi payload dari jaringan begitu saja.
    // Lakukan query balik ke GET /hl/v1/payment/{id} menggunakan kunci API resmi.
    const verifyRes = await getPaymentStatus(paymentId);
    if (!verifyRes.success || !verifyRes.data) {
      console.warn(
        `[MAYAR_WEBHOOK_VERIFY_FAILED] Gagal memeriksa status riil tagihan ${paymentId} ke server Mayar:`,
        verifyRes.error
      );
      return NextResponse.json(
        {
          error:
            "Verifikasi transaksi gagal ke gateway Mayar: " +
            (verifyRes.error || "Data pembayaran tidak ditemukan."),
        },
        { status: 422 }
      );
    }

    const verifiedPayment = verifyRes.data;
    const verifiedStatus = (verifiedPayment.status || "").toLowerCase();

    // Pastikan status riil di Mayar memang benar-benar sudah 'paid' sesuai kontrak resmi Headless API V1
    if (verifiedStatus !== "paid") {
      console.info(
        `[MAYAR_WEBHOOK_NOT_PAID] Tagihan ${paymentId} terverifikasi namun status riil adalah '${verifiedStatus}'. Pesanan tidak diubah.`
      );
      return NextResponse.json(
        {
          received: true,
          message: `Status transaksi saat ini adalah '${verifiedStatus}', bukan 'paid'.`,
        },
        { status: 200 }
      );
    }

    // 6. Inisialisasi Supabase Admin Client
    let adminSupabase;
    try {
      adminSupabase = createAdminClient();
    } catch (adminErr) {
      console.error(
        "[MAYAR_WEBHOOK_ADMIN_ERROR] Gagal menginisialisasi Supabase Admin Client:",
        adminErr instanceof Error ? adminErr.message : "Kredensial belum disetel"
      );
      return NextResponse.json(
        { error: "Konfigurasi server basis data admin belum tersedia." },
        { status: 500 }
      );
    }

    // 7. Temukan Pesanan Jual Berdasarkan mayar_payment_id
    const { data: pesanan, error: pesananErr } = await adminSupabase
      .from("pesanan_jual")
      .select("id, nomor, status, total, mayar_payment_id, mayar_status, dilunasi_pada, dibuat_oleh")
      .eq("mayar_payment_id", paymentId)
      .maybeSingle();

    if (pesananErr) {
      console.error(
        `[MAYAR_WEBHOOK_DB_ERROR] Query pesanan dengan payment_id ${paymentId} gagal:`,
        pesananErr.message
      );
      return NextResponse.json(
        { error: `Kesalahan query basis data: ${pesananErr.message}` },
        { status: 500 }
      );
    }

    if (!pesanan) {
      console.warn(
        `[MAYAR_WEBHOOK_ORDER_NOT_FOUND] Tagihan Mayar ${paymentId} telah terbayar tetapi pesanan terkait tidak ditemukan di database.`
      );
      return NextResponse.json(
        {
          error: `Pesanan dengan mayar_payment_id '${paymentId}' tidak ditemukan pada basis data.`,
        },
        { status: 404 }
      );
    }

    // 8. Validasi Mata Uang Terverifikasi (Hanya IDR yang didukung)
    const normalizedCurrency = (verifiedPayment.currency || "").trim().toUpperCase();
    if (!normalizedCurrency || normalizedCurrency !== "IDR") {
      console.error(
        `[MAYAR_WEBHOOK_CURRENCY_INVALID] Mata uang transaksi '${verifiedPayment.currency || ""}' tidak valid untuk pesanan ${pesanan.nomor}. Hanya transaksi IDR yang didukung.`
      );
      return NextResponse.json(
        {
          error: `Mata uang transaksi ('${verifiedPayment.currency || ""}') tidak sesuai. Hanya transaksi IDR yang didukung.`,
        },
        { status: 400 }
      );
    }

    // 9. Validasi Integritas Nominal (Anti-Fraud Check Eksak Tanpa Toleransi Pembulatan)
    // Nominal terverifikasi dari gateway wajib sama persis dengan total pesanan sebelum pemanggilan RPC
    const verifiedAmount = Number(verifiedPayment.amount);
    const pesananTotal = Number(pesanan.total);

    if (isNaN(verifiedAmount) || verifiedAmount !== pesananTotal) {
      console.error(
        `[MAYAR_WEBHOOK_FRAUD_ALERT] Nominal transaksi terverifikasi (Rp${verifiedAmount}) TIDAK COCOK dengan total pesanan (Rp${pesananTotal}) untuk pesanan ${pesanan.nomor}!`
      );
      return NextResponse.json(
        {
          error: `Integritas nominal gagal: Nominal pembayaran Mayar (Rp${verifiedAmount}) tidak cocok dengan total pesanan (Rp${pesananTotal}). Pelunasan dibatalkan demi keamanan audit.`,
        },
        { status: 400 }
      );
    }

    // 10. Pelunasan Pesanan, Validasi Status Transisi, dan Idempotensi Atomik Melalui RPC (PRD BR-07, BR-12)
    // Seluruh keputusan status, idempotensi mutlak (FOR UPDATE), dan pencatatan audit log
    // diserahkan secara eksklusif kepada RPC selesaikan_pembayaran_mayar (Migrasi 05).
    // Handler tidak melakukan early return untuk pesanan lunas, melainkan mengandalkan RPC sebagai single source of truth.
    //
    // KEBIJAKAN INTEGRITAS DATA:
    // Jika RPC belum terpasang di database (PGRST202 / does not exist), sistem TIDAK AKAN
    // mengubah status pesanan melalui REST API terpisah karena memisahkan update pesanan
    // dan insert audit log melanggar jaminan atomisitas dan berisiko meninggalkan inkonsistensi
    // audit log. Sebagai gantinya, sistem merespons HTTP 503 (Service Unavailable) secara aman
    // agar gateway Mayar mengulang pengiriman webhook (webhook retry) sesuai jadwal resminya
    // hingga migrasi database aktif di production.
    let dilunasiPada = new Date().toISOString();
    let isIdempotent = false;

    try {
      const { data: rpcData, error: rpcError } = await adminSupabase.rpc(
        "selesaikan_pembayaran_mayar",
        {
          p_pesanan_id: pesanan.id,
          p_payment_id: paymentId,
          p_verified_amount: verifiedAmount,
          p_verified_status: verifiedStatus,
          p_transaction_id: verifiedPayment.transactionId || null,
          p_payment_method: verifiedPayment.paymentMethod || null,
          p_pelaku_id: (pesanan as { dibuat_oleh?: string }).dibuat_oleh || null,
        }
      );

      if (rpcError) {
        // Jika fungsi belum terpasang di database, tolak pelunasan non-atomik dan picu retry gateway (HTTP 503)
        if (rpcError.code === "PGRST202" || rpcError.message.includes("does not exist")) {
          console.error(
            `[MAYAR_WEBHOOK_RPC_UNAVAILABLE] RPC selesaikan_pembayaran_mayar belum terpasang di database (Migrasi 05). Menolak pelunasan terpisah demi integritas data & audit log (merespons HTTP 503 untuk retry gateway Mayar).`
          );
          return NextResponse.json(
            {
              error:
                "Layanan pelunasan atomik belum siap: RPC database belum terpasang. Webhook akan diulang otomatis oleh gateway Mayar.",
            },
            { status: 503 }
          );
        }

        console.error(
          `[MAYAR_WEBHOOK_RPC_ERROR] RPC selesaikan_pembayaran_mayar menolak transaksi: ${rpcError.message}`
        );
        return NextResponse.json(
          { error: `Pelunasan ditolak oleh sistem database: ${rpcError.message}` },
          { status: 400 }
        );
      }

      if (rpcData) {
        const rpcRecord = rpcData as unknown as {
          idempotent?: boolean;
          message?: string;
          data?: { dilunasi_pada?: string };
        };
        isIdempotent = Boolean(rpcRecord.idempotent);
        if (rpcRecord.data?.dilunasi_pada) {
          dilunasiPada = rpcRecord.data.dilunasi_pada;
        }
      }
    } catch (rpcEx) {
      console.error(
        "[MAYAR_WEBHOOK_RPC_EXCEPTION] Eksepsi saat memanggil RPC pelunasan atomik:",
        rpcEx instanceof Error ? rpcEx.message : rpcEx
      );
      return NextResponse.json(
        {
          error:
            "Terjadi kendala koneksi ke basis data saat memproses pelunasan atomik. Webhook akan diulang oleh gateway.",
        },
        { status: 503 }
      );
    }

    // 13. Revalidasi Seluruh Cache Terkait di Sisi Server
    revalidatePath("/pesanan-jual");
    revalidatePath("/pelanggan");
    revalidatePath("/laporan");
    revalidatePath("/");

    return NextResponse.json(
      {
        received: true,
        success: true,
        idempotent: isIdempotent,
        message: isIdempotent
          ? `Pesanan ${pesanan.nomor} telah berstatus 'lunas' sebelumnya.`
          : `Pesanan ${pesanan.nomor} berhasil diverifikasi dan dicatat lunas melalui Mayar.`,
        data: {
          id: pesanan.id,
          nomor: pesanan.nomor,
          status: "lunas",
          dilunasi_pada: dilunasiPada,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan internal pada pemrosesan webhook Mayar.";
    console.error("[MAYAR_WEBHOOK_FATAL_ERROR]", errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
