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
  PembelianItem,
  canApprovePembelian,
  canReceivePembelian,
  canCreatePembelian,
  canCancelPembelian,
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

/**
 * Helper: Generate nomor urut PO berikutnya (misal PO-00020).
 */
async function generateNextNomorPO(supabase: Awaited<ReturnType<typeof createServerClientInstance>>): Promise<string> {
  // Ambil nomor urut atomik dari sequence PostgreSQL (mencegah race condition concurrency)
  const { data: rpcNomor, error: rpcError } = await supabase.rpc("ambil_nomor_po_berikutnya");

  if (rpcError || !rpcNomor || typeof rpcNomor !== "string" || !rpcNomor.trim()) {
    console.error("Gagal mengambil nomor urut PO dari database sequence:", rpcError);
    throw new Error(
      "Gagal mengalokasikan nomor PO atomik: Fungsi database 'ambil_nomor_po_berikutnya' tidak tersedia atau mengalami kendala. Pastikan migrasi '03_izin_dan_kebijakan_pembelian.sql' telah diterapkan pada basis data Supabase."
    );
  }

  return rpcNomor.trim();
}

/**
 * Server Action: Buat Pengajuan Pembelian Baru (PO).
 * Sesuai PRD Bab 4 (BR-09) & Bab 6.2:
 * - Diajukan oleh Staf Gudang atau Manajer.
 * - Jumlah dipesan 1 s/d 10.000.
 * - Status awal: 'diajukan'.
 * - Stok barang TIDAK BERUBAH saat diajukan.
 */
