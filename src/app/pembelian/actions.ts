"use server";

import { revalidatePath } from "next/cache";
import { createServerClientInstance } from "@/lib/supabase/server";
import {
  BuatPengajuanPembelianInput,
  SetujuiPembelianInput,
  TolakPembelianInput,
  TerimaBarangPembelianInput,
  BatalkanPembelianInput,
  PEMBELIAN_LIMITS,
  canApprovePembelian,
  canReceivePembelian,
  canCreatePembelian,
} from "@/types/pembelian";
import { UserProfile, isValidRole } from "@/types/auth";

export interface ActionResult<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

/**
 * Helper: Verifikasi autentikasi dan ambil profil pengguna di server.
 */
async function getAuthenticatedUserAndProfile() {
  const supabase = await createServerClientInstance();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      supabase,
      user: null,
      profile: null,
      error: "Akses ditolak: sesi login Anda telah berakhir atau tidak valid. Silakan login kembali.",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, nama_lengkap, peran, aktif")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      supabase,
      user,
      profile: null,
      error: "Akses ditolak: profil pengguna tidak ditemukan di sistem.",
    };
  }

  if (profile.aktif !== true) {
    return {
      supabase,
      user,
      profile: null,
      error: "Akses ditolak: akun Anda berstatus nonaktif. Hubungi administrator sistem.",
    };
  }

  if (!isValidRole(profile.peran)) {
    return {
      supabase,
      user,
      profile: null,
      error: `Akses ditolak: peran '${profile.peran}' tidak dikenali oleh sistem.`,
    };
  }

  return {
    supabase,
    user,
    profile: profile as UserProfile,
    error: null,
  };
}


const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Server Action: Buat Pengajuan Pembelian Baru (PO).
 * Sesuai PRD Bab 4 (BR-09) & Bab 6.2:
 * - Diajukan oleh Staf Gudang atau Manajer.
 * - Jumlah dipesan 1 s/d 10.000.
 * - Status awal: 'diajukan'.
 * - Stok barang TIDAK BERUBAH saat diajukan.
 * - Dilindungi BR-12 (harga pokok tidak boleh dibaca oleh staf gudang/nonmanajer).
 */
