import "server-only";

import {
  MayarCreatePaymentRequest,
  MayarCreatePaymentResponse,
  MayarInvoiceCreateData,
  MayarPaymentData,
  MayarPaymentStatusData,
  MayarPaymentStatusResponse,
} from "@/types/mayar";

// Proteksi runtime: Memastikan service ini hanya dieksekusi di sisi server Node.js
if (typeof window !== "undefined") {
  throw new Error("Mayar client service hanya boleh dijalankan di sisi server.");
}

/**
 * Timeout standar untuk pemanggilan Mayar API (12 detik).
 */
const MAYAR_REQUEST_TIMEOUT_MS = 12000;

/**
 * Helper untuk mengambil konfigurasi kredensial Mayar secara aman di server.
 */
function getMayarConfig(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.MAYAR_API_KEY;
  // Domain resmi Mayar API V2 (sumber: docs.mayar.id/api-reference-v2/migration-from-v1.md):
  //   Produksi: https://api.mayar.id/hl/v2
  //   Sandbox:  https://api.mayar.io/hl/v2
  // Setel MAYAR_BASE_URL di .env.local sesuai environment yang digunakan.
  const baseUrl = (process.env.MAYAR_BASE_URL || "https://api.mayar.io/hl/v2")
    .trim()
    .replace(/\/+$/, "");

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    throw new Error(
      "Konfigurasi MAYAR_API_KEY belum disetel pada environment server (.env.local)."
    );
  }

  return {
    apiKey: apiKey.trim(),
    baseUrl,
  };
}

/**
 * Membuat Invoice Tagihan Mayar (POST /hl/v2/invoices/create).
 *
 * MENEGAKKAN ATURAN KEAMANAN & INTEGRITAS:
 * 1. Hanya dieksekusi di sisi server.
 * 2. Nominal wajib bilangan bulat positif (Rupiah penuh).
 * 3. Header otorisasi dikirimkan secara aman tanpa pernah dicatat ke log sistem.
 * 4. Berhasil membuat tagihan HANYA menghasilkan status 'unpaid' (bukan pembayaran selesai).
 *
 * Kontrak Mayar API V2: POST /hl/v2/invoices/create
 * Field wajib: name, email, mobile, items[]
 * Respons data: { id, transactionId?, link, expiredAt? (epoch ms), extraData? }
 * TIDAK ada field status/amount/expired_date dalam respons create.
 */
export async function createSinglePayment(
  params: MayarCreatePaymentRequest
): Promise<{ success: boolean; data?: MayarPaymentData; error?: string }> {
  try {
    // 1. Validasi Input Parameter Sesuai Kontrak Mayar API V2
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
        error: "Alamat email pelanggan wajib diisi dan berformat valid sesuai kontrak Mayar API V2.",
      };
    }

    const cleanMobile = (params.mobile || "").trim();
    if (!cleanMobile) {
      return {
        success: false,
        error: "Nomor ponsel pelanggan wajib diisi sesuai kontrak Mayar API V2.",
      };
    }

    const { apiKey, baseUrl } = getMayarConfig();
    const endpointUrl = `${baseUrl}/invoices/create`;

    // LOG DIAGNOSTIK AMAN: endpoint tanpa kredensial, validasi field
    // Catatan: email dimasking, nomor telepon tidak dicatat
    const emailDomain = cleanEmail.includes("@") ? cleanEmail.split("@")[1] : "[tidak valid]";
    console.info(
      `[MAYAR_CREATE] endpoint=${endpointUrl} ` +
      `name_valid=${params.name.trim().length > 0} ` +
      `email_domain=${emailDomain} ` +
      `mobile_valid=${cleanMobile.length > 0} ` +
      `amount=${cleanAmount}`
    );

    const payload = {
      name: params.name.trim(),
      email: cleanEmail,
      mobile: cleanMobile,
      description:
        params.description?.trim() || params.name.trim(),
      items: [
        {
          quantity: 1,
          rate: cleanAmount,
          description:
            params.description?.trim() || params.name.trim(),
        },
      ],
    };

    // 2. Eksekusi HTTP Request dengan Abort Timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MAYAR_REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (fetchErr: unknown) {
      if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
        return {
          success: false,
          error: "Batas waktu koneksi ke server Mayar terlampaui (timeout 12 detik).",
        };
      }
      return {
        success: false,
        error: `Gagal menghubungkan ke server Mayar: ${fetchErr instanceof Error ? fetchErr.message : "Network error"}`,
      };
    } finally {
      clearTimeout(timeoutId);
    }

    // 3. Parsing & Validasi Respons JSON
    let responseBody: MayarCreatePaymentResponse | null = null;
    try {
      responseBody = (await res.json()) as MayarCreatePaymentResponse;
    } catch {
      console.error(
        `[MAYAR_CREATE] Gagal parse JSON respons: HTTP ${res.status} ` +
        `content-type=${res.headers.get("content-type") ?? "unknown"}`
      );
      return {
        success: false,
        error: `Respons dari server Mayar tidak valid (HTTP ${res.status}).`,
      };
    }

    // LOG DIAGNOSTIK AMAN: status HTTP dan bentuk respons (bukan konten sensitif)
    console.info(
      `[MAYAR_CREATE] HTTP_status=${res.status} ` +
      `body_statusCode=${responseBody?.statusCode ?? "null"} ` +
      `has_data=${responseBody?.data != null} ` +
      `has_link=${!!(responseBody?.data as MayarInvoiceCreateData | null)?.link}`
    );

    if (!res.ok || (responseBody != null && responseBody.statusCode != null && responseBody.statusCode >= 400)) {
      // Ekstrak pesan error — V2 menggunakan 'messages' (plural) pada kebanyakan endpoint,
      // beberapa endpoint menggunakan 'message' (singular). Ambil keduanya secara defensif.
      const rawMsg = responseBody?.messages || responseBody?.message;
      // Tangani kemungkinan messages berupa array (beberapa implementasi API)
      const apiMsg = Array.isArray(rawMsg)
        ? (rawMsg as string[]).join("; ")
        : (rawMsg ? String(rawMsg) : `HTTP ${res.status}`);

      console.error(
        `[MAYAR_CREATE] Penolakan dari API: HTTP=${res.status} ` +
        `statusCode=${responseBody?.statusCode ?? "null"} ` +
        `msg_shape=${Array.isArray(rawMsg) ? "array" : typeof rawMsg}`
      );
      return {
        success: false,
        error: `Mayar API menolak pembuatan tagihan: ${apiMsg}`,
      };
    }

    // 4. Validasi data respons sesuai kontrak V2
    // V2 create invoice mengembalikan: { id, transactionId?, link, expiredAt?, extraData? }
    // TIDAK ada: status, amount, url, paymentUrl, expired_date
    const data = responseBody?.data as MayarInvoiceCreateData | null;
    if (!data || !data.id || !data.link) {
      console.error(
        `[MAYAR_CREATE] Respons tidak lengkap: has_data=${data != null} ` +
        `has_id=${!!(data as MayarInvoiceCreateData | null)?.id} ` +
        `has_link=${!!(data as MayarInvoiceCreateData | null)?.link}`
      );
      return {
        success: false,
        error: "Respons Mayar berhasil namun data ID atau tautan pembayaran tidak lengkap.",
      };
    }

    // 5. Normalisasi: V2 hanya mengembalikan `link` (bukan url/paymentUrl) pada create.
    // status dan amount TIDAK dikembalikan V2 — diisi dari nilai lokal yang terverifikasi.
    const paymentLink = data.link;

    return {
      success: true,
      data: {
        id: data.id,
        link: paymentLink,
        url: paymentLink,
        paymentUrl: paymentLink,
        status: "unpaid",           // V2 tidak mengembalikan status saat create
        amount: cleanAmount,         // V2 tidak mengembalikan amount — gunakan nilai yang dikirim
        expiredAt: data.expiredAt,  // Epoch ms dari V2 (mungkin undefined)
        expired_date: undefined,     // Tidak digunakan di V2
      },
    };
  } catch (err: unknown) {
    const safeMsg = err instanceof Error ? err.message : "Terjadi kesalahan internal pada Mayar client.";
    return { success: false, error: safeMsg };
  }
}