export async function buatPengajuanPembelianAction(
  input: BuatPengajuanPembelianInput
): Promise<ActionResult<{ id: string; nomor: string }>> {
  try {
    const auth = await getAuthenticatedUserAndProfile();
    if (auth.error || !auth.user || !auth.profile) {
      return { success: false, error: auth.error || "Gagal verifikasi autentikasi." };
    }

    const { supabase, user, profile } = auth;

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

    const pemasokId = (input.pemasok_id || "").trim();
    const barangId = (input.barang_id || "").trim();
    const jumlahDipesan = Number(input.jumlah_dipesan);

    if (!pemasokId) {
      return { success: false, error: "Pemasok wajib dipilih." };
    }

    if (!barangId) {
      return { success: false, error: "Barang yang akan dipesan wajib dipilih." };
    }

    if (
      !Number.isInteger(jumlahDipesan) ||
      jumlahDipesan < PEMBELIAN_LIMITS.MIN_JUMLAH_PESAN ||
      jumlahDipesan > PEMBELIAN_LIMITS.MAX_JUMLAH_PESAN
    ) {
      return {
        success: false,
        error: `Jumlah dipesan harus berupa bilangan bulat antara ${PEMBELIAN_LIMITS.MIN_JUMLAH_PESAN} sampai ${PEMBELIAN_LIMITS.MAX_JUMLAH_PESAN} (BR-09).`,
      };
    }

    // 2. Validasi pemasok aktif
    const { data: pemasok, error: pemasokError } = await supabase
      .from("pemasok")
      .select("id, nama, aktif")
      .eq("id", pemasokId)
      .maybeSingle();

    if (pemasokError || !pemasok) {
      return { success: false, error: "Data mitra pemasok tidak ditemukan di database." };
    }

    if (pemasok.aktif !== true) {
      return { success: false, error: `Pemasok '${pemasok.nama}' berstatus nonaktif dan tidak dapat menerima pesanan baru.` };
    }

    // 3. Validasi barang aktif
    const { data: barang, error: barangError } = await supabase
      .from("barang")
      .select("id, kode, nama, aktif, harga_pokok")
      .eq("id", barangId)
      .maybeSingle();

    if (barangError || !barang) {
      return { success: false, error: "Data barang tidak ditemukan di katalog sistem." };
    }

    if (barang.aktif !== true) {
      return { success: false, error: `Barang '${barang.nama}' (${barang.kode}) berstatus nonaktif dan tidak dapat dipesan.` };
    }

    // Tentukan harga beli satuan (opsional diisi jika Manajer yang membuat)
    let hargaBeliSatuan: number | null = null;
    if (profile.peran === "manajer" && input.harga_beli_satuan !== undefined && input.harga_beli_satuan !== null) {
      const parsedHarga = Number(input.harga_beli_satuan);
      if (!isNaN(parsedHarga) && parsedHarga > 0) {
        hargaBeliSatuan = parsedHarga;
      }
    }

    // 4. Generate nomor urut PO baru secara atomik dari sequence basis data
    let nomorPO: string;
    try {
      nomorPO = await generateNextNomorPO(supabase);
    } catch (nomorErr) {
      return {
        success: false,
        error:
          nomorErr instanceof Error
            ? nomorErr.message
            : "Gagal mengalokasikan nomor urut PO dari sequence basis data.",
      };
    }

    const newId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // 5. Insert record pembelian ke tabel public.pembelian
    const insertPayload = {
      id: newId,
      nomor: nomorPO,
      pemasok_id: pemasokId,
      barang_id: barangId,
      jumlah_dipesan: jumlahDipesan,
      jumlah_diterima: null,
      harga_beli_satuan: hargaBeliSatuan,
      status: "diajukan" as const,
      alasan_tolak: null,
      diajukan_oleh: user.id,
      diajukan_pada: nowIso,
      diputuskan_oleh: null,
      diputuskan_pada: null,
      diterima_oleh: null,
      diterima_pada: null,
    };

    const { error: insertError } = await supabase
      .from("pembelian")
      .insert(insertPayload);

    if (insertError) {
      console.error("Gagal insert pembelian:", insertError);
      return {
        success: false,
        error: `Gagal menyimpan pengajuan pembelian ke database: ${insertError.message}`,
      };
    }

    // 6. Pencatatan jejak audit (BR-12):
    // Dikelola secara otoritatif dan atomik di level basis data oleh trigger trg_audit_tambah_pembelian
    // dalam transaksi yang sama dengan INSERT pembelian (mencegah pencatatan audit ganda).

    // Revalidasi cache halaman
    revalidatePath("/pembelian");
    revalidatePath("/barang-dan-stok");
    revalidatePath("/");

    return {
      success: true,
      data: {
        id: newId,
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
    const { data: rpcData, error: rpcError } = await supabase.rpc("setujui_pembelian", {
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

    if (!rpcData || !rpcData.success) {
      return {
        success: false,
        error: "Transaksi persetujuan pembelian tidak menghasilkan konfirmasi yang valid dari basis data.",
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

    // Eksekusi mutasi pembatalan secara atomik via RPC SECURITY DEFINER (dengan lock FOR UPDATE & audit log)
    const { data: rpcData, error: rpcError } = await supabase.rpc("batalkan_pembelian", {
      p_pembelian_id: pembelianId,
    });

    if (rpcError) {
      console.error("Gagal eksekusi RPC batalkan_pembelian:", rpcError);
      return {
        success: false,
        error: `Gagal membatalkan pembelian di database: ${rpcError.message}`,
      };
    }

    if (!rpcData || !rpcData.success) {
      return {
        success: false,
        error: "Transaksi pembatalan pembelian tidak menghasilkan konfirmasi yang valid dari basis data.",
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

    const { supabase, user, profile } = auth;

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

    // 2. Eksekusi HANYA melalui RPC Database Atomik proses_penerimaan_barang_pembelian
    // CATATAN KEAMANAN & INTEGRITAS (ACID):
    // Dilarang melakukan mutasi parsial bertahap di sisi client/server action.
    // Pembaruan status PO, penambahan stok barang, pembaruan HPP, dan pencatatan kartu stok
    // WAJIB berada dalam 1 transaksi atomik database dengan penguncian baris (FOR UPDATE).
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "proses_penerimaan_barang_pembelian",
      {
        p_pembelian_id: pembelianId,
        p_jumlah_diterima: jumlahDiterima,
      }
    );

    if (rpcError) {
      console.error("Gagal eksekusi RPC proses_penerimaan_barang_pembelian:", rpcError);

      if (rpcError.message.includes("does not exist") || rpcError.code === "42883") {
        return {
          success: false,
          error:
            "Aksi ditolak demi integritas basis data: Fungsi transaksi atomik 'proses_penerimaan_barang_pembelian' belum terpasang di database Supabase. Silakan terapkan migrasi '03_izin_dan_kebijakan_pembelian.sql' terlebih dahulu.",
        };
      }

      return {
        success: false,
        error: `Gagal mencatat penerimaan barang: ${rpcError.message}`,
      };
    }

    if (!rpcData || !rpcData.success) {
      return {
        success: false,
        error: "Transaksi penerimaan barang tidak menghasilkan konfirmasi yang valid dari basis data.",
      };
    }

    // Revalidasi semua cache halaman terkait setelah transaksi atomik berhasil
    revalidatePath("/pembelian");
    revalidatePath("/barang-dan-stok");
    revalidatePath("/");

    return {
      success: true,
      data: {
        id: pembelianId,
        nomor: rpcData.nomor,
        stok_sebelum: rpcData.stok_sebelum,
        stok_sesudah: rpcData.stok_sesudah,
        jumlah_diterima: rpcData.jumlah_diterima,
        harga_pokok_baru: Number(rpcData.harga_pokok_baru) || 0,
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
