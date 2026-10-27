import "server-only";

import {
  MayarCreatePaymentRequest,
  MayarCreatePaymentResponse,
  MayarInvoiceCreateData,
  MayarPaymentData,
  MayarPaymentStatusData,
  MayarPaymentStatusResponse,
} from "@/types/mayar";
import {
  validateMayarPaymentUrl,
  DEFAULT_SANDBOX_TENANT,
} from "./urlHelper";

export { validateMayarPaymentUrl, DEFAULT_SANDBOX_TENANT };

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
    if (!cleanEmail || !cleanEmail.includes("@") || cleanEmail.indexOf("@") === 0 || cleanEmail.indexOf("@") === cleanEmail.length - 1) {
      return {
        success: false,
        error: "Alamat email pelanggan wajib diisi dan berformat valid sesuai kontrak Mayar API V2.",
      };
    }

    const cleanMobile = (params.mobile || "").trim();
    const digitsOnly = cleanMobile.replace(/\D/g, "");
    if (!cleanMobile || digitsOnly.length < 10) {
      return {
        success: false,
        error: "Nomor ponsel pelanggan wajib diisi (minimal 10 digit angka) sesuai kontrak Mayar API V2.",
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
      `mobile_digits=${digitsOnly.length} ` +
      `amount=${cleanAmount}`
    );

    const requestStartTime = Date.now();
    const uniqueOrderRef = params.uniqueRef ? String(params.uniqueRef).trim() : "";
    const descriptionText = params.description?.trim() || (uniqueOrderRef ? `Tagihan pesanan [REF:${uniqueOrderRef}]` : params.name.trim());
    const payload: Record<string, unknown> = {
      name: params.name.trim(),
      email: cleanEmail,
      mobile: cleanMobile,
      description: descriptionText,
      items: [
        {
          name: params.name.trim(),
          quantity: 1,
          rate: cleanAmount,
          description: descriptionText,
        },
      ],
    };

    if (params.redirectUrl && typeof params.redirectUrl === "string" && params.redirectUrl.trim()) {
      payload.redirectUrl = params.redirectUrl.trim();
    }

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
      const apiMsg = Array.isArray(rawMsg)
        ? (rawMsg as string[]).join("; ")
        : (rawMsg ? String(rawMsg) : `HTTP ${res.status}`);

      // PENANGANAN SPESIFIK SANDBOX MAYAR DENGAN VERIFIKASI IDENTITAS KETAT:
      // Pada sandbox Mayar (api.mayar.io), backend Express Mayar berhasil membuat invoice
      // di basis data Mayar, namun melempar exception internal HTTP 500:
      // "Cannot read properties of null (reading 'name')" saat post-processing response.
      // KEAMANAN KETAT: Dilarang memulihkan secara spekulatif! Invoice HANYA dipulihkan jika
      // ditemukan TEPAT 1 invoice yang memenuhi seluruh kriteria identitas berikut:
      // 1. Nominal persis sama.
      // 2. Email pelanggan cocok (jika data customer tersedia dari Mayar).
      // 3. Waktu pembuatan (createdAt) baru (dengan toleransi clock skew terdistribusi).
      // 4. Identifier unik (uniqueOrderRef) terkandung pada deskripsi invoice.
      const isSandboxNullNameAnomaly =
        (res.status >= 500 || (responseBody?.statusCode != null && responseBody.statusCode >= 500)) &&
        typeof apiMsg === "string" &&
        apiMsg.includes("Cannot read properties of null (reading 'name')");

      if (isSandboxNullNameAnomaly) {
        console.warn(
          "[MAYAR_CREATE] Terdeteksi anomali respons HTTP 500 Mayar Sandbox. Memulai pencocokan invoice ketat di gateway..."
        );
        try {
          const checkController = new AbortController();
          const checkTimeout = setTimeout(() => checkController.abort(), 6000);
          const listRes = await fetch(`${baseUrl}/invoices`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Accept: "application/json",
            },
            signal: checkController.signal,
            cache: "no-store",
          });
          clearTimeout(checkTimeout);

          if (listRes.ok) {
            const listData = (await listRes.json()) as {
              data?: Array<{
                id: string;
                amount: number;
                description: string;
                link: string;
                status?: string;
                createdAt?: number;
                customer?: { email?: string; name?: string };
              }>;
            };

            // Gunakan header Date Mayar sebagai baseline waktu server resmi jika tersedia
            const serverDateHeader = listRes.headers.get("date") || res.headers.get("date");
            const referenceTime = serverDateHeader ? new Date(serverDateHeader).getTime() : requestStartTime;
            const maxClockSkewMs = 15 * 60 * 1000; // 15 menit toleransi clock skew terdistribusi

            const candidateInvoices = (listData.data || []).filter((inv) => {
              // 1. Validasi nominal wajib persis sama
              if (Number(inv.amount) !== cleanAmount) return false;

              // 2. Validasi email pelanggan jika tersedia dari invoice Mayar
              if (inv.customer?.email && inv.customer.email.trim().toLowerCase() !== cleanEmail.toLowerCase()) {
                return false;
              }

              // 3. Validasi waktu pembuatan: Wajib epoch timestamp baru (toleransi clock skew 15 menit)
              const invCreatedMs =
                typeof inv.createdAt === "number"
                  ? (inv.createdAt < 10000000000 ? inv.createdAt * 1000 : inv.createdAt)
                  : (typeof inv.createdAt === "string" ? new Date(inv.createdAt).getTime() : 0);

              if (isNaN(invCreatedMs) || invCreatedMs === 0 || invCreatedMs < referenceTime - maxClockSkewMs) {
                return false;
              }

              // 4. Validasi identifier unik:
              if (uniqueOrderRef) {
                if (!inv.description || !inv.description.includes(uniqueOrderRef)) {
                  return false;
                }
              } else {
                if (inv.description !== descriptionText) {
                  return false;
                }
              }

              return true;
            });

            // Pastikan TEPAT SATU kandidat yang cocok secara pasti tanpa ambiguitas
            if (candidateInvoices.length === 1) {
              const matchedInvoice = candidateInvoices[0];

              // Dapatkan paymentUrl resmi via detail invoice
              let paymentUrl = "";
              try {
                const detailRes = await fetch(`${baseUrl}/invoices/${matchedInvoice.id}`, {
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    Accept: "application/json",
                  },
                  cache: "no-store",
                });
                if (detailRes.ok) {
                  const detailData = (await detailRes.json()) as { data?: { paymentUrl?: string; link?: string } };
                  paymentUrl = detailData.data?.paymentUrl || "";
                }
              } catch {
                // Fallback jika fetch detail gagal
              }

              const configuredTenant = process.env.MAYAR_SANDBOX_TENANT || DEFAULT_SANDBOX_TENANT;
              if (!paymentUrl && matchedInvoice.link) {
                paymentUrl = matchedInvoice.link.startsWith("http")
                  ? matchedInvoice.link
                  : `https://${configuredTenant}/invoices/${matchedInvoice.link}`;
              }

              // Validasi domain resmi Mayar tanpa normalisasi spekulatif
              const validation = validateMayarPaymentUrl(paymentUrl, {
                allowedSandboxTenant: configuredTenant,
              });

              if (validation.valid && validation.cleanUrl) {
                const safeUrl = validation.cleanUrl;
                console.info(
                  `[MAYAR_SANDBOX_RECONCILED] Berhasil merekonsiliasi invoice sandbox secara pasti: id=${matchedInvoice.id}`
                );
                return {
                  success: true,
                  data: {
                    id: matchedInvoice.id,
                    link: safeUrl,
                    url: safeUrl,
                    paymentUrl: safeUrl,
                    status: (matchedInvoice.status || "unpaid").toLowerCase(),
                    amount: cleanAmount,
                  },
                };
              }
            } else if (candidateInvoices.length > 1) {
              console.warn(
                `[MAYAR_RECONCILE_AMBIGUOUS] Ditemukan ${candidateInvoices.length} invoice kandidat. Pemulihan spekulatif ditolak untuk mencegah invoice ganda.`
              );
            }
          }
        } catch (reconcileErr) {
          console.warn(
            "[MAYAR_SANDBOX_RECONCILE_FAILED]",
            reconcileErr instanceof Error ? reconcileErr.message : "Error"
          );
        }
      }

      console.error(
        `[MAYAR_CREATE] Penolakan dari API: HTTP=${res.status} ` +
        `statusCode=${responseBody?.statusCode ?? "null"} ` +
        `msg_shape=${Array.isArray(rawMsg) ? "array" : typeof rawMsg}`
      );
      let displayError = apiMsg;
      if (typeof apiMsg === "string" && apiMsg.includes("Cannot read properties of null")) {
        displayError = "Layanan gateway Mayar mengalami kendala teknis internal saat menerbitkan tagihan. Silakan periksa status tagihan atau coba beberapa saat lagi.";
      }
      return {
        success: false,
        error: `Mayar API menolak pembuatan tagihan: ${displayError}`,
      };
    }

    // 4. Validasi data respons sesuai kontrak V2
    // V2 create invoice mengembalikan: { id, transactionId?, link, expiredAt?, extraData? }
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

    // 5. Normalisasi & Validasi URL pembayaran resmi Mayar
    const configuredTenant = process.env.MAYAR_SANDBOX_TENANT || DEFAULT_SANDBOX_TENANT;
    const rawData = data as unknown as { link?: string; paymentUrl?: string; url?: string };
    let paymentLink = rawData.paymentUrl || (rawData.url?.startsWith("http") ? rawData.url : undefined);
    if (!paymentLink && rawData.link) {
      paymentLink = rawData.link.startsWith("http")
        ? rawData.link
        : `https://${configuredTenant}/invoices/${rawData.link}`;
    }

    const validation = validateMayarPaymentUrl(paymentLink, {
      allowedSandboxTenant: configuredTenant,
    });

    if (!validation.valid || !validation.cleanUrl) {
      console.error(
        `[MAYAR_CREATE] URL pembayaran tidak valid dari gateway: ${paymentLink} | Error: ${validation.error}`
      );
      return {
        success: false,
        error: `Tautan pembayaran yang dikembalikan Mayar tidak valid: ${validation.error || "Format tidak resmi"}.`,
      };
    }

    const cleanPaymentUrl = validation.cleanUrl;

    return {
      success: true,
      data: {
        id: data.id,
        link: cleanPaymentUrl,
        url: cleanPaymentUrl,
        paymentUrl: cleanPaymentUrl,
        status: "unpaid",
        amount: cleanAmount,
        expiredAt: data.expiredAt,
        expired_date: undefined,
      },
    };
  } catch (err: unknown) {
    const safeMsg = err instanceof Error ? err.message : "Terjadi kesalahan internal pada Mayar client.";
    return { success: false, error: safeMsg };
  }
}

