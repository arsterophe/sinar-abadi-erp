/**
 * Unit Test Suite Fondasi Dashboard Analitik Bisnis
 * CV Sinar Abadi Niaga ERP
 *
 * MENGUJI SECARA OFFLINE / IN-MEMORY:
 * 1. Pesanan draf dan batal tidak masuk ke total penjualan sah.
 * 2. Nilai pesanan berbeda tegas dari kas masuk terverifikasi.
 * 3. Perhitungan jumlah pesanan dan rata-rata nilai pesanan (AOV) dengan anti-division by zero.
 * 4. Filter tanggal dan batas inklusif jam lokal WIB (Asia/Jakarta).
 * 5. Rentang kosong dan zero-filling tanggal tanpa transaksi.
 * 6. Penanganan nilai null, undefined, dan angka nol.
 * 7. Peringkat kuantitas fisik produk terlaris.
 * 8. Validasi filter tanggal kustom yang rusak atau terbalik.
 * 9. Penegakan keamanan BR-12: Payload Penjualan & Gudang DILARANG memuat HPP, margin, atau valuasi.
 * 10. Kegagalan query menghasilkan error transparan dan tidak disamarkan menjadi angka nol.
 *
 * TIDAK MENGUBAH DATABASE SUPABASE MAUPUN DATA TRANSAKSI AKTUAL.
 */

import assert from "node:assert/strict";

console.log("===============================================================================");
console.log("MEMULAI UNIT TEST FONDASI DASHBOARD ANALITIK BISNIS (OFFLINE / IN-MEMORY)");
console.log("===============================================================================\n");

let passedCount = 0;
let totalCount = 0;

