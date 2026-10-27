import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createServerClientInstance } from "@/lib/supabase/server";
import { UserProfile, isValidRole } from "@/types/auth";
import { PelangganItem, TerminHari } from "@/types/pelanggan";
import PelangganClientView from "@/components/pelanggan/PelangganClientView";

// Rute ini dilindungi di server menggunakan sesi dinamis & verifikasi profil Supabase.
// Menonaktifkan instant prerendering pada route dinamis ini sesuai konvensi Next.js 16.
export const instant = false;

export default async function PelangganPage() {
  // Indikasikan evaluasi sesi dijalankan saat request tiba (request-time)
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

  // 2. Ambil profil pengguna dari public.profiles berdasarkan UUID auth
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

  // 4. Tolak akses jika peran tidak sah
  if (!isValidRole(profile.peran)) {
    redirect("/login?error=invalid_role");
  }

  // 5. Aturan Hak Akses Rute (PRD Bab 7 & Instruksi):
  // manajer dan penjualan boleh mengakses halaman ini.
  // gudang DILARANG mengakses halaman atau data pelanggan.
  if (profile.peran === "gudang") {
    redirect("/?error=unauthorized_pelanggan");
  }

  // 6. Query data tabel public.pelanggan secara eksplisit
  let pelangganList: PelangganItem[] = [];
  let dbErrorMessage: string | null = null;

  try {
    const { data: rawPelanggan, error: pelangganError } = await supabase
      .from("pelanggan")
      .select("id, kode, nama_toko, telepon, alamat, batas_kredit, termin_hari, aktif, dibuat_oleh, dibuat_pada")
      .order("kode", { ascending: true });

    if (pelangganError) {
      dbErrorMessage = pelangganError.message;
    } else if (rawPelanggan) {
      // 7. Ambil pesanan aktif dari public.pesanan_jual untuk kalkulasi Piutang Berjalan (BR-05)
      // Piutang berjalan = total pesanan berstatus 'dikonfirmasi' atau 'dikirim'
      const { data: activeOrders } = await supabase
        .from("pesanan_jual")
        .select("pelanggan_id, status, total, jatuh_tempo")
        .in("status", ["dikonfirmasi", "dikirim"]);

      const today = new Date().toISOString().split("T")[0];
      const piutangMap: Record<string, number> = {};
      const overdueMap: Record<string, boolean> = {};

      if (activeOrders && Array.isArray(activeOrders)) {
        for (const ord of activeOrders) {
          if (!ord.pelanggan_id) continue;
          const pid = ord.pelanggan_id;
          piutangMap[pid] = (piutangMap[pid] || 0) + (Number(ord.total) || 0);

          // Tagihan terlambat jika status dikirim dan tanggal jatuh_tempo < hari ini (BR-05)
          if (
            ord.status === "dikirim" &&
            ord.jatuh_tempo &&
            ord.jatuh_tempo < today
          ) {
            overdueMap[pid] = true;
          }
        }
      }

      pelangganList = rawPelanggan.map((p) => ({
        id: p.id,
        kode: p.kode,
        nama_toko: p.nama_toko,
        telepon: p.telepon,
        alamat: p.alamat,
        batas_kredit: Number(p.batas_kredit) || 0,
        termin_hari: p.termin_hari as TerminHari,
        aktif: Boolean(p.aktif),
        dibuat_oleh: p.dibuat_oleh,
        dibuat_pada: p.dibuat_pada,
        piutang_berjalan: piutangMap[p.id] || 0,
        tagihan_terlambat: Boolean(overdueMap[p.id]),
      }));
    }
  } catch (err) {
    dbErrorMessage = err instanceof Error ? err.message : "Gagal mengambil data pelanggan.";
  }

  return (
    <PelangganClientView
      serverProfile={profile}
      initialPelanggan={pelangganList}
      dbError={dbErrorMessage}
    />
  );
}