/**
 * Memeriksa Ulang Status Tagihan/Transaksi ke Server Mayar.
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

    // Di API V2, endpoint detail invoice adalah /invoices/{uuid}
    // Jika V1, endpoint adalah /payment/{id}
    const endpointsToTry = baseUrl.includes("/v2")
      ? [
          `${baseUrl}/invoices/${encodeURIComponent(cleanPaymentId)}`,
          `${baseUrl}/payments/${encodeURIComponent(cleanPaymentId)}`,
          `${baseUrl}/invoice/${encodeURIComponent(cleanPaymentId)}`,
          `${baseUrl}/payment/${encodeURIComponent(cleanPaymentId)}`,
        ]
      : [
          `${baseUrl}/payment/${encodeURIComponent(cleanPaymentId)}`,
          `${baseUrl}/invoice/${encodeURIComponent(cleanPaymentId)}`,
        ];

    let res: Response | null = null;
    let lastStatus = 0;

    for (const ep of endpointsToTry) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), MAYAR_REQUEST_TIMEOUT_MS);
      try {
        const attempt = await fetch(ep, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timeoutId);
        lastStatus = attempt.status;
        if (attempt.status !== 404) {
          res = attempt;
          break;
        }
      } catch (fetchErr: unknown) {
        clearTimeout(timeoutId);
        if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
          return {
            success: false,
            error: "Batas waktu pemeriksaan status ke server Mayar terlampaui (timeout 12 detik).",
          };
        }
      }
    }

    if (!res) {
      return {
        success: false,
        error: `Gagal menghubungi server Mayar atau transaksi tidak ditemukan (HTTP ${lastStatus || 404}).`,
      };
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

    const rawStatusData = data as unknown as {
      link?: string;
      paymentUrl?: string;
      url?: string;
    };

    const configuredTenant = process.env.MAYAR_SANDBOX_TENANT || DEFAULT_SANDBOX_TENANT;
    let paymentUrl =
      rawStatusData.paymentUrl ||
      (rawStatusData.url?.startsWith("http") ? rawStatusData.url : undefined);

    if (!paymentUrl && rawStatusData.link) {
      if (rawStatusData.link.startsWith("http")) {
        paymentUrl = rawStatusData.link;
      } else if (baseUrl.includes("mayar.io")) {
        paymentUrl = `https://${configuredTenant}/invoices/${rawStatusData.link}`;
      }
    }

    let validatedPaymentUrl: string | undefined = undefined;
    if (paymentUrl) {
      const validation = validateMayarPaymentUrl(paymentUrl, {
        allowedSandboxTenant: configuredTenant,
      });
      if (validation.valid && validation.cleanUrl) {
        validatedPaymentUrl = validation.cleanUrl;
      }
    }

    return {
      success: true,
      data: {
        id: data.id,
        status: (data.status || "unpaid").toLowerCase(),
        amount: Number(data.amount) || 0,
        currency: (data as { currency?: string }).currency,
        name: data.name || data.customer?.name,
        email: data.email || data.customer?.email,
        paymentMethod: data.paymentMethod,
        transactionId: data.transactionId,
        paidAt: data.paidAt,
        customer: data.customer,
        link: rawStatusData.link,
        paymentUrl: validatedPaymentUrl,
        url: validatedPaymentUrl,
      },
    };
  } catch (err: unknown) {
    const safeMsg = err instanceof Error ? err.message : "Terjadi kesalahan internal pada Mayar client.";
    return { success: false, error: safeMsg };
  }
}

/**
 * Mencari invoice yang sudah terbit di gateway Mayar berdasarkan uniqueRef pesanan dan nominal.
 * Digunakan untuk rekonsiliasi otomatis jika terjadi status sewa klaim kedaluwarsa (IN_DOUBT_STALE).
 */
