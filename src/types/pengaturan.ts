import { DbUserRole, UserProfile } from "./auth";

/**
 * Entitas riwayat audit log aktivitas sistem (tabel public.audit_log)
 * Sesuai PRD Bab 4 BR-12 & Bab 7.
 */
export interface AuditLogItem {
  id: number;
  pelaku_id: string;
  pelaku_nama?: string;
  pelaku_peran?: string;
  aksi: string;
  nama_tabel: string;
  data_id: string;
  nilai_lama: Record<string, unknown> | null;
  nilai_baru: Record<string, unknown> | null;
  dibuat_pada: string;
}

export interface PengaturanDataPayload {
  profilesList: UserProfile[];
  auditLogs: AuditLogItem[];
  error?: string | null;
}

export interface UpdateUserRoleAndStatusInput {
  targetUserId: string;
  newRole: DbUserRole;
  newStatus: boolean;
}
