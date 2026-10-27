import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createServerClientInstance } from "@/lib/supabase/server";
import { UserProfile, isValidRole } from "@/types/auth";
import { BarangItem } from "@/types/barang";
import BarangClientView from "@/components/barang/BarangClientView";

// Rute ini dilindungi di server menggunakan sesi dinamis & verifikasi profil Supabase.
// Menonaktifkan instant prerendering pada route dinamis ini sesuai konvensi Next.js 16.
export const instant = false;

export default async function BarangDanStokPage() {
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

  // 5. Query data langsung dari tabel public.barang dengan kolom yang eksplisit
  // Sesuai aturan keamanan BR-12:
  // - Manajer: boleh membaca kolom harga_pokok.
  // - Penjualan & Gudang: kolom harga_pokok TIDAK BOLEH disertakan dalam query maupun payload.
  // - Tidak pernah menggunakan `select('*')`.
  let barangList: BarangItem[] = [];
  let dbErrorMessage: string | null = null;

  try {
    if (profile.peran === "manajer") {
      const { data, error } = await supabase.rpc("get_katalog_barang_manajer");

      if (error) {
        dbErrorMessage = error.message;
      } else if (data) {
        barangList = data as BarangItem[];
      }
    } else {
      // Penjualan & Gudang: harga_pokok sama sekali tidak diminta dari database
      const { data, error } = await supabase
        .from("barang")
        .select("id, kode, nama, satuan, harga_jual, stok, stok_minimum, aktif, diperbarui_pada")
        .order("kode", { ascending: true });

      if (error) {
        dbErrorMessage = error.message;
      } else if (data) {
        barangList = data as BarangItem[];
      }
    }
  } catch (err) {
    dbErrorMessage = err instanceof Error ? err.message : "Gagal mengambil data katalog barang.";
  }

  return (
    <BarangClientView
      serverProfile={profile}
      initialBarang={barangList}
      dbError={dbErrorMessage}
    />
  );
}
