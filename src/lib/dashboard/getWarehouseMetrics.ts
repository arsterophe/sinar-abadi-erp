import { SupabaseClient } from "@supabase/supabase-js";

export interface StokMenipisItem {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  stok: number;
  stokMinimum: number;
  status: "Kritis" | "Perlu Reorder";
}

export interface PesananSiapKirimItem {
  id: string;
  nomor: string;
  namaToko: string;
  tanggalKonfirmasi: string;
  totalBarang?: number;
  total: number;
}

export interface PembelianMenungguBarangItem {
  id: string;
  nomor: string;
  namaPemasok: string;
  namaBarang: string;
  jumlahDipesan: number;
  satuan: string;
  tanggalPersetujuan: string;
}

export interface WarehouseDashboardMetrics {
  jumlahStokMenipis: number;
  jumlahPesananSiapKirim: number;
  jumlahPembelianMenunggu: number;
  totalSkuAktif: number;
  stokMenipisList: StokMenipisItem[];
  pesananSiapKirimList: PesananSiapKirimItem[];
  pembelianMenungguList: PembelianMenungguBarangItem[];
  error?: string | null;
}

/**
 * Mengonversi tanggal / timestamp ke format YYYY-MM-DD dalam zona waktu Indonesia Barat (WIB / Asia/Jakarta).
 */
export function getWIBDateString(dateInput?: string | Date | null): string {
  if (!dateInput) return "-";
  try {
    const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return "-";
  }
}

/**
 * Mengambil metrik aktual Dashboard Gudang langsung dari Supabase.
 *
 * MENEGAKKAN ATURAN BISNIS & KEAMANAN (PRD Bab 4, 7 & 9, BR-01, BR-12):
 * 1. Peringatan Stok Menipis: Barang aktif dengan stok <= stok_minimum.
 * 2. Antrean Pesanan Siap Kirim: Pesanan Jual dengan status 'dikonfirmasi' yang siap dipacking & dikirim.
 * 3. Pembelian Menunggu Barang: PO dari pemasok dengan status 'disetujui' yang menunggu penerimaan fisik gudang.
 * 4. Total SKU Terdaftar: Total item barang aktif di gudang.
 * 5. KEAMANAN BR-12: Kolom harga_pokok, harga_beli_satuan, dan margin internal DILARANG KERAS disertakan.
 */