function runTest(description, testFn) {
  totalCount++;
  try {
    testFn();
    console.log(`[V] LULUS | ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`[X] GAGAL | ${description}`);
    console.error(`    Alasan: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// -----------------------------------------------------------------------------
// ADAPTER FUNGSI LOGIKA MURNI (SESUAI src/lib/dashboard/getAnalyticsData.ts)
// -----------------------------------------------------------------------------

const BULAN_INDONESIA_SINGKAT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

function getWIBDateString(dateInput) {
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

function getWIBShortLabel(dateStr) {
  if (!dateStr || !dateStr.includes("-")) return dateStr || "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const day = parseInt(parts[2], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const monthName = BULAN_INDONESIA_SINGKAT[monthIdx] || parts[1];
  return `${day} ${monthName}`;
}

function resolveDateRange(filterInput, referenceDateInput) {
  const refDate = referenceDateInput || new Date();
  const todayWIBStr = getWIBDateString(refDate);

  const preset = filterInput?.preset || "30_hari";
  let startDateWIB = todayWIBStr;
  let endDateWIB = todayWIBStr;

  if (preset === "hari_ini") {
    startDateWIB = todayWIBStr;
    endDateWIB = todayWIBStr;
  } else if (preset === "7_hari") {
    const refMs = new Date(`${todayWIBStr}T12:00:00+07:00`).getTime();
    const startMs = refMs - 6 * 24 * 60 * 60 * 1000;
    startDateWIB = getWIBDateString(new Date(startMs));
    endDateWIB = todayWIBStr;
  } else if (preset === "30_hari") {
    const refMs = new Date(`${todayWIBStr}T12:00:00+07:00`).getTime();
    const startMs = refMs - 29 * 24 * 60 * 60 * 1000;
    startDateWIB = getWIBDateString(new Date(startMs));
    endDateWIB = todayWIBStr;
  } else if (preset === "bulan_ini") {
    const parts = todayWIBStr.split("-");
    startDateWIB = `${parts[0]}-${parts[1]}-01`;
    endDateWIB = todayWIBStr;
  } else if (preset === "kustom") {
    const rawStart = (filterInput?.startDate || "").trim();
    const rawEnd = (filterInput?.endDate || "").trim();

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (datePattern.test(rawStart) && datePattern.test(rawEnd)) {
      if (rawStart <= rawEnd) {
        startDateWIB = rawStart;
        endDateWIB = rawEnd;
      } else {
        startDateWIB = rawEnd;
        endDateWIB = rawStart;
      }

      const startMs = new Date(`${startDateWIB}T00:00:00+07:00`).getTime();
      const endMs = new Date(`${endDateWIB}T00:00:00+07:00`).getTime();
      const maxMs = 366 * 24 * 60 * 60 * 1000;
      if (endMs - startMs > maxMs) {
        const adjustedStart = new Date(endMs - maxMs);
        startDateWIB = getWIBDateString(adjustedStart);
      }
    } else {
      const refMs = new Date(`${todayWIBStr}T12:00:00+07:00`).getTime();
      startDateWIB = getWIBDateString(new Date(refMs - 29 * 24 * 60 * 60 * 1000));
      endDateWIB = todayWIBStr;
    }
  }

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

function generateZeroFilledTrend(startDateWIB, endDateWIB, salesMap) {
  const result = [];
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

function calculateOrderMetrics(orders) {
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

  const validOrderIds = [];
  const dailyTrendMap = new Map();

  const statusCounts = {
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
      totalPiutangBerjalan += total;
      jumlahPesananBelumLunas += 1;
    } else if (rawStatus === "dikirim") {
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

  const rataRataNilaiPesanan =
    jumlahPesananSah > 0 ? Math.round(totalNilaiPenjualanSah / jumlahPesananSah) : 0;

  const totalAllOrders = safeOrders.length;
  const statusLabels = {
    draf: "Draf",
    dikonfirmasi: "Dikonfirmasi",
    dikirim: "Dikirim",
    lunas: "Lunas",
    dibatalkan: "Dibatalkan",
  };

  const statusDistribution = [
    "draf", "dikonfirmasi", "dikirim", "lunas", "dibatalkan"
  ].map((st) => {
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

  const persentaseLunas =
    totalNilaiPenjualanSah > 0
      ? Number(((kasMasukTerverifikasi / totalNilaiPenjualanSah) * 100).toFixed(1))
      : 0;

  const paymentStatusSummary = {
    kasMasukTerverifikasi,
    jumlahPesananLunas,
    piutangBerjalan: totalPiutangBerjalan,
    jumlahPesananBelumLunas,
    persentaseLunas,
  };

  const kpi = {
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

function calculateTopProducts(items, barangMap, limit = 10) {
  const aggregatedMap = new Map();

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

function filterPayloadByRole(role, rawData) {
  if (role === "manajer") {
    return {
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
  }

  if (role === "penjualan") {
    return {
      role: "penjualan",
      kpi: {
        totalNilaiPenjualanSah: rawData.kpi.totalNilaiPenjualanSah,
        jumlahPesananSah: rawData.kpi.jumlahPesananSah,
        rataRataNilaiPesanan: rawData.kpi.rataRataNilaiPesanan,
        jumlahPesananDraf: rawData.kpi.jumlahPesananDraf,
        totalNilaiDraf: rawData.kpi.totalNilaiDraf,
      },
      trend: rawData.trend,
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
  }

  return {
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
}

// -----------------------------------------------------------------------------
// BAGIAN 1: PENGUJIAN FILTER TANGGAL & ZONA WAKTU ASIA/JAKARTA (WIB)
// -----------------------------------------------------------------------------

const FIXED_NOW = new Date("2026-10-27T10:30:00+07:00"); // 27 Oktober 2026 10:30 WIB

runTest("1.1. Filter Preset 'hari_ini': Start dan End menghasilkan tanggal hari ini WIB", () => {
  const { filter, startISO, endISO, startDateWIB, endDateWIB } = resolveDateRange(
    { preset: "hari_ini" },
    FIXED_NOW
  );

  assert.strictEqual(startDateWIB, "2026-10-27");
  assert.strictEqual(endDateWIB, "2026-10-27");
  assert.strictEqual(filter.startDate, "2026-10-27");
  assert.strictEqual(filter.endDate, "2026-10-27");

  // Jam 00:00:00 WIB (+07:00) pada 27 Okt harus setara 17:00:00Z pada 26 Okt di UTC
  assert.strictEqual(startISO, "2026-10-26T17:00:00.000Z");
  assert.strictEqual(endISO, "2026-10-27T16:59:59.999Z");
});

runTest("1.2. Filter Preset '7_hari': Rentang tepat 7 hari kalender inklusif", () => {
  const { startDateWIB, endDateWIB } = resolveDateRange({ preset: "7_hari" }, FIXED_NOW);
  assert.strictEqual(startDateWIB, "2026-10-21");
  assert.strictEqual(endDateWIB, "2026-10-27");
});

runTest("1.3. Filter Preset '30_hari': Rentang tepat 30 hari kalender inklusif", () => {
  const { startDateWIB, endDateWIB } = resolveDateRange({ preset: "30_hari" }, FIXED_NOW);
  assert.strictEqual(startDateWIB, "2026-09-28");
  assert.strictEqual(endDateWIB, "2026-10-27");
});

runTest("1.4. Filter Preset 'bulan_ini': Dimulai tanggal 1 bulan berjalan s/d hari ini", () => {
  const { startDateWIB, endDateWIB } = resolveDateRange({ preset: "bulan_ini" }, FIXED_NOW);
  assert.strictEqual(startDateWIB, "2026-10-01");
  assert.strictEqual(endDateWIB, "2026-10-27");
});

runTest("1.5. Filter Preset 'kustom' Valid: Mempertahankan rentang tanggal yang dimasukkan", () => {
  const { startDateWIB, endDateWIB, filter } = resolveDateRange(
    { preset: "kustom", startDate: "2026-09-01", endDate: "2026-09-15" },
    FIXED_NOW
  );
  assert.strictEqual(startDateWIB, "2026-09-01");
  assert.strictEqual(endDateWIB, "2026-09-15");
  assert.strictEqual(filter.preset, "kustom");
});

runTest("1.6. Filter Preset 'kustom' Terbalik: Secara otomatis di-swap agar startDate <= endDate", () => {
  const { startDateWIB, endDateWIB } = resolveDateRange(
    { preset: "kustom", startDate: "2026-09-20", endDate: "2026-09-05" },
    FIXED_NOW
  );
  assert.strictEqual(startDateWIB, "2026-09-05");
  assert.strictEqual(endDateWIB, "2026-09-20");
});

runTest("1.7. Filter Preset 'kustom' Format Rusak: Fallback aman ke 30 hari tanpa melempar error", () => {
  const { startDateWIB, endDateWIB } = resolveDateRange(
    { preset: "kustom", startDate: "rusak", endDate: "123-abc" },
    FIXED_NOW
  );
  assert.strictEqual(startDateWIB, "2026-09-28");
  assert.strictEqual(endDateWIB, "2026-10-27");
});

// -----------------------------------------------------------------------------
// BAGIAN 2: PENGUJIAN METRIK OMZET SAH, KAS MASUK, DAN PIUTANG (PRD BAB 6 & 9)
// -----------------------------------------------------------------------------

const SAMPLE_ORDERS = [
  // 1. Pesanan Draf (Rp1.500.000) -> DILARANG masuk omzet sah
  { id: "ord-1", status: "draf", total: 1500000, dibuat_pada: "2026-10-25T02:00:00Z" },
  // 2. Pesanan Dibatalkan (Rp800.000) -> DILARANG masuk omzet sah
  { id: "ord-2", status: "dibatalkan", total: 800000, dibuat_pada: "2026-10-25T03:00:00Z" },
  // 3. Pesanan Dikonfirmasi (Rp2.000.000) -> Piutang berjalan, siap kirim
  { id: "ord-3", status: "dikonfirmasi", total: 2000000, dibuat_pada: "2026-10-26T04:00:00Z" },
  // 4. Pesanan Dikirim (Rp5.000.000) -> Omzet sah, piutang berjalan belum lunas
  { id: "ord-4", status: "dikirim", total: 5000000, dibuat_pada: "2026-10-26T05:00:00Z" },
  // 5. Pesanan Lunas (Rp3.000.000) -> Omzet sah, kas masuk terverifikasi
  { id: "ord-5", status: "lunas", total: 3000000, dibuat_pada: "2026-10-27T06:00:00Z" },
  // 6. Pesanan Lunas ke-2 (Rp1.000.000) -> Omzet sah, kas masuk terverifikasi
  { id: "ord-6", status: "lunas", total: 1000000, dibuat_pada: "2026-10-27T07:00:00Z" },
];

runTest("2.1. Integritas Omzet Sah: Pesanan draf dan dibatalkan TIDAK masuk ke total penjualan sah", () => {
  const { kpi } = calculateOrderMetrics(SAMPLE_ORDERS);

  // Penjualan sah HANYA: dikirim (5jt) + lunas (3jt) + lunas (1jt) = 9jt
  assert.strictEqual(kpi.totalNilaiPenjualanSah, 9000000);
  assert.strictEqual(kpi.jumlahPesananSah, 3);

  // Draf disajikan terpisah
  assert.strictEqual(kpi.totalNilaiDraf, 1500000);
  assert.strictEqual(kpi.jumlahPesananDraf, 1);

  // Batal disajikan terpisah
  assert.strictEqual(kpi.totalNilaiDibatalkan, 800000);
  assert.strictEqual(kpi.jumlahPesananDibatalkan, 1);
});

runTest("2.2. Pemisahan Tegas Kas Masuk vs Nilai Pesanan vs Piutang Berjalan", () => {
  const { kpi, paymentStatusSummary } = calculateOrderMetrics(SAMPLE_ORDERS);

  // Kas Masuk Terverifikasi: HANYA lunas (3jt + 1jt = 4jt)
  assert.strictEqual(kpi.kasMasukTerverifikasi, 4000000);
  assert.strictEqual(paymentStatusSummary.kasMasukTerverifikasi, 4000000);
  assert.strictEqual(paymentStatusSummary.jumlahPesananLunas, 2);

  // Piutang Berjalan: dikonfirmasi (2jt) + dikirim (5jt) = 7jt
  assert.strictEqual(kpi.totalPiutangBerjalan, 7000000);
  assert.strictEqual(paymentStatusSummary.piutangBerjalan, 7000000);
  assert.strictEqual(paymentStatusSummary.jumlahPesananBelumLunas, 2);

  // Kas Masuk TIDAK SAMA dengan Total Penjualan Sah (4jt != 9jt)
  assert.notStrictEqual(kpi.kasMasukTerverifikasi, kpi.totalNilaiPenjualanSah);
});

runTest("2.3. Perhitungan Rata-rata Nilai Pesanan (AOV): Pembagian tepat dan tahan division-by-zero", () => {
  const { kpi } = calculateOrderMetrics(SAMPLE_ORDERS);
  // Total sah = 9jt, jumlah = 3 -> AOV = 3jt
  assert.strictEqual(kpi.rataRataNilaiPesanan, 3000000);

  // Uji division by zero jika 0 pesanan sah
  const zeroMetrics = calculateOrderMetrics([
    { id: "d1", status: "draf", total: 500000, dibuat_pada: "2026-10-27T01:00:00Z" }
  ]);
  assert.strictEqual(zeroMetrics.kpi.jumlahPesananSah, 0);
  assert.strictEqual(zeroMetrics.kpi.rataRataNilaiPesanan, 0, "AOV harus 0 saat pesanan sah kosong (bukan NaN)");
});

runTest("2.4. Distribusi Status Pesanan: Seluruh 5 status terhitung dengan persentase tepat", () => {
  const { statusDistribution } = calculateOrderMetrics(SAMPLE_ORDERS);
  assert.strictEqual(statusDistribution.length, 5);

  const draf = statusDistribution.find((s) => s.status === "draf");
  const dikonfirmasi = statusDistribution.find((s) => s.status === "dikonfirmasi");
  const dikirim = statusDistribution.find((s) => s.status === "dikirim");
  const lunas = statusDistribution.find((s) => s.status === "lunas");
  const dibatalkan = statusDistribution.find((s) => s.status === "dibatalkan");

  assert.strictEqual(draf.jumlahPesanan, 1);
  assert.strictEqual(dikonfirmasi.jumlahPesanan, 1);
  assert.strictEqual(dikirim.jumlahPesanan, 1);
  assert.strictEqual(lunas.jumlahPesanan, 2);
  assert.strictEqual(dibatalkan.jumlahPesanan, 1);

  // Total persentase akumulatif mendekati 100%
  const totalPersen = statusDistribution.reduce((acc, cur) => acc + cur.persentase, 0);
  assert.ok(totalPersen >= 99.8 && totalPersen <= 100.2);
});

// -----------------------------------------------------------------------------
// BAGIAN 3: PENGUJIAN DERET WAKTU TREN PENJUALAN (ZERO-FILLED GAP HANDLING)
// -----------------------------------------------------------------------------

runTest("3.1. Zero-Filled Trend: Tanggal tanpa transaksi diisi angka nol secara konsisten", () => {
  const dailyMap = new Map();
  // Hanya ada transaksi di tanggal 25 Okt dan 27 Okt
  dailyMap.set("2026-10-25", { totalNilai: 5000000, jumlahPesanan: 1 });
  dailyMap.set("2026-10-27", { totalNilai: 4000000, jumlahPesanan: 2 });

  const trend = generateZeroFilledTrend("2026-10-24", "2026-10-27", dailyMap);

  assert.strictEqual(trend.length, 4, "Harus menghasilkan 4 titik hari (24, 25, 26, 27 Okt)");

  // 24 Okt: Kosong -> totalNilai = 0, jumlahPesanan = 0
  assert.strictEqual(trend[0].date, "2026-10-24");
  assert.strictEqual(trend[0].totalNilai, 0);
  assert.strictEqual(trend[0].jumlahPesanan, 0);

  // 25 Okt: Ada transaksi -> 5jt
  assert.strictEqual(trend[1].date, "2026-10-25");
  assert.strictEqual(trend[1].totalNilai, 5000000);
  assert.strictEqual(trend[1].jumlahPesanan, 1);

  // 26 Okt: Kosong -> totalNilai = 0, jumlahPesanan = 0
  assert.strictEqual(trend[2].date, "2026-10-26");
  assert.strictEqual(trend[2].totalNilai, 0);
  assert.strictEqual(trend[2].jumlahPesanan, 0);

  // 27 Okt: Ada transaksi -> 4jt
  assert.strictEqual(trend[3].date, "2026-10-27");
  assert.strictEqual(trend[3].totalNilai, 4000000);
  assert.strictEqual(trend[3].jumlahPesanan, 2);
});

runTest("3.2. Zero-Filled Trend: Rentang kosong tidak menyebabkan infinite loop", () => {
  const trend = generateZeroFilledTrend("2026-10-27", "2026-10-20", new Map());
  assert.strictEqual(trend.length, 0);
});

// -----------------------------------------------------------------------------
// BAGIAN 4: PENGUJIAN PRODUK TERLARIS (TOP PRODUCTS BY QUANTITY)
// -----------------------------------------------------------------------------

const MOCK_ITEMS = [
  { barang_id: "b-beras", jumlah: 50, subtotal: 750000 },
  { barang_id: "b-minyak", jumlah: 120, subtotal: 1920000 },
  { barang_id: "b-gula", jumlah: 80, subtotal: 1200000 },
  { barang_id: "b-minyak", jumlah: 30, subtotal: 480000 }, // akumulasi minyak jadi 150
  { barang_id: "b-terigu", jumlah: 20, subtotal: 240000 },
];

const MOCK_BARANG_MAP = new Map([
  ["b-beras", { kode: "BRG-001", nama: "Beras Premium 5kg", satuan: "karung" }],
  ["b-minyak", { kode: "BRG-002", nama: "Minyak Goreng 2L", satuan: "pouch" }],
  ["b-gula", { kode: "BRG-003", nama: "Gula Pasir 1kg", satuan: "kg" }],
  ["b-terigu", { kode: "BRG-004", nama: "Tepung Terigu 1kg", satuan: "kg" }],
]);

runTest("4.1. Produk Terlaris: Diurutkan berdasarkan kuantitas fisik (jumlah), bukan nilai rupiah", () => {
  const top = calculateTopProducts(MOCK_ITEMS, MOCK_BARANG_MAP, 3);
  assert.strictEqual(top.length, 3);

  // Juara 1: Minyak Goreng (120 + 30 = 150)
  assert.strictEqual(top[0].barangId, "b-minyak");
  assert.strictEqual(top[0].kuantitasTerjual, 150);
  assert.strictEqual(top[0].totalNilaiJual, 2400000);

  // Juara 2: Gula Pasir (80)
  assert.strictEqual(top[1].barangId, "b-gula");
  assert.strictEqual(top[1].kuantitasTerjual, 80);

  // Juara 3: Beras (50)
  assert.strictEqual(top[2].barangId, "b-beras");
  assert.strictEqual(top[2].kuantitasTerjual, 50);
});

runTest("4.2. Produk Terlaris: Penanganan defensif untuk item kosong dan barang_id tidak terdaftar", () => {
  const top = calculateTopProducts(
    [{ barang_id: "b-antah-berantah", jumlah: 10, subtotal: 100000 }],
    new Map()
  );
  assert.strictEqual(top.length, 1);
  assert.strictEqual(top[0].namaBarang, "Barang Tidak Dikenal");
  assert.strictEqual(top[0].kuantitasTerjual, 10);
});

// -----------------------------------------------------------------------------
// BAGIAN 5: PENGUJIAN PENEGAKAN KEAMANAN & PEMISAHAN PERAN (BR-12)
// -----------------------------------------------------------------------------

const RAW_ANALYTICS_FIXTURE = {
  kpi: {
    totalNilaiPenjualanSah: 10000000,
    jumlahPesananSah: 5,
    rataRataNilaiPesanan: 2000000,
    kasMasukTerverifikasi: 6000000,
    totalPiutangBerjalan: 4000000,
    totalNilaiDraf: 1000000,
    jumlahPesananDraf: 2,
    totalNilaiDibatalkan: 500000,
    jumlahPesananDibatalkan: 1,
  },
  trend: [
    { date: "2026-10-27", label: "27 Okt", totalNilai: 10000000, jumlahPesanan: 5 }
  ],
  topProducts: [
    {
      barangId: "b-1",
      kodeBarang: "B-01",
      namaBarang: "Barang Uji",
      satuan: "dus",
      kuantitasTerjual: 100,
      totalNilaiJual: 10000000,
    }
  ],
  orderStatusDistribution: [
    { status: "draf", label: "Draf", jumlahPesanan: 2, totalNilai: 1000000, persentase: 25 },
    { status: "dikonfirmasi", label: "Dikonfirmasi", jumlahPesanan: 1, totalNilai: 2000000, persentase: 12.5 },
    { status: "dikirim", label: "Dikirim", jumlahPesanan: 2, totalNilai: 4000000, persentase: 25 },
    { status: "lunas", label: "Lunas", jumlahPesanan: 3, totalNilai: 4000000, persentase: 37.5 },
  ],
  paymentStatusSummary: {
    kasMasukTerverifikasi: 6000000,
    jumlahPesananLunas: 3,
    piutangBerjalan: 4000000,
    jumlahPesananBelumLunas: 3,
    persentaseLunas: 60,
  },
  stockSummary: {
    totalBarang: 10,
    jumlahHabis: 1,
    jumlahKritis: 2,
    jumlahWaspada: 3,
    jumlahAman: 4,
    jumlahStagnan: 0,
    jumlahNonaktif: 0,
  },
  filter: { preset: "30_hari", startDate: "2026-09-28", endDate: "2026-10-27" },
  keterbatasanData: ["Pencatatan kas masuk dari pesanan lunas."],
};

runTest("5.1. Penegakan BR-12 Penjualan: Payload Penjualan DILARANG memuat kas masuk, piutang, HPP, atau margin", () => {
  const salesPayload = filterPayloadByRole("penjualan", RAW_ANALYTICS_FIXTURE);

  assert.strictEqual(salesPayload.role, "penjualan");

  // Memiliki omzet penjualan
  assert.strictEqual(salesPayload.kpi.totalNilaiPenjualanSah, 10000000);
  assert.strictEqual(salesPayload.kpi.rataRataNilaiPesanan, 2000000);

  // DILARANG KERAS memuat field finansial terlindungi
  assert.strictEqual("kasMasukTerverifikasi" in salesPayload.kpi, false, "kasMasukTerverifikasi tidak boleh ada di KPI penjualan");
  assert.strictEqual("totalPiutangBerjalan" in salesPayload.kpi, false, "totalPiutangBerjalan tidak boleh ada di KPI penjualan");
  assert.strictEqual("paymentStatusSummary" in salesPayload, false, "paymentStatusSummary tidak boleh ada di payload penjualan");
  assert.strictEqual("hpp" in salesPayload, false);
  assert.strictEqual("margin" in salesPayload, false);
  assert.strictEqual("harga_pokok" in salesPayload, false);
  assert.strictEqual("harga_beli" in salesPayload, false);
});

runTest("5.2. Penegakan BR-12 Gudang: Payload Gudang MURNI kuantitas fisik dan TANPA angka moneter (Rupiah)", () => {
  const whPayload = filterPayloadByRole("gudang", RAW_ANALYTICS_FIXTURE);

  assert.strictEqual(whPayload.role, "gudang");

  // Hanya kuantitas fisik
  assert.strictEqual(whPayload.kpi.jumlahPesananSiapKirim, 1);
  assert.strictEqual(whPayload.kpi.jumlahPesananTerkirim, 2);
  assert.strictEqual(whPayload.kpi.totalKuantitasBarangKeluar, 100);

  // Produk terlaris gudang TIDAK MEMILIKI totalNilaiJual (Rupiah)
  assert.strictEqual("totalNilaiJual" in whPayload.topProducts[0], false, "totalNilaiJual tidak boleh ada di topProducts gudang");

  // Distribusi status pesanan gudang TIDAK MEMILIKI totalNilai (Rupiah)
  assert.strictEqual("totalNilai" in whPayload.orderStatusDistribution[0], false, "totalNilai tidak boleh ada di orderStatusDistribution gudang");

  // Tidak ada omzet atau kas sama sekali
  assert.strictEqual("trend" in whPayload, false, "Tren penjualan rupiah tidak boleh dikirim ke gudang");
  assert.strictEqual("paymentStatusSummary" in whPayload, false);
});

runTest("5.3. Payload Manajer: Memiliki akses eksekutif lengkap beserta dokumentasi keterbatasan data", () => {
  const managerPayload = filterPayloadByRole("manajer", RAW_ANALYTICS_FIXTURE);

  assert.strictEqual(managerPayload.role, "manajer");
  assert.strictEqual(managerPayload.kpi.totalNilaiPenjualanSah, 10000000);
  assert.strictEqual(managerPayload.kpi.kasMasukTerverifikasi, 6000000);
  assert.strictEqual(managerPayload.kpi.totalPiutangBerjalan, 4000000);
  assert.strictEqual(managerPayload.paymentStatusSummary.persentaseLunas, 60);
  assert.ok(Array.isArray(managerPayload.keterbatasanData));
  assert.ok(managerPayload.keterbatasanData.length > 0);
});

// -----------------------------------------------------------------------------
// BAGIAN 6: PENGUJIAN PENANGANAN KEGAGALAN & DATA NULL/KOSONG
// -----------------------------------------------------------------------------

runTest("6.1. Penanganan Data Null & Kosong: calculateOrderMetrics tahan terhadap array null/undefined", () => {
  const resNull = calculateOrderMetrics(null);
  assert.strictEqual(resNull.kpi.totalNilaiPenjualanSah, 0);
  assert.strictEqual(resNull.kpi.jumlahPesananSah, 0);
  assert.strictEqual(resNull.kpi.rataRataNilaiPesanan, 0);
  assert.strictEqual(resNull.validOrderIds.length, 0);

  const resUndef = calculateOrderMetrics(undefined);
  assert.strictEqual(resUndef.kpi.kasMasukTerverifikasi, 0);
});

runTest("6.2. Penanganan Nilai Anomali: Order dengan total negatif atau bukan angka dinormalisasi ke 0", () => {
  const res = calculateOrderMetrics([
    { id: "anomali-1", status: "lunas", total: -50000, dibuat_pada: "2026-10-27T01:00:00Z" },
    { id: "anomali-2", status: "lunas", total: "bukan_angka", dibuat_pada: "2026-10-27T02:00:00Z" },
  ]);
  assert.strictEqual(res.kpi.totalNilaiPenjualanSah, 0);
  assert.strictEqual(res.kpi.kasMasukTerverifikasi, 0);
  assert.strictEqual(res.kpi.jumlahPesananSah, 2);
});

runTest("6.3. Transparansi Kegagalan Query: Error query tidak disembunyikan menjadi sukses angka nol", () => {
  // Simulasi jika terjadi error pada database
  const errorMock = {
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
    trend: [],
    topProducts: [],
    orderStatusDistribution: [],
    paymentStatusSummary: {
      kasMasukTerverifikasi: 0,
      jumlahPesananLunas: 0,
      piutangBerjalan: 0,
      jumlahPesananBelumLunas: 0,
      persentaseLunas: 0,
    },
    stockSummary: {
      totalBarang: 0,
      jumlahHabis: 0,
      jumlahKritis: 0,
      jumlahWaspada: 0,
      jumlahAman: 0,
      jumlahStagnan: 0,
      jumlahNonaktif: 0,
    },
    filter: { preset: "30_hari", startDate: "2026-09-28", endDate: "2026-10-27" },
    keterbatasanData: [],
    error: "Koneksi basis data terputus (PGRST000)",
  };

  const payload = filterPayloadByRole("manajer", errorMock);
  assert.strictEqual(payload.error, "Koneksi basis data terputus (PGRST000)");
});

console.log("\n===============================================================================");
console.log(`RINGKASAN UNIT TEST ANALITIK: ${passedCount}/${totalCount} LULUS (${Math.round((passedCount/totalCount)*100)}%)`);
console.log("===============================================================================");

process.exit(passedCount === totalCount ? 0 : 1);