export async function findInvoiceByOrderRef(
  uniqueOrderRef: string,
  expectedAmount: number,
  customerEmail?: string
): Promise<{ success: boolean; data?: MayarPaymentData; error?: string }> {
  try {
    const { apiKey, baseUrl } = getMayarConfig();
    const cleanRef = String(uniqueOrderRef || "").trim();
    if (!cleanRef) {
      return { success: false, error: "Identifier pesanan unik wajib disertakan." };
    }

    const checkController = new AbortController();
    const checkTimeout = setTimeout(() => checkController.abort(), 6000);
    const listRes = await fetch(`${baseUrl}/invoices`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: checkController.signal,
      cache: "no-store",
    });
    clearTimeout(checkTimeout);

    if (!listRes.ok) {
      return { success: false, error: `Gagal membaca daftar invoice dari gateway Mayar (HTTP ${listRes.status}).` };
    }

    const listData = (await listRes.json()) as {
      data?: Array<{
        id: string;
        amount: number;
        description: string;
        link: string;
        status?: string;
        createdAt?: number;
        customer?: { email?: string; name?: string };
      }>;
    };

    const cleanEmail = (customerEmail || "").trim().toLowerCase();
    const candidates = (listData.data || []).filter((inv) => {
      if (Number(inv.amount) !== expectedAmount) return false;
      if (cleanEmail && inv.customer?.email && inv.customer.email.trim().toLowerCase() !== cleanEmail) {
        return false;
      }
      if (!inv.description || !inv.description.includes(cleanRef)) {
        return false;
      }
      return true;
    });

    if (candidates.length === 1) {
      const matched = candidates[0];
      let paymentUrl = "";
      try {
        const detailRes = await fetch(`${baseUrl}/invoices/${matched.id}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
          cache: "no-store",
        });
        if (detailRes.ok) {
          const detailData = (await detailRes.json()) as { data?: { paymentUrl?: string; link?: string } };
          paymentUrl = detailData.data?.paymentUrl || "";
        }
      } catch {
        // Fallback
      }

      const configuredTenant = process.env.MAYAR_SANDBOX_TENANT || DEFAULT_SANDBOX_TENANT;
      if (!paymentUrl && matched.link) {
        paymentUrl = matched.link.startsWith("http")
          ? matched.link
          : `https://${configuredTenant}/invoices/${matched.link}`;
      }

      const validation = validateMayarPaymentUrl(paymentUrl, {
        allowedSandboxTenant: configuredTenant,
      });

      if (validation.valid && validation.cleanUrl) {
        const safeUrl = validation.cleanUrl;
        return {
          success: true,
          data: {
            id: matched.id,
            link: safeUrl,
            url: safeUrl,
            paymentUrl: safeUrl,
            status: (matched.status || "unpaid").toLowerCase(),
            amount: expectedAmount,
          },
        };
      }
    }

    if (candidates.length > 1) {
      return { success: false, error: `Ditemukan ${candidates.length} invoice dengan referensi sama pada gateway Mayar.` };
    }

    return { success: false, error: "Invoice tidak ditemukan pada gateway Mayar." };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Gagal mencari invoice di Mayar.",
    };
  }
}