/**
 * Memeriksa Ulang Status Tagihan/Transaksi ke Server Mayar (GET /hl/v1/payment/{id}).
 *
 * MENEGAKKAN ATURAN KEAMANAN PRD BAB 11:
 * Digunakan oleh backend/webhook worker untuk memeriksa ulang status riil tagihan
 * langsung ke server Mayar sebelum menandai pesanan sebagai 'lunas'.
 */
export async function getPaymentStatus(
  paymentId: string
): Promise<{ success: boolean; data?: MayarPaymentStatusData; error?: string }> {
  try {
    if (!paymentId || typeof paymentId !== "string" || paymentId.trim().length === 0) {
      return { success: false, error: "ID pembayaran Mayar wajib diisi." };
    }

    const cleanPaymentId = paymentId.trim();
    const { apiKey, baseUrl } = getMayarConfig();
    let endpointUrl = `${baseUrl}/payment/${encodeURIComponent(cleanPaymentId)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MAYAR_REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(endpointUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });

      // Fallback ke endpoint /invoice/{id} jika /payment/{id} mengembalikan 404
      if (res.status === 404) {
        endpointUrl = `${baseUrl}/invoice/${encodeURIComponent(cleanPaymentId)}`;
        res = await fetch(endpointUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          signal: controller.signal,
          cache: "no-store",
        });
      }
    } catch (fetchErr: unknown) {
      if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
        return {
          success: false,
          error: "Batas waktu pemeriksaan status ke server Mayar terlampaui (timeout 12 detik).",
        };
      }
      return {
        success: false,
        error: `Gagal menghubungi server Mayar: ${fetchErr instanceof Error ? fetchErr.message : "Network error"}`,
      };
    } finally {
      clearTimeout(timeoutId);
    }

    let responseBody: (MayarPaymentStatusResponse & { message?: string }) | null = null;
    try {
      responseBody = (await res.json()) as (MayarPaymentStatusResponse & { message?: string });
    } catch {
      return {
        success: false,
        error: `Respons pemeriksaan status Mayar tidak valid (HTTP ${res.status}).`,
      };
    }

    if (!res.ok || (responseBody.statusCode && responseBody.statusCode >= 400)) {
      const apiMsg = responseBody.messages || responseBody.message || `HTTP ${res.status}`;
      return {
        success: false,
        error: `Mayar API gagal memverifikasi tagihan: ${apiMsg}`,
      };
    }

    const data = responseBody.data;
    if (!data || !data.id) {
      return {
        success: false,
        error: "Data transaksi tidak ditemukan pada respons server Mayar.",
      };
    }

    return {
      success: true,
      data: {
        id: data.id,
        status: (data.status || "unpaid").toLowerCase(),
        amount: Number(data.amount) || 0,
        currency: (data as { currency?: string }).currency,
        name: data.name,
        email: data.email,
        paymentMethod: data.paymentMethod,
        transactionId: data.transactionId,
        paidAt: data.paidAt,
      },
    };
  } catch (err: unknown) {
    const safeMsg = err instanceof Error ? err.message : "Terjadi kesalahan internal pada Mayar client.";
    return { success: false, error: safeMsg };
  }
}
