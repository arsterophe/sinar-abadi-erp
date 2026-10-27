import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createServerClientInstance } from "@/lib/supabase/server";
import { UserProfile, isValidRole } from "@/types/auth";
import DashboardClient from "@/components/dashboard/DashboardClient";

import { getManagerDashboardMetrics, ManagerDashboardMetrics } from "@/lib/dashboard/getManagerMetrics";
import { getWarehouseDashboardMetrics, WarehouseDashboardMetrics } from "@/lib/dashboard/getWarehouseMetrics";
import { getSalesDashboardMetrics, SalesDashboardMetrics } from "@/lib/dashboard/getSalesMetrics";
import { getAnalyticsData } from "@/lib/dashboard/getAnalyticsData";
import { AnalyticsPayload } from "@/types/analytics";

// Rute dashboard dilindungi di server menggunakan sesi dinamis & verifikasi profil Supabase.
// Menonaktifkan instant prerendering pada route dinamis ini sesuai konvensi Next.js 16.
export const instant = false;

export default async function HomePage() {
  // Indikasikan ke Next.js 16 (dengan Cache Components / PPR enabled) bahwa evaluasi
  // sesi dan pemanggilan SDK Supabase Auth dijalankan secara dinamis saat request tiba (request-time).
  await connection();

  const supabase = await createServerClientInstance();

  // 1. Verifikasi pengguna menggunakan Supabase Auth di sisi server
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // Pengguna yang belum login diarahkan ke /login
  if (userError || !user) {
    redirect("/login");
  }

  // 2. Periksa profil di public.profiles berdasarkan UUID pengguna yang sedang login
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, nama_lengkap, peran, aktif, dibuat_pada")
    .eq("id", user.id)
    .maybeSingle();

  // 3. Tolak akses jika profil tidak ditemukan
  if (profileError || !profileData) {
    redirect("/login?error=profile_not_found");
  }

  const profile = profileData as UserProfile;

  // 4. Tolak akses jika aktif bukan true
  if (profile.aktif !== true) {
    redirect("/login?error=account_inactive");
  }

  // 5. Tolak akses jika peran bukan salah satu dari manajer, penjualan, atau gudang
  if (!isValidRole(profile.peran)) {
    redirect("/login?error=invalid_role");
  }

  // 6. Otorisasi Server-Side & Pengambilan Data Sesuai Peran (PRD Bab 4, 7 & 9, BR-12)
  let managerMetrics: ManagerDashboardMetrics | null = null;
  let warehouseMetrics: WarehouseDashboardMetrics | null = null;
  let salesMetrics: SalesDashboardMetrics | null = null;

  // Ambil data analitik inisial (default: 30 hari terakhir) dengan otorisasi peran server
  const initialAnalytics: AnalyticsPayload = await getAnalyticsData(
    supabase,
    { preset: "30_hari" },
    profile.peran,
    user.id
  );

  if (profile.peran === "manajer") {
    // Manajer memiliki wewenang eksekutif & operasional penuh
    // Dapat melihat metrik eksekutif, serta pratinjau gudang dan penjualan perusahaan
    const [mgr, wh, sls] = await Promise.all([
      getManagerDashboardMetrics(supabase),
      getWarehouseDashboardMetrics(supabase),
      getSalesDashboardMetrics(supabase, user.id, true),
    ]);
    managerMetrics = mgr;
    warehouseMetrics = wh;
    salesMetrics = sls;
  } else if (profile.peran === "gudang") {
    // Staf Gudang: HANYA mengambil metrik operasional gudang non-HPP (BR-12)
    warehouseMetrics = await getWarehouseDashboardMetrics(supabase);
  } else if (profile.peran === "penjualan") {
    // Staf Penjualan: HANYA mengambil metrik pesanan dan pelanggan tanpa margin/HPP (BR-12)
    salesMetrics = await getSalesDashboardMetrics(supabase, user.id, false);
  }

  // Kirim data profil yang terverifikasi dan metrik ke DashboardClient
  return (
    <DashboardClient
      serverProfile={profile}
      managerMetrics={managerMetrics}
      warehouseMetrics={warehouseMetrics}
      salesMetrics={salesMetrics}
      initialAnalytics={initialAnalytics}
    />
  );
}
