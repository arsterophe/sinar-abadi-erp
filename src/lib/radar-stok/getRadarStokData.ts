import { SupabaseClient } from "@supabase/supabase-js";
import {
  RadarStokItem,
  RadarStokSummary,
  RadarStokDataPayload,
  StatusRadarStok,
  SortOptionRadarStok,
  SmartStockAlert,
  SmartStockBadgeSummary,
  PrioritasAlertStok,
  KategoriAlertStok,
} from "@/types/radar_stok";

export * from "@/types/radar_stok";

/**
 * Parameter input untuk kalkulasi prediksi per barang.
 */
export interface HitungPrediksiBarangInput {
  barangId: string;
  kodeBarang: string;
  namaBarang: string;
  satuan: string;
  stokFisik: number;
  stokMinimum: number;
  aktif: boolean;
  totalPenjualan30Hari: number;
  incomingPO: number;
}

/**
 * Menghitung prediksi stok, estimasi hari habis, kebutuhan pengadaan,
 * dan status prioritas radar untuk sebuah barang secara murni dan deterministik.
 *
 * MENEGAKKAN ATURAN BISNIS:
 * 1. Target Stok: max(stokMinimum * 2, ceil(rataRataHarian * 30))
 * 2. Kebutuhan Bersih: targetStok - stokFisik - incomingPO
 * 3. Rekomendasi Order: max(0, kebutuhanBersih), dan WAJIB 0 jika barang nonaktif.
 * 4. Prioritas Status:
 *    - Nonaktif: jika barang tidak aktif.
 *    - Habis: stok fisik 0 (termasuk jika tidak ada penjualan).
 *    - Kritis: stok fisik > 0 dan estimasi hari habis <= 7.
 *    - Waspada: estimasi hari habis > 7 s/d 14, ATAU stok fisik <= stok minimum.
 *    - Aman: estimasi hari habis > 14 dan stok fisik > stok minimum.
 *    - Stagnan: tidak ada penjualan sah dalam 30 hari terakhir dan stok fisik > stok minimum.
 */
export function hitungPrediksiBarang(input: HitungPrediksiBarangInput): RadarStokItem {
  const stokFisik = Math.max(0, Math.floor(Number(input.stokFisik) || 0));
  const stokMinimum = Math.max(0, Math.floor(Number(input.stokMinimum) || 0));
  const totalPenjualan30Hari = Math.max(0, Number(input.totalPenjualan30Hari) || 0);
  const incomingPO = Math.max(0, Number(input.incomingPO) || 0);
  const aktif = Boolean(input.aktif);

  // Rata-rata harian dengan pembagi 30 hari kalender
  const rataRataPenjualanHarian = Number((totalPenjualan30Hari / 30).toFixed(4));

  // Estimasi hari habis:
  // - Jika tidak ada penjualan (rataRata <= 0), nilai harus null (bukan 0)
  // - Jika stok 0 dan ada penjualan, bernilai 0
  // - Jika stok > 0 dan ada penjualan, dihitung dari stok / rataRata
  let estimasiHariHabis: number | null = null;
  if (totalPenjualan30Hari > 0) {
    if (stokFisik <= 0) {
      estimasiHariHabis = 0;
    } else {
      const days = stokFisik / (totalPenjualan30Hari / 30);
      estimasiHariHabis = Number(days.toFixed(1));
    }
  }

  // Target stok dan rekomendasi order
  const targetStok = Math.max(
    stokMinimum * 2,
    Math.ceil(rataRataPenjualanHarian * 30)
  );

  const kebutuhanBersih = targetStok - stokFisik - incomingPO;
  // Barang nonaktif DILARANG masuk ke rekomendasi pengadaan (rekomendasi order = 0)
  const rekomendasiOrder = aktif ? Math.max(0, Math.ceil(kebutuhanBersih)) : 0;

  // Penentuan status dengan urutan prioritas ketat
  let status: StatusRadarStok;
  if (!aktif) {
    status = "Nonaktif";
  } else if (stokFisik <= 0) {
    // Barang stok 0 tanpa penjualan atau dengan penjualan tetap tampil sebagai Habis
    status = "Habis";
  } else if (estimasiHariHabis !== null && estimasiHariHabis <= 7) {
    status = "Kritis";
  } else if (
    (estimasiHariHabis !== null && estimasiHariHabis > 7 && estimasiHariHabis <= 14) ||
    stokFisik <= stokMinimum
  ) {
    status = "Waspada";
  } else if (estimasiHariHabis !== null && estimasiHariHabis > 14 && stokFisik > stokMinimum) {
    status = "Aman";
  } else if (totalPenjualan30Hari === 0 && stokFisik > stokMinimum) {
    status = "Stagnan";
  } else {
    status = "Aman";
  }

  return {
    barangId: input.barangId,
    kodeBarang: input.kodeBarang,
    namaBarang: input.namaBarang,
    satuan: input.satuan,
    stokFisik,
    stokMinimum,
    aktif,
    totalPenjualan30Hari,
    rataRataPenjualanHarian,
    incomingPO,
    estimasiHariHabis,
    targetStok,
    rekomendasiOrder,
    status,
  };
}