export async function buatPengajuanPembelianAction(
  input: BuatPengajuanPembelianInput
): Promise<ActionResult<{ id: string; nomor: string }>> {
  try {
    const auth = await getAuthenticatedUserAndProfile();
    if (auth.error || !auth.user || !auth.profile) {
      return { success: false, error: auth.error || "Gagal verifikasi autentikasi." };
    }

    const { supabase, profile } = auth;

    if (!canCreatePembelian(profile.peran)) {
      return {
        success: false,
        error: "Akses ditolak: Hanya Staf Gudang dan Manajer yang memiliki wewenang mengajukan pembelian barang ke pemasok.",
      };
    }

    // 1. Validasi input
    if (!input || typeof input !== "object") {
      return { success: false, error: "Data pengajuan pembelian tidak valid." };
    }

    const rawPemasokId = (input.pemasok_id || "").trim();
    const rawBarangId = (input.barang_id || "").trim();
    const jumlahDipesan = Number(input.jumlah_dipesan);

    if (!rawPemasokId) {
      return { success: false, error: "Pemasok wajib dipilih." };
    }

    if (!rawBarangId) {
      return { success: false, error: "Barang yang akan dipesan wajib dipilih." };
    }

    if (
      !Number.isInteger(jumlahDipesan) ||
      jumlahDipesan < PEMBELIAN_LIMITS.MIN_JUMLAH_PESAN ||
      jumlahDipesan > PEMBELIAN_LIMITS.MAX_JUMLAH_PESAN
    ) {
      return {
        success: false,
        error: `Jumlah dipesan harus berupa bilangan bulat antara ${PEMBELIAN_LIMITS.MIN_JUMLAH_PESAN} sampai ${PEMBELIAN_LIMITS.MAX_JUMLAH_PESAN.toLocaleString("id-ID")} (BR-09).`,
      };
    }

    // 2. Validasi pemasok aktif (Mendukung identifikasi via UUID kanonis maupun kode pemasok)
    const isPemasokUuid = UUID_REGEX.test(rawPemasokId);
    const pemasokQuery = supabase
      .from("pemasok")
      .select("id, kode, nama, aktif");

    const { data: pemasok, error: pemasokError } = isPemasokUuid
      ? await pemasokQuery.eq("id", rawPemasokId).maybeSingle()
      : await pemasokQuery.eq("kode", rawPemasokId).maybeSingle();

    if (pemasokError) {
      console.error("Gagal validasi pemasok:", pemasokError);
      return { success: false, error: `Gagal memverifikasi data mitra pemasok: ${pemasokError.message}` };
    }

    if (!pemasok) {
      return { success: false, error: "Data mitra pemasok tidak ditemukan di database." };
    }

    if (pemasok.aktif !== true) {
      return { success: false, error: `Pemasok '${pemasok.nama}' berstatus nonaktif dan tidak dapat menerima pesanan baru.` };
    }

    // 3. Validasi barang aktif (Mendukung identifikasi via UUID kanonis maupun kode barang)
    // SANGAT PENTING (BR-12): Jangan sertakan 'harga_pokok' dalam select karena role nonmanajer
    // (staf gudang) tidak memiliki hak SELECT pada kolom tersebut di basis data.
    const isBarangUuid = UUID_REGEX.test(rawBarangId);
    const barangQuery = supabase
      .from("barang")
      .select("id, kode, nama, aktif");

    const { data: barang, error: barangError } = isBarangUuid
      ? await barangQuery.eq("id", rawBarangId).maybeSingle()
      : await barangQuery.eq("kode", rawBarangId).maybeSingle();

    if (barangError) {
      console.error("Gagal validasi barang:", barangError);
      return { success: false, error: `Gagal memverifikasi data barang dari database: ${barangError.message}` };
    }

    if (!barang) {
      return { success: false, error: "Data barang tidak ditemukan di katalog sistem." };
    }

    if (barang.aktif !== true) {
      return { success: false, error: `Barang '${barang.nama}' (${barang.kode}) berstatus nonaktif dan tidak dapat dipesan.` };
    }

    // 4. Eksekusi pengajuan pembelian secara atomik melalui RPC database resmi (ajukan_pembelian)
    // RPC ini mengurus alokasi nomor PO unik, audit log, serta penyimpanan ke tabel pembelian secara atomik.
    const { data: poId, error: rpcError } = await supabase.rpc("ajukan_pembelian", {
      p_pemasok_id: pemasok.id,
      p_barang_id: barang.id,
      p_jumlah_dipesan: jumlahDipesan,
    });

    if (rpcError || !poId) {
      console.error("Gagal eksekusi RPC ajukan_pembelian:", rpcError);
      return {
        success: false,
        error: rpcError?.message || "Gagal menyimpan pengajuan pembelian ke database.",
      };
    }

    // 5. Ambil nomor PO atomik yang dihasilkan oleh basis data
    const { data: createdPo } = await supabase
      .from("pembelian")
      .select("id, nomor")
      .eq("id", poId)
      .maybeSingle();

    const nomorPO = createdPo?.nomor || String(poId);

    // Revalidasi cache halaman
    revalidatePath("/pembelian");
    revalidatePath("/barang-dan-stok");
    revalidatePath("/radar-stok");
    revalidatePath("/");

    return {
      success: true,
      data: {
        id: poId,
        nomor: nomorPO,
      },
    };
  } catch (err) {
    console.error("Exception in buatPengajuanPembelianAction:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem saat membuat pengajuan pembelian.",
    };
  }
}

