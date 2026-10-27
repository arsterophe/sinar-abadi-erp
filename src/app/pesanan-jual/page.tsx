import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createServerClientInstance } from "@/lib/supabase/server";
import { UserProfile, isValidRole } from "@/types/auth";
import { PesananJualHeader, StatusPesananJual } from "@/types/pesanan_jual";
import PesananJualClientView, {
  PelangganOption,
  BarangOption,
} from "@/components/pesanan-jual/PesananJualClientView";

// Rute pesanan jual dilindungi di server menggunakan sesi dinamis & verifikasi profil Supabase.
// Menonaktifkan instant prerendering pada route dinamis ini sesuai konvensi Next.js 16.
export const instant = false;

interface RawPesananRow {
  id: string;
  nomor: string;
  pelanggan_id: string;
  status: string;
  total: number | string;
  dibuat_oleh: string;
  dibuat_pada: string;
  dikonfirmasi_pada: string | null;
  dikirim_pada: string | null;
  jatuh_tempo: string | null;
  dilunasi_pada: string | null;
  dibatalkan_pada: string | null;
  alasan_batal: string | null;
  mayar_payment_id?: string | null;
  mayar_payment_url?: string | null;
  mayar_status?: string | null;
  mayar_claim_token?: string | null;
  mayar_claim_at?: string | null;
  pelanggan?: {
    id?: string;
    kode?: string;
    nama_toko?: string;
    telepon?: string;
    alamat?: string;
    termin_hari?: number;
  } | null;
}

