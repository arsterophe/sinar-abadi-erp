/**
 * Tipe data untuk Laporan Finansial dan Operasional Manajerial
 * CV Sinar Abadi Niaga
 * Sesuai PRD Bab 7 & 9, Aturan Keamanan BR-12 (Khusus Manajer).
 */

export interface WeeklySalesMargin {
  weekKey: string;
  weekLabel: string;
  startDate: string;
  endDate: string;
  omzet: number;
  margin: number;
  marginPersen: number;
  jumlahPesanan: number;
}

export interface ItemMarginReport {
  barangId: string;
  kode: string;
  nama: string;
  satuan: string;
  kuantitasTerjual: number;
  totalOmzet: number;
  totalHpp: number;
  totalMargin: number;
  marginPersen: number;
}

export interface CustomerAgingReceivable {
  pelangganId: string;
  namaToko: string;
  terminHari: number;
  terminBayar?: number;
  batasKredit: number;
  totalPiutang: number;
  belumJatuhTempo: number; // jatuh_tempo >= hari ini
  lewat1Sampai30Hari: number; // 1 <= hari lewat <= 30
  lewatLebih30Hari: number; // hari lewat > 30
  sisaKredit: number;
  statusKredit: "aman" | "mendekati_limit" | "melebihi_limit";
  jumlahNotaPiutang: number;
}

export interface LaporanSummary {
  omzetBulanIni: number;
  marginBulanIni: number;
  marginPersenBulanIni: number;
  totalPiutangBerjalan: number;
  pesananTerkirimLunasBulanIni: number;
  totalNilaiPersediaan: number;
}

export interface LaporanDataPayload {
  summary: LaporanSummary;
  weeklyTrend: WeeklySalesMargin[];
  itemMarginList: ItemMarginReport[];
  customerAgingList: CustomerAgingReceivable[];
  tanggalLaporan: string;
  error?: string | null;
}