/**
 * Menghitung ringkasan statistik (KPI summary) dari kumpulan barang radar stok.
 */
export function hitungRadarStokSummary(items: RadarStokItem[]): RadarStokSummary {
  let jumlahHabis = 0;
  let jumlahKritis = 0;
  let jumlahWaspada = 0;
  let jumlahAman = 0;
  let jumlahStagnan = 0;
  let jumlahNonaktif = 0;
  let totalRekomendasiOrder = 0;

  for (const item of items) {
    switch (item.status) {
      case "Habis":
        jumlahHabis++;
        break;
      case "Kritis":
        jumlahKritis++;
        break;
      case "Waspada":
        jumlahWaspada++;
        break;
      case "Aman":
        jumlahAman++;
        break;
      case "Stagnan":
        jumlahStagnan++;
        break;
      case "Nonaktif":
        jumlahNonaktif++;
        break;
    }
    totalRekomendasiOrder += item.rekomendasiOrder;
  }

  return {
    totalBarang: items.length,
    jumlahHabis,
    jumlahKritis,
    jumlahWaspada,
    jumlahAman,
    jumlahStagnan,
    jumlahNonaktif,
    totalRekomendasiOrder,
  };
}

/**
 * Mengurutkan kumpulan barang Radar Stok secara murni (pure function tanpa mutasi array asli).
 * Menjamin urutan stabil dan deterministik dengan tie-breaking multi-level.
 */