export default async function PesananJualPage() {
  // Indikasikan evaluasi sesi dan query dijalankan saat request tiba (request-time)
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

  // 5. Query data dari tabel public.pesanan_jual secara eksplisit
  // ATURAN HAK AKSES SERVER (PRD Bab 7):
  // - Manajer & Penjualan: Melihat seluruh pesanan (draf, dikonfirmasi, dikirim, lunas, dibatalkan).
  // - Staf Gudang: HANYA melihat pesanan berstatus 'dikonfirmasi' ke atas. Pesanan 'draf'
  //   DILARANG dikirim ke Gudang, sehingga dieksklusikan langsung di level query database.
  // KEAMANAN BR-12: Kolom hpp_satuan tidak disertakan dalam query ini.
  let pesananList: PesananJualHeader[] = [];
  let dbErrorMessage: string | null = null;

  try {
    let query = supabase
      .from("pesanan_jual")
      .select(`
        id,
        nomor,
        pelanggan_id,
        status,
        total,
        dibuat_oleh,
        dibuat_pada,
        dikonfirmasi_pada,
        dikirim_pada,
        jatuh_tempo,
        dilunasi_pada,
        dibatalkan_pada,
        alasan_batal,
        mayar_payment_id,
        mayar_payment_url,
        mayar_status,
        mayar_claim_token,
        mayar_claim_at,
        pelanggan:pelanggan!pelanggan_id (
          id,
          kode,
          nama_toko,
          telepon,
          alamat,
          termin_hari
        )
      `)
      .order("dibuat_pada", { ascending: false });

    // Penegakan sisi server untuk Staf Gudang (PRD Bab 7)
    if (profile.peran === "gudang") {
      query = query.neq("status", "draf");
    }

    const { data: rawPesanan, error: pesananError } = await query;

    if (pesananError) {
      console.warn(
        "Query join utama pesanan_jual mengalami kendala, mencoba fallback query terpisah:",
        pesananError.message
      );

      // Ambil fallback data jika join relasi foreign key membutuhkan query terpisah
      let fallbackQuery = supabase
        .from("pesanan_jual")
        .select(`
          id,
          nomor,
          pelanggan_id,
          status,
          total,
          dibuat_oleh,
          dibuat_pada,
          dikonfirmasi_pada,
          dikirim_pada,
          jatuh_tempo,
          dilunasi_pada,
          dibatalkan_pada,
          alasan_batal,
          mayar_payment_id,
          mayar_payment_url,
          mayar_status,
          mayar_claim_token,
          mayar_claim_at
        `)
        .order("dibuat_pada", { ascending: false });

      if (profile.peran === "gudang") {
        fallbackQuery = fallbackQuery.neq("status", "draf");
      }

      const { data: fallbackData, error: fallbackError } = await fallbackQuery;

      if (fallbackError) {
        console.error("Fallback query pesanan_jual gagal:", fallbackError);
        dbErrorMessage = `Gagal memuat data transaksi pesanan jual dari database (${fallbackError.message}).`;
      } else if (fallbackData) {
        // Ambil data toko pelanggan untuk mapping nama toko
        const { data: pelangganData, error: pelangganError } = await supabase
          .from("pelanggan")
          .select("id, kode, nama_toko, telepon, alamat, termin_hari");

        if (pelangganError) {
          console.warn("Fallback query detail pelanggan gagal:", pelangganError.message);
        }

        const pelangganMap = new Map(
          (pelangganData || []).map((p) => [p.id, p])
        );

        pesananList = fallbackData.map((row) => {
          const pel = pelangganMap.get(row.pelanggan_id);
          return {
            id: row.id,
            nomor: row.nomor,
            pelanggan_id: row.pelanggan_id,
            status: row.status as StatusPesananJual,
            total: Number(row.total) || 0,
            dibuat_oleh: row.dibuat_oleh,
            dibuat_pada: row.dibuat_pada,
            dikonfirmasi_pada: row.dikonfirmasi_pada,
            dikirim_pada: row.dikirim_pada,
            jatuh_tempo: row.jatuh_tempo,
            dilunasi_pada: row.dilunasi_pada,
            dibatalkan_pada: row.dibatalkan_pada,
            alasan_batal: row.alasan_batal,
            mayar_payment_id: row.mayar_payment_id || null,
            mayar_payment_url: row.mayar_payment_url || null,
            mayar_status: row.mayar_status || null,
            mayar_claim_token: row.mayar_claim_token || null,
            mayar_claim_at: row.mayar_claim_at || null,
            nama_toko: pel?.nama_toko || "Toko Tidak Dikenal",
            kode_pelanggan: pel?.kode || "-",
            telepon_pelanggan: pel?.telepon || "-",
            alamat_pelanggan: pel?.alamat || "-",
            termin_hari_pelanggan: pel?.termin_hari || 0,
          };
        });
      }
    } else if (rawPesanan) {
      pesananList = (rawPesanan as unknown as RawPesananRow[]).map((row) => ({
        id: row.id,
        nomor: row.nomor,
        pelanggan_id: row.pelanggan_id,
        status: row.status as StatusPesananJual,
        total: Number(row.total) || 0,
        dibuat_oleh: row.dibuat_oleh,
        dibuat_pada: row.dibuat_pada,
        dikonfirmasi_pada: row.dikonfirmasi_pada,
        dikirim_pada: row.dikirim_pada,
        jatuh_tempo: row.jatuh_tempo,
        dilunasi_pada: row.dilunasi_pada,
        dibatalkan_pada: row.dibatalkan_pada,
        alasan_batal: row.alasan_batal,
        mayar_payment_id: row.mayar_payment_id || null,
        mayar_payment_url: row.mayar_payment_url || null,
        mayar_status: row.mayar_status || null,
        mayar_claim_token: row.mayar_claim_token || null,
        mayar_claim_at: row.mayar_claim_at || null,
        nama_toko: row.pelanggan?.nama_toko || "Toko Tidak Dikenal",
        kode_pelanggan: row.pelanggan?.kode || "-",
        telepon_pelanggan: row.pelanggan?.telepon || "-",
        alamat_pelanggan: row.pelanggan?.alamat || "-",
        termin_hari_pelanggan: row.pelanggan?.termin_hari || 0,
      }));
    }
  } catch (err) {
    console.error("Exception pada PesananJualPage:", err);
    dbErrorMessage =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan sistem saat memproses data pesanan jual.";
  }

  // 6. Query daftar pelanggan aktif untuk opsi formulir draf pesanan
  let pelangganList: PelangganOption[] = [];
  let pelangganErrorMsg: string | null = null;

  try {
    const { data: pelangganData, error: pError } = await supabase
      .from("pelanggan")
      .select("id, kode, nama_toko, telepon, alamat, termin_hari, batas_kredit, aktif")
      .eq("aktif", true)
      .order("nama_toko", { ascending: true });

    if (pError) {
      console.error("Gagal memuat data pelanggan aktif:", pError);
      pelangganErrorMsg = `Gagal memuat daftar pelanggan (${pError.message}).`;
    } else if (pelangganData) {
      pelangganList = pelangganData as PelangganOption[];
    }
  } catch (err) {
    console.error("Exception query pelanggan:", err);
    pelangganErrorMsg =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan sistem saat memuat data pelanggan.";
  }

  // 7. Query katalog barang aktif untuk opsi pemilihan baris barang
  // PERHATIAN KEAMANAN BR-12: Kolom harga_pokok/hpp_satuan DILARANG disertakan dalam query ini!
  let barangList: BarangOption[] = [];
  let barangErrorMsg: string | null = null;

  try {
    const { data: barangData, error: bError } = await supabase
      .from("barang")
      .select("id, kode, nama, satuan, harga_jual, stok, aktif")
      .eq("aktif", true)
      .order("nama", { ascending: true });

    if (bError) {
      console.error("Gagal memuat katalog barang aktif:", bError);
      barangErrorMsg = `Gagal memuat katalog barang (${bError.message}).`;
    } else if (barangData) {
      barangList = barangData as BarangOption[];
    }
  } catch (err) {
    console.error("Exception query barang:", err);
    barangErrorMsg =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan sistem saat memuat katalog barang.";
  }

  return (
    <PesananJualClientView
      serverProfile={profile}
      initialPesanan={pesananList}
      dbError={dbErrorMessage}
      pelangganList={pelangganList}
      barangList={barangList}
      pelangganError={pelangganErrorMsg}
      barangError={barangErrorMsg}
    />
  );
}
