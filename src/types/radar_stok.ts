/**
 * Tipe data untuk fitur Radar Stok — Prediksi Kapan Barang Habis & Rekomendasi Pengadaan.
 * Sesuai PRD dan aturan bisnis Sinar Abadi ERP (BR-01, BR-12).
 */

export type StatusRadarStok =
  | "Habis"
  | "Kritis"
  | "Waspada"
  | "Aman"
  | "Stagnan"
  | "Nonaktif";

export type SortOptionRadarStok =
  | "urgensi"
  | "estimasi_asc"
  | "stok_asc"
  | "penjualan_desc"
  | "rekomendasi_desc"
  | "nama_asc";

export interface RadarStokItem {
  barangId: string;
  kodeBarang: string;
  namaBarang: string;
  satuan: string;
  stokFisik: number;
  stokMinimum: number;
  aktif: boolean;

  /** Total kuantitas barang terjual dalam 30 hari terakhir dari pesanan sah */
  totalPenjualan30Hari: number;

  /** Rata-rata kuantitas penjualan harian dengan pembagi 30 hari kalender */
  rataRataPenjualanHarian: number;

  /** Sisa kuantitas PO berjalan (status 'diajukan' atau 'disetujui') yang belum diterima */
  incomingPO: number;

  /** Estimasi hari sampai stok fisik habis. null jika tidak ada penjualan (rata-rata 0) */
  estimasiHariHabis: number | null;

  /** Target persediaan aman: max(stokMinimum * 2, ceil(rataRataHarian * 30)) */
  targetStok: number;

  /** Rekomendasi kuantitas yang perlu dipesan (0 jika sudah tercukupi atau barang nonaktif) */
  rekomendasiOrder: number;

  /** Status prioritas radar stok */
  status: StatusRadarStok;
}

export interface RadarStokSummary {
  totalBarang: number;
  jumlahHabis: number;
  jumlahKritis: number;
  jumlahWaspada: number;
  jumlahAman: number;
  jumlahStagnan: number;
  jumlahNonaktif: number;
  totalRekomendasiOrder: number;
}

export interface RadarStokDataPayload {
  items: RadarStokItem[];
  summary: RadarStokSummary;
  periodeHari: number;
  tanggalDihitung: string;
  error: string | null;
}

export type PrioritasAlertStok = 1 | 2 | 3;
export type KategoriAlertStok = "darurat" | "peringatan";

export interface SmartStockAlert {
  barangId: string;
  kodeBarang: string;
  namaBarang: string;
  satuan: string;
  stokFisik: number;
  stokMinimum: number;
  status: "Habis" | "Kritis" | "Waspada";
  prioritas: PrioritasAlertStok; // 1: Habis, 2: Kritis, 3: Waspada
  kategori: KategoriAlertStok;   // "darurat" (Habis, Kritis) vs "peringatan" (Waspada)
  estimasiHariHabis: number | null;
  rekomendasiOrder: number;
  pesan: string;
}

export interface SmartStockBadgeSummary {
  emergencyCount: number; // Barang unik berstatus Habis + Kritis
  warningCount: number;   // Barang unik berstatus Waspada
  totalAlerts: number;    // Total barang unik yang memicu alert
}

