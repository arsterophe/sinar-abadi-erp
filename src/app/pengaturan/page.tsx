import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createServerClientInstance } from "@/lib/supabase/server";
import { UserProfile, isValidRole } from "@/types/auth";
import { getPengaturanData } from "./actions";
import PengaturanClientView from "@/components/pengaturan/PengaturanClientView";
import AksesDitolak from "@/components/layout/AksesDitolak";

// Rute ini dilindungi di server menggunakan sesi dinamis & verifikasi profil Supabase.
// Menonaktifkan instant prerendering pada route dinamis ini sesuai konvensi Next.js 16.
export const instant = false;

export default async function PengaturanPage() {
  // Indikasikan ke Next.js 16 bahwa evaluasi sesi dan pemanggilan Supabase Auth
  // dijalankan secara dinamis saat request tiba (request-time).
  await connection();

  const supabase = await createServerClientInstance();

  // 1. Verifikasi pengguna menggunakan Supabase Auth di sisi server
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  // 2. Periksa profil di public.profiles berdasarkan UUID pengguna yang sedang login
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, nama_lengkap, peran, aktif, dibuat_pada")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profileData) {
    redirect("/login?error=profile_not_found");
  }

  const profile = profileData as UserProfile;

  // 3. Tolak akses jika akun non-aktif
  if (profile.aktif !== true) {
    redirect("/login?error=account_inactive");
  }

  // 4. Tolak akses jika peran tidak valid
  if (!isValidRole(profile.peran)) {
    redirect("/login?error=invalid_role");
  }

  // 5. Aturan Hak Akses Rute (PRD Bab 7 & Instruksi Keamanan BR-12):
  // Menu Pengaturan EKSKLUSIF hanya boleh diakses oleh peran 'manajer' (unauthorized_pengaturan).
  // Staf Penjualan dan Gudang DILARANG mengakses modul manajemen peran dan konfigurasi.
  if (profile.peran !== "manajer") {
    return (
      <AksesDitolak
        userProfile={profile}
        activePath="/pengaturan"
        title="403 — Akses Ditolak: Modul Pengaturan"
        pesan="Menu Pengaturan Sistem dan Audit Log bersifat eksklusif hanya untuk peran Manajer (PRD Bab 7 & BR-12). Staf Penjualan dan Gudang tidak memiliki wewenang mengelola akun atau membaca riwayat audit sistem."
      />
    );
  }

  // 6. Ambil data pengaturan (daftar pengguna & audit log)
  const pengaturanData = await getPengaturanData();

  return (
    <PengaturanClientView
      serverProfile={profile}
      initialData={pengaturanData}
    />
  );
}
