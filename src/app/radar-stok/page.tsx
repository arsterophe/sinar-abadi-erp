import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createServerClientInstance } from "@/lib/supabase/server";
import { UserProfile, isValidRole } from "@/types/auth";
import { PemasokItem } from "@/types/pembelian";
import { getRadarStokData } from "@/lib/radar-stok/getRadarStokData";
import RadarStokClientView from "@/components/radar-stok/RadarStokClientView";

// Rute ini dilindungi di server menggunakan sesi dinamis & verifikasi profil Supabase.
// Menonaktifkan instant prerendering pada route dinamis ini sesuai konvensi Next.js 16.
export const instant = false;

export const metadata = {
  title: "Radar Stok — Prediksi Kapan Barang Habis | Sinar Abadi ERP",
  description:
    "Prediksi laju konsumsi stok fisik barang dan rekomendasi jumlah pengadaan otomatis berdasarkan transaksi penjualan aktual.",
};

export default async function RadarStokPage() {
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

  // 5. Aturan Hak Akses:
  // Seluruh peran operasional yang sah (manajer, gudang, penjualan) berhak melihat analitik ketersediaan stok fisik barang.
  // Data finansial rahasia (harga_pokok, HPP, margin) DILARANG diambil/disertakan (BR-12).

  // 6. Ambil data Radar Stok aktual langsung dari Supabase melalui sesi pengguna (RLS aktif)
  const radarStokData = await getRadarStokData(supabase);

  // 7. Ambil katalog pemasok aktif untuk alur Quick PO jika peran berwenang mengajukan pembelian (Gudang & Manajer)
  let pemasokList: PemasokItem[] = [];
  if (profile.peran === "manajer" || profile.peran === "gudang") {
    const { data: rawPemasok } = await supabase
      .from("pemasok")
      .select("id, kode, nama, telepon, alamat, aktif")
      .eq("aktif", true)
      .order("kode", { ascending: true });

    pemasokList = (rawPemasok as PemasokItem[]) || [];
  }

  return (
    <RadarStokClientView
      serverProfile={profile}
      initialData={radarStokData}
      pemasokList={pemasokList}
    />
  );
}