/**
 * Server Action: Setujui Pengajuan Pembelian (PO).
 * Sesuai PRD Bab 4 (BR-09, BR-12) & Bab 6.2:
 * - Hanya Manajer yang berwenang.
 * - Wajib mengisi harga beli satuan lebih dari 0.
 * - Status berubah menjadi 'disetujui'.
 * - Stok barang TIDAK BERUBAH saat disetujui (hanya berubah saat barang fisik diterima).
 */
export async function setujuiPembelianAction(
  input: SetujuiPembelianInput
): Promise<ActionResult<{ id: string; status: "disetujui" }>> {
  try {
    const auth = await getAuthenticatedUserAndProfile();
    if (auth.error || !auth.user || !auth.profile) {
      return { success: false, error: auth.error || "Gagal verifikasi autentikasi." };
    }

    const { supabase, profile } = auth;

    if (!canApprovePembelian(profile.peran)) {
      return {
        success: false,
        error: "Akses ditolak: Hanya Manajer yang memiliki wewenang menyetujui pengajuan pembelian dan menentukan harga beli (BR-09, BR-12).",
      };
    }

    const pembelianId = (input.pembelian_id || "").trim();
    const hargaBeliSatuan = Number(input.harga_beli_satuan);

    if (!pembelianId) {
      return { success: false, error: "ID pembelian wajib disertakan." };
    }

    if (isNaN(hargaBeliSatuan) || hargaBeliSatuan <= 0) {
      return {
        success: false,
        error: "Harga beli satuan wajib diisi dan harus bernilai lebih dari Rp0 (BR-09).",
      };
    }

    // Eksekusi mutasi persetujuan secara atomik via RPC SECURITY DEFINER (dengan lock FOR UPDATE & audit log)
    const { error: rpcError } = await supabase.rpc("setujui_pembelian", {
      p_pembelian_id: pembelianId,
      p_harga_beli_satuan: hargaBeliSatuan,
    });

    if (rpcError) {
      console.error("Gagal eksekusi RPC setujui_pembelian:", rpcError);
      return {
        success: false,
        error: `Gagal menyetujui pembelian di database: ${rpcError.message}`,
      };
    }

    revalidatePath("/pembelian");
    revalidatePath("/");

    return {
      success: true,
      data: {
        id: pembelianId,
        status: "disetujui",
      },
    };
  } catch (err) {
    console.error("Exception in setujuiPembelianAction:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem saat menyetujui pembelian.",
    };
  }
}

/**
 * Server Action: Tolak Pengajuan Pembelian (PO).
 * Sesuai PRD Bab 4 (BR-09, BR-12) & Bab 6.2:
 * - Hanya Manajer yang berwenang.
 * - Alasan tolak wajib diisi minimal 10 karakter.
 * - Status berubah menjadi 'ditolak'.
 */
export async function tolakPembelianAction(
  input: TolakPembelianInput
): Promise<ActionResult<{ id: string; status: "ditolak" }>> {
  try {
    const auth = await getAuthenticatedUserAndProfile();
    if (auth.error || !auth.user || !auth.profile) {
      return { success: false, error: auth.error || "Gagal verifikasi autentikasi." };
    }

    const { supabase, profile } = auth;

    if (!canApprovePembelian(profile.peran)) {
      return {
        success: false,
        error: "Akses ditolak: Hanya Manajer yang memiliki wewenang menolak pengajuan pembelian (BR-09).",
      };
    }

    const pembelianId = (input.pembelian_id || "").trim();
    const alasanTolak = (input.alasan_tolak || "").trim();

    if (!pembelianId) {
      return { success: false, error: "ID pembelian wajib disertakan." };
    }

    if (alasanTolak.length < PEMBELIAN_LIMITS.MIN_ALASAN_TOLAK_LEN) {
      return {
        success: false,
        error: `Alasan penolakan pembelian wajib diisi paling sedikit ${PEMBELIAN_LIMITS.MIN_ALASAN_TOLAK_LEN} karakter (BR-09).`,
      };
    }

    // Eksekusi mutasi penolakan secara atomik via RPC SECURITY DEFINER (dengan lock FOR UPDATE & audit log)
    const { data: rpcData, error: rpcError } = await supabase.rpc("tolak_pembelian", {
      p_pembelian_id: pembelianId,
      p_alasan_tolak: alasanTolak,
    });

    if (rpcError) {
      console.error("Gagal eksekusi RPC tolak_pembelian:", rpcError);
      return {
        success: false,
        error: `Gagal menolak pembelian di database: ${rpcError.message}`,
      };
    }

    if (!rpcData || !rpcData.success) {
      return {
        success: false,
        error: "Transaksi penolakan pembelian tidak menghasilkan konfirmasi yang valid dari basis data.",
      };
    }

    revalidatePath("/pembelian");
    revalidatePath("/");

    return {
      success: true,
      data: {
        id: pembelianId,
        status: "ditolak",
      },
    };
  } catch (err) {
    console.error("Exception in tolakPembelianAction:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem saat menolak pembelian.",
    };
  }
}

