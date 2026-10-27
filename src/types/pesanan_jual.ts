import { DbUserRole } from "./auth";

/**
 * Status alur hidup Pesanan Jual sesuai PRD Bab 6.1 dan nilai aktual database.
 */
export type StatusPesananJual =
  | "draf"
  | "dikonfirmasi"
  | "dikirim"
  | "lunas"
  | "dibatalkan";

export const VALID_STATUS_PESANAN_JUAL: StatusPesananJual[] = [
  "draf",
  "dikonfirmasi",
  "dikirim",
  "lunas",
  "dibatalkan",
];

export function isStatusPesananJual(val: string): val is StatusPesananJual {
  return VALID_STATUS_PESANAN_JUAL.includes(val as StatusPesananJual);
}

/**
 * Batasan kuantitas dan item per pesanan jual sesuai PRD BR-02 & BR-03.
 */
export const PESANAN_JUAL_LIMITS = {
  MIN_ITEMS: 1,
  MAX_ITEMS: 20,
  MIN_JUMLAH_PER_BARIS: 1,
  MAX_DISKON_PENJUALAN: 10, // Maksimal 10% untuk Staf Penjualan
  MAX_DISKON_MANAJER: 25,   // Maksimal 25% untuk Manajer
  MIN_ALASAN_BATAL_LEN: 10, // Minimal 10 karakter untuk pembatalan dikonfirmasi (BR-08)
} as const;

/**
 * Item baris pesanan jual (tabel public.item_pesanan_jual).
 * PERHATIAN KEAMANAN BR-12:
 * hpp_satuan hanya boleh diisi di sisi server untuk peran 'manajer'.
 * Kolom ini dilarang dikirim ke client/browser untuk peran Penjualan dan Gudang.
 */
export interface ItemPesananJual {
  id: string;
  pesanan_jual_id: string;
  barang_id: string;
  jumlah: number;
  harga_satuan: number;
  diskon_persen: number;
  subtotal: number;
  hpp_satuan?: number | null; // Rahasia finansial: hanya untuk peran 'manajer'

  // Relasi tambahan dari tabel barang (berguna saat join untuk tampilan)
  kode_barang?: string;
  nama_barang?: string;
  satuan?: string;
  stok_tersedia?: number;
  margin?: number | null; // Rahasia finansial: hanya untuk peran 'manajer' (subtotal - HPP total)
  margin_persen?: number | null;
}

export interface DetailPesananPayload {
  pesanan: PesananJualHeader;
  items: ItemPesananJual[];
  total_margin?: number | null; // Rahasia finansial: hanya untuk peran 'manajer'
  total_margin_persen?: number | null;
}

/**
 * Header data transaksi Pesanan Jual (tabel public.pesanan_jual).
 */
export interface PesananJualHeader {
  id: string;
  nomor: string;
  pelanggan_id: string;
  status: StatusPesananJual;
  total: number;
  dibuat_oleh: string;
  dibuat_pada: string;
  dikonfirmasi_pada?: string | null;
  dikirim_pada?: string | null;
  jatuh_tempo?: string | null;
  dilunasi_pada?: string | null;
  dibatalkan_pada?: string | null;
  alasan_batal?: string | null;

  // Relasi tambahan dari pelanggan & pembuat profil
  nama_toko?: string;
  kode_pelanggan?: string;
  telepon_pelanggan?: string;
  alamat_pelanggan?: string;
  termin_hari_pelanggan?: number;
  pembuat_nama?: string;
  jumlah_item?: number;

  // Metadata Pembayaran & Integrasi Mayar (PRD Bab 11, Migrasi 04)
  mayar_payment_id?: string | null;
  mayar_payment_url?: string | null;
  mayar_status?: string | null;
  metode_bayar?: string | null;
  mayar_claim_token?: string | null;
  mayar_claim_at?: string | null;
}

/**
 * Detail pesanan jual lengkap beserta baris itemnya.
 */
export interface PesananJualDetail extends PesananJualHeader {
  items: ItemPesananJual[];
}

/**
 * Input untuk tiap baris item pada saat pembuatan/pengeditan draf pesanan.
 */
export interface ItemPesananInput {
  barang_id: string;
  jumlah: number;
  diskon_persen: number;
}

/**
 * Payload untuk membuat atau menyimpan draf pesanan jual baru.
 */
export interface BuatPesananJualInput {
  pelanggan_id: string;
  items: ItemPesananInput[];
}

/**
 * Opsi filter status pada daftar pesanan jual.
 */
export type PesananJualFilterStatus = "semua" | StatusPesananJual;

/**
 * Opsi preset filter tanggal untuk pencarian pesanan jual (tidak hardcoded pada tahun/bulan tertentu).
 */
export type DateFilterPreset =
  | "semua"
  | "hari_ini"
  | "7_hari"
  | "30_hari"
  | "bulan_ini"
  | "kustom";

/**
 * Menghitung subtotal satu baris pesanan sesuai aturan bisnis BR-03:
 * Subtotal baris = jumlah * harga_satuan * (100% - diskon_persen),
 * dibulatkan ke rupiah terdekat (Math.round).
 */
export function hitungSubtotalItem(
  jumlah: number,
  hargaSatuan: number,
  diskonPersen: number
): number {
  const diskon = Math.max(0, Math.min(100, Number(diskonPersen) || 0));
  const rawSubtotal = Number(jumlah) * Number(hargaSatuan) * (1 - diskon / 100);
  return Math.round(rawSubtotal);
}

/**
 * Menghitung total keseluruhan transaksi dari daftar item.
 */
export function hitungTotalPesanan(
  items: Array<{ jumlah: number; harga_satuan: number; diskon_persen: number }>
): number {
  return items.reduce((acc, item) => {
    return acc + hitungSubtotalItem(item.jumlah, item.harga_satuan, item.diskon_persen);
  }, 0);
}

/**
 * Menentukan batas diskon maksimal yang diizinkan untuk peran pengguna tertentu (BR-03).
 */
export function getMaxDiskonByRole(peran: DbUserRole): number {
  if (peran === "manajer") {
    return PESANAN_JUAL_LIMITS.MAX_DISKON_MANAJER; // 25%
  }
  return PESANAN_JUAL_LIMITS.MAX_DISKON_PENJUALAN; // 10% untuk staf penjualan & lainnya
}

/**
 * Label ramah pengguna untuk status pesanan jual.
 */
export function statusPesananDisplayLabel(status: StatusPesananJual): string {
  switch (status) {
    case "draf":
      return "Draf";
    case "dikonfirmasi":
      return "Dikonfirmasi";
    case "dikirim":
      return "Dikirim";
    case "lunas":
      return "Lunas";
    case "dibatalkan":
      return "Dibatalkan";
    default:
      return status;
  }
}
