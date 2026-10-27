import { createBrowserClient } from "@supabase/ssr";
import { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type ConnectionStatus =
  | "idle"
  | "checking"
  | "success"
  | "config_missing"
  | "invalid_credentials"
  | "access_denied"
  | "network_error"
  | "unknown_error";

export interface ConnectionTestResult {
  status: ConnectionStatus;
  message: string;
  detail: string;
  httpStatus?: number;
  timestamp?: string;
}

/**
 * Memeriksa apakah konfigurasi Supabase telah disetel pada environment variables
 * tanpa membocorkan nilai kredensial.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
    supabaseUrl.trim().length > 0 &&
    supabasePublishableKey &&
    supabasePublishableKey.trim().length > 0
  );
}

/**
 * Membuat instance Supabase client untuk browser menggunakan @supabase/ssr.
 * Mengelola cookie auth secara otomatis sehingga dapat dibaca dan diverifikasi oleh Server.
 */
export function createClient(): SupabaseClient {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Konfigurasi Supabase belum lengkap. Pastikan NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY telah disetel pada file .env.local."
    );
  }

  return createBrowserClient(
    supabaseUrl.trim().replace(/\/+$/, ""),
    supabasePublishableKey.trim()
  );
}

let clientInstance: SupabaseClient | null = null;

/**
 * Mengambil singleton instance Supabase client.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!clientInstance) {
    clientInstance = createClient();
  }
  return clientInstance;
}

/**
 * Supabase client instance siap pakai.
 * Menggunakan Proxy untuk inisialisasi yang aman dan mencegah error saat build time jika env belum terpasang.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/**
 * Menguji koneksi nyata ke Supabase secara aman sesuai permintaan (on-demand).
 * Menggunakan endpoint publik `/auth/v1/settings` yang memvalidasi domain URL dan API key
 * tanpa bergantung pada tabel bisnis/ERP yang belum dibuat.
 */
export async function checkSupabaseConnection(): Promise<ConnectionTestResult> {
  // 1. Validasi keberadaan konfigurasi
  if (!supabaseUrl || !supabasePublishableKey) {
    return {
      status: "config_missing",
      message: "Konfigurasi Belum Lengkap",
      detail:
        "Variabel NEXT_PUBLIC_SUPABASE_URL atau NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY belum ditemukan di .env.local.",
    };
  }

  const cleanUrl = supabaseUrl.trim().replace(/\/+$/, "");
  const cleanKey = supabasePublishableKey.trim();

  // 2. Validasi format URL
  try {
    new URL(cleanUrl);
  } catch {
    return {
      status: "invalid_credentials",
      message: "Format URL Tidak Valid",
      detail: "Nilai NEXT_PUBLIC_SUPABASE_URL bukan format URL web yang valid.",
    };
  }

  // 3. Eksekusi request uji koneksi ke endpoint Supabase
  try {
    const response = await fetch(`${cleanUrl}/auth/v1/settings`, {
      method: "GET",
      headers: {
        apikey: cleanKey,
        Authorization: `Bearer ${cleanKey}`,
      },
    });

    if (response.ok) {
      return {
        status: "success",
        message: "Koneksi Supabase Berhasil",
        detail:
          "URL dan kredensial API Key valid. Endpoint Supabase merespons dengan status 200 OK.",
        httpStatus: response.status,
      };
    }

    if (response.status === 401) {
      return {
        status: "invalid_credentials",
        message: "Kredensial Tidak Valid (401 Unauthorized)",
        detail:
          "Kunci API (Publishable Key) ditolak oleh server Supabase. Pastikan kunci yang digunakan sesuai.",
        httpStatus: response.status,
      };
    }

    if (response.status === 403) {
      return {
        status: "access_denied",
        message: "Akses Ditolak (403 Forbidden)",
        detail:
          "Permintaan ditolak oleh kebijakan keamanan atau batasan akses server Supabase.",
        httpStatus: response.status,
      };
    }

    return {
      status: "unknown_error",
      message: `Status Respons Tak Terduga (HTTP ${response.status})`,
      detail: `Server Supabase merespons dengan status HTTP ${response.status} ${response.statusText}.`,
      httpStatus: response.status,
    };
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Kesalahan koneksi tidak diketahui";

    return {
      status: "network_error",
      message: "Gagal Menghubungi Server",
      detail: `Koneksi jaringan ke host Supabase gagal dihubungi (${errorMsg}).`,
    };
  }
}
