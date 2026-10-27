import { supabase } from "./client";
import { UserProfile, isValidRole } from "@/types/auth";

/**
 * Mengambil data pengguna yang sedang login beserta profilnya dari tabel `profiles`.
 * Memvalidasi apakah akun masih aktif dan memiliki peran yang sah.
 * Jika tidak valid, sesi otomatis dibersihkan (signOut).
 */
export async function getCurrentUserProfile(): Promise<{
  profile: UserProfile | null;
  isAuthenticated: boolean;
  error?: string;
}> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { profile: null, isAuthenticated: false };
    }

    // Ambil data profil dari tabel profiles
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, nama_lengkap, peran, aktif, dibuat_pada")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profileData) {
      await supabase.auth.signOut();
      return {
        profile: null,
        isAuthenticated: false,
        error: "Profil pengguna tidak ditemukan pada sistem.",
      };
    }

    const profile = profileData as UserProfile;

    // Tolak jika non-aktif
    if (!profile.aktif) {
      await supabase.auth.signOut();
      return {
        profile: null,
        isAuthenticated: false,
        error: "Akun berstatus non-aktif.",
      };
    }

    // Tolak jika peran tidak valid
    if (!isValidRole(profile.peran)) {
      await supabase.auth.signOut();
      return {
        profile: null,
        isAuthenticated: false,
        error: "Peran pengguna tidak valid.",
      };
    }

    return {
      profile,
      isAuthenticated: true,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Kesalahan sistem autentikasi";
    return { profile: null, isAuthenticated: false, error: msg };
  }
}

/**
 * Logout dari sesi Supabase Auth.
 */
export async function logoutUser(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Gagal melakukan signOut Supabase:", err);
  }
}