export async function getWarehouseDashboardMetrics(
  supabase: SupabaseClient
): Promise<WarehouseDashboardMetrics> {
  try {
    // 1. Ambil data katalog barang aktif (tanpa harga_pokok untuk mematuhi BR-12)
    const { data: rawBarang, error: barangError } = await supabase
      .from("barang")
      .select("id, kode, nama, satuan, stok, stok_minimum, aktif")
      .eq("aktif", true)
      .order("kode", { ascending: true });

    if (barangError) {
      console.error("Gagal mengambil data stok barang untuk gudang:", barangError.message);
      return createEmptyWarehouseMetrics(barangError.message);
    }

    const barangList = rawBarang || [];
    const totalSkuAktif = barangList.length;

    // Filter barang dengan stok di bawah atau sama dengan stok minimum (Reorder Point)
    const stokMenipisList: StokMenipisItem[] = [];
    const barangMap = new Map<string, { nama: string; satuan: string }>();

    for (const b of barangList) {
      const stok = Number(b.stok) || 0;
      const min = Number(b.stok_minimum) || 0;
      barangMap.set(b.id, { nama: b.nama, satuan: b.satuan });

      if (stok <= min) {
        // Status kritis jika stok habis (0) atau <= 50% dari batas minimum
        const isKritis = stok === 0 || stok <= Math.floor(min / 2);
        stokMenipisList.push({
          id: b.id,
          kode: b.kode,
          nama: b.nama,
          satuan: b.satuan,
          stok,
          stokMinimum: min,
          status: isKritis ? "Kritis" : "Perlu Reorder",
        });
      }
    }

    // Urutkan stok menipis: persentase sisa stok terkecil (paling darurat) di atas
    stokMenipisList.sort((a, b) => {
      const ratioA = a.stokMinimum > 0 ? a.stok / a.stokMinimum : a.stok;
      const ratioB = b.stokMinimum > 0 ? b.stok / b.stokMinimum : b.stok;
      return ratioA - ratioB;
    });

    const jumlahStokMenipis = stokMenipisList.length;

    // 2. Ambil data pesanan jual yang siap dikirim (status = 'dikonfirmasi')
    // Sesuai PRD Bab 7: Staf Gudang hanya memproses pesanan berstatus dikonfirmasi
    let pesananSiapKirimList: PesananSiapKirimItem[] = [];
    let jumlahPesananSiapKirim = 0;

    const { data: rawPesanan, error: pesananError } = await supabase
      .from("pesanan_jual")
      .select(`
        id,
        nomor,
        pelanggan_id,
        status,
        total,
        dikonfirmasi_pada,
        dibuat_pada,
        pelanggan:pelanggan!pelanggan_id (
          id,
          nama_toko
        )
      `)
      .eq("status", "dikonfirmasi")
      .order("dikonfirmasi_pada", { ascending: true });

    if (pesananError) {
      console.warn("Query join pesanan_jual gudang terkendala, mencoba query terpisah:", pesananError.message);
      const { data: fallbackPesanan } = await supabase
        .from("pesanan_jual")
        .select("id, nomor, pelanggan_id, status, total, dikonfirmasi_pada, dibuat_pada")
        .eq("status", "dikonfirmasi")
        .order("dikonfirmasi_pada", { ascending: true });

      if (fallbackPesanan && fallbackPesanan.length > 0) {
        const { data: pelangganData } = await supabase
          .from("pelanggan")
          .select("id, nama_toko");

        const pelMap = new Map((pelangganData || []).map((p) => [p.id, p.nama_toko]));

        pesananSiapKirimList = fallbackPesanan.map((row) => ({
          id: row.id,
          nomor: row.nomor,
          namaToko: pelMap.get(row.pelanggan_id) || "Toko Mitra",
          tanggalKonfirmasi: getWIBDateString(row.dikonfirmasi_pada),
          total: Number(row.total) || 0,
        }));
      }
    } else if (rawPesanan) {
      pesananSiapKirimList = rawPesanan.map((row) => {
        // Handle joined pelanggan type
        const pel = Array.isArray(row.pelanggan) ? row.pelanggan[0] : row.pelanggan;
        return {
          id: row.id,
          nomor: row.nomor,
          namaToko: pel?.nama_toko || "Toko Mitra",
          tanggalKonfirmasi: getWIBDateString(row.dikonfirmasi_pada),
          total: Number(row.total) || 0,
        };
      });
    }

    jumlahPesananSiapKirim = pesananSiapKirimList.length;

    // 3. Ambil data pembelian PO pemasok yang menunggu barang fisik (status = 'disetujui')
    // Sesuai PRD Bab 5 & Bab 7: Staf Gudang mencatat penerimaan PO yang telah disetujui Manajer.
    // KEAMANAN BR-12: Kolom harga_beli_satuan DILARANG diambil!
    let pembelianMenungguList: PembelianMenungguBarangItem[] = [];
    let jumlahPembelianMenunggu = 0;

    const { data: rawPembelian, error: pembelianError } = await supabase
      .from("pembelian")
      .select(`
        id,
        nomor,
        pemasok_id,
        barang_id,
        jumlah_dipesan,
        status,
        diputuskan_pada,
        pemasok:pemasok!pemasok_id ( id, nama ),
        barang:barang!barang_id ( id, nama, satuan )
      `)
      .eq("status", "disetujui")
      .order("diputuskan_pada", { ascending: false });

    if (pembelianError) {
      console.warn("Query join pembelian gudang terkendala, mencoba query terpisah:", pembelianError.message);
      const { data: fallbackPembelian } = await supabase
        .from("pembelian")
        .select("id, nomor, pemasok_id, barang_id, jumlah_dipesan, status, diputuskan_pada")
        .eq("status", "disetujui")
        .order("diputuskan_pada", { ascending: false });

      if (fallbackPembelian && fallbackPembelian.length > 0) {
        const { data: pemasokData } = await supabase
          .from("pemasok")
          .select("id, nama");

        const pemMap = new Map((pemasokData || []).map((p) => [p.id, p.nama]));

        pembelianMenungguList = fallbackPembelian.map((row) => {
          const brg = barangMap.get(row.barang_id);
          return {
            id: row.id,
            nomor: row.nomor,
            namaPemasok: pemMap.get(row.pemasok_id) || "Pemasok Utama",
            namaBarang: brg?.nama || "Barang",
            jumlahDipesan: Number(row.jumlah_dipesan) || 0,
            satuan: brg?.satuan || "item",
            tanggalPersetujuan: getWIBDateString(row.diputuskan_pada),
          };
        });
      }
    } else if (rawPembelian) {
      pembelianMenungguList = rawPembelian.map((row) => {
        const pem = Array.isArray(row.pemasok) ? row.pemasok[0] : row.pemasok;
        const brg = Array.isArray(row.barang) ? row.barang[0] : row.barang;
        return {
          id: row.id,
          nomor: row.nomor,
          namaPemasok: pem?.nama || "Pemasok Utama",
          namaBarang: brg?.nama || barangMap.get(row.barang_id)?.nama || "Barang",
          jumlahDipesan: Number(row.jumlah_dipesan) || 0,
          satuan: brg?.satuan || barangMap.get(row.barang_id)?.satuan || "item",
          tanggalPersetujuan: getWIBDateString(row.diputuskan_pada),
        };
      });
    }

    jumlahPembelianMenunggu = pembelianMenungguList.length;

    return {
      jumlahStokMenipis,
      jumlahPesananSiapKirim,
      jumlahPembelianMenunggu,
      totalSkuAktif,
      stokMenipisList: stokMenipisList.slice(0, 5),
      pesananSiapKirimList: pesananSiapKirimList.slice(0, 5),
      pembelianMenungguList: pembelianMenungguList.slice(0, 5),
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat metrik gudang.";
    console.error("Exception in getWarehouseDashboardMetrics:", err);
    return createEmptyWarehouseMetrics(msg);
  }
}

function createEmptyWarehouseMetrics(errorMsg?: string | null): WarehouseDashboardMetrics {
  return {
    jumlahStokMenipis: 0,
    jumlahPesananSiapKirim: 0,
    jumlahPembelianMenunggu: 0,
    totalSkuAktif: 0,
    stokMenipisList: [],
    pesananSiapKirimList: [],
    pembelianMenungguList: [],
    error: errorMsg || null,
  };
}
