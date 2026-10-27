export type DbUserRole = "penjualan" | "gudang" | "manajer";

export interface UserProfile {
  id: string;
  nama_lengkap: string;
  peran: DbUserRole;
  aktif: boolean;
  dibuat_pada?: string;
}

export const VALID_ROLES: DbUserRole[] = ["penjualan", "gudang", "manajer"];

export function isValidRole(role: string): role is DbUserRole {
  return VALID_ROLES.includes(role as DbUserRole);
}

export function roleDisplayLabel(role: DbUserRole): string {
  switch (role) {
    case "manajer":
      return "Manajer";
    case "penjualan":
      return "Staf Penjualan";
    case "gudang":
      return "Staf Gudang";
    default:
      return role;
  }
}

export function mapDbRoleToDashboardRole(dbRole: DbUserRole): "manager" | "sales" | "warehouse" {
  switch (dbRole) {
    case "manajer":
      return "manager";
    case "penjualan":
      return "sales";
    case "gudang":
      return "warehouse";
  }
}
