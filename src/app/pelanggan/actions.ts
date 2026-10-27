"use server";

import { revalidatePath } from "next/cache";
import { createServerClientInstance } from "@/lib/supabase/server";
import { isValidTerminHari } from "@/types/pelanggan";

export interface TambahPelangganInput {
  kode: string;
  nama_toko: string;
  telepon: string;
  alamat: string;
  batas_kredit?: number;
  termin_hari: number;
}

export interface ActionResult<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

/**
 * Server Action untuk menambah pelanggan baru menggunakan RPC public.tambah_pelanggan.
 * Menegakkan verifikasi sesi pengguna, validasi profil & peran, serta aturan batas kredit BR-05 & BR-12.
 */
export async function tambahPelangganAction(
  input: TambahPelangganInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createServerClientInstance();

    // 1. Verifikasi pengguna terautentikasi melalui sesi Supabase Auth
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Akses ditolak: sesi telah berakhir atau pengguna belum terautentikasi. Silakan login kembali.",
      };
    }

    // 2. Ambil profil pengguna dari public.profiles untuk verifikasi peran & status aktif
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, peran, aktif")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || !profile.aktif) {
      return {
        success: false,
        error: "Akses ditolak: akun Anda tidak terdaftar atau telah dinonaktifkan.",
      };
    }

    // Hanya peran manajer dan penjualan yang berhak mendaftarkan pelanggan
    if (profile.peran !== "manajer" && profile.peran !== "penjualan") {
      return {
        success: false,
        error: `Akses ditolak: peran '${profile.peran}' tidak memiliki izin mengelola pelanggan.`,
      };
    }

    // 3. Sanitasi & Validasi Input Teks
    const kode = (input.kode || "").trim().toUpperCase();
    const namaToko = (input.nama_toko || "").trim();
    const telepon = (input.telepon || "").trim();
    const alamat = (input.alamat || "").trim();
    const terminHari = Number(input.termin_hari);

    if (!kode) {
      return {
        success: false,
        error: "Kode pelanggan wajib diisi (contoh: PLG-011).",
      };
    }

    // Format kode pelanggan harus terstruktur (diawali PLG-)
    if (!/^PLG-[A-Z0-9\-_]+$/i.test(kode)) {
      return {
        success: false,
        error: "Format kode pelanggan tidak valid. Gunakan format seperti PLG-011.",
      };
    }

    if (!namaToko) {
      return {
        success: false,
        error: "Nama toko / pelanggan wajib diisi.",
      };
    }
    if (namaToko.length > 255) {
      return {
        success: false,
        error: "Nama toko maksimal 255 karakter.",
      };
    }

    if (!telepon) {
      return {
        success: false,
        error: "Nomor telepon / kontak wajib diisi.",
      };
    }
    if (telepon.length < 8 || telepon.length > 20) {
      return {
        success: false,
        error: "Panjang nomor telepon harus antara 8 hingga 20 karakter.",
      };
    }
    if (!/^\+?[0-9\s\-]{8,20}$/.test(telepon)) {
      return {
        success: false,
        error: "Format nomor telepon tidak valid (hanya angka, tanda strip, spasi, atau awalan +).",
      };
    }

    if (!alamat) {
      return {
        success: false,
        error: "Alamat toko wajib diisi.",
      };
    }

    // 4. Validasi Termin Pembayaran (BR-05: 0, 7, 14, 30 hari)
    if (!isValidTerminHari(terminHari)) {
      return {
        success: false,
        error: `Pilihan termin tidak valid: ${terminHari} hari. Pilihan yang sah: 0, 7, 14, atau 30 hari.`,
      };
    }

    // 5. Penegakan Aturan Batas Kredit (BR-05 & BR-12)
    // Staf Penjualan SELALU mendapatkan batas kredit 0, mengabaikan manipulasi apa pun dari klien.
    let batasKredit = 0;
    if (profile.peran === "manajer") {
      const rawKredit = Number(input.batas_kredit ?? 0);
      if (isNaN(rawKredit) || rawKredit < 0) {
        return {
          success: false,
          error: "Batas kredit tidak boleh bernilai negatif.",
        };
      }
      batasKredit = rawKredit;
    } else {
      batasKredit = 0;
    }

    // 6. Eksekusi RPC public.tambah_pelanggan di Supabase dengan fallback ke direct table insert
    let newCustomerUuid: string | null = null;

    const { data: newId, error: rpcError } = await supabase.rpc(
      "tambah_pelanggan",
      {
        p_kode: kode,
        p_nama_toko: namaToko,
        p_telepon: telepon,
        p_alamat: alamat,
        p_batas_kredit: batasKredit,
        p_termin_hari: terminHari,
      }
    );

    if (rpcError) {
      const isMissingRpc =
        rpcError.message?.toLowerCase().includes("could not find the function") ||
        rpcError.code === "PGRST202" ||
        rpcError.code === "42883";

      if (isMissingRpc) {
        // Fallback: Gunakan direct INSERT jika RPC belum dideploy di database
        const { data: directInsert, error: directError } = await supabase
          .from("pelanggan")
          .insert({
            kode,
            nama_toko: namaToko,
            telepon,
            alamat,
            batas_kredit: batasKredit,
            termin_hari: terminHari,
            aktif: true,
            dibuat_oleh: user.id,
          })
          .select("id")
          .single();

        if (directError) {
          const msg = directError.message || "";
          if (
            directError.code === "23505" ||
            msg.includes("duplicate key") ||
            msg.includes("unique") ||
            msg.includes("pelanggan_kode_key")
          ) {
            return {
              success: false,
              error: `Kode pelanggan '${kode}' sudah terdaftar di sistem. Silakan gunakan kode pelanggan lain.`,
            };
          }

          return {
            success: false,
            error: `Gagal menyimpan pelanggan ke database: ${msg}`,
          };
        }

        newCustomerUuid = String(directInsert.id);
      } else {
        const msg = rpcError.message || "";

        // Tangani pelanggaran UNIQUE constraint pada kode pelanggan
        if (
          rpcError.code === "23505" ||
          msg.includes("duplicate key") ||
          msg.includes("pelanggan_kode_key") ||
          msg.includes("unique")
        ) {
          return {
            success: false,
            error: `Kode pelanggan '${kode}' sudah terdaftar di sistem. Silakan gunakan kode pelanggan lain.`,
          };
        }

        return {
          success: false,
          error: `Gagal menyimpan pelanggan ke database: ${msg}`,
        };
      }
    } else {
      newCustomerUuid = String(newId);
    }

    // 7. Revalidasi halaman katalog pelanggan agar data mutasi langsung terrefleksi
    revalidatePath("/pelanggan");

    return {
      success: true,
      data: {
        id: newCustomerUuid,
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

export interface EditPelangganInput {
  id: string;
  nama_toko: string;
  telepon: string;
  alamat: string;
  batas_kredit?: number;
  termin_hari: number;
}

export interface EditPelangganSuccessData {
  id: string;
  kode: string;
  nama_toko: string;
  telepon: string;
  alamat: string;
  batas_kredit: number;
  termin_hari: number;
}

/**
 * Server Action untuk memperbarui data toko pelanggan (Edit Pelanggan).
 * MENEGAKKAN ATURAN BISNIS & KEAMANAN (PRD Bab 4, 7 & BR-05, BR-12):
 * 1. Autentikasi sesi pengguna via Supabase Auth di sisi server.
 * 2. Hanya peran 'manajer' dan 'penjualan' yang berhak mengedit data pelanggan ('gudang' DITOLAK).
 * 3. BR-05 & BR-12: Hanya peran 'manajer' yang berhak mengubah batas_kredit (plafon piutang).
 *    Untuk peran 'penjualan', perubahan batas_kredit diabaikan dan nilai sebelumnya dipertahankan.
 * 4. Jika batas_kredit diubah oleh manajer, dicatat dalam public.audit_log dengan aksi 'ubah_batas_kredit'.
 * 5. Validasi teks & termin hari sesuai spesifikasi PRD.
 * 6. Revalidasi cache rute /pelanggan.
 */
export async function editPelangganAction(
  input: EditPelangganInput
): Promise<ActionResult<EditPelangganSuccessData>> {
  try {
    const supabase = await createServerClientInstance();

    // 1. Verifikasi pengguna terautentikasi
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Akses ditolak: sesi telah berakhir atau belum terautentikasi.",
      };
    }

    // 2. Verifikasi profil dan otorisasi peran
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, peran, aktif")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || !profile.aktif) {
      return {
        success: false,
        error: "Akses ditolak: akun Anda tidak terdaftar atau telah dinonaktifkan.",
      };
    }

    if (profile.peran !== "manajer" && profile.peran !== "penjualan") {
      return {
        success: false,
        error: `Akses ditolak: peran '${profile.peran}' tidak memiliki izin mengedit pelanggan.`,
      };
    }

    // 3. Validasi ID Pelanggan
    const id = (input.id || "").trim();
    if (!id) {
      return {
        success: false,
        error: "ID pelanggan tidak valid.",
      };
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return {
        success: false,
        error: "Format ID pelanggan tidak valid (format UUID salah).",
      };
    }

    // Ambil data pelanggan eksisting
    const { data: existing, error: existingError } = await supabase
      .from("pelanggan")
      .select("id, kode, nama_toko, telepon, alamat, batas_kredit, termin_hari, aktif")
      .eq("id", id)
      .maybeSingle();

    if (existingError || !existing) {
      return {
        success: false,
        error: `Data pelanggan dengan ID '${id}' tidak ditemukan pada database.`,
      };
    }

    // 4. Sanitasi & Validasi Input
    const namaToko = (input.nama_toko || "").trim();
    const telepon = (input.telepon || "").trim();
    const alamat = (input.alamat || "").trim();
    const terminHari = Number(input.termin_hari);

    if (!namaToko) {
      return {
        success: false,
        error: "Nama toko / pelanggan wajib diisi.",
      };
    }
    if (namaToko.length > 255) {
      return {
        success: false,
        error: "Nama toko maksimal 255 karakter.",
      };
    }

    if (!telepon) {
      return {
        success: false,
        error: "Nomor telepon / kontak wajib diisi.",
      };
    }
    if (telepon.length < 8 || telepon.length > 20) {
      return {
        success: false,
        error: "Panjang nomor telepon harus antara 8 hingga 20 karakter.",
      };
    }
    if (!/^\+?[0-9\s\-]{8,20}$/.test(telepon)) {
      return {
        success: false,
        error: "Format nomor telepon tidak valid.",
      };
    }

    if (!alamat) {
      return {
        success: false,
        error: "Alamat toko wajib diisi.",
      };
    }

    if (!isValidTerminHari(terminHari)) {
      return {
        success: false,
        error: `Pilihan termin tidak valid: ${terminHari} hari. Pilihan yang sah: 0, 7, 14, atau 30 hari.`,
      };
    }

    // 5. Penegakan Hak Akses Batas Kredit (BR-05 & BR-12)
    const updatePayload: Record<string, unknown> = {
      nama_toko: namaToko,
      telepon: telepon,
      alamat: alamat,
      termin_hari: terminHari,
    };

    let batasKreditBerubah = false;
    const oldBatasKredit = Number(existing.batas_kredit) || 0;
    let newBatasKredit = oldBatasKredit;

    if (profile.peran === "manajer" && typeof input.batas_kredit !== "undefined") {
      const parsedKredit = Number(input.batas_kredit);
      if (isNaN(parsedKredit) || parsedKredit < 0) {
        return {
          success: false,
          error: "Batas kredit tidak boleh bernilai negatif.",
        };
      }
      newBatasKredit = Math.round(parsedKredit);
      if (newBatasKredit !== oldBatasKredit) {
        batasKreditBerubah = true;
        updatePayload.batas_kredit = newBatasKredit;
      }
    }

    // 6. Eksekusi Pembaruan Data Pelanggan di Supabase dengan .select()
    const { data: updatedRows, error: updateError } = await supabase
      .from("pelanggan")
      .update(updatePayload)
      .eq("id", existing.id)
      .select("id, kode, nama_toko, telepon, alamat, batas_kredit, termin_hari, aktif");

    if (updateError) {
      return {
        success: false,
        error: `Gagal memperbarui data pelanggan di database: ${updateError.message}`,
      };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return {
        success: false,
        error: `Gagal memperbarui: tidak ada baris data pelanggan yang diperbarui di database (ID: ${existing.id}). Pastikan akun Anda memiliki izin update pada data pelanggan ini.`,
      };
    }

    const updatedPelanggan = updatedRows[0];

    // 7. Catat Audit Log jika Batas Kredit Diubah (BR-12)
    if (batasKreditBerubah) {
      try {
        await supabase.from("audit_log").insert({
          pelaku_id: user.id,
          aksi: "ubah_batas_kredit",
          nama_tabel: "pelanggan",
          data_id: existing.id,
          nilai_lama: { batas_kredit: oldBatasKredit },
          nilai_baru: { batas_kredit: newBatasKredit },
          dibuat_pada: new Date().toISOString(),
        });
      } catch (auditErr) {
        // Catat error audit log tanpa menggagalkan transaksi utama
        console.error("Gagal mencatat audit log ubah_batas_kredit:", auditErr);
      }
    }

    // 8. Revalidasi halaman katalog pelanggan
    revalidatePath("/pelanggan");

    return {
      success: true,
      data: {
        id: updatedPelanggan.id,
        kode: updatedPelanggan.kode,
        nama_toko: updatedPelanggan.nama_toko,
        telepon: updatedPelanggan.telepon,
        alamat: updatedPelanggan.alamat,
        batas_kredit: Number(updatedPelanggan.batas_kredit) || 0,
        termin_hari: updatedPelanggan.termin_hari as number,
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

