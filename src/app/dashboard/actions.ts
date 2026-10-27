"use server";

import { createServerClientInstance } from "@/lib/supabase/server";
import { getAnalyticsData } from "@/lib/dashboard/getAnalyticsData";
import { AnalyticsPayload, DateRangeFilter } from "@/types/analytics";
import { isValidRole } from "@/types/auth";

/**
 * Server Action: Mengambil data analitik bisnis dengan otorisasi berbasis sesi server.
 *
 * MENEGAKKAN ATURAN KEAMANAN & PRD (PRD Bab 4, 7 & 9, BR-12):
 * 1. Otorisasi peran mutlak ditentukan di server dari cookie sesi Supabase Auth & tabel profiles.
 * 2. Client DILARANG memalsukan atau meminta data peran yang lebih tinggi dari hak aksesnya.
 * 3. Menjamin payload Penjualan dan Gudang steril dari angka HPP, margin kotor, laba, dan data moneter rahasia.
 */
export async function getAnalyticsDataAction(
  filterInput?: Partial<DateRangeFilter> | null
): Promise<{
  success: boolean;
  data?: AnalyticsPayload;
  error?: string;
}> {
  try {
    const supabase = await createServerClientInstance();

    // 1. Verifikasi sesi auth
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Sesi telah berakhir atau tidak sah. Silakan login kembali.",
      };
    }

    // 2. Ambil profil terdaftar dari database
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, peran, aktif")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return {
        success: false,
        error: "Profil pengguna tidak ditemukan pada sistem.",
      };
    }

    if (profile.aktif !== true) {
      return {
        success: false,
        error: "Akun Anda saat ini dinonaktifkan oleh administrator.",
      };
    }

    if (!isValidRole(profile.peran)) {
      return {
        success: false,
        error: "Peran pengguna tidak valid.",
      };
    }

    // 3. Ambil data analitik dengan filter peran dari server
    const payload = await getAnalyticsData(
      supabase,
      filterInput,
      profile.peran as "manajer" | "penjualan" | "gudang",
      user.id
    );

    return {
      success: true,
      data: payload,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Gagal memuat analitik bisnis: ${msg}`,
    };
  }
}
