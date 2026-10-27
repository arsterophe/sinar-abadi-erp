export interface BarangItem {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  harga_jual: number;
  harga_pokok?: number | null; // Hanya disertakan di server untuk peran 'manajer'
  stok: number;
  stok_minimum: number;
  aktif: boolean;
  diperbarui_pada?: string;
}

export type BarangFilterStatus = "semua" | "aktif" | "menipis";

/**
 * Menentukan apakah barang berada dalam kondisi stok menipis
 * sesuai aturan bisnis BR-01 (stok <= stok_minimum).
 */
export function isStokMenipis(stok: number, stokMinimum: number): boolean {
  return Number(stok) <= Number(stokMinimum);
}

/**
 * Memformat angka ke format mata uang Rupiah Indonesia (Rp).
 * Sesuai aturan PRD Bab 10: angka uang disimpan tanpa pembulatan dan
 * ditampilkan dalam format seperti Rp1.250.000.
 */
export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return "Rp 0";
  }
  return `Rp ${Math.round(Number(value)).toLocaleString("id-ID")}`;
}

export type JenisMutasiStok = "masuk" | "keluar" | "batal" | "penyesuaian";

export interface MutasiStokItem {
  id: number;
  barang_id: string;
  jenis: JenisMutasiStok;
  jumlah: number;
  stok_sesudah: number;
  nomor_dokumen: string | null;
  alasan: string | null;
  dibuat_oleh: string | null;
  dibuat_pada: string;
  pelaku_nama?: string | null;
}

export interface PenyesuaianStokInput {
  barang_id: string;
  tipe_input: "selisih" | "stok_fisik";
  nilai: number;
  alasan: string;
  nomor_dokumen?: string;
}

export interface PenyesuaianStokResult {
  barang_id: string;
  kode_barang?: string;
  nama_barang?: string;
  stok_sebelum: number;
  stok_sesudah: number;
  perubahan: number;
  nomor_dokumen: string;
  mutasi_id?: number;
}
