/**
 * Helper Validasi URL Pembayaran Resmi Mayar
 * CV Sinar Abadi Niaga ERP
 *
 * MENEGAKKAN ATURAN KEAMANAN TINGGI:
 * 1. Protokol WAJIB HTTPS (menolak http:).
 * 2. Hostname Sandbox WAJIB sesuai tenant terdaftar (default: erp-sinar-abadi-ale.myr.lat).
 *    Menolak hostname arbitrer meskipun berakhiran .myr.lat (misal: attacker.myr.lat).
 * 3. Domain Produksi mengizinkan mayar.link, mayar.club, mayar.id, myr.id dan subdomain resminya.
 * 4. Path WAJIB sesuai format faktur checkout: /invoices/{short_code}.
 *    Menolak path sintetis /{uuid} (customer portal), path kosong, atau path traversal.
 * 5. Menolak kredensial userinfo (user:pass@...) dan port khusus (:8080).
 */

export const DEFAULT_SANDBOX_TENANT = "erp-sinar-abadi-ale.myr.lat";

// Regex untuk path faktur Mayar resmi: /invoices/{kode_singkat}
// Format short code faktur Mayar V2: alfanumerik / tanda hubung / garis bawah (contoh: /invoices/gbhojkcuon)
const INVOICE_PATH_REGEX = /^\/invoices\/[a-zA-Z0-9_-]+$/;

// Regex domain produksi resmi Mayar
const PROD_DOMAIN_REGEX = /^([a-zA-Z0-9-]+\.)*(mayar\.(link|club|id)|myr\.id)$/i;

export interface MayarUrlValidationResult {
  valid: boolean;
  cleanUrl?: string;
  error?: string;
  isSandbox?: boolean;
}

/**
 * Validasi ketat URL pembayaran Mayar (Sandbox & Produksi).
 */
export function validateMayarPaymentUrl(
  rawUrl: string | null | undefined,
  options?: {
    allowedSandboxTenant?: string;
    allowProduction?: boolean;
  }
): MayarUrlValidationResult {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return {
      valid: false,
      error: "URL pembayaran Mayar kosong atau tidak valid.",
    };
  }

  const cleanInput = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(cleanInput);
  } catch {
    return {
      valid: false,
      error: "Format URL pembayaran Mayar tidak valid (gagal di-parse).",
    };
  }

  // 1. Protokol WAJIB HTTPS
  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      error: `Protokol URL tidak aman (${parsed.protocol}). Wajib menggunakan HTTPS.`,
    };
  }

  // 2. Tolak userinfo (kredensial terselubung)
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: "URL tidak aman: menyertakan kredensial userinfo.",
    };
  }

  // 3. Tolak port kustom / port khusus
  if (parsed.port) {
    return {
      valid: false,
      error: `URL menyertakan port kustom (: ${parsed.port}) yang tidak diizinkan.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 4. Validasi Path: WAJIB /invoices/{short_code}
  // Menolak secara tegas URL sintetis / customer portal seperti https://mayar.link/{invoice_uuid}
  if (!INVOICE_PATH_REGEX.test(parsed.pathname)) {
    return {
      valid: false,
      error: `Path URL "${parsed.pathname}" tidak valid. Format path resmi wajib: /invoices/{short_code}.`,
    };
  }

  // 5. Validasi Hostname (Sandbox vs Produksi)
  const configuredSandboxTenant = (
    options?.allowedSandboxTenant ||
    process.env.MAYAR_SANDBOX_TENANT ||
    DEFAULT_SANDBOX_TENANT
  ).toLowerCase().trim();

  const isSandbox =
    hostname.endsWith(".myr.lat") || hostname === "myr.lat";

  if (isSandbox) {
    // KEAMANAN KETAT: Tolak hostname arbitrer meskipun berakhiran .myr.lat!
    if (hostname !== configuredSandboxTenant) {
      return {
        valid: false,
        isSandbox: true,
        error: `Hostname sandbox "${hostname}" tidak diizinkan. Hanya tenant resmi "${configuredSandboxTenant}" yang diterima.`,
      };
    }

    return {
      valid: true,
      cleanUrl: `${parsed.origin}${parsed.pathname}`,
      isSandbox: true,
    };
  }

  // Domain Produksi
  const allowProduction = options?.allowProduction !== false;
  if (allowProduction && PROD_DOMAIN_REGEX.test(hostname)) {
    return {
      valid: true,
      cleanUrl: `${parsed.origin}${parsed.pathname}`,
      isSandbox: false,
    };
  }

  return {
    valid: false,
    error: `Domain "${hostname}" bukan domain pembayaran resmi Mayar yang diizinkan.`,
  };
}