/**
 * Server Action: Batalkan Pengajuan Pembelian (PO).
 * Sesuai PRD Bab 4 (BR-09) & Bab 6.2:
 * - Jika status 'diajukan': Boleh dibatalkan oleh pengaju atau Manajer.
 * - Jika status 'disetujui': Hanya boleh dibatalkan oleh Manajer (selama fisik barang belum diterima).
 */
export async function batalkanPembelianAction(
  input: BatalkanPembelianInput
): Promise<ActionResult<{ id: string; status: "dibatalkan" }>> {
  try {
    const auth = await getAuthenticatedUserAndProfile();
    if (auth.error || !auth.user || !auth.profile) {
      return { success: false, error: auth.error || "Gagal verifikasi autentikasi." };
    }

    const { supabase } = auth;
    const pembelianId = (input.pembelian_id || "").trim();

    if (!pembelianId) {
      return { success: false, error: "ID pembelian wajib disertakan." };
    }

    // Eksekusi mutasi pembatalan secara atomik via RPC SECURITY DEFINER
    const { error: rpcError } = await supabase.rpc("batalkan_pengajuan_pembelian", {
      p_pembelian_id: pembelianId,
    });

    if (rpcError) {
      console.error("Gagal eksekusi RPC batalkan_pengajuan_pembelian:", rpcError);
      return {
        success: false,
        error: `Gagal membatalkan pembelian di database: ${rpcError.message}`,
      };
    }

    revalidatePath("/pembelian");
    revalidatePath("/");

    return {
      success: true,
      data: {
        id: pembelianId,
        status: "dibatalkan",
      },
    };
  } catch (err) {
    console.error("Exception in batalkanPembelianAction:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem saat membatalkan pembelian.",
    };
  }
}

/**
 * Server Action: Catat Penerimaan Barang Fisik (Goods Receipt).
 * Sesuai PRD Bab 4 (BR-10, BR-11, BR-12) & Bab 6.2:
 * - Hanya untuk pembelian berstatus 'disetujui' dan hanya satu kali.
 * - Dilakukan oleh Staf Gudang atau Manajer.
 * - Jumlah diterima 1 s/d jumlah dipesan. Kekurangan dari pemasok tidak ditunggu.
 * - STOK BERUBAH:
 *   1. Stok barang bertambah sejumlah barang yang diterima.
 *   2. Harga pokok barang diperbarui menjadi harga beli pembelian tersebut (BR-10).
 *   3. Tercatat di kartu stok (public.mutasi_stok) jenis 'masuk' (BR-11).
 *   4. Tercatat di audit_log (BR-12).
 */
