/**
 * Definisi Tipe Data Resmi Dashboard Analitik Bisnis
 * CV Sinar Abadi Niaga ERP
 *
 * MENEGAKKAN ATURAN BISNIS & KEAMANAN (PRD Bab 6, 7 & 9, BR-05, BR-12):
 * 1. Pemisahan peran ketat (Manajer, Penjualan, Gudang) di tingkat tipe & payload.
 * 2. Penjualan & Gudang DILARANG KERAS memuat field HPP, margin kotor, laba, atau harga beli.
 * 3. Gudang DILARANG memuat metrik moneter / finansial (omzet, piutang, kas, rupiah).
 * 4. Pemisahan tegas antara nilai pesanan sah (dikirim & lunas), kas masuk (lunas),
 *    piutang (dikirim & dikonfirmasi), draf (pipeline), dan pembatalan (dibatalkan).
 */

import { RadarStokSummary } from "@/types/radar_stok";

export type DateRangePreset =
  | "hari_ini"
  | "7_hari"
  | "30_hari"
  | "bulan_ini"
  | "kustom";

export interface DateRangeFilter {
  preset: DateRangePreset;
  startDate: string; // Format YYYY-MM-DD dalam zona waktu Asia/Jakarta (WIB)
  endDate: string;   // Format YYYY-MM-DD dalam zona waktu Asia/Jakarta (WIB)
}

/**
 * KPI Penjualan Eksekutif (Khusus Manajer)
 */
export interface OrderKpiMetrics {
  /** Nilai penjualan sah dari pesanan berstatus 'dikirim' dan 'lunas' */
  totalNilaiPenjualanSah: number;

  /** Frekuensi pesanan berstatus 'dikirim' dan 'lunas' */
  jumlahPesananSah: number;

  /** Rata-rata nilai pesanan sah (totalNilaiPenjualanSah / jumlahPesananSah). 0 jika pesanan 0 */
  rataRataNilaiPesanan: number;

  /** Pembayaran lunas yang benar-benar terverifikasi masuk ke kas/bank */
  kasMasukTerverifikasi: number;

  /** Pesanan berstatus 'dikirim' atau 'dikonfirmasi' yang belum dilunasi (BR-05) */
  totalPiutangBerjalan: number;

  /** Pipeline pesanan draf yang menunggu persetujuan/konfirmasi (tidak masuk omzet) */
  totalNilaiDraf: number;
  jumlahPesananDraf: number;

  /** Pesanan yang dibatalkan / void (tidak masuk omzet) */
  totalNilaiDibatalkan: number;
  jumlahPesananDibatalkan: number;
}

/**
 * Titik data deret waktu tren penjualan harian (Zero-filled untuk semua hari dalam rentang)
 */
export interface SalesTrendPoint {
  date: string;       // YYYY-MM-DD (WIB)
  label: string;      // Label ringkas, misal "27 Okt"
  totalNilai: number; // Nilai pesanan sah pada hari tersebut (Rupiah)
  jumlahPesanan: number;
}

/**
 * Item produk terlaris berdasarkan kuantitas fisik
 */
export interface TopProductItem {
  barangId: string;
  kodeBarang: string;
  namaBarang: string;
  satuan: string;
  kuantitasTerjual: number; // Akumulasi kuantitas fisik terjual pada pesanan sah
  totalNilaiJual?: number;  // Nominal omzet penjualan (Hanya untuk Manajer & Penjualan)
}

/**
 * Distribusi pesanan berdasarkan status transaksi
 */
export interface OrderStatusCount {
  status: "draf" | "dikonfirmasi" | "dikirim" | "lunas" | "dibatalkan";
  label: string;
  jumlahPesanan: number;
  totalNilai: number;
  persentase: number; // Persentase terhadap total keseluruhan pesanan
}

/**
 * Ringkasan pembayaran: Lunas (Kas Masuk) vs Belum Lunas (Piutang)
 */
export interface PaymentStatusSummary {
  kasMasukTerverifikasi: number;
  jumlahPesananLunas: number;
  piutangBerjalan: number;
  jumlahPesananBelumLunas: number;
  persentaseLunas: number; // Persentase nominal lunas terhadap total pesanan sah
}

// -----------------------------------------------------------------------------
// PAYLOAD ANALITIK KHUSUS BERDASARKAN PERAN (SERVER-SIDE AUTHORIZATION)
// -----------------------------------------------------------------------------

/**
 * Payload Analitik Lengkap untuk Peran MANAJER (Pemilik Usaha)
 * Memiliki akses ke metrik finansial, kas masuk, piutang, dan stok.
 */
export interface ManagerAnalyticsPayload {
  role: "manajer";
  kpi: OrderKpiMetrics;
  trend: SalesTrendPoint[];
  topProducts: TopProductItem[];
  orderStatusDistribution: OrderStatusCount[];
  paymentStatusSummary: PaymentStatusSummary;
  stockSummary: RadarStokSummary;
  filter: DateRangeFilter;
  keterbatasanData: string[];
  error?: string | null;
}

/**
 * Payload Analitik untuk Peran PENJUALAN
 * Memiliki akses ke omzet penjualan dan volume, tetapi DILARANG KERAS
 * melihat data HPP, margin kotor, laba, atau status kasir/pembayaran mendalam.
 */
export interface SalesAnalyticsPayload {
  role: "penjualan";
  kpi: {
    totalNilaiPenjualanSah: number;
    jumlahPesananSah: number;
    rataRataNilaiPesanan: number;
    jumlahPesananDraf: number;
    totalNilaiDraf: number;
  };
  trend: SalesTrendPoint[];
  topProducts: TopProductItem[];
  orderStatusDistribution: OrderStatusCount[];
  stockSummary: RadarStokSummary;
  filter: DateRangeFilter;
  error?: string | null;
}

/**
 * Payload Analitik untuk Peran GUDANG
 * HANYA memuat metrik kuantitas fisik dan status pergerakan barang.
 * DILARANG KERAS memuat angka moneter, omzet, piutang, kas, HPP, atau margin.
 */
export interface WarehouseAnalyticsPayload {
  role: "gudang";
  kpi: {
    jumlahPesananSiapKirim: number;
    jumlahPesananTerkirim: number;
    totalKuantitasBarangKeluar: number;
  };
  topProducts: Array<Omit<TopProductItem, "totalNilaiJual">>;
  orderStatusDistribution: Array<Omit<OrderStatusCount, "totalNilai">>;
  stockSummary: RadarStokSummary;
  filter: DateRangeFilter;
  error?: string | null;
}

export type AnalyticsPayload =
  | ManagerAnalyticsPayload
  | SalesAnalyticsPayload
  | WarehouseAnalyticsPayload;
