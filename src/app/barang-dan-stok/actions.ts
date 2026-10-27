"use server";

import { revalidatePath } from "next/cache";
import { createServerClientInstance } from "@/lib/supabase/server";
import {
  PenyesuaianStokInput,
  PenyesuaianStokResult,
  MutasiStokItem,
} from "@/types/barang";

export interface ActionResult<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

/**
 * Server Action: Penyesuaian Stok Barang (Stock Adjustment).
 *
 * MENEGAKKAN ATURAN BISNIS & KEAMANAN (PRD Bab 4, 7, 8 & BR-01, BR-11, BR-12):
 * 1. Autentikasi ketat via supabase.auth.getUser() di sisi server.
 * 2. Hanya peran 'manajer' dan 'gudang' yang diizinkan melakukan penyesuaian stok. Peran 'penjualan' DITOLAK.
 * 3. BR-01: Stok dan stok minimum berupa bilangan bulat dan tidak boleh negatif.
 * 4. BR-01: Jumlah perubahan tidak boleh bernilai nol (0).
 * 5. Alasan wajib diisi (minimal 10 karakter) untuk akuntabilitas fisik barang (sesuai ERD tabel mutasi_stok).
 * 6. Menggunakan RPC atomik `proses_penyesuaian_stok` yang menjalankan SELECT ... FOR UPDATE
 *    untuk mencegah race condition / lost update.
 * 7. Tepat satu baris catatan mutasi dibuat pada `public.mutasi_stok`.
 */