export async function terimaBarangPembelianAction(
  input: TerimaBarangPembelianInput
): Promise<ActionResult<{
  id: string;
  nomor: string;
  stok_sebelum: number;
  stok_sesudah: number;
  jumlah_diterima: number;
  harga_pokok_baru: number;
}>> {
  try {
    const auth = await getAuthenticatedUserAndProfile();
    if (auth.error || !auth.user || !auth.profile) {
      return { success: false, error: auth.error || "Gagal verifikasi autentikasi." };
    }

    const { supabase, profile } = auth;

    if (!canReceivePembelian(profile.peran)) {
      return {
        success: false,
        error: "Akses ditolak: Hanya Staf Gudang dan Manajer yang berwenang mencatat penerimaan fisik barang dari pemasok (BR-10).",
      };
    }

    const pembelianId = (input.pembelian_id || "").trim();
    const jumlahDiterima = Number(input.jumlah_diterima);

    if (!pembelianId) {
      return { success: false, error: "ID pembelian wajib disertakan." };
    }

    // 1. Ambil data pembelian saat ini (tanpa meminta harga_beli_satuan dari tabel pembelian)
    const { data: pembelian, error: getError } = await supabase
      .from("pembelian")
      .select("id, nomor, status, barang_id, jumlah_dipesan, jumlah_diterima")
      .eq("id", pembelianId)
      .maybeSingle();

    if (getError || !pembelian) {
      return { success: false, error: "Data transaksi pembelian tidak ditemukan di sistem." };
    }

    if (pembelian.status !== "disetujui") {
      return {
        success: false,
        error: `Penerimaan barang untuk PO ${pembelian.nomor} ditolak karena saat ini berstatus '${pembelian.status}'. Penerimaan fisik barang hanya dapat dilakukan untuk pembelian yang telah disetujui (BR-10).`,
      };
    }

    if (pembelian.jumlah_diterima !== null && pembelian.jumlah_diterima !== undefined) {
      return {
        success: false,
        error: `Penerimaan barang untuk PO ${pembelian.nomor} telah dicatat sebelumnya. Penerimaan barang dari pemasok hanya diizinkan satu kali (BR-10).`,
      };
    }

    const jumlahDipesan = Number(pembelian.jumlah_dipesan) || 0;
    if (
      !Number.isInteger(jumlahDiterima) ||
      jumlahDiterima < 1 ||
      jumlahDiterima > jumlahDipesan
    ) {
      return {
        success: false,
        error: `Jumlah diterima harus berupa bilangan bulat antara 1 sampai jumlah yang dipesan (${jumlahDipesan} unit) sesuai BR-10.`,
      };
    }

    // 2. Eksekusi melalui RPC Database Atomik terima_pembelian
    const { error: rpcError } = await supabase.rpc(
      "terima_pembelian",
      {
        p_pembelian_id: pembelianId,
        p_jumlah_diterima: jumlahDiterima,
      }
    );

    if (rpcError) {
      console.error("Gagal eksekusi RPC terima_pembelian:", rpcError);
      return {
        success: false,
        error: `Gagal mencatat penerimaan barang: ${rpcError.message}`,
      };
    }

    // 3. Ambil data PO dan stok terbaru
    const { data: updatedPo } = await supabase
      .from("pembelian")
      .select("id, nomor, jumlah_diterima, barang_id")
      .eq("id", pembelianId)
      .maybeSingle();

    const { data: updatedBarang } = await supabase
      .from("barang")
      .select("stok")
      .eq("id", pembelian.barang_id)
      .maybeSingle();

    const stokSesudah = Number(updatedBarang?.stok) || 0;
    const stokSebelum = Math.max(0, stokSesudah - jumlahDiterima);

    // Revalidasi semua cache halaman terkait setelah transaksi atomik berhasil
    revalidatePath("/pembelian");
    revalidatePath("/barang-dan-stok");
    revalidatePath("/");

    return {
      success: true,
      data: {
        id: pembelianId,
        nomor: updatedPo?.nomor || pembelian.nomor,
        stok_sebelum: stokSebelum,
        stok_sesudah: stokSesudah,
        jumlah_diterima: jumlahDiterima,
        harga_pokok_baru: 0,
      },
    };


  } catch (err) {
    console.error("Exception in terimaBarangPembelianAction:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Terjadi kesalahan sistem saat memproses penerimaan barang.",
    };
  }
}