export function sortRadarStokItems(
  items: RadarStokItem[],
  sortBy: SortOptionRadarStok
): RadarStokItem[] {
  if (!items || items.length <= 1) return items ? [...items] : [];

  const list = [...items];

  const weight: Record<StatusRadarStok, number> = {
    Habis: 1,
    Kritis: 2,
    Waspada: 3,
    Stagnan: 4,
    Aman: 5,
    Nonaktif: 6,
  };

  list.sort((a, b) => {
    switch (sortBy) {
      case "urgensi": {
        // 1. Status Urgensi: Habis -> Kritis -> Waspada -> Stagnan -> Aman -> Nonaktif
        const statusDiff = weight[a.status] - weight[b.status];
        if (statusDiff !== 0) return statusDiff;

        // 2. Estimasi hari habis terkecil
        if (a.estimasiHariHabis !== null && b.estimasiHariHabis !== null) {
          const estDiff = a.estimasiHariHabis - b.estimasiHariHabis;
          if (estDiff !== 0) return estDiff;
        } else if (a.estimasiHariHabis !== null) {
          return -1;
        } else if (b.estimasiHariHabis !== null) {
          return 1;
        }

        // 3. Sisa stok fisik terendah
        const stockDiff = a.stokFisik - b.stokFisik;
        if (stockDiff !== 0) return stockDiff;

        // 4. Nama barang A-Z
        return a.namaBarang.localeCompare(b.namaBarang, "id");
      }

      case "estimasi_asc": {
        // Barang dengan estimasi hari paling sedikit tampil lebih dahulu
        // Nilai null tanpa riwayat penjualan ditempatkan di bawah barang yang memiliki estimasi
        if (a.estimasiHariHabis !== null && b.estimasiHariHabis !== null) {
          const estDiff = a.estimasiHariHabis - b.estimasiHariHabis;
          if (estDiff !== 0) return estDiff;
        } else if (a.estimasiHariHabis !== null) {
          return -1;
        } else if (b.estimasiHariHabis !== null) {
          return 1;
        }

        // Jika sama-sama null atau sama estimasi: aktif tampil sebelum nonaktif
        if (a.aktif !== b.aktif) return a.aktif ? -1 : 1;

        // Sisa stok fisik terendah
        const stockDiff = a.stokFisik - b.stokFisik;
        if (stockDiff !== 0) return stockDiff;

        return a.namaBarang.localeCompare(b.namaBarang, "id");
      }

      case "stok_asc": {
        // Stok fisik terkecil tampil lebih dahulu
        const stockDiff = a.stokFisik - b.stokFisik;
        if (stockDiff !== 0) return stockDiff;

        // Tie-breaker 1: Tingkat urgensi status
        const statusDiff = weight[a.status] - weight[b.status];
        if (statusDiff !== 0) return statusDiff;

        // Tie-breaker 2: Rekomendasi order terbesar
        const reqDiff = b.rekomendasiOrder - a.rekomendasiOrder;
        if (reqDiff !== 0) return reqDiff;

        return a.namaBarang.localeCompare(b.namaBarang, "id");
      }

      case "penjualan_desc": {
        // Total penjualan 30 hari terbesar tampil lebih dahulu
        const salesDiff = b.totalPenjualan30Hari - a.totalPenjualan30Hari;
        if (salesDiff !== 0) return salesDiff;

        // Tie-breaker 1: Rata-rata harian terbesar
        const rateDiff = b.rataRataPenjualanHarian - a.rataRataPenjualanHarian;
        if (rateDiff !== 0) return rateDiff;

        // Tie-breaker 2: Sisa stok terendah
        const stockDiff = a.stokFisik - b.stokFisik;
        if (stockDiff !== 0) return stockDiff;

        return a.namaBarang.localeCompare(b.namaBarang, "id");
      }

      case "rekomendasi_desc": {
        // Rekomendasi pengadaan terbesar tampil lebih dahulu
        const reqDiff = b.rekomendasiOrder - a.rekomendasiOrder;
        if (reqDiff !== 0) return reqDiff;

        // Tie-breaker 1: Tingkat urgensi status
        const statusDiff = weight[a.status] - weight[b.status];
        if (statusDiff !== 0) return statusDiff;

        // Tie-breaker 2: Sisa stok terendah
        const stockDiff = a.stokFisik - b.stokFisik;
        if (stockDiff !== 0) return stockDiff;

        return a.namaBarang.localeCompare(b.namaBarang, "id");
      }

      case "nama_asc": {
        // Nama barang A-Z
        const nameDiff = a.namaBarang.localeCompare(b.namaBarang, "id");
        if (nameDiff !== 0) return nameDiff;

        return a.kodeBarang.localeCompare(b.kodeBarang, "id");
      }

      default:
        return 0;
    }
  });

  return list;
}

/**
 * Menghasilkan daftar notifikasi stok pintar (Smart Stock Alerts) secara murni dan deterministik.
 *
 * MENEGAKKAN ATURAN:
 * 1. Tidak melakukan query Supabase, mengubah database, atau memutasi array sumber.
 * 2. Hanya memasukkan barang aktif dengan status 'Habis', 'Kritis', atau 'Waspada'.
 * 3. Memisahkan tingkat urgensi secara konsisten:
 *    - Prioritas 1: Habis (Kategori 'darurat')
 *    - Prioritas 2: Kritis (Kategori 'darurat')
 *    - Prioritas 3: Waspada (Kategori 'peringatan')
 * 4. Pengurutan deterministik:
 *    - Prioritas (1 -> 2 -> 3)
 *    - Estimasi hari habis terkecil (nilai numerik lebih dahulu, null di bawahnya)
 *    - Sisa stok fisik terendah
 *    - Rekomendasi order terbesar
 *    - Nama barang A-Z (locale id)
 *    - Kode barang A-Z
 *    - Barang ID
 * 5. Menangani estimasi hari null tanpa NaN, Infinity, atau error.
 * 6. Dilarang memasukkan barang Nonaktif, Aman, atau Stagnan.
 * 7. Tidak memuat informasi HPP, harga beli, margin, atau data finansial.
 */
