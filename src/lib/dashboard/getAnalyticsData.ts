import { SupabaseClient } from "@supabase/supabase-js";
import {
  DateRangeFilter,
  DateRangePreset,
  OrderKpiMetrics,
  SalesTrendPoint,
  TopProductItem,
  OrderStatusCount,
  PaymentStatusSummary,
  ManagerAnalyticsPayload,
  SalesAnalyticsPayload,
  WarehouseAnalyticsPayload,
  AnalyticsPayload,
} from "@/types/analytics";
import { RadarStokSummary } from "@/types/radar_stok";
import { getRadarStokData } from "@/lib/radar-stok/getRadarStokData";

/**
 * Format nama bulan singkat dalam bahasa Indonesia
 */
const BULAN_INDONESIA_SINGKAT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

/**
 * Mengonversi tanggal / timestamp ke format YYYY-MM-DD dalam zona waktu Indonesia Barat (WIB / Asia/Jakarta).
 * Mencegah pergeseran tanggal kalender yang disebabkan oleh penggunaan toISOString() berbasis UTC.
 */
export function getWIBDateString(dateInput?: string | Date | null): string {
  if (!dateInput) return "";
  try {
    const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

/**
 * Mendapatkan label tanggal ringkas lokal, misal "27 Okt"
 */
export function getWIBShortLabel(dateStr: string): string {
  if (!dateStr || !dateStr.includes("-")) return dateStr || "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const day = parseInt(parts[2], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const monthName = BULAN_INDONESIA_SINGKAT[monthIdx] || parts[1];
  return `${day} ${monthName}`;
}

/**
 * Memvalidasi dan menyelesaikan filter rentang tanggal ke string YYYY-MM-DD (WIB)
 * dan timestamp ISO UTC yang tepat (+07:00).
 */
export function resolveDateRange(
  filterInput?: Partial<DateRangeFilter> | null,
  referenceDateInput?: Date
): {
  filter: DateRangeFilter;
  startISO: string;
  endISO: string;
  startDateWIB: string;
  endDateWIB: string;
} {
  const refDate = referenceDateInput || new Date();
  const todayWIBStr = getWIBDateString(refDate);

  const preset: DateRangePreset = filterInput?.preset || "30_hari";
  let startDateWIB = todayWIBStr;
  let endDateWIB = todayWIBStr;

  if (preset === "hari_ini") {
    startDateWIB = todayWIBStr;
    endDateWIB = todayWIBStr;
  } else if (preset === "7_hari") {
    // 7 hari terakhir (Hari ini dan 6 hari sebelumnya)
    const refMs = new Date(`${todayWIBStr}T12:00:00+07:00`).getTime();
    const startMs = refMs - 6 * 24 * 60 * 60 * 1000;
    startDateWIB = getWIBDateString(new Date(startMs));
    endDateWIB = todayWIBStr;
  } else if (preset === "30_hari") {
    // 30 hari terakhir (Hari ini dan 29 hari sebelumnya)
    const refMs = new Date(`${todayWIBStr}T12:00:00+07:00`).getTime();
    const startMs = refMs - 29 * 24 * 60 * 60 * 1000;
    startDateWIB = getWIBDateString(new Date(startMs));
    endDateWIB = todayWIBStr;
  } else if (preset === "bulan_ini") {
    // Tanggal 1 bulan ini s/d hari ini
    const parts = todayWIBStr.split("-");
    startDateWIB = `${parts[0]}-${parts[1]}-01`;
    endDateWIB = todayWIBStr;
  } else if (preset === "kustom") {
    const rawStart = (filterInput?.startDate || "").trim();
    const rawEnd = (filterInput?.endDate || "").trim();

    // Validasi format YYYY-MM-DD
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (datePattern.test(rawStart) && datePattern.test(rawEnd)) {
      if (rawStart <= rawEnd) {
        startDateWIB = rawStart;
        endDateWIB = rawEnd;
      } else {
        // Swap defensif jika tanggal mulai lebih besar dari tanggal akhir
        startDateWIB = rawEnd;
        endDateWIB = rawStart;
      }

      // Pembatasan rentang maksimal 366 hari untuk menjaga performa server
      const startMs = new Date(`${startDateWIB}T00:00:00+07:00`).getTime();
      const endMs = new Date(`${endDateWIB}T00:00:00+07:00`).getTime();
      const maxMs = 366 * 24 * 60 * 60 * 1000;
      if (endMs - startMs > maxMs) {
        const adjustedStart = new Date(endMs - maxMs);
        startDateWIB = getWIBDateString(adjustedStart);
      }
    } else {
      // Fallback aman ke 30 hari jika input tanggal kustom rusak
      const refMs = new Date(`${todayWIBStr}T12:00:00+07:00`).getTime();
      startDateWIB = getWIBDateString(new Date(refMs - 29 * 24 * 60 * 60 * 1000));
      endDateWIB = todayWIBStr;
    }
  }

  // Konversi batas inklusif kalender lokal WIB (+07:00) ke ISO string UTC
  const startISO = new Date(`${startDateWIB}T00:00:00+07:00`).toISOString();
  const endISO = new Date(`${endDateWIB}T23:59:59.999+07:00`).toISOString();

  return {
    filter: {
      preset,
      startDate: startDateWIB,
      endDate: endDateWIB,
    },
    startISO,
    endISO,
    startDateWIB,
    endDateWIB,
  };
}

/**
 * Menghasilkan larik tanggal berurutan yang diisi nilai nol (Zero-Filled)
 * untuk menjamin deret waktu tren penjualan tidak memiliki tanggal yang melompat.
 */
export function generateZeroFilledTrend(
  startDateWIB: string,
  endDateWIB: string,
  salesMap: Map<string, { totalNilai: number; jumlahPesanan: number }>
): SalesTrendPoint[] {
  const result: SalesTrendPoint[] = [];
  if (!startDateWIB || !endDateWIB || startDateWIB > endDateWIB) {
    return result;
  }

  const current = new Date(`${startDateWIB}T12:00:00+07:00`);
  const endMs = new Date(`${endDateWIB}T12:00:00+07:00`).getTime();

  while (current.getTime() <= endMs) {
    const dateStr = getWIBDateString(current);
    const existing = salesMap.get(dateStr);

    result.push({
      date: dateStr,
      label: getWIBShortLabel(dateStr),
      totalNilai: existing ? Math.round(existing.totalNilai) : 0,
      jumlahPesanan: existing ? existing.jumlahPesanan : 0,
    });

    current.setDate(current.getDate() + 1);
  }

  return result;
}

export interface PesananInputRow {
  id: string;
  nomor?: string;
  status: string;
  total: number | string;
  dibuat_pada: string;
  dikirim_pada?: string | null;
  dilunasi_pada?: string | null;
}

/**
 * Menghitung metrik transaksi, agregasi status, dan ringkasan pembayaran secara deterministik.
 *
 * MENEGAKKAN ATURAN BISNIS (PRD Bab 6 & 9, BR-05):
 * 1. Penjualan Sah (Omzet): HANYA pesanan berstatus 'dikirim' dan 'lunas'.
 * 2. Kas Masuk Terverifikasi: HANYA pesanan berstatus 'lunas'.
 * 3. Piutang Berjalan: HANYA pesanan berstatus 'dikonfirmasi' dan 'dikirim'.
 * 4. Draf: Dihitung sebagai pipeline terpisah, DILARANG masuk penjualan sah.
 * 5. Dibatalkan: Void, DILARANG masuk penjualan sah.
 */
export function calculateOrderMetrics(orders: PesananInputRow[]): {
  kpi: OrderKpiMetrics;
  statusDistribution: OrderStatusCount[];
  paymentStatusSummary: PaymentStatusSummary;
  dailyTrendMap: Map<string, { totalNilai: number; jumlahPesanan: number }>;
  validOrderIds: string[];
} {
  let totalNilaiPenjualanSah = 0;
  let jumlahPesananSah = 0;
  let kasMasukTerverifikasi = 0;
  let totalPiutangBerjalan = 0;
  let totalNilaiDraf = 0;
  let jumlahPesananDraf = 0;
  let totalNilaiDibatalkan = 0;
  let jumlahPesananDibatalkan = 0;

  let jumlahPesananLunas = 0;
  let jumlahPesananBelumLunas = 0;

  const validOrderIds: string[] = [];
  const dailyTrendMap = new Map<string, { totalNilai: number; jumlahPesanan: number }>();

  // Hitung jumlah & total per status untuk distribusi status
  const statusCounts: Record<string, { count: number; total: number }> = {
    draf: { count: 0, total: 0 },
    dikonfirmasi: { count: 0, total: 0 },
    dikirim: { count: 0, total: 0 },
    lunas: { count: 0, total: 0 },
    dibatalkan: { count: 0, total: 0 },
  };

  const safeOrders = Array.isArray(orders) ? orders : [];

  for (const order of safeOrders) {
    const rawStatus = (order.status || "").toLowerCase().trim();
    const total = Math.max(0, Math.round(Number(order.total) || 0));
    const dateWIB = getWIBDateString(order.dibuat_pada);

    if (rawStatus in statusCounts) {
      statusCounts[rawStatus].count += 1;
      statusCounts[rawStatus].total += total;
    }

    if (rawStatus === "draf") {
      totalNilaiDraf += total;
      jumlahPesananDraf += 1;
    } else if (rawStatus === "dibatalkan") {
      totalNilaiDibatalkan += total;
      jumlahPesananDibatalkan += 1;
    } else if (rawStatus === "dikonfirmasi") {
      // Dikonfirmasi: Mengikat stok dan memotong batas kredit (piutang berjalan), belum dikirim
      totalPiutangBerjalan += total;
      jumlahPesananBelumLunas += 1;
    } else if (rawStatus === "dikirim") {
      // Dikirim: Sah sebagai omzet penjualan, piutang berjalan sebelum lunas
      totalNilaiPenjualanSah += total;
      jumlahPesananSah += 1;
      totalPiutangBerjalan += total;
      jumlahPesananBelumLunas += 1;
      validOrderIds.push(order.id);

      if (dateWIB) {
        const cur = dailyTrendMap.get(dateWIB) || { totalNilai: 0, jumlahPesanan: 0 };
        dailyTrendMap.set(dateWIB, {
          totalNilai: cur.totalNilai + total,
          jumlahPesanan: cur.jumlahPesanan + 1,
        });
      }
    } else if (rawStatus === "lunas") {
      // Lunas: Sah sebagai omzet penjualan dan kas masuk terverifikasi
      totalNilaiPenjualanSah += total;
      jumlahPesananSah += 1;
      kasMasukTerverifikasi += total;
      jumlahPesananLunas += 1;
      validOrderIds.push(order.id);

      if (dateWIB) {
        const cur = dailyTrendMap.get(dateWIB) || { totalNilai: 0, jumlahPesanan: 0 };
        dailyTrendMap.set(dateWIB, {
          totalNilai: cur.totalNilai + total,
          jumlahPesanan: cur.jumlahPesanan + 1,
        });
      }
    }
  }

  // Rata-rata nilai pesanan sah (AOV) dengan penanganan division by zero
  const rataRataNilaiPesanan =
    jumlahPesananSah > 0 ? Math.round(totalNilaiPenjualanSah / jumlahPesananSah) : 0;

  // Distribusi status pesanan
  const totalAllOrders = safeOrders.length;
  const statusLabels: Record<string, string> = {
    draf: "Draf",
    dikonfirmasi: "Dikonfirmasi",
    dikirim: "Dikirim",
    lunas: "Lunas",
    dibatalkan: "Dibatalkan",
  };

  const statusDistribution: OrderStatusCount[] = (
    ["draf", "dikonfirmasi", "dikirim", "lunas", "dibatalkan"] as const
  ).map((st) => {
    const data = statusCounts[st];
    const persentase =
      totalAllOrders > 0 ? Number(((data.count / totalAllOrders) * 100).toFixed(1)) : 0;
    return {
      status: st,
      label: statusLabels[st] || st,
      jumlahPesanan: data.count,
      totalNilai: Math.round(data.total),
      persentase,
    };
  });

  // Ringkasan Pembayaran
  const persentaseLunas =
    totalNilaiPenjualanSah > 0
      ? Number(((kasMasukTerverifikasi / totalNilaiPenjualanSah) * 100).toFixed(1))
      : 0;

  const paymentStatusSummary: PaymentStatusSummary = {
    kasMasukTerverifikasi,
    jumlahPesananLunas,
    piutangBerjalan: totalPiutangBerjalan,
    jumlahPesananBelumLunas,
    persentaseLunas,
  };

  const kpi: OrderKpiMetrics = {
    totalNilaiPenjualanSah,
    jumlahPesananSah,
    rataRataNilaiPesanan,
    kasMasukTerverifikasi,
    totalPiutangBerjalan,
    totalNilaiDraf,
    jumlahPesananDraf,
    totalNilaiDibatalkan,
    jumlahPesananDibatalkan,
  };

  return {
    kpi,
    statusDistribution,
    paymentStatusSummary,
    dailyTrendMap,
    validOrderIds,
  };
}

export interface ItemPesananInputRow {
  barang_id: string;
  jumlah: number;
  subtotal?: number | string;
}

export interface BarangInfo {
  kode: string;
  nama: string;
  satuan: string;
}

/**
 * Menghitung peringkat produk terlaris berdasarkan akumulasi kuantitas fisik.
 */
export function calculateTopProducts(
  items: ItemPesananInputRow[],
  barangMap: Map<string, BarangInfo>,
  limit: number = 10
): TopProductItem[] {
  const aggregatedMap = new Map<string, { kuantitas: number; totalNilai: number }>();

  const safeItems = Array.isArray(items) ? items : [];
  for (const item of safeItems) {
    if (!item.barang_id) continue;
    const qty = Math.max(0, Math.floor(Number(item.jumlah) || 0));
    const subtotal = Math.max(0, Math.round(Number(item.subtotal) || 0));

    const cur = aggregatedMap.get(item.barang_id) || { kuantitas: 0, totalNilai: 0 };
    aggregatedMap.set(item.barang_id, {
      kuantitas: cur.kuantitas + qty,
      totalNilai: cur.totalNilai + subtotal,
    });
  }

  // Urutkan menurun berdasarkan kuantitas
  const sortedEntries = Array.from(aggregatedMap.entries()).sort(
    (a, b) => b[1].kuantitas - a[1].kuantitas
  );

  return sortedEntries.slice(0, limit).map(([barangId, data]) => {
    const info = barangMap.get(barangId) || {
      kode: "-",
      nama: "Barang Tidak Dikenal",
      satuan: "unit",
    };
    return {
      barangId,
      kodeBarang: info.kode,
      namaBarang: info.nama,
      satuan: info.satuan,
      kuantitasTerjual: data.kuantitas,
      totalNilaiJual: data.totalNilai,
    };
  });
}

/**
 * Memfilter payload analitik sesuai dengan wewenang peran pengguna di sisi server (Server-Side Authorization).
 * Menjamin kepatuhan penuh terhadap aturan kerahasiaan finansial BR-12.
 */
export function filterPayloadByRole(
  role: "manajer" | "penjualan" | "gudang",
  rawData: {
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
): AnalyticsPayload {
  if (role === "manajer") {
    const payload: ManagerAnalyticsPayload = {
      role: "manajer",
      kpi: rawData.kpi,
      trend: rawData.trend,
      topProducts: rawData.topProducts,
      orderStatusDistribution: rawData.orderStatusDistribution,
      paymentStatusSummary: rawData.paymentStatusSummary,
      stockSummary: rawData.stockSummary,
      filter: rawData.filter,
      keterbatasanData: rawData.keterbatasanData,
      error: rawData.error,
    };
    return payload;
  }

  if (role === "penjualan") {
    // Peran PENJUALAN: Akses ke omzet dan kuantitas, DILARANG memuat kas masuk, piutang, HPP, atau margin
    const payload: SalesAnalyticsPayload = {
      role: "penjualan",
      kpi: {
        totalNilaiPenjualanSah: rawData.kpi.totalNilaiPenjualanSah,
        jumlahPesananSah: rawData.kpi.jumlahPesananSah,
        rataRataNilaiPesanan: rawData.kpi.rataRataNilaiPesanan,
        jumlahPesananDraf: rawData.kpi.jumlahPesananDraf,
        totalNilaiDraf: rawData.kpi.totalNilaiDraf,
      },
      trend: rawData.trend,
      // Produk terlaris menyertakan omzet harga jual, tetapi TANPA HPP/margin
      topProducts: rawData.topProducts.map((p) => ({
        barangId: p.barangId,
        kodeBarang: p.kodeBarang,
        namaBarang: p.namaBarang,
        satuan: p.satuan,
        kuantitasTerjual: p.kuantitasTerjual,
        totalNilaiJual: p.totalNilaiJual,
      })),
      orderStatusDistribution: rawData.orderStatusDistribution,
      stockSummary: rawData.stockSummary,
      filter: rawData.filter,
      error: rawData.error,
    };
    return payload;
  }

  // Peran GUDANG: MURNI kuantitas fisik dan status pergerakan barang.
  // DILARANG KERAS mengekspos metrik moneter (Rupiah), omzet, kas, piutang, HPP, atau margin.
  const payload: WarehouseAnalyticsPayload = {
    role: "gudang",
    kpi: {
      jumlahPesananSiapKirim:
        rawData.orderStatusDistribution.find((s) => s.status === "dikonfirmasi")
          ?.jumlahPesanan || 0,
      jumlahPesananTerkirim:
        rawData.orderStatusDistribution.find((s) => s.status === "dikirim")
          ?.jumlahPesanan || 0,
      totalKuantitasBarangKeluar: rawData.topProducts.reduce(
        (sum, p) => sum + p.kuantitasTerjual,
        0
      ),
    },
    topProducts: rawData.topProducts.map((p) => ({
      barangId: p.barangId,
      kodeBarang: p.kodeBarang,
      namaBarang: p.namaBarang,
      satuan: p.satuan,
      kuantitasTerjual: p.kuantitasTerjual,
    })),
    orderStatusDistribution: rawData.orderStatusDistribution.map((s) => ({
      status: s.status,
      label: s.label,
      jumlahPesanan: s.jumlahPesanan,
      persentase: s.persentase,
    })),
    stockSummary: rawData.stockSummary,
    filter: rawData.filter,
    error: rawData.error,
  };
  return payload;
}

/**
 * Service Utama: Mengambil Data Analitik Bisnis Langsung dari Supabase
 * dengan Validasi Rentang Tanggal, Proteksi BR-12, dan Zero-Filling Lengkap.
 */
export async function getAnalyticsData(
  supabase: SupabaseClient,
  filterInput?: Partial<DateRangeFilter> | null,
  userRole?: "manajer" | "penjualan" | "gudang",
  userId?: string
): Promise<AnalyticsPayload> {
  const { filter, startISO, endISO, startDateWIB, endDateWIB } = resolveDateRange(
    filterInput
  );

  // 1. Tentukan peran pengguna secara server-side jika tidak dipasok
  let resolvedRole: "manajer" | "penjualan" | "gudang" = userRole || "gudang";
  if (!userRole && userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("peran")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.peran && ["manajer", "penjualan", "gudang"].includes(profile.peran)) {
      resolvedRole = profile.peran as "manajer" | "penjualan" | "gudang";
    }
  }

  // 2. Query Pesanan Jual sesuai rentang tanggal dibuat_pada inklusif
  const orderQuery = supabase
    .from("pesanan_jual")
    .select("id, nomor, status, total, dibuat_pada, dikirim_pada, dilunasi_pada, pelanggan_id, dibuat_oleh")
    .gte("dibuat_pada", startISO)
    .lte("dibuat_pada", endISO);

  // Jika sales murni dan ingin melihat transaksi buatannya (RLS / scoping),
  // namun untuk distributor-wide analitik dapat melihat agregat umum
  const { data: orders, error: ordersErr } = await orderQuery;

  if (ordersErr) {
    console.error("[GET_ANALYTICS_DATA_ERROR] Gagal membaca pesanan_jual:", ordersErr.message);
    const emptyRadar: RadarStokSummary = {
      totalBarang: 0,
      jumlahHabis: 0,
      jumlahKritis: 0,
      jumlahWaspada: 0,
      jumlahAman: 0,
      jumlahStagnan: 0,
      jumlahNonaktif: 0,
      totalRekomendasiOrder: 0,
    };
    return filterPayloadByRole(resolvedRole, {
      kpi: {
        totalNilaiPenjualanSah: 0,
        jumlahPesananSah: 0,
        rataRataNilaiPesanan: 0,
        kasMasukTerverifikasi: 0,
        totalPiutangBerjalan: 0,
        totalNilaiDraf: 0,
        jumlahPesananDraf: 0,
        totalNilaiDibatalkan: 0,
        jumlahPesananDibatalkan: 0,
      },
      trend: generateZeroFilledTrend(startDateWIB, endDateWIB, new Map()),
      topProducts: [],
      orderStatusDistribution: [],
      paymentStatusSummary: {
        kasMasukTerverifikasi: 0,
        jumlahPesananLunas: 0,
        piutangBerjalan: 0,
        jumlahPesananBelumLunas: 0,
        persentaseLunas: 0,
      },
      stockSummary: emptyRadar,
      filter,
      keterbatasanData: [],
      error: `Gagal memuat data analitik transaksi: ${ordersErr.message}`,
    });
  }

  // 3. Kalkulasi metrik order, distribusi status, dan mapping tren harian
  const {
    kpi,
    statusDistribution,
    paymentStatusSummary,
    dailyTrendMap,
    validOrderIds,
  } = calculateOrderMetrics(orders || []);

  // 4. Generate deret tren penjualan harian yang terisi nol (Zero-Filled)
  const trend = generateZeroFilledTrend(startDateWIB, endDateWIB, dailyTrendMap);

  // 5. Query Produk Terlaris berdasarkan kuantitas fisik dari pesanan sah
  let topProducts: TopProductItem[] = [];
  if (validOrderIds.length > 0) {
    // Query efisien: hanya ambil barang_id, jumlah, subtotal dari item pesanan sah
    // KEAMANAN BR-12: DILARANG menyertakan kolom hpp_satuan
    const { data: orderItems, error: itemsErr } = await supabase
      .from("item_pesanan_jual")
      .select("barang_id, jumlah, subtotal")
      .in("pesanan_jual_id", validOrderIds);

    if (!itemsErr && orderItems && orderItems.length > 0) {
      // Ambil daftar barang unik untuk katalog nama
      const uniqueBarangIds = Array.from(new Set(orderItems.map((i) => i.barang_id)));
      const { data: barangList } = await supabase
        .from("barang")
        .select("id, kode, nama, satuan")
        .in("id", uniqueBarangIds);

      const barangMap = new Map<string, BarangInfo>();
      if (barangList && Array.isArray(barangList)) {
        for (const b of barangList) {
          barangMap.set(b.id, {
            kode: b.kode || "-",
            nama: b.nama || "Tanpa Nama",
            satuan: b.satuan || "unit",
          });
        }
      }

      topProducts = calculateTopProducts(orderItems, barangMap, 10);
    }
  }

  // 6. Ringkasan Stok dari modul Radar Stok
  let stockSummary: RadarStokSummary = {
    totalBarang: 0,
    jumlahHabis: 0,
    jumlahKritis: 0,
    jumlahWaspada: 0,
    jumlahAman: 0,
    jumlahStagnan: 0,
    jumlahNonaktif: 0,
    totalRekomendasiOrder: 0,
  };

  try {
    const radarData = await getRadarStokData(supabase);
    if (radarData && radarData.summary) {
      stockSummary = radarData.summary;
    }
  } catch (radarErr) {
    console.warn("[GET_ANALYTICS_RADAR_WARNING] Gagal memuat ringkasan stok:", radarErr);
  }

  // 7. Dokumentasi Keterbatasan Data Aktual
  const keterbatasanData: string[] = [
    "Pencatatan kas masuk saat ini dihitung dari pesanan berstatus 'lunas' penuh. Belum tersedia modul penerimaan pembayaran piutang cicilan/parsial di basis data.",
    "Piutang berjalan dihitung dari seluruh pesanan berstatus 'dikonfirmasi' dan 'dikirim' yang belum dilunasi, sesuai PRD BR-05.",
    "Pesanan draf dan pesanan dibatalkan disajikan terpisah dan tidak dimasukkan ke dalam omzet penjualan sah.",
    "Data finansial HPP dan margin dilindungi oleh aturan BR-12 dan tidak diekspos ke peran Staf Penjualan maupun Gudang.",
  ];

  // 8. Kembalikan payload yang telah difilter sesuai peran pengguna
  return filterPayloadByRole(resolvedRole, {
    kpi,
    trend,
    topProducts,
    orderStatusDistribution: statusDistribution,
    paymentStatusSummary,
    stockSummary,
    filter,
    keterbatasanData,
  });
}
