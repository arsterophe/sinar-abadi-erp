import { DbUserRole } from "@/types/auth";

export type PembelianStatus =
  | "diajukan"
  | "disetujui"
  | "ditolak"
  | "diterima"
  | "dibatalkan";

export interface PemasokItem {
  id: string;
  kode: string;
  nama: string;
  telepon: string | null;
  alamat: string | null;
  aktif: boolean;
  dibuat_pada?: string;
}

export interface PembelianItem {
  id: string;
  nomor: string;
  pemasok_id: string;
  barang_id: string;
  jumlah_dipesan: number;
  jumlah_diterima: number | null;
  harga_beli_satuan: number | null; // Dirahasiakan dari Staf Gudang & Penjualan (BR-12)
  status: PembelianStatus;
  alasan_tolak: string | null;
  diajukan_oleh: string;
  diajukan_pada: string;
  diputuskan_oleh: string | null;
  diputuskan_pada: string | null;
  diterima_oleh: string | null;
  diterima_pada: string | null;
  // Relasi join untuk kemudahan visualisasi
  pemasok?: {
    id: string;
    kode: string;
    nama: string;
    telepon?: string | null;
  } | null;
  barang?: {
    id: string;
    kode: string;
    nama: string;
    satuan: string;
    stok?: number;
    stok_minimum?: number;
  } | null;
  pengaju?: {
    id: string;
    nama_lengkap: string;
    peran: DbUserRole;
  } | null;
  pemutus?: {
    id: string;
    nama_lengkap: string;
    peran: DbUserRole;
  } | null;
  penerima?: {
    id: string;
    nama_lengkap: string;
    peran: DbUserRole;
  } | null;
}

export interface RadarStokContextPO {
  stokFisik: number;
  stokMinimum: number;
  incomingPO: number;
  rekomendasiOrder: number;
  satuan: string;
}

export interface BuatPengajuanPembelianInput {
  pemasok_id: string;
  barang_id: string;
  jumlah_dipesan: number;
  harga_beli_satuan?: number | null; // Opsional/khusus jika diajukan oleh Manajer
}

export interface SetujuiPembelianInput {
  pembelian_id: string;
  harga_beli_satuan: number;
}

export interface TolakPembelianInput {
  pembelian_id: string;
  alasan_tolak: string;
}

export interface TerimaBarangPembelianInput {
  pembelian_id: string;
  jumlah_diterima: number;
}

export interface BatalkanPembelianInput {
  pembelian_id: string;
  alasan?: string;
}

export const PEMBELIAN_LIMITS = {
  MIN_JUMLAH_PESAN: 1,
  MAX_JUMLAH_PESAN: 10000,
  MIN_ALASAN_TOLAK_LEN: 10,
} as const;

export type PembelianFilterStatus = "semua" | PembelianStatus;

/**
 * Validasi apakah peran tertentu boleh menyetujui/menolak pembelian (PRD Bab 4 & 6.2)
 */
export function canApprovePembelian(role: DbUserRole): boolean {
  return role === "manajer";
}

/**
 * Validasi apakah peran tertentu boleh mencatat penerimaan barang (PRD Bab 4 & 6.2)
 */
export function canReceivePembelian(role: DbUserRole): boolean {
  return role === "manajer" || role === "gudang";
}

/**
 * Validasi apakah peran tertentu boleh mengajukan pembelian (PRD Bab 4 & 6.2)
 */
export function canCreatePembelian(role: DbUserRole): boolean {
  return role === "manajer" || role === "gudang";
}

/**
 * Validasi apakah pengguna boleh membatalkan pengajuan (PRD Bab 4 & 6.2)
 */
export function canCancelPembelian(
  role: DbUserRole,
  isCreator: boolean,
  currentStatus: PembelianStatus
): boolean {
  if (currentStatus === "diajukan") {
    return role === "manajer" || isCreator;
  }
  if (currentStatus === "disetujui") {
    return role === "manajer";
  }
  return false;
}