export function getSmartStockAlerts(items: RadarStokItem[]): SmartStockAlert[] {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return [];
  }

  // 1. Filter barang yang relevan untuk notifikasi stok pintar (hanya aktif dan berstatus Habis/Kritis/Waspada)
  const eligibleItems = items.filter(
    (item) =>
      item.aktif === true &&
      (item.status === "Habis" || item.status === "Kritis" || item.status === "Waspada")
  );

  if (eligibleItems.length === 0) {
    return [];
  }

  // 2. Transformasi ke format SmartStockAlert
  const alerts: SmartStockAlert[] = eligibleItems.map((item) => {
    let prioritas: PrioritasAlertStok;
    let kategori: KategoriAlertStok;
    let pesan: string;

    switch (item.status) {
      case "Habis":
        prioritas = 1;
        kategori = "darurat";
        pesan = `Stok fisik habis (0 ${item.satuan}). Segera lakukan pemesanan ulang.`;
        break;

      case "Kritis":
        prioritas = 2;
        kategori = "darurat";
        pesan =
          item.estimasiHariHabis !== null
            ? `Stok kritis! Estimasi habis dalam ${item.estimasiHariHabis} hari.`
            : `Stok kritis (${item.stokFisik} ${item.satuan}) berada di bawah batas aman.`;
        break;

      case "Waspada":
      default:
        prioritas = 3;
        kategori = "peringatan";
        pesan =
          item.estimasiHariHabis !== null && item.estimasiHariHabis <= 14
            ? `Peringatan: Estimasi stok habis dalam ${item.estimasiHariHabis} hari.`
            : `Stok menipis (${item.stokFisik} ${item.satuan}), mencapai batas minimum (${item.stokMinimum} ${item.satuan}).`;
        break;
    }

    return {
      barangId: item.barangId,
      kodeBarang: item.kodeBarang,
      namaBarang: item.namaBarang,
      satuan: item.satuan,
      stokFisik: item.stokFisik,
      stokMinimum: item.stokMinimum,
      status: item.status as "Habis" | "Kritis" | "Waspada",
      prioritas,
      kategori,
      estimasiHariHabis: item.estimasiHariHabis,
      rekomendasiOrder: item.rekomendasiOrder,
      pesan,
    };
  });

  // 3. Pengurutan deterministik multi-level
  alerts.sort((a, b) => {
    // Level 1: Tingkat prioritas (1: Habis, 2: Kritis, 3: Waspada)
    const priorityDiff = a.prioritas - b.prioritas;
    if (priorityDiff !== 0) return priorityDiff;

    // Level 2: Estimasi hari habis (terkecil lebih dulu, null di bawahnya)
    if (a.estimasiHariHabis !== null && b.estimasiHariHabis !== null) {
      const estDiff = a.estimasiHariHabis - b.estimasiHariHabis;
      if (estDiff !== 0) return estDiff;
    } else if (a.estimasiHariHabis !== null) {
      return -1;
    } else if (b.estimasiHariHabis !== null) {
      return 1;
    }

    // Level 3: Sisa stok fisik terendah
    const stockDiff = a.stokFisik - b.stokFisik;
    if (stockDiff !== 0) return stockDiff;

    // Level 4: Rekomendasi order terbesar
    const recDiff = b.rekomendasiOrder - a.rekomendasiOrder;
    if (recDiff !== 0) return recDiff;

    // Level 5: Nama barang alfabetis A-Z (id locale)
    const nameDiff = a.namaBarang.localeCompare(b.namaBarang, "id");
    if (nameDiff !== 0) return nameDiff;

    // Level 6: Kode barang A-Z
    const codeDiff = a.kodeBarang.localeCompare(b.kodeBarang, "id");
    if (codeDiff !== 0) return codeDiff;

    // Level 7: Barang ID
    return a.barangId.localeCompare(b.barangId);
  });

  return alerts;
}

