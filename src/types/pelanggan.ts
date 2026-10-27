export type TerminHari = 0 | 7 | 14 | 30;

export const VALID_TERMIN_HARI: TerminHari[] = [0, 7, 14, 30];

export interface PelangganItem {
  id: string;
  kode: string;
  nama_toko: string;
  telepon: string;
  alamat: string;
  batas_kredit: number;
  termin_hari: TerminHari;
  aktif: boolean;
  dibuat_oleh?: string;
  dibuat_pada?: string;

  // Agregasi dari pesanan_jual (BR-05)
  piutang_berjalan: number;
  tagihan_terlambat: boolean;
  jumlah_pesanan_aktif?: number;
}

export type PelangganFilterStatus = "semua" | "aktif" | "nonaktif" | "terlambat";

/**
 * Validasi opsi termin hari sesuai aturan bisnis BR-05 (0, 7, 14, 30).
 */
export function isValidTerminHari(val: number): val is TerminHari {
  return VALID_TERMIN_HARI.includes(val as TerminHari);
}

/**
 * Format angka uang ke mata uang Rupiah Indonesia (Rp).
 */
export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return "Rp 0";
  }
  return `Rp ${Math.round(Number(value)).toLocaleString("id-ID")}`;
}