export async function sesuaikanStokAction(
  input: PenyesuaianStokInput
): Promise<ActionResult<PenyesuaianStokResult>> {
  try {
    const supabase = await createServerClientInstance();

    // 1. Verifikasi Sesi Pengguna di Supabase Auth
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Akses ditolak: sesi telah berakhir atau belum terautentikasi. Silakan login kembali.",
      };
    }

    // 2. Verifikasi Profil & Peran Pengguna di public.profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, nama_lengkap, peran, aktif")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || profile.aktif !== true) {
      return {
        success: false,
        error: "Akses ditolak: akun Anda tidak terdaftar atau telah dinonaktifkan.",
      };
    }

    // Penolakan Peran Staf Penjualan (PRD Bab 4 & 7)
    if (profile.peran === "penjualan") {
      return {
        success: false,
        error: "Akses ditolak: Staf Penjualan tidak memiliki wewenang melakukan penyesuaian stok.",
      };
    }

    if (profile.peran !== "manajer" && profile.peran !== "gudang") {
      return {
        success: false,
        error: `Akses ditolak: peran '${profile.peran}' tidak memiliki izin penyesuaian stok.`,
      };
    }

    // 3. Validasi Payload Awal
    if (!input || typeof input !== "object") {
      return {
        success: false,
        error: "Payload penyesuaian stok tidak valid.",
      };
    }

    const barangId = (input.barang_id || "").trim();
    if (!barangId) {
      return {
        success: false,
        error: "Barang wajib dipilih.",
      };
    }

    const alasan = (input.alasan || "").trim();
    if (alasan.length < 10) {
      return {
        success: false,
        error: "Alasan penyesuaian stok wajib diisi minimal 10 karakter (contoh: 'Hasil hitung fisik berkala', 'Kemasan rusak/bocor').",
      };
    }

    // 4. Periksa Keberadaan dan Stok Saat Ini di Database
    const { data: barang, error: barangError } = await supabase
      .from("barang")
      .select("id, kode, nama, stok, aktif")
      .eq("id", barangId)
      .maybeSingle();

    if (barangError || !barang) {
      return {
        success: false,
        error: "Data barang tidak ditemukan pada katalog sistem.",
      };
    }

    if (barang.aktif !== true) {
      return {
        success: false,
        error: `Barang '${barang.nama}' (${barang.kode}) berstatus nonaktif dan tidak dapat disesuaikan stoknya.`,
      };
    }

    const stokSaatIni = Number(barang.stok) || 0;
    let selisih = 0;

    // 5. Kalkulasi Jumlah Perubahan Berdasarkan Mode Input
    if (input.tipe_input === "stok_fisik") {
      const stokFisik = Number(input.nilai);
      if (!Number.isInteger(stokFisik) || stokFisik < 0) {
        return {
          success: false,
          error: "Stok fisik hasil perhitungan harus berupa bilangan bulat dan tidak boleh negatif (BR-01).",
        };
      }
      selisih = stokFisik - stokSaatIni;
      if (selisih === 0) {
        return {
          success: false,
          error: `Stok fisik yang dimasukkan (${stokFisik}) sama dengan stok tercatat saat ini. Tidak ada selisih stok untuk disesuaikan.`,
        };
      }
    } else {
      // Mode 'selisih' (+/-)
      const perubahan = Number(input.nilai);
      if (!Number.isInteger(perubahan) || perubahan === 0) {
        return {
          success: false,
          error: "Jumlah penyesuaian harus berupa bilangan bulat dan tidak boleh bernilai nol (BR-01).",
        };
      }
      selisih = perubahan;
      const perkiraanStokAkhir = stokSaatIni + selisih;
      if (perkiraanStokAkhir < 0) {
        return {
          success: false,
          error: `Penyesuaian ditolak: stok tidak boleh negatif (BR-01). Stok saat ini: ${stokSaatIni}, pengurangan: ${Math.abs(selisih)} (hasil: ${perkiraanStokAkhir}).`,
        };
      }
    }

    // 6. Eksekusi Transaksi Atomik Database Melalui RPC
    // Menggunakan fungsi database `proses_penyesuaian_stok` yang melakukan SELECT ... FOR UPDATE
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "proses_penyesuaian_stok",
      {
        p_barang_id: barangId,
        p_jumlah: selisih,
        p_alasan: alasan,
        p_nomor_dokumen: input.nomor_dokumen?.trim() || null,
      }
    );

    if (rpcError) {
      const rpcMsg = rpcError.message || "";

      // Jika fungsi RPC belum dipasang di PostgreSQL remote:
      if (
        rpcMsg.includes("Could not find the function") ||
        rpcMsg.includes("schema cache") ||
        rpcError.code === "PGRST202"
      ) {
        return {
          success: false,
          error:
            "Fungsi transaksi atomik database (RPC 'proses_penyesuaian_stok') belum terpasang di remote Supabase. Sesuai aturan keamanan data, eksekusi file migrasi 'scripts/migrations/01_penyesuaian_stok_dan_kartu_stok.sql' pada SQL Editor Supabase diperlukan agar perubahan stok dan pencatatan mutasi berjalan secara atomik (ACID).",
        };
      }

      return {
        success: false,
        error: `Gagal memproses penyesuaian stok di database: ${rpcMsg}`,
      };
    }

    // 7. Revalidasi Cache Halaman Katalog Barang
    revalidatePath("/barang-dan-stok");

    const payload = rpcResult as Record<string, unknown> | null;

    return {
      success: true,
      data: {
        barang_id: barangId,
        kode_barang: (payload?.kode_barang as string) || barang.kode,
        nama_barang: (payload?.nama_barang as string) || barang.nama,
        stok_sebelum: (payload?.stok_sebelum as number) ?? stokSaatIni,
        stok_sesudah: (payload?.stok_sesudah as number) ?? (stokSaatIni + selisih),
        perubahan: (payload?.perubahan as number) ?? selisih,
        nomor_dokumen: (payload?.nomor_dokumen as string) || "",
        mutasi_id: payload?.mutasi_id as number | undefined,
      },
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Terjadi kesalahan internal pada server.";
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Server Action: Mengambil Riwayat Kartu Stok per Barang (BR-11, BR-12).
 *
 * MENEGAKKAN ATURAN BISNIS & KEAMANAN:
 * 1. Autentikasi sesi di server Supabase.
 * 2. Hanya memuat catatan mutasi_stok untuk `barang_id` yang spesifik.
 * 3. Mengurutkan berdasarkan waktu terbaru (dibuat_pada descending, id descending).
 * 4. TIDAK menampilkan atau membocorkan harga pokok / harga beli / margin (BR-12).
 */
export async function ambilKartuStokAction(
  barangId: string
): Promise<ActionResult<MutasiStokItem[]>> {
  try {
    const supabase = await createServerClientInstance();

    // 1. Verifikasi Sesi Pengguna
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Akses ditolak: sesi belum terautentikasi. Silakan masuk kembali.",
      };
    }

    // 2. Verifikasi Profil Pengguna
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, peran, aktif")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || profile.aktif !== true) {
      return {
        success: false,
        error: "Akses ditolak: akun tidak ditemukan atau telah dinonaktifkan.",
      };
    }

    const cleanBarangId = (barangId || "").trim();
    if (!cleanBarangId) {
      return {
        success: false,
        error: "ID barang tidak valid.",
      };
    }

    // 3. Query Riwayat Mutasi Stok dengan Urutan Waktu Terbaru
    // Mencoba join ke profiles untuk menampilkan nama pembuat mutasi
    let mutasiList: MutasiStokItem[] = [];

    const { data: rawMutasi, error: mutasiError } = await supabase
      .from("mutasi_stok")
      .select("id, barang_id, jenis, jumlah, stok_sesudah, nomor_dokumen, alasan, dibuat_oleh, dibuat_pada")
      .eq("barang_id", cleanBarangId)
      .order("dibuat_pada", { ascending: false })
      .order("id", { ascending: false });

    if (mutasiError) {
      return {
        success: false,
        error: `Gagal membaca kartu stok: ${mutasiError.message}`,
      };
    }

    if (rawMutasi && Array.isArray(rawMutasi)) {
      // Ambil daftar UUID pembuat unik untuk memetakan nama lengkap (tanpa perlu join FK eksplisit)
      const pembuatIds = Array.from(
        new Set(rawMutasi.map((m) => m.dibuat_oleh).filter(Boolean))
      ) as string[];

      const namaMap: Record<string, string> = {};

      if (pembuatIds.length > 0) {
        const { data: pembuatList } = await supabase
          .from("profiles")
          .select("id, nama_lengkap")
          .in("id", pembuatIds);

        if (pembuatList) {
          for (const p of pembuatList) {
            namaMap[p.id] = p.nama_lengkap;
          }
        }
      }

      mutasiList = rawMutasi.map((m) => ({
        id: Number(m.id),
        barang_id: m.barang_id,
        jenis: m.jenis,
        jumlah: Number(m.jumlah),
        stok_sesudah: Number(m.stok_sesudah),
        nomor_dokumen: m.nomor_dokumen,
        alasan: m.alasan,
        dibuat_oleh: m.dibuat_oleh,
        dibuat_pada: m.dibuat_pada,
        pelaku_nama: m.dibuat_oleh ? namaMap[m.dibuat_oleh] || null : null,
      }));
    }

    return {
      success: true,
      data: mutasiList,
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Gagal memproses permintaan kartu stok.";
    return {
      success: false,
      error: errorMsg,
    };
  }
}
