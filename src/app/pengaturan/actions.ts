"use server";

import { revalidatePath } from "next/cache";
import { createServerClientInstance } from "@/lib/supabase/server";
import { isValidRole, UserProfile } from "@/types/auth";
import {
  AuditLogItem,
  PengaturanDataPayload,
  UpdateUserRoleAndStatusInput,
} from "@/types/pengaturan";

export interface ActionResult<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

/**
 * Mengambil data awal untuk modul Pengaturan (Daftar Pengguna & Riwayat Audit Log).
 * Khusus peran 'manajer'.
 */
export async function getPengaturanData(): Promise<PengaturanDataPayload> {
  const supabase = await createServerClientInstance();

  try {
    // 1. Ambil daftar profil pengguna
    const { data: rawProfiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, nama_lengkap, peran, aktif, dibuat_pada")
      .order("nama_lengkap", { ascending: true });

    if (profilesErr) {
      throw new Error(`Gagal memuat profil pengguna: ${profilesErr.message}`);
    }

    const profilesList = (rawProfiles || []) as UserProfile[];
    const profileMap = new Map<string, { nama: string; peran: string }>();
    for (const p of profilesList) {
      profileMap.set(p.id, { nama: p.nama_lengkap, peran: p.peran });
    }

    // 2. Ambil riwayat audit log (maksimal 200 aktivitas terbaru)
    const { data: rawLogs, error: logsErr } = await supabase
      .from("audit_log")
      .select("id, pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru, dibuat_pada")
      .order("dibuat_pada", { ascending: false })
      .limit(200);

    if (logsErr) {
      throw new Error(`Gagal memuat log audit: ${logsErr.message}`);
    }

    const auditLogs: AuditLogItem[] = (rawLogs || []).map((l) => {
      const actor = profileMap.get(l.pelaku_id);
      return {
        id: Number(l.id),
        pelaku_id: l.pelaku_id,
        pelaku_nama: actor?.nama || "Sistem / Tidak Dikenal",
        pelaku_peran: actor?.peran || "-",
        aksi: l.aksi,
        nama_tabel: l.nama_tabel,
        data_id: l.data_id,
        nilai_lama: (l.nilai_lama as Record<string, unknown>) || null,
        nilai_baru: (l.nilai_baru as Record<string, unknown>) || null,
        dibuat_pada: l.dibuat_pada,
      };
    });

    return {
      profilesList,
      auditLogs,
      error: null,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Gagal mengambil data pengaturan:", errorMsg);
    return {
      profilesList: [],
      auditLogs: [],
      error: errorMsg,
    };
  }
}

/**
 * Memperbarui peran dan status akun pengguna (BR-12).
 * HANYA boleh dieksekusi oleh Manajer aktif.
 * Setiap perubahan dicatat ke dalam audit_log secara terverifikasi.
 */
export async function updateUserRoleAndStatus(
  input: UpdateUserRoleAndStatusInput
): Promise<ActionResult> {
  const supabase = await createServerClientInstance();

  try {
    // 1. Verifikasi pengguna yang sedang login
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return { success: false, error: "Sesi login tidak sah atau telah berakhir." };
    }

    // 2. Verifikasi hak akses manajer dari tabel public.profiles
    const { data: callerProfile, error: callerErr } = await supabase
      .from("profiles")
      .select("id, peran, aktif")
      .eq("id", user.id)
      .maybeSingle();

    if (callerErr || !callerProfile) {
      return { success: false, error: "Profil manajer tidak ditemukan." };
    }

    if (callerProfile.aktif !== true || callerProfile.peran !== "manajer") {
      return {
        success: false,
        error: "Akses ditolak: Hanya peran Manajer aktif yang berhak mengubah peran akun pengguna.",
      };
    }

    // 3. Validasi input
    if (!input.targetUserId) {
      return { success: false, error: "ID pengguna target tidak valid." };
    }

    if (!isValidRole(input.newRole)) {
      return { success: false, error: "Peran pengguna baru yang dipilih tidak valid." };
    }

    // Cegah self-lockout: Manajer tidak boleh menonaktifkan akunnya sendiri
    if (input.targetUserId === user.id && input.newStatus === false) {
      return {
        success: false,
        error: "Keamanan Sistem: Anda tidak dapat menonaktifkan akun Manajer yang sedang Anda gunakan.",
      };
    }

    // 4. Ambil data profil target sebelum diperbarui
    const { data: targetProfile, error: targetErr } = await supabase
      .from("profiles")
      .select("id, nama_lengkap, peran, aktif")
      .eq("id", input.targetUserId)
      .maybeSingle();

    if (targetErr || !targetProfile) {
      return { success: false, error: "Akun pengguna target tidak ditemukan di sistem." };
    }

    const roleBerubah = targetProfile.peran !== input.newRole;
    const statusBerubah = targetProfile.aktif !== input.newStatus;

    if (!roleBerubah && !statusBerubah) {
      return { success: true, error: "Tidak ada perubahan peran maupun status akun." };
    }

    // 5. Lakukan update pada tabel public.profiles
    const nowIso = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({
        peran: input.newRole,
        aktif: input.newStatus,
      })
      .eq("id", input.targetUserId);

    if (updateErr) {
      return {
        success: false,
        error: `Gagal memperbarui profil pengguna: ${updateErr.message}`,
      };
    }

    // 6. Catat aktivitas ke tabel audit_log (BR-12)
    // Jika peran diubah:
    if (roleBerubah) {
      try {
        await supabase.from("audit_log").insert({
          pelaku_id: user.id,
          aksi: "ubah_peran",
          nama_tabel: "profiles",
          data_id: input.targetUserId,
          nilai_lama: { peran: targetProfile.peran },
          nilai_baru: { peran: input.newRole },
          dibuat_pada: nowIso,
        });
      } catch (auditErr) {
        console.warn("Pencatatan audit log ubah_peran menemui kendala non-fatal:", auditErr);
      }
    }

    // Jika status keaktifan diubah:
    if (statusBerubah) {
      try {
        await supabase.from("audit_log").insert({
          pelaku_id: user.id,
          aksi: "ubah_status_akun",
          nama_tabel: "profiles",
          data_id: input.targetUserId,
          nilai_lama: { aktif: targetProfile.aktif },
          nilai_baru: { aktif: input.newStatus },
          dibuat_pada: nowIso,
        });
      } catch (auditErr) {
        console.warn("Pencatatan audit log ubah_status_akun menemui kendala non-fatal:", auditErr);
      }
    }

    revalidatePath("/pengaturan");
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Kesalahan server: ${errorMsg}` };
  }
}