/**
 * Menghitung ringkasan badge notifikasi stok pintar.
 * - emergencyCount = jumlah barang unik berstatus 'Habis' + 'Kritis'
 * - warningCount = jumlah barang unik berstatus 'Waspada'
 * Menjamin tidak ada barang yang dihitung ganda.
 */
export function hitungSmartStockBadge(
  alerts: SmartStockAlert[]
): SmartStockBadgeSummary {
  if (!alerts || !Array.isArray(alerts) || alerts.length === 0) {
    return {
      emergencyCount: 0,
      warningCount: 0,
      totalAlerts: 0,
    };
  }

  const seenEmergency = new Set<string>();
  const seenWarning = new Set<string>();

  for (const alert of alerts) {
    if (alert.kategori === "darurat" || alert.status === "Habis" || alert.status === "Kritis") {
      seenEmergency.add(alert.barangId);
    } else if (alert.kategori === "peringatan" || alert.status === "Waspada") {
      if (!seenEmergency.has(alert.barangId)) {
        seenWarning.add(alert.barangId);
      }
    }
  }

  return {
    emergencyCount: seenEmergency.size,
    warningCount: seenWarning.size,
    totalAlerts: seenEmergency.size + seenWarning.size,
  };
}

/**
 * Mengambil dan mengkalkulasi data aktual Radar Stok dari Supabase.
 *
 * MENEGAKKAN KEAMANAN DAN KETENTUAN TEKNIS:
 * 1. Menggunakan client Supabase konteks sesi pengguna (RLS aktif, bukan service_role bypass).
 * 2. KEAMANAN BR-12: Kolom harga_pokok dan harga_beli_satuan DILARANG diambil atau dikembalikan.
 * 3. Tanggal transaksi: menggunakan `pesanan_jual.dibuat_pada` karena merepresentasikan
 *    tanggal resmi pencatatan transaksi pesanan pelanggan dan selalu terisi (NOT NULL)
 *    pada seluruh pesanan yang berstatus 'dikonfirmasi', 'dikirim', maupun 'lunas'.
 * 4. Efisiensi query: menghindari N+1 dengan batch query dan agregasi in-memory Map O(N).
 * 5. Error handling: tidak menutupi kegagalan query menjadi hasil kosong yang menipu.
 */
