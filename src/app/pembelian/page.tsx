import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createServerClientInstance } from "@/lib/supabase/server";
import { UserProfile, isValidRole, DbUserRole } from "@/types/auth";
import { PembelianItem, PemasokItem } from "@/types/pembelian";
import AppLayout from "@/components/layout/AppLayout";
import AksesDitolak from "@/components/layout/AksesDitolak";
import PembelianClientView from "@/components/pembelian/PembelianClientView";

export const instant = false;

interface RawPembelianRow {
  id: string;
  nomor: string;
  pemasok_id: string;
  barang_id: string;
  jumlah_dipesan: number;
  jumlah_diterima?: number | null;
  harga_beli_satuan?: number | null;
  status: PembelianItem["status"];
  alasan_tolak?: string | null;
  diajukan_oleh: string;
  diajukan_pada: string;
  diputuskan_oleh?: string | null;
  diputuskan_pada?: string | null;
  diterima_oleh?: string | null;
  diterima_pada?: string | null;
  pemasok?: PemasokItem | PemasokItem[] | null;
  barang?: PembelianItem["barang"] | PembelianItem["barang"][] | null;
}

export default async function PembelianPage() {
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

  // 2. Periksa profil di public.profiles berdasarkan UUID akun auth
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, nama_lengkap, peran, aktif, dibuat_pada")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profileData) {
    redirect("/login?error=profile_not_found");
  }

  const profile = profileData as UserProfile;

  // 3. Tolak akses jika akun nonaktif
  if (profile.aktif !== true) {
    redirect("/login?error=account_inactive");
  }

  // 4. Tolak akses jika peran tidak sah
  if (!isValidRole(profile.peran)) {
    redirect("/login?error=invalid_role");
  }

  // 5. ATURAN HAK AKSES PERAN (PRD Bab 7 & BR-12):
  // Halaman Pembelian hanya diperuntukkan bagi Staf Gudang dan Manajer (Akses Terbatas).
  // Staf Penjualan dilarang mengakses modul pembelian.
  if (profile.peran === "penjualan" || (profile.peran !== "gudang" && profile.peran !== "manajer")) {
    return (
      <AksesDitolak
        userProfile={profile}
        activePath="/pembelian"
        title="403 — Akses Ditolak: Modul Pembelian"
        pesan="Sesuai aturan operasional distribusi CV Sinar Abadi Niaga (PRD Bab 7), modul Pembelian hanya dapat diakses oleh Staf Gudang dan Manajer."
      />
    );
  }

  const isManajer = profile.peran === "manajer";

  // 6. Query Data Pembelian, Mitra Pemasok, dan Katalog Barang
  let rawPembelian: RawPembelianRow[] = [];
  let pemasokList: PemasokItem[] = [];
  let barangList: { id: string; kode: string; nama: string; satuan: string; stok: number }[] = [];

  try {
    // 6a. Query Pembelian (Enforcing BR-12 Privacy)
    if (isManajer) {
      // Manajer membaca via view v_pembelian untuk mendapatkan data harga_beli_satuan
      const { data: dataPembelian, error: errPembelian } = await supabase
        .from("v_pembelian")
        .select(`
          id,
          nomor,
          pemasok_id,
          barang_id,
          jumlah_dipesan,
          jumlah_diterima,
          harga_beli_satuan,
          status,
          alasan_tolak,
          diajukan_oleh,
          diajukan_pada,
          diputuskan_oleh,
          diputuskan_pada,
          diterima_oleh,
          diterima_pada
        `)
        .order("diajukan_pada", { ascending: false });

      if (errPembelian) {
        // Fallback ke tabel dasar pembelian jika view belum terpasang di database (tanpa meminta harga_beli_satuan)
        const { data: fallbackPemb } = await supabase
          .from("pembelian")
          .select(
            "id, nomor, pemasok_id, barang_id, jumlah_dipesan, jumlah_diterima, status, alasan_tolak, diajukan_oleh, diajukan_pada, diputuskan_oleh, diputuskan_pada, diterima_oleh, diterima_pada"
          )
          .order("diajukan_pada", { ascending: false });

        rawPembelian = ((fallbackPemb || []) as unknown as RawPembelianRow[]).map((p) => ({ ...p, harga_beli_satuan: null }));
      } else {
        rawPembelian = (dataPembelian as unknown as RawPembelianRow[]) || [];
      }
    } else {
      // Staf Gudang: DILARANG meminta kolom harga_beli_satuan (BR-12)
      const { data: dataPembelian, error: errPembelian } = await supabase
        .from("pembelian")
        .select(`
          id,
          nomor,
          pemasok_id,
          barang_id,
          jumlah_dipesan,
          jumlah_diterima,
          status,
          alasan_tolak,
          diajukan_oleh,
          diajukan_pada,
          diputuskan_oleh,
          diputuskan_pada,
          diterima_oleh,
          diterima_pada
        `)
        .order("diajukan_pada", { ascending: false });

      if (errPembelian) {
        console.warn("Query pembelian gudang terkendala:", errPembelian.message);
      }
      rawPembelian = (dataPembelian as unknown as RawPembelianRow[]) || [];
    }

    // 6b. Query Mitra Pemasok (PRD Bab 7)
    const { data: dataPemasok } = await supabase
      .from("pemasok")
      .select("id, kode, nama, telepon, alamat, aktif, dibuat_pada")
      .order("kode", { ascending: true });

    pemasokList = (dataPemasok as PemasokItem[]) || [];

    // 6c. Query Katalog Barang Aktif untuk form pengajuan PO
    const { data: dataBarang } = await supabase
      .from("barang")
      .select("id, kode, nama, satuan, stok")
      .eq("aktif", true)
      .order("kode", { ascending: true });

    barangList =
      (dataBarang as { id: string; kode: string; nama: string; satuan: string; stok: number }[]) ||
      [];
  } catch (err) {
    console.error("Exception saat query modul pembelian:", err);
  }

  // 7. Bentuk Lookup Map untuk melengkapi data relasi jika query join fallback terjadi
  const pemasokMap = new Map(pemasokList.map((p) => [p.id, p]));
  const barangMap = new Map(barangList.map((b) => [b.id, b]));

  // Ambil profil pengaju/pemutus/penerima untuk nama lengkap di timeline jika ada
  const userIdsToFetch = new Set<string>();
  rawPembelian.forEach((po) => {
    if (po.diajukan_oleh) userIdsToFetch.add(po.diajukan_oleh);
    if (po.diputuskan_oleh) userIdsToFetch.add(po.diputuskan_oleh);
    if (po.diterima_oleh) userIdsToFetch.add(po.diterima_oleh);
  });

  const profilesMap = new Map<string, { id: string; nama_lengkap: string; peran: DbUserRole }>();
  if (userIdsToFetch.size > 0) {
    const { data: fetchedProfiles } = await supabase
      .from("profiles")
      .select("id, nama_lengkap, peran")
      .in("id", Array.from(userIdsToFetch));

    (fetchedProfiles || []).forEach((prof) => {
      profilesMap.set(prof.id, {
        id: prof.id,
        nama_lengkap: prof.nama_lengkap,
        peran: prof.peran as DbUserRole,
      });
    });
  }

  const initialPembelian: PembelianItem[] = rawPembelian.map((row) => {
    const pem = Array.isArray(row.pemasok)
      ? row.pemasok[0]
      : row.pemasok || pemasokMap.get(row.pemasok_id) || null;

    const brg = Array.isArray(row.barang)
      ? row.barang[0]
      : row.barang || barangMap.get(row.barang_id) || null;

    return {
      id: row.id,
      nomor: row.nomor,
      pemasok_id: row.pemasok_id,
      barang_id: row.barang_id,
      jumlah_dipesan: Number(row.jumlah_dipesan) || 0,
      jumlah_diterima:
        row.jumlah_diterima !== null && row.jumlah_diterima !== undefined
          ? Number(row.jumlah_diterima)
          : null,
      harga_beli_satuan:
        isManajer && row.harga_beli_satuan !== null && row.harga_beli_satuan !== undefined
          ? Number(row.harga_beli_satuan)
          : null,
      status: row.status,
      alasan_tolak: row.alasan_tolak || null,
      diajukan_oleh: row.diajukan_oleh,
      diajukan_pada: row.diajukan_pada,
      diputuskan_oleh: row.diputuskan_oleh || null,
      diputuskan_pada: row.diputuskan_pada || null,
      diterima_oleh: row.diterima_oleh || null,
      diterima_pada: row.diterima_pada || null,
      pemasok: pem,
      barang: brg,
      pengaju: row.diajukan_oleh ? profilesMap.get(row.diajukan_oleh) || null : null,
      pemutus: row.diputuskan_oleh ? profilesMap.get(row.diputuskan_oleh) || null : null,
      penerima: row.diterima_oleh ? profilesMap.get(row.diterima_oleh) || null : null,
    };
  });

  const currentRole = profile.peran === "gudang" ? "warehouse" : "manager";

  return (
    <AppLayout
      currentRole={currentRole}
      userProfile={profile}
      activePath="/pembelian"
    >
      <PembelianClientView
        initialPembelian={initialPembelian}
        pemasokList={pemasokList}
        barangList={barangList}
        userRole={profile.peran}
        currentUserId={profile.id}
      />
    </AppLayout>
  );
}
