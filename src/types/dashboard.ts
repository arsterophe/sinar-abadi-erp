export type UserRole = "manager" | "sales" | "warehouse";

export interface RoleConfig {
  id: UserRole;
  label: string;
  badgeLabel: string;
  description: string;
  iconName: string;
  focusArea: string;
}

export const USER_ROLES: Record<UserRole, RoleConfig> = {
  manager: {
    id: "manager",
    label: "Manajer / Pemilik",
    badgeLabel: "Manajemen",
    description: "Monitoring performa finansial, margin distributor, kontrol piutang, dan persetujuan pesanan grosir.",
    iconName: "Briefcase",
    focusArea: "Finansial, Piutang & Pengawasan Umum",
  },
  sales: {
    id: "sales",
    label: "Tim Penjualan (Sales)",
    badgeLabel: "Sales Toko",
    description: "Pencatatan order toko kelontong, pengecekan plafon kredit langganan, dan target kunjungan.",
    iconName: "TrendingUp",
    focusArea: "Pesanan Jual & Monitoring Pelanggan",
  },
  warehouse: {
    id: "warehouse",
    label: "Tim Gudang (Logistik)",
    badgeLabel: "Operasional Gudang",
    description: "Pemantauan stok fisik sembako/kelontong, penerimaan barang dari supplier, dan packing pengiriman.",
    iconName: "Boxes",
    focusArea: "Stok Fisik & Logistik Pengiriman",
  },
};