export async function getRadarStokData(
  supabase: SupabaseClient
): Promise<RadarStokDataPayload> {
  const tanggalDihitung = new Date().toISOString();
  const PERIODE_HARI = 30;

  // Tanggal batas awal 30 hari kalender yang lalu
  const thirtyDaysAgo = new Date(Date.now() - PERIODE_HARI * 24 * 3600 * 1000);
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

  try {
    // 1. Ambil seluruh barang (aktif dan nonaktif) tanpa menyertakan kolom rahasia harga_pokok (BR-12)
    const { data: rawBarang, error: barangError } = await supabase
      .from("barang")
      .select("id, kode, nama, satuan, stok, stok_minimum, aktif")
      .order("kode", { ascending: true });

    if (barangError) {
      throw new Error(`Gagal memuat katalog barang dari database: ${barangError.message}`);
    }

    if (!rawBarang) {
      throw new Error("Data katalog barang tidak ditemukan.");
    }

    // 2. Ambil penjualan item_pesanan_jual dari pesanan sah 30 hari terakhir
    // Status pesanan sah sesuai PRD: 'dikonfirmasi', 'dikirim', 'lunas'
    const salesQtyMap = new Map<string, number>();

    const { data: rawSalesItems, error: salesError } = await supabase
      .from("item_pesanan_jual")
      .select(`
        id,
        barang_id,
        jumlah,
        pesanan_jual!inner (
          id,
          nomor,
          status,
          dibuat_pada
        )
      `)
      .in("pesanan_jual.status", ["dikonfirmasi", "dikirim", "lunas"])
      .gte("pesanan_jual.dibuat_pada", thirtyDaysAgoISO);

    if (salesError) {
      console.warn(
        `[RadarStok] Query inner-join item_pesanan_jual terkendala (${salesError.message}), menjalankan fallback query 2 tahap...`
      );

      // Fallback query 2 tahap jika PostgREST schema cache join terkendala
      const { data: fallbackOrders, error: orderError } = await supabase
        .from("pesanan_jual")
        .select("id, status, dibuat_pada")
        .in("status", ["dikonfirmasi", "dikirim", "lunas"])
        .gte("dibuat_pada", thirtyDaysAgoISO);

      if (orderError) {
        throw new Error(`Gagal memuat riwayat pesanan penjualan: ${orderError.message}`);
      }

      const orderIds = (fallbackOrders || []).map((o) => o.id);
      if (orderIds.length > 0) {
        const { data: fallbackItems, error: itemsError } = await supabase
          .from("item_pesanan_jual")
          .select("id, barang_id, jumlah, pesanan_jual_id")
          .in("pesanan_jual_id", orderIds);

        if (itemsError) {
          throw new Error(`Gagal memuat item riwayat penjualan: ${itemsError.message}`);
        }

        for (const item of fallbackItems || []) {
          const prev = salesQtyMap.get(item.barang_id) || 0;
          salesQtyMap.set(item.barang_id, prev + (Number(item.jumlah) || 0));
        }
      }
    } else if (rawSalesItems) {
      for (const item of rawSalesItems) {
        const prev = salesQtyMap.get(item.barang_id) || 0;
        salesQtyMap.set(item.barang_id, prev + (Number(item.jumlah) || 0));
      }
    }

    // 3. Ambil incoming PO pembelian yang sedang berjalan (status 'diajukan' atau 'disetujui')
    // KEAMANAN BR-12: Kolom harga_beli_satuan DILARANG diambil!
    const incomingPOMap = new Map<string, number>();

    const { data: rawPembelian, error: pembelianError } = await supabase
      .from("pembelian")
      .select("id, nomor, barang_id, jumlah_dipesan, jumlah_diterima, status")
      .in("status", ["diajukan", "disetujui"]);

    if (pembelianError) {
      throw new Error(`Gagal memuat data pembelian berjalan (PO): ${pembelianError.message}`);
    }

    for (const po of rawPembelian || []) {
      const dipesan = Number(po.jumlah_dipesan) || 0;
      const diterima = Number(po.jumlah_diterima) || 0;
      const sisaPO = Math.max(0, dipesan - diterima);

      const prev = incomingPOMap.get(po.barang_id) || 0;
      incomingPOMap.set(po.barang_id, prev + sisaPO);
    }

    // 4. Hitung prediksi untuk setiap barang
    const items: RadarStokItem[] = rawBarang.map((b) => {
      const totalPenjualan30Hari = salesQtyMap.get(b.id) || 0;
      const incomingPO = incomingPOMap.get(b.id) || 0;

      return hitungPrediksiBarang({
        barangId: b.id,
        kodeBarang: b.kode,
        namaBarang: b.nama,
        satuan: b.satuan,
        stokFisik: b.stok,
        stokMinimum: b.stok_minimum,
        aktif: b.aktif,
        totalPenjualan30Hari,
        incomingPO,
      });
    });

    // Urutkan item secara default berdasarkan prioritas urgensi
    const sortedItems = sortRadarStokItems(items, "urgensi");

    const summary = hitungRadarStokSummary(sortedItems);

    return {
      items: sortedItems,
      summary,
      periodeHari: PERIODE_HARI,
      tanggalDihitung,
      error: null,
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Terjadi kesalahan internal saat menghitung Radar Stok.";
    console.error("[getRadarStokData] Gagal mengeksekusi perhitungan Radar Stok:", errorMsg);

    return {
      items: [],
      summary: {
        totalBarang: 0,
        jumlahHabis: 0,
        jumlahKritis: 0,
        jumlahWaspada: 0,
        jumlahAman: 0,
        jumlahStagnan: 0,
        jumlahNonaktif: 0,
        totalRekomendasiOrder: 0,
      },
      periodeHari: PERIODE_HARI,
      tanggalDihitung,
      error: errorMsg,
    };
  }
}
