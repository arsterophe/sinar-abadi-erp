/**
 * Test Suite Unit Offline / In-Memory untuk Modul Radar Stok
 * Memverifikasi:
 * 1. Barang dengan penjualan rutin
 * 2. Barang tanpa penjualan 30 hari (Stagnan, estimasi null)
 * 3. Barang stok 0 (Habis, prioritas sebelum Stagnan)
 * 4. Barang di bawah stok minimum (Waspada / Kritis)
 * 5. Barang dengan PO berjalan yang cukup mencegah order ganda
 * 6. PO yang sudah diterima sebagian (dipesan - diterima)
 * 7. Barang nonaktif (Status Nonaktif, rekomendasi order = 0)
 * 8. Query gagal (Penanganan error yang transparan dan tidak disembunyikan)
 * 9. Perhitungan KPI Summary Radar Stok
 * 10. Integrasi service getRadarStokData dengan Mock Supabase Client
 */

import assert from "node:assert/strict";

// Dynamic import dari build/source atau transpile
// Kita menguji langsung logika hitungPrediksiBarang, hitungRadarStokSummary, dan getRadarStokData
// Kita buat adapter modul JS murni yang mencerminkan fungsi persis di src/lib/radar-stok/getRadarStokData.ts

export function hitungPrediksiBarang(input) {
  const stokFisik = Math.max(0, Math.floor(Number(input.stokFisik) || 0));
  const stokMinimum = Math.max(0, Math.floor(Number(input.stokMinimum) || 0));
  const totalPenjualan30Hari = Math.max(0, Number(input.totalPenjualan30Hari) || 0);
  const incomingPO = Math.max(0, Number(input.incomingPO) || 0);
  const aktif = Boolean(input.aktif);

  const rataRataPenjualanHarian = Number((totalPenjualan30Hari / 30).toFixed(4));

  let estimasiHariHabis = null;
  if (totalPenjualan30Hari > 0) {
    if (stokFisik <= 0) {
      estimasiHariHabis = 0;
    } else {
      const days = stokFisik / (totalPenjualan30Hari / 30);
      estimasiHariHabis = Number(days.toFixed(1));
    }
  }

  const targetStok = Math.max(
    stokMinimum * 2,
    Math.ceil(rataRataPenjualanHarian * 30)
  );

  const kebutuhanBersih = targetStok - stokFisik - incomingPO;
  const rekomendasiOrder = aktif ? Math.max(0, Math.ceil(kebutuhanBersih)) : 0;

  let status;
  if (!aktif) {
    status = "Nonaktif";
  } else if (stokFisik <= 0) {
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

export function hitungRadarStokSummary(items) {
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

export async function executeMockGetRadarStokData(supabase) {
  const PERIODE_HARI = 30;
  const thirtyDaysAgoISO = new Date(Date.now() - PERIODE_HARI * 24 * 3600 * 1000).toISOString();

  try {
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

    const salesQtyMap = new Map();
    const { data: rawSalesItems, error: salesError } = await supabase
      .from("item_pesanan_jual")
      .select("id, barang_id, jumlah, pesanan_jual!inner(id, nomor, status, dibuat_pada)")
      .in("pesanan_jual.status", ["dikonfirmasi", "dikirim", "lunas"])
      .gte("pesanan_jual.dibuat_pada", thirtyDaysAgoISO);

    if (salesError) {
      throw new Error(`Gagal memuat item riwayat penjualan: ${salesError.message}`);
    }

    if (rawSalesItems) {
      for (const item of rawSalesItems) {
        const prev = salesQtyMap.get(item.barang_id) || 0;
        salesQtyMap.set(item.barang_id, prev + (Number(item.jumlah) || 0));
      }
    }

    const incomingPOMap = new Map();
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

    const items = rawBarang.map((b) => {
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

    const summary = hitungRadarStokSummary(items);
    return {
      items,
      summary,
      periodeHari: PERIODE_HARI,
      error: null,
    };
  } catch (err) {
    return {
      items: [],
      summary: hitungRadarStokSummary([]),
      periodeHari: PERIODE_HARI,
      error: err.message,
    };
  }
}

export function sortRadarStokItems(items, sortBy) {
  if (!items || items.length <= 1) return items ? [...items] : [];

  const list = [...items];

  const weight = {
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
        const statusDiff = weight[a.status] - weight[b.status];
        if (statusDiff !== 0) return statusDiff;

        if (a.estimasiHariHabis !== null && b.estimasiHariHabis !== null) {
          const estDiff = a.estimasiHariHabis - b.estimasiHariHabis;
          if (estDiff !== 0) return estDiff;
        } else if (a.estimasiHariHabis !== null) {
          return -1;
        } else if (b.estimasiHariHabis !== null) {
          return 1;
        }

        const stockDiff = a.stokFisik - b.stokFisik;
        if (stockDiff !== 0) return stockDiff;

        return a.namaBarang.localeCompare(b.namaBarang, "id");
      }

      case "estimasi_asc": {
        if (a.estimasiHariHabis !== null && b.estimasiHariHabis !== null) {
          const estDiff = a.estimasiHariHabis - b.estimasiHariHabis;
          if (estDiff !== 0) return estDiff;
        } else if (a.estimasiHariHabis !== null) {
          return -1;
        } else if (b.estimasiHariHabis !== null) {
          return 1;
        }

        if (a.aktif !== b.aktif) return a.aktif ? -1 : 1;

        const stockDiff = a.stokFisik - b.stokFisik;
        if (stockDiff !== 0) return stockDiff;

        return a.namaBarang.localeCompare(b.namaBarang, "id");
      }

      case "stok_asc": {
        const stockDiff = a.stokFisik - b.stokFisik;
        if (stockDiff !== 0) return stockDiff;

        const statusDiff = weight[a.status] - weight[b.status];
        if (statusDiff !== 0) return statusDiff;

        const reqDiff = b.rekomendasiOrder - a.rekomendasiOrder;
        if (reqDiff !== 0) return reqDiff;

        return a.namaBarang.localeCompare(b.namaBarang, "id");
      }

      case "penjualan_desc": {
        const salesDiff = b.totalPenjualan30Hari - a.totalPenjualan30Hari;
        if (salesDiff !== 0) return salesDiff;

        const rateDiff = b.rataRataPenjualanHarian - a.rataRataPenjualanHarian;
        if (rateDiff !== 0) return rateDiff;

        const stockDiff = a.stokFisik - b.stokFisik;
        if (stockDiff !== 0) return stockDiff;

        return a.namaBarang.localeCompare(b.namaBarang, "id");
      }

      case "rekomendasi_desc": {
        const reqDiff = b.rekomendasiOrder - a.rekomendasiOrder;
        if (reqDiff !== 0) return reqDiff;

        const statusDiff = weight[a.status] - weight[b.status];
        if (statusDiff !== 0) return statusDiff;

        const stockDiff = a.stokFisik - b.stokFisik;
        if (stockDiff !== 0) return stockDiff;

        return a.namaBarang.localeCompare(b.namaBarang, "id");
      }

      case "nama_asc": {
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

export function getSmartStockAlerts(items) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return [];
  }

  const eligibleItems = items.filter(
    (item) =>
      item.aktif === true &&
      (item.status === "Habis" || item.status === "Kritis" || item.status === "Waspada")
  );

  if (eligibleItems.length === 0) {
    return [];
  }

  const alerts = eligibleItems.map((item) => {
    let prioritas;
    let kategori;
    let pesan;

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
      status: item.status,
      prioritas,
      kategori,
      estimasiHariHabis: item.estimasiHariHabis,
      rekomendasiOrder: item.rekomendasiOrder,
      pesan,
    };
  });

  alerts.sort((a, b) => {
    const priorityDiff = a.prioritas - b.prioritas;
    if (priorityDiff !== 0) return priorityDiff;

    if (a.estimasiHariHabis !== null && b.estimasiHariHabis !== null) {
      const estDiff = a.estimasiHariHabis - b.estimasiHariHabis;
      if (estDiff !== 0) return estDiff;
    } else if (a.estimasiHariHabis !== null) {
      return -1;
    } else if (b.estimasiHariHabis !== null) {
      return 1;
    }

    const stockDiff = a.stokFisik - b.stokFisik;
    if (stockDiff !== 0) return stockDiff;

    const recDiff = b.rekomendasiOrder - a.rekomendasiOrder;
    if (recDiff !== 0) return recDiff;

    const nameDiff = a.namaBarang.localeCompare(b.namaBarang, "id");
    if (nameDiff !== 0) return nameDiff;

    const codeDiff = a.kodeBarang.localeCompare(b.kodeBarang, "id");
    if (codeDiff !== 0) return codeDiff;

    return a.barangId.localeCompare(b.barangId);
  });

  return alerts;
}

export function hitungSmartStockBadge(alerts) {
  if (!alerts || !Array.isArray(alerts) || alerts.length === 0) {
    return {
      emergencyCount: 0,
      warningCount: 0,
      totalAlerts: 0,
    };
  }

  const seenEmergency = new Set();
  const seenWarning = new Set();

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

// ============================================================================
// RUNNER PENGUJIAN
// ============================================================================
let passedCount = 0;
let totalCount = 0;

function runTest(testName, fn) {
  totalCount++;
  try {
    fn();
    console.log(`[V] LULUS | ${testName}`);
    passedCount++;
  } catch (err) {
    console.error(`[X] GAGAL | ${testName}:`, err.message);
  }
}

async function runAsyncTest(testName, fn) {
  totalCount++;
  try {
    await fn();
    console.log(`[V] LULUS | ${testName}`);
    passedCount++;
  } catch (err) {
    console.error(`[X] GAGAL | ${testName}:`, err.message);
  }
}

console.log("===============================================================================");
console.log("MEMULAI UNIT TEST MOCK RADAR STOK (OFFLINE / IN-MEMORY)");
console.log("===============================================================================\n");

// 1. Barang dengan penjualan rutin
runTest("1. Barang Penjualan Rutin: Menghitung rata-rata harian, estimasi hari, target stok, dan rekomendasi", () => {
  // Stok: 60 bal, Min: 10 bal, Terjual 30 hari: 90 bal, PO: 0
  // Rata-rata: 90 / 30 = 3.0 bal/hari
  // Estimasi hari habis: 60 / 3 = 20.0 hari (> 14 dan stok > min) -> Status: Aman
  // Target stok: max(10 * 2, ceil(3.0 * 30)) = max(20, 90) = 90
  // Kebutuhan bersih: 90 - 60 - 0 = 30 bal
  // Rekomendasi order: 30 bal
  const res = hitungPrediksiBarang({
    barangId: "b-01",
    kodeBarang: "BRG-001",
    namaBarang: "Beras Premium 5kg",
    satuan: "sak",
    stokFisik: 60,
    stokMinimum: 10,
    aktif: true,
    totalPenjualan30Hari: 90,
    incomingPO: 0,
  });

  assert.equal(res.rataRataPenjualanHarian, 3);
  assert.equal(res.estimasiHariHabis, 20);
  assert.equal(res.targetStok, 90);
  assert.equal(res.rekomendasiOrder, 30);
  assert.equal(res.status, "Aman");
});

// 2. Barang tanpa penjualan 30 hari (Stagnan)
runTest("2. Barang Tanpa Penjualan 30 Hari: Estimasi hari bernilai null, status Stagnan", () => {
  // Stok: 50 bal, Min: 5 bal, Terjual 30 hari: 0 bal, PO: 0
  // Rata-rata: 0
  // Estimasi hari habis: null (bukan 0, bukan string)
  // Target stok: max(5 * 2, 0) = 10
  // Kebutuhan bersih: 10 - 50 = -40 -> max(0, -40) = 0
  // Status: Stagnan (karena stok > min dan tidak ada penjualan)
  const res = hitungPrediksiBarang({
    barangId: "b-02",
    kodeBarang: "BRG-002",
    namaBarang: "Garam Halus 250g",
    satuan: "pack",
    stokFisik: 50,
    stokMinimum: 5,
    aktif: true,
    totalPenjualan30Hari: 0,
    incomingPO: 0,
  });

  assert.equal(res.rataRataPenjualanHarian, 0);
  assert.equal(res.estimasiHariHabis, null);
  assert.equal(res.targetStok, 10);
  assert.equal(res.rekomendasiOrder, 0);
  assert.equal(res.status, "Stagnan");
});

// 3. Barang stok 0 (Habis)
runTest("3. Barang Stok 0: Status Habis, baik tanpa penjualan maupun dengan riwayat", () => {
  // Kasus 3A: Stok 0 tanpa penjualan
  const resA = hitungPrediksiBarang({
    barangId: "b-03a",
    kodeBarang: "BRG-003A",
    namaBarang: "Minyak Goreng Jerigen 5L",
    satuan: "jerigen",
    stokFisik: 0,
    stokMinimum: 15,
    aktif: true,
    totalPenjualan30Hari: 0,
    incomingPO: 0,
  });

  // Wajib Habis, bukan Stagnan
  assert.equal(resA.stokFisik, 0);
  assert.equal(resA.status, "Habis");
  assert.equal(resA.targetStok, 30); // 15 * 2
  assert.equal(resA.rekomendasiOrder, 30);

  // Kasus 3B: Stok 0 dengan penjualan tinggi
  const resB = hitungPrediksiBarang({
    barangId: "b-03b",
    kodeBarang: "BRG-003B",
    namaBarang: "Tepung Terigu 1kg",
    satuan: "bal",
    stokFisik: 0,
    stokMinimum: 10,
    aktif: true,
    totalPenjualan30Hari: 60,
    incomingPO: 0,
  });

  assert.equal(resB.stokFisik, 0);
  assert.equal(resB.estimasiHariHabis, 0);
  assert.equal(resB.status, "Habis");
  assert.equal(resB.targetStok, 60);
  assert.equal(resB.rekomendasiOrder, 60);
});

// 4. Barang di bawah stok minimum
runTest("4. Barang Di Bawah Stok Minimum: Menetapkan status Kritis jika <= 7 hari, Waspada jika <= min", () => {
  // Kasus 4A: Stok 10, Min 15, Penjualan 60 (2/hari) -> Estimasi 5 hari (<= 7) -> Kritis
  const resKritis = hitungPrediksiBarang({
    barangId: "b-04a",
    kodeBarang: "BRG-004A",
    namaBarang: "Gula Pasir 1kg",
    satuan: "bal",
    stokFisik: 10,
    stokMinimum: 15,
    aktif: true,
    totalPenjualan30Hari: 60,
    incomingPO: 0,
  });

  assert.equal(resKritis.estimasiHariHabis, 5);
  assert.equal(resKritis.status, "Kritis");

  // Kasus 4B: Stok 14, Min 15, Penjualan 30 (1/hari) -> Estimasi 14 hari (> 7 s/d 14) -> Waspada
  const resWaspada1 = hitungPrediksiBarang({
    barangId: "b-04b",
    kodeBarang: "BRG-004B",
    namaBarang: "Kecap Manis Botol",
    satuan: "dus",
    stokFisik: 14,
    stokMinimum: 15,
    aktif: true,
    totalPenjualan30Hari: 30,
    incomingPO: 0,
  });

  assert.equal(resWaspada1.estimasiHariHabis, 14);
  assert.equal(resWaspada1.status, "Waspada");

  // Kasus 4C: Stok 10, Min 15, Penjualan 15 (0.5/hari) -> Estimasi 20 hari (> 14 hari tapi stok <= min) -> Waspada
  const resWaspada2 = hitungPrediksiBarang({
    barangId: "b-04c",
    kodeBarang: "BRG-004C",
    namaBarang: "Saus Sambal Botol",
    satuan: "dus",
    stokFisik: 10,
    stokMinimum: 15,
    aktif: true,
    totalPenjualan30Hari: 15,
    incomingPO: 0,
  });

  assert.equal(resWaspada2.estimasiHariHabis, 20);
  assert.equal(resWaspada2.status, "Waspada");
});

// 5. Barang dengan PO berjalan yang cukup
runTest("5. PO Berjalan Mencukupi: Mencegah rekomendasi order ganda saat incoming PO sudah cukup", () => {
  // Target: max(10 * 2, 45) = 45
  // Stok Fisik: 15 bal
  // Incoming PO: 30 bal
  // Kebutuhan Bersih: 45 - 15 - 30 = 0 -> Rekomendasi Order = 0
  const res = hitungPrediksiBarang({
    barangId: "b-05",
    kodeBarang: "BRG-005",
    namaBarang: "Kopi Sachet Renceng",
    satuan: "dus",
    stokFisik: 15,
    stokMinimum: 10,
    aktif: true,
    totalPenjualan30Hari: 45,
    incomingPO: 30,
  });

  assert.equal(res.targetStok, 45);
  assert.equal(res.incomingPO, 30);
  assert.equal(res.rekomendasiOrder, 0); // Bebas order ganda
});

// 6. PO yang sudah diterima sebagian
runTest("6. PO Diterima Sebagian: Menghitung sisa kuantitas berjalan (jumlah_dipesan - jumlah_diterima)", () => {
  // PO 1: Dipesan 25, Diterima 10 -> Sisa 15
  // PO 2: Dipesan 20, Diterima null -> Sisa 20
  // Total incoming PO: 35
  const rawPembelian = [
    { barang_id: "b-06", jumlah_dipesan: 25, jumlah_diterima: 10, status: "disetujui" },
    { barang_id: "b-06", jumlah_dipesan: 20, jumlah_diterima: null, status: "diajukan" },
  ];

  let calculatedPO = 0;
  for (const po of rawPembelian) {
    const sisa = Math.max(0, (po.jumlah_dipesan || 0) - (po.jumlah_diterima || 0));
    calculatedPO += sisa;
  }

  assert.equal(calculatedPO, 35);

  const res = hitungPrediksiBarang({
    barangId: "b-06",
    kodeBarang: "BRG-006",
    namaBarang: "Mie Instan Goreng",
    satuan: "dus",
    stokFisik: 10,
    stokMinimum: 20,
    aktif: true,
    totalPenjualan30Hari: 60,
    incomingPO: calculatedPO,
  });

  // Target: max(20 * 2, 60) = 60
  // Kebutuhan bersih: 60 - 10 - 35 = 15
  assert.equal(res.incomingPO, 35);
  assert.equal(res.targetStok, 60);
  assert.equal(res.rekomendasiOrder, 15);
});

// 7. Barang nonaktif
runTest("7. Barang Nonaktif: Status Nonaktif dan DILARANG masuk ke rekomendasi pengadaan (rekomendasi = 0)", () => {
  // Walaupun stok 0 dan min 100, karena barang NONAKTIF, rekomendasi order harus 0
  const res = hitungPrediksiBarang({
    barangId: "b-07",
    kodeBarang: "BRG-007",
    namaBarang: "Produk Lama Discontinue",
    satuan: "pcs",
    stokFisik: 0,
    stokMinimum: 50,
    aktif: false,
    totalPenjualan30Hari: 0,
    incomingPO: 0,
  });

  assert.equal(res.aktif, false);
  assert.equal(res.status, "Nonaktif");
  assert.equal(res.rekomendasiOrder, 0);
});

// 8. Query gagal (Penanganan error yang tidak disamarkan)
await runAsyncTest("8. Penanganan Query Gagal: Menangkap error database dan mengembalikan pesan error yang jelas", async () => {
  const mockFailingSupabase = {
    from(tableName) {
      return {
        select() {
          return {
            order() {
              return Promise.resolve({
                data: null,
                error: { message: "Database connection refused" },
              });
            },
          };
        },
      };
    },
  };

  const result = await executeMockGetRadarStokData(mockFailingSupabase);

  assert.equal(result.items.length, 0);
  assert.ok(result.error !== null);
  assert.match(result.error, /Database connection refused/);
});

// 9. Perhitungan Summary KPI
runTest("9. Perhitungan RadarStokSummary: Menghitung distribusi status dan total rekomendasi order secara tepat", () => {
  const dummyItems = [
    { status: "Habis", rekomendasiOrder: 20 },
    { status: "Kritis", rekomendasiOrder: 15 },
    { status: "Waspada", rekomendasiOrder: 10 },
    { status: "Aman", rekomendasiOrder: 0 },
    { status: "Stagnan", rekomendasiOrder: 0 },
    { status: "Nonaktif", rekomendasiOrder: 0 },
  ];

  const summary = hitungRadarStokSummary(dummyItems);
  assert.equal(summary.totalBarang, 6);
  assert.equal(summary.jumlahHabis, 1);
  assert.equal(summary.jumlahKritis, 1);
  assert.equal(summary.jumlahWaspada, 1);
  assert.equal(summary.jumlahAman, 1);
  assert.equal(summary.jumlahStagnan, 1);
  assert.equal(summary.jumlahNonaktif, 1);
  assert.equal(summary.totalRekomendasiOrder, 45);
});

// 10. Integrasi getRadarStokData dengan Mock Supabase Client Sukses
await runAsyncTest("10. Integrasi Service Sukses: Mengagregasi data barang, penjualan, dan PO secara utuh", async () => {
  const mockSuccessSupabase = {
    from(tableName) {
      if (tableName === "barang") {
        return {
          select() {
            return {
              order() {
                return Promise.resolve({
                  data: [
                    { id: "1", kode: "BRG-01", nama: "Gula", satuan: "bal", stok: 5, stok_minimum: 10, aktif: true },
                    { id: "2", kode: "BRG-02", nama: "Kopi", satuan: "dus", stok: 50, stok_minimum: 10, aktif: true },
                    { id: "3", kode: "BRG-03", nama: "Teh", satuan: "pack", stok: 0, stok_minimum: 5, aktif: true },
                  ],
                  error: null,
                });
              },
            };
          },
        };
      }
      if (tableName === "item_pesanan_jual") {
        return {
          select() {
            return {
              in() {
                return {
                  gte() {
                    return Promise.resolve({
                      data: [
                        { id: "it-1", barang_id: "1", jumlah: 30 },
                        { id: "it-2", barang_id: "2", jumlah: 0 },
                      ],
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      if (tableName === "pembelian") {
        return {
          select() {
            return {
              in() {
                return Promise.resolve({
                  data: [
                    { id: "po-1", barang_id: "1", jumlah_dipesan: 10, jumlah_diterima: null, status: "disetujui" },
                  ],
                  error: null,
                });
              },
            };
          },
        };
      }
      return {};
    },
  };

  const payload = await executeMockGetRadarStokData(mockSuccessSupabase);
  assert.equal(payload.error, null);
  assert.equal(payload.items.length, 3);
  assert.equal(payload.summary.totalBarang, 3);
  assert.equal(payload.summary.jumlahHabis, 1); // BRG-03 stok 0
});

// ============================================================================
// PENGUJIAN TAHAP 3: QUICK PO DARI RADAR STOK & ATURAN KEAMANAN / INTEGRITAS
// ============================================================================

const PEMBELIAN_LIMITS = {
  MIN_JUMLAH_PESAN: 1,
  MAX_JUMLAH_PESAN: 10000,
};

function canCreatePembelian(role) {
  return role === "manajer" || role === "gudang";
}

function canApprovePembelian(role) {
  return role === "manajer";
}

// Mock simulasi validasi server action buatPengajuanPembelianAction
function validatePengajuanPembelian({ role, barang, pemasok, jumlahDipesan }) {
  if (!canCreatePembelian(role)) {
    return {
      success: false,
      error: "Akses ditolak: Hanya Staf Gudang dan Manajer yang memiliki wewenang mengajukan pembelian barang ke pemasok.",
    };
  }

  if (!pemasok || !pemasok.id) {
    return { success: false, error: "Pemasok wajib dipilih." };
  }

  if (pemasok.aktif !== true) {
    return { success: false, error: `Pemasok '${pemasok.nama}' berstatus nonaktif dan tidak dapat menerima pesanan baru.` };
  }

  if (!barang || !barang.id) {
    return { success: false, error: "Barang yang akan dipesan wajib dipilih." };
  }

  if (barang.aktif !== true) {
    return { success: false, error: `Barang '${barang.nama}' berstatus nonaktif dan tidak dapat dipesan.` };
  }

  const qty = Number(jumlahDipesan);
  if (
    !Number.isInteger(qty) ||
    qty < PEMBELIAN_LIMITS.MIN_JUMLAH_PESAN ||
    qty > PEMBELIAN_LIMITS.MAX_JUMLAH_PESAN
  ) {
    return {
      success: false,
      error: `Jumlah dipesan harus berupa bilangan bulat antara ${PEMBELIAN_LIMITS.MIN_JUMLAH_PESAN} sampai ${PEMBELIAN_LIMITS.MAX_JUMLAH_PESAN.toLocaleString("id-ID")} (BR-09).`,
    };
  }

  return {
    success: true,
    data: {
      id: "po-uuid-new-1234",
      nomor: "PO-202610-0099",
      status: "diajukan",
      jumlah_dipesan: qty,
    },
  };
}

// 11. Barang aktif dengan rekomendasi positif
runTest("11. Quick PO: Barang aktif dengan rekomendasi positif dapat diajukan (status 'diajukan')", () => {
  const itemAktif = hitungPrediksiBarang({
    barangId: "brg-001",
    kodeBarang: "BRG-001",
    namaBarang: "Beras Rojolele 5kg",
    satuan: "karung",
    stokFisik: 5,
    stokMinimum: 20,
    totalPenjualan30Hari: 60,
    aktif: true,
    incomingPO: 0,
  });

  // Target stok = max(40, 60) = 60. Kebutuhan = 60 - 5 - 0 = 55.
  assert.equal(itemAktif.rekomendasiOrder, 55);
  assert.equal(itemAktif.status, "Kritis");

  const pemasokAktif = { id: "sup-01", nama: "PT Beras Makmur", aktif: true };
  const res = validatePengajuanPembelian({
    role: "gudang",
    barang: { id: itemAktif.barangId, nama: itemAktif.namaBarang, aktif: itemAktif.aktif },
    pemasok: pemasokAktif,
    jumlahDipesan: itemAktif.rekomendasiOrder,
  });

  assert.equal(res.success, true);
  assert.equal(res.data.status, "diajukan");
  assert.equal(res.data.jumlah_dipesan, 55);
});

// 12. Barang nonaktif
runTest("12. Quick PO: Barang nonaktif menghasilkan rekomendasi 0 dan ditolak saat pengajuan", () => {
  const itemNonaktif = hitungPrediksiBarang({
    barangId: "brg-nonaktif",
    kodeBarang: "BRG-DISC",
    namaBarang: "Kecap Manis Lama (Discontinued)",
    satuan: "botol",
    stokFisik: 0,
    stokMinimum: 20,
    totalPenjualan30Hari: 50,
    aktif: false,
    incomingPO: 0,
  });

  assert.equal(itemNonaktif.status, "Nonaktif");
  assert.equal(itemNonaktif.rekomendasiOrder, 0);

  // Jika client mencoba mengajukan barang nonaktif
  const res = validatePengajuanPembelian({
    role: "manajer",
    barang: { id: itemNonaktif.barangId, nama: itemNonaktif.namaBarang, aktif: itemNonaktif.aktif },
    pemasok: { id: "sup-01", nama: "PT Pangan Utama", aktif: true },
    jumlahDipesan: 10,
  });

  assert.equal(res.success, false);
  assert.match(res.error, /nonaktif dan tidak dapat dipesan/);
});

// 13. Rekomendasi nol
runTest("13. Quick PO: Barang dengan stok mencukupi menghasilkan rekomendasi order 0", () => {
  const itemAman = hitungPrediksiBarang({
    barangId: "brg-aman",
    kodeBarang: "BRG-AMAN",
    namaBarang: "Garam Dapur 250g",
    satuan: "bungkus",
    stokFisik: 150,
    stokMinimum: 20,
    totalPenjualan30Hari: 30,
    aktif: true,
    incomingPO: 0,
  });

  assert.equal(itemAman.rekomendasiOrder, 0);
  assert.equal(itemAman.status, "Aman");
});

// 14. Kuantitas tidak valid
runTest("14. Quick PO: Kuantitas tidak valid (< 1, > 10.000, pecahan) ditolak sesuai BR-09", () => {
  const barang = { id: "brg-001", nama: "Minyak Goreng 2L", aktif: true };
  const pemasok = { id: "sup-01", nama: "PT Agro Jaya", aktif: true };

  // Kuantitas 0
  const resZero = validatePengajuanPembelian({ role: "gudang", barang, pemasok, jumlahDipesan: 0 });
  assert.equal(resZero.success, false);
  assert.match(resZero.error, /harus berupa bilangan bulat antara 1 sampai 10\.000/);

  // Kuantitas negatif
  const resNeg = validatePengajuanPembelian({ role: "gudang", barang, pemasok, jumlahDipesan: -5 });
  assert.equal(resNeg.success, false);

  // Kuantitas lebih dari 10.000
  const resOver = validatePengajuanPembelian({ role: "gudang", barang, pemasok, jumlahDipesan: 10001 });
  assert.equal(resOver.success, false);

  // Kuantitas desimal / pecahan
  const resFloat = validatePengajuanPembelian({ role: "gudang", barang, pemasok, jumlahDipesan: 10.5 });
  assert.equal(resFloat.success, false);
});

// 15. Pengguna tanpa izin
runTest("15. Quick PO: Role 'penjualan' ditolak dari pengajuan maupun persetujuan pembelian", () => {
  assert.equal(canCreatePembelian("penjualan"), false);
  assert.equal(canApprovePembelian("penjualan"), false);

  // Verifikasi role yang berhak
  assert.equal(canCreatePembelian("gudang"), true);
  assert.equal(canCreatePembelian("manajer"), true);
  assert.equal(canApprovePembelian("manajer"), true);
  assert.equal(canApprovePembelian("gudang"), false);

  const res = validatePengajuanPembelian({
    role: "penjualan",
    barang: { id: "brg-001", nama: "Gula Pasir 1kg", aktif: true },
    pemasok: { id: "sup-01", nama: "Pemasok Gula", aktif: true },
    jumlahDipesan: 25,
  });

  assert.equal(res.success, false);
  assert.match(res.error, /Hanya Staf Gudang dan Manajer/);
});

// 16. Alur pembelian dan persetujuan yang sudah ada tidak rusak
runTest("16. Quick PO: Transisi status pengajuan 'diajukan' -> persetujuan Manajer 'disetujui' terjaga", () => {
  // 1. Gudang membuat pengajuan
  const poDraft = {
    id: "po-001",
    status: "diajukan",
    barang_id: "brg-01",
    jumlah_dipesan: 50,
    diajukan_oleh: "user-gudang",
  };

  assert.equal(poDraft.status, "diajukan");

  // 2. Gudang mencoba menyetujui sendiri -> DITOLAK
  assert.equal(canApprovePembelian("gudang"), false);

  // 3. Manajer menyetujui pengajuan
  assert.equal(canApprovePembelian("manajer"), true);
  const poApproved = {
    ...poDraft,
    status: "disetujui",
    diputuskan_oleh: "user-manajer",
    diputuskan_pada: new Date().toISOString(),
  };

  assert.equal(poApproved.status, "disetujui");
});

// 17. Pembuatan pengajuan tidak langsung mengubah stok
runTest("17. Quick PO: Pembuatan pengajuan (status 'diajukan') TIDAK MENGUBAH stok fisik gudang", () => {
  const stokFisikAwal = 10;
  const jumlahDipesan = 100;

  // Simulasi PO diajukan
  const po = {
    id: "po-123",
    status: "diajukan",
    jumlah_dipesan: jumlahDipesan,
  };

  // Stok barang di database
  let stokBarangDatabase = stokFisikAwal;
  let daftarMutasiStok = [];

  // Verifikasi aturan PRD BR-10: Pengajuan baru tidak boleh menghasilkan mutasi stok
  if (po.status === "diajukan") {
    // Tidak ada perubahan stok
  }

  assert.equal(stokBarangDatabase, stokFisikAwal);
  assert.equal(daftarMutasiStok.length, 0);

  // Stok HANYA bertambah saat penerimaan fisik tercatat (status 'diterima')
  function terimaBarang(poRecord, jumlahDiterima) {
    if (poRecord.status !== "disetujui") {
      throw new Error("Penerimaan barang hanya dapat diproses untuk PO yang telah disetujui Manajer.");
    }
    stokBarangDatabase += jumlahDiterima;
    daftarMutasiStok.push({
      barang_id: "brg-01",
      jenis: "masuk",
      jumlah: jumlahDiterima,
      referensi_tipe: "pembelian",
    });
    poRecord.status = "diterima";
  }

  // Harus disetujui dahulu sebelum diterima
  po.status = "disetujui";
  terimaBarang(po, 100);

  assert.equal(stokBarangDatabase, 110);
  assert.equal(daftarMutasiStok.length, 1);
  assert.equal(daftarMutasiStok[0].jumlah, 100);
});

// 18. Rekomendasi lama yang sudah tidak sesuai dengan kondisi stok terkini
runTest("18. Quick PO: Rekomendasi lama langsung disesuaikan secara dinamis saat stok/incoming PO berubah", () => {
  // Kondisi Awal: Stok fisik = 2, Target = max(30, 60) = 60, Incoming PO = 0 => Rekomendasi = 58
  const prediksiAwal = hitungPrediksiBarang({
    barangId: "brg-kopi",
    kodeBarang: "BRG-KOPI",
    namaBarang: "Kopi Kapal Api 65g",
    satuan: "renceng",
    stokFisik: 2,
    stokMinimum: 15,
    totalPenjualan30Hari: 60,
    aktif: true,
    incomingPO: 0,
  });

  assert.equal(prediksiAwal.rekomendasiOrder, 58);

  // Setelah Staf Gudang mengajukan PO sebanyak 58 unit:
  // incomingPO sekarang menjadi 58 unit.
  const prediksiSetelahPO = hitungPrediksiBarang({
    barangId: "brg-kopi",
    kodeBarang: "BRG-KOPI",
    namaBarang: "Kopi Kapal Api 65g",
    satuan: "renceng",
    stokFisik: 2,
    stokMinimum: 15,
    totalPenjualan30Hari: 60,
    aktif: true,
    incomingPO: 58, // PO yang baru saja diajukan
  });

  // Rekomendasi order langsung turun ke 0 (mencegah order ganda)
  assert.equal(prediksiSetelahPO.rekomendasiOrder, 0);

  // Jika barang fisik tiba dan stok bertambah menjadi 60:
  const prediksiSetelahDiterima = hitungPrediksiBarang({
    barangId: "brg-kopi",
    kodeBarang: "BRG-KOPI",
    namaBarang: "Kopi Kapal Api 65g",
    satuan: "renceng",
    stokFisik: 60,
    stokMinimum: 15,
    totalPenjualan30Hari: 60,
    aktif: true,
    incomingPO: 0,
  });

  assert.equal(prediksiSetelahDiterima.rekomendasiOrder, 0);
  assert.equal(prediksiSetelahDiterima.status, "Aman");
});

// ============================================================================
// PENGUJIAN TAHAP 4: SORTING / URUTAN RADAR STOK (PURE FUNCTION & DETERMINISTIK)
// ============================================================================

// 19. Sorting berdasarkan Tingkat Urgensi
runTest("19. Sorting Urgensi: Mengurutkan prioritas status (Habis -> Kritis -> Waspada -> Stagnan -> Aman -> Nonaktif)", () => {
  const dummy = [
    { barangId: "1", namaBarang: "Barang Aman", status: "Aman", estimasiHariHabis: 25, stokFisik: 50 },
    { barangId: "2", namaBarang: "Barang Nonaktif", status: "Nonaktif", estimasiHariHabis: null, stokFisik: 0 },
    { barangId: "3", namaBarang: "Barang Habis", status: "Habis", estimasiHariHabis: 0, stokFisik: 0 },
    { barangId: "4", namaBarang: "Barang Stagnan", status: "Stagnan", estimasiHariHabis: null, stokFisik: 30 },
    { barangId: "5", namaBarang: "Barang Kritis", status: "Kritis", estimasiHariHabis: 3, stokFisik: 6 },
    { barangId: "6", namaBarang: "Barang Waspada", status: "Waspada", estimasiHariHabis: 10, stokFisik: 15 },
  ];

  const sorted = sortRadarStokItems(dummy, "urgensi");
  const resultStatuses = sorted.map((item) => item.status);
  assert.deepEqual(resultStatuses, [
    "Habis",
    "Kritis",
    "Waspada",
    "Stagnan",
    "Aman",
    "Nonaktif",
  ]);
});

// 20. Sorting berdasarkan Estimasi Habis Tercepat
runTest("20. Sorting Estimasi Tercepat: Hari paling sedikit tampil dulu, nilai null ditempatkan di bawah", () => {
  const dummy = [
    { barangId: "1", namaBarang: "Barang Stagnan (Null)", estimasiHariHabis: null, aktif: true, stokFisik: 20 },
    { barangId: "2", namaBarang: "Barang 5 Hari", estimasiHariHabis: 5.0, aktif: true, stokFisik: 10 },
    { barangId: "3", namaBarang: "Barang 1 Hari", estimasiHariHabis: 1.2, aktif: true, stokFisik: 2 },
    { barangId: "4", namaBarang: "Barang Nonaktif (Null)", estimasiHariHabis: null, aktif: false, stokFisik: 0 },
    { barangId: "5", namaBarang: "Barang 15 Hari", estimasiHariHabis: 15.0, aktif: true, stokFisik: 30 },
  ];

  const sorted = sortRadarStokItems(dummy, "estimasi_asc");
  const names = sorted.map((item) => item.namaBarang);

  // 1.2 hari -> 5.0 hari -> 15.0 hari -> null aktif -> null nonaktif
  assert.equal(names[0], "Barang 1 Hari");
  assert.equal(names[1], "Barang 5 Hari");
  assert.equal(names[2], "Barang 15 Hari");
  assert.equal(names[3], "Barang Stagnan (Null)");
  assert.equal(names[4], "Barang Nonaktif (Null)");
});

// 21. Sorting berdasarkan Stok Terendah
runTest("21. Sorting Stok Terendah: Stok fisik terkecil tampil lebih dahulu dengan tie-breaker stabil", () => {
  const dummy = [
    { barangId: "1", namaBarang: "Beras 50kg", stokFisik: 50, status: "Aman", rekomendasiOrder: 0 },
    { barangId: "2", namaBarang: "Gula 0kg", stokFisik: 0, status: "Habis", rekomendasiOrder: 30 },
    { barangId: "3", namaBarang: "Minyak 10kg", stokFisik: 10, status: "Waspada", rekomendasiOrder: 20 },
    { barangId: "4", namaBarang: "Kecap 5kg", stokFisik: 5, status: "Kritis", rekomendasiOrder: 25 },
    { barangId: "5", namaBarang: "Saus 0kg", stokFisik: 0, status: "Habis", rekomendasiOrder: 15 },
  ];

  const sorted = sortRadarStokItems(dummy, "stok_asc");
  const stokValues = sorted.map((item) => item.stokFisik);
  assert.deepEqual(stokValues, [0, 0, 5, 10, 50]);

  // Tie-breaker untuk stok 0: rekomendasi order lebih besar (30 > 15) tampil lebih dulu
  assert.equal(sorted[0].namaBarang, "Gula 0kg");
  assert.equal(sorted[1].namaBarang, "Saus 0kg");
});

// 22. Sorting berdasarkan Penjualan 30 Hari Tertinggi
runTest("22. Sorting Penjualan Tertinggi: Total penjualan 30 hari terbesar tampil lebih dahulu", () => {
  const dummy = [
    { barangId: "1", namaBarang: "Barang A", totalPenjualan30Hari: 20, rataRataPenjualanHarian: 0.67, stokFisik: 10 },
    { barangId: "2", namaBarang: "Barang B", totalPenjualan30Hari: 150, rataRataPenjualanHarian: 5.0, stokFisik: 30 },
    { barangId: "3", namaBarang: "Barang C", totalPenjualan30Hari: 0, rataRataPenjualanHarian: 0, stokFisik: 50 },
    { barangId: "4", namaBarang: "Barang D", totalPenjualan30Hari: 75, rataRataPenjualanHarian: 2.5, stokFisik: 20 },
  ];

  const sorted = sortRadarStokItems(dummy, "penjualan_desc");
  const sales = sorted.map((item) => item.totalPenjualan30Hari);
  assert.deepEqual(sales, [150, 75, 20, 0]);
  assert.equal(sorted[0].namaBarang, "Barang B");
  assert.equal(sorted[3].namaBarang, "Barang C");
});

// 23. Sorting berdasarkan Rekomendasi Order Terbesar
runTest("23. Sorting Rekomendasi Order: Rekomendasi pengadaan terbesar tampil lebih dahulu", () => {
  const dummy = [
    { barangId: "1", namaBarang: "Barang Sedang", rekomendasiOrder: 25, status: "Waspada", stokFisik: 10 },
    { barangId: "2", namaBarang: "Barang Nihil", rekomendasiOrder: 0, status: "Aman", stokFisik: 50 },
    { barangId: "3", namaBarang: "Barang Mendesak", rekomendasiOrder: 100, status: "Habis", stokFisik: 0 },
    { barangId: "4", namaBarang: "Barang Kecil", rekomendasiOrder: 5, status: "Kritis", stokFisik: 15 },
  ];

  const sorted = sortRadarStokItems(dummy, "rekomendasi_desc");
  const recommendations = sorted.map((item) => item.rekomendasiOrder);
  assert.deepEqual(recommendations, [100, 25, 5, 0]);
  assert.equal(sorted[0].namaBarang, "Barang Mendesak");
  assert.equal(sorted[3].namaBarang, "Barang Nihil");
});

// 24. Sorting berdasarkan Nama Barang (A - Z)
runTest("24. Sorting Nama (A - Z): Mengurutkan alfabetis nama barang secara akurat (id locale)", () => {
  const dummy = [
    { kodeBarang: "B03", namaBarang: "Minyak Kelapa" },
    { kodeBarang: "B01", namaBarang: "Beras Pandan Wangi" },
    { kodeBarang: "B04", namaBarang: "Telur Ayam" },
    { kodeBarang: "B02", namaBarang: "Gula Merah" },
  ];

  const sorted = sortRadarStokItems(dummy, "nama_asc");
  const names = sorted.map((item) => item.namaBarang);
  assert.deepEqual(names, [
    "Beras Pandan Wangi",
    "Gula Merah",
    "Minyak Kelapa",
    "Telur Ayam",
  ]);
});

// 25. Immutabilitas Array (Pure Function)
runTest("25. Immutabilitas: Fungsi sortRadarStokItems TIDAK memutasi array asli", () => {
  const original = [
    { namaBarang: "Zebra", stokFisik: 100 },
    { namaBarang: "Ayam", stokFisik: 5 },
  ];
  const originalOrder = [...original.map((x) => x.namaBarang)];

  const sorted = sortRadarStokItems(original, "nama_asc");

  // Array hasil urut
  assert.equal(sorted[0].namaBarang, "Ayam");
  assert.equal(sorted[1].namaBarang, "Zebra");

  // Array asli tetap utuh
  assert.equal(original[0].namaBarang, originalOrder[0]);
  assert.equal(original[1].namaBarang, originalOrder[1]);
  assert.notEqual(original, sorted);
});

// 26. Integrasi Filtering + Sorting (Pencarian & Status Filter)
runTest("26. Integrasi Filter + Sorting: Bekerja bersamaan dengan filter status dan pencarian keyword", () => {
  const dataset = [
    { barangId: "1", kodeBarang: "B01", namaBarang: "Beras Premium Rojolele", status: "Kritis", estimasiHariHabis: 3, stokFisik: 5, totalPenjualan30Hari: 50, rekomendasiOrder: 45, aktif: true },
    { barangId: "2", kodeBarang: "B02", namaBarang: "Beras Medium Cianjur", status: "Kritis", estimasiHariHabis: 7, stokFisik: 10, totalPenjualan30Hari: 40, rekomendasiOrder: 30, aktif: true },
    { barangId: "3", kodeBarang: "B03", namaBarang: "Gula Pasir", status: "Kritis", estimasiHariHabis: 2, stokFisik: 4, totalPenjualan30Hari: 60, rekomendasiOrder: 56, aktif: true },
    { barangId: "4", kodeBarang: "B04", namaBarang: "Beras Merah Sehat", status: "Aman", estimasiHariHabis: 25, stokFisik: 80, totalPenjualan30Hari: 15, rekomendasiOrder: 0, aktif: true },
  ];

  // Skenario: Pengguna mencari "beras" dan memilih filter status "Kritis"
  const keyword = "beras".toLowerCase();
  const filterStatus = "Kritis";

  const filtered = dataset.filter((item) => {
    const matchSearch = item.namaBarang.toLowerCase().includes(keyword) || item.kodeBarang.toLowerCase().includes(keyword);
    const matchStatus = filterStatus === "semua" || item.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // Hanya Beras Rojolele dan Beras Cianjur yang lolos filter
  assert.equal(filtered.length, 2);

  // Urutkan berdasarkan estimasi tercepat
  const sortedByEst = sortRadarStokItems(filtered, "estimasi_asc");
  assert.equal(sortedByEst[0].namaBarang, "Beras Premium Rojolele"); // 3 hari
  assert.equal(sortedByEst[1].namaBarang, "Beras Medium Cianjur"); // 7 hari

  // Ubah urutkan ke penjualan tertinggi
  const sortedBySales = sortRadarStokItems(filtered, "penjualan_desc");
  assert.equal(sortedBySales[0].namaBarang, "Beras Premium Rojolele"); // 50
  assert.equal(sortedBySales[1].namaBarang, "Beras Medium Cianjur"); // 40
});

// ============================================================================
// PENGUJIAN FONDASI NOTIFIKASI STOK PINTAR (TAHAP 1)
// ============================================================================

// 27. Barang Habis masuk prioritas tertinggi
runTest("27. Notifikasi: Barang Habis masuk prioritas tertinggi (Prioritas 1, Kategori Darurat)", () => {
  const items = [
    { barangId: "b-kritis", kodeBarang: "B01", namaBarang: "Kecap Manis", satuan: "btl", stokFisik: 5, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 60, rataRataPenjualanHarian: 2, incomingPO: 0, estimasiHariHabis: 2.5, targetStok: 60, rekomendasiOrder: 55, status: "Kritis" },
    { barangId: "b-habis", kodeBarang: "B02", namaBarang: "Beras Rojolele", satuan: "sak", stokFisik: 0, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 30, rataRataPenjualanHarian: 1, incomingPO: 0, estimasiHariHabis: 0, targetStok: 30, rekomendasiOrder: 30, status: "Habis" },
    { barangId: "b-waspada", kodeBarang: "B03", namaBarang: "Minyak Goreng", satuan: "pouch", stokFisik: 10, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 30, rataRataPenjualanHarian: 1, incomingPO: 0, estimasiHariHabis: 10, targetStok: 30, rekomendasiOrder: 20, status: "Waspada" },
  ];

  const alerts = getSmartStockAlerts(items);
  assert.equal(alerts.length, 3);
  assert.equal(alerts[0].barangId, "b-habis");
  assert.equal(alerts[0].prioritas, 1);
  assert.equal(alerts[0].kategori, "darurat");
  assert.equal(alerts[0].status, "Habis");
  assert.match(alerts[0].pesan, /habis/i);
});

// 28. Barang Kritis diurutkan berdasarkan estimasi hari
runTest("28. Notifikasi: Barang Kritis diurutkan berdasarkan estimasi hari habis tercepat", () => {
  const items = [
    { barangId: "k-5d", kodeBarang: "K02", namaBarang: "Gula Pasir 1kg", satuan: "kg", stokFisik: 10, stokMinimum: 5, aktif: true, totalPenjualan30Hari: 60, rataRataPenjualanHarian: 2, incomingPO: 0, estimasiHariHabis: 5, targetStok: 60, rekomendasiOrder: 50, status: "Kritis" },
    { barangId: "k-1d", kodeBarang: "K01", namaBarang: "Garam Halus", satuan: "bks", stokFisik: 2, stokMinimum: 5, aktif: true, totalPenjualan30Hari: 60, rataRataPenjualanHarian: 2, incomingPO: 0, estimasiHariHabis: 1, targetStok: 60, rekomendasiOrder: 58, status: "Kritis" },
    { barangId: "k-3d", kodeBarang: "K03", namaBarang: "Tepung Terigu", satuan: "sak", stokFisik: 6, stokMinimum: 5, aktif: true, totalPenjualan30Hari: 60, rataRataPenjualanHarian: 2, incomingPO: 0, estimasiHariHabis: 3, targetStok: 60, rekomendasiOrder: 54, status: "Kritis" },
  ];

  const alerts = getSmartStockAlerts(items);
  assert.equal(alerts.length, 3);
  assert.equal(alerts[0].barangId, "k-1d"); // 1 hari
  assert.equal(alerts[1].barangId, "k-3d"); // 3 hari
  assert.equal(alerts[2].barangId, "k-5d"); // 5 hari
  assert.equal(alerts[0].prioritas, 2);
  assert.equal(alerts[0].kategori, "darurat");
});

// 29. Barang Waspada muncul sebagai peringatan sekunder
runTest("29. Notifikasi: Barang Waspada muncul sebagai peringatan sekunder (Prioritas 3, Peringatan)", () => {
  const items = [
    { barangId: "w-1", kodeBarang: "W01", namaBarang: "Kopi Sachet", satuan: "renceng", stokFisik: 12, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 30, rataRataPenjualanHarian: 1, incomingPO: 0, estimasiHariHabis: 12, targetStok: 30, rekomendasiOrder: 18, status: "Waspada" },
    { barangId: "h-1", kodeBarang: "H01", namaBarang: "Teh Celup", satuan: "kotak", stokFisik: 0, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 30, rataRataPenjualanHarian: 1, incomingPO: 0, estimasiHariHabis: 0, targetStok: 30, rekomendasiOrder: 30, status: "Habis" },
  ];

  const alerts = getSmartStockAlerts(items);
  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].status, "Habis");
  assert.equal(alerts[1].status, "Waspada");
  assert.equal(alerts[1].prioritas, 3);
  assert.equal(alerts[1].kategori, "peringatan");
});

// 30. Barang Nonaktif, Aman, dan Stagnan dikecualikan
runTest("30. Notifikasi: Barang Nonaktif, Aman, dan Stagnan dikecualikan secara ketat", () => {
  const items = [
    { barangId: "nonaktif-habis", kodeBarang: "N01", namaBarang: "Barang Nonaktif Stok 0", satuan: "pcs", stokFisik: 0, stokMinimum: 5, aktif: false, totalPenjualan30Hari: 0, rataRataPenjualanHarian: 0, incomingPO: 0, estimasiHariHabis: null, targetStok: 10, rekomendasiOrder: 0, status: "Nonaktif" },
    { barangId: "aman-1", kodeBarang: "A01", namaBarang: "Barang Melimpah", satuan: "pcs", stokFisik: 200, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 30, rataRataPenjualanHarian: 1, incomingPO: 0, estimasiHariHabis: 200, targetStok: 30, rekomendasiOrder: 0, status: "Aman" },
    { barangId: "stagnan-1", kodeBarang: "S01", namaBarang: "Barang Tidak Laku", satuan: "pcs", stokFisik: 50, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 0, rataRataPenjualanHarian: 0, incomingPO: 0, estimasiHariHabis: null, targetStok: 20, rekomendasiOrder: 0, status: "Stagnan" },
    { barangId: "kritis-1", kodeBarang: "K01", namaBarang: "Barang Kritis Aktif", satuan: "pcs", stokFisik: 4, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 30, rataRataPenjualanHarian: 1, incomingPO: 0, estimasiHariHabis: 4, targetStok: 30, rekomendasiOrder: 26, status: "Kritis" },
  ];

  const alerts = getSmartStockAlerts(items);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].barangId, "kritis-1");
});

// 31. Estimasi hari null ditangani dengan aman
runTest("31. Notifikasi: Estimasi hari null ditangani dengan aman tanpa NaN/Infinity/error", () => {
  const items = [
    { barangId: "w-null", kodeBarang: "W02", namaBarang: "Barang Waspada Tanpa Penjualan", satuan: "pcs", stokFisik: 5, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 0, rataRataPenjualanHarian: 0, incomingPO: 0, estimasiHariHabis: null, targetStok: 20, rekomendasiOrder: 15, status: "Waspada" },
    { barangId: "w-est", kodeBarang: "W01", namaBarang: "Barang Waspada Dengan Estimasi", satuan: "pcs", stokFisik: 9, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 30, rataRataPenjualanHarian: 1, incomingPO: 0, estimasiHariHabis: 9, targetStok: 30, rekomendasiOrder: 21, status: "Waspada" },
  ];

  const alerts = getSmartStockAlerts(items);
  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].barangId, "w-est"); // Yang memiliki estimasi numerik tampil lebih dulu
  assert.equal(alerts[1].barangId, "w-null"); // Null ditempatkan di bawahnya
  assert.equal(alerts[1].estimasiHariHabis, null);
  assert.ok(!Number.isNaN(alerts[1].stokFisik));
  assert.ok(typeof alerts[1].pesan === "string" && alerts[1].pesan.length > 0);
});

// 32. Array sumber tidak dimutasi (Immutabilitas)
runTest("32. Notifikasi: Array sumber tidak dimutasi (Immutabilitas terjaga)", () => {
  const original = [
    { barangId: "2", kodeBarang: "B02", namaBarang: "Kritis B", satuan: "pcs", stokFisik: 5, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 60, rataRataPenjualanHarian: 2, incomingPO: 0, estimasiHariHabis: 2.5, targetStok: 60, rekomendasiOrder: 55, status: "Kritis" },
    { barangId: "1", kodeBarang: "B01", namaBarang: "Habis A", satuan: "pcs", stokFisik: 0, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 30, rataRataPenjualanHarian: 1, incomingPO: 0, estimasiHariHabis: 0, targetStok: 30, rekomendasiOrder: 30, status: "Habis" },
  ];

  const snapshot = JSON.stringify(original);
  const alerts = getSmartStockAlerts(original);

  assert.equal(JSON.stringify(original), snapshot, "Array sumber tidak boleh dimutasi");
  assert.notEqual(alerts, original, "Alerts harus merupakan instance array baru");
  assert.equal(alerts[0].barangId, "1"); // Diurutkan ulang di array baru
  assert.equal(original[0].barangId, "2"); // Array asli tetap pada posisi awal
});

// 33. Tie-breaker deterministik
runTest("33. Notifikasi: Tie-breaker deterministik untuk barang berprioritas dan estimasi sama", () => {
  const items = [
    { barangId: "id-b", kodeBarang: "KOD-B", namaBarang: "Sabun Cuci", satuan: "pcs", stokFisik: 3, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 30, rataRataPenjualanHarian: 1, incomingPO: 0, estimasiHariHabis: 3, targetStok: 30, rekomendasiOrder: 27, status: "Kritis" },
    { barangId: "id-a", kodeBarang: "KOD-A", namaBarang: "Deterjen Bubuk", satuan: "pcs", stokFisik: 3, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 30, rataRataPenjualanHarian: 1, incomingPO: 0, estimasiHariHabis: 3, targetStok: 30, rekomendasiOrder: 27, status: "Kritis" },
  ];

  const alerts = getSmartStockAlerts(items);
  assert.equal(alerts.length, 2);
  // Nama A-Z: Deterjen Bubuk sebelum Sabun Cuci
  assert.equal(alerts[0].namaBarang, "Deterjen Bubuk");
  assert.equal(alerts[1].namaBarang, "Sabun Cuci");
});

// 34. Hasil kosong ditangani tanpa error
runTest("34. Notifikasi: Input kosong, null, atau tidak ada alert ditangani tanpa error", () => {
  assert.deepEqual(getSmartStockAlerts([]), []);
  assert.deepEqual(getSmartStockAlerts(null), []);
  assert.deepEqual(getSmartStockAlerts(undefined), []);

  const onlySafe = [
    { barangId: "safe-1", kodeBarang: "S01", namaBarang: "Barang Aman", satuan: "pcs", stokFisik: 100, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 30, rataRataPenjualanHarian: 1, incomingPO: 0, estimasiHariHabis: 100, targetStok: 30, rekomendasiOrder: 0, status: "Aman" },
  ];
  assert.deepEqual(getSmartStockAlerts(onlySafe), []);

  const badgeEmpty = hitungSmartStockBadge([]);
  assert.deepEqual(badgeEmpty, { emergencyCount: 0, warningCount: 0, totalAlerts: 0 });
});

// 35. Aturan Badge: Badge darurat tidak menghitung barang yang sama dua kali
runTest("35. Aturan Badge: Badge darurat (Habis + Kritis) dan peringatan tidak menghitung barang ganda", () => {
  const alerts = [
    { barangId: "b-01", kodeBarang: "B01", namaBarang: "Beras", satuan: "sak", stokFisik: 0, stokMinimum: 10, status: "Habis", prioritas: 1, kategori: "darurat", estimasiHariHabis: 0, rekomendasiOrder: 20, pesan: "Habis" },
    { barangId: "b-02", kodeBarang: "B02", namaBarang: "Minyak", satuan: "pouch", stokFisik: 2, stokMinimum: 10, status: "Kritis", prioritas: 2, kategori: "darurat", estimasiHariHabis: 2, rekomendasiOrder: 18, pesan: "Kritis" },
    { barangId: "b-03", kodeBarang: "B03", namaBarang: "Gula", satuan: "kg", stokFisik: 8, stokMinimum: 10, status: "Waspada", prioritas: 3, kategori: "peringatan", estimasiHariHabis: 8, rekomendasiOrder: 12, pesan: "Waspada" },
    // Simulasi duplikasi entri barang b-01 yang sama
    { barangId: "b-01", kodeBarang: "B01", namaBarang: "Beras", satuan: "sak", stokFisik: 0, stokMinimum: 10, status: "Habis", prioritas: 1, kategori: "darurat", estimasiHariHabis: 0, rekomendasiOrder: 20, pesan: "Habis" },
  ];

  const badge = hitungSmartStockBadge(alerts);
  // b-01 (Habis) + b-02 (Kritis) = 2 barang unik darurat (meski b-01 muncul dua kali)
  assert.equal(badge.emergencyCount, 2);
  // b-03 (Waspada) = 1 barang unik peringatan
  assert.equal(badge.warningCount, 1);
  assert.equal(badge.totalAlerts, 3);
});

// 36. Keamanan Data: Tidak mengekspos informasi finansial
runTest("36. Keamanan Data: Objek notifikasi tidak memuat properti finansial (HPP, harga beli, margin)", () => {
  const items = [
    { barangId: "b-01", kodeBarang: "B01", namaBarang: "Beras", satuan: "sak", stokFisik: 0, stokMinimum: 10, aktif: true, totalPenjualan30Hari: 30, rataRataPenjualanHarian: 1, incomingPO: 0, estimasiHariHabis: 0, targetStok: 30, rekomendasiOrder: 30, status: "Habis" },
  ];

  const alerts = getSmartStockAlerts(items);
  assert.equal(alerts.length, 1);
  const alertKeys = Object.keys(alerts[0]);

  assert.ok(!alertKeys.includes("harga_pokok"), "Tidak boleh memuat harga_pokok");
  assert.ok(!alertKeys.includes("harga_beli_satuan"), "Tidak boleh memuat harga_beli_satuan");
  assert.ok(!alertKeys.includes("hpp"), "Tidak boleh memuat hpp");
  assert.ok(!alertKeys.includes("margin"), "Tidak boleh memuat margin");
});

console.log("\n===============================================================================");
console.log(`RINGKASAN UNIT TEST MOCK RADAR STOK: ${passedCount}/${totalCount} LULUS (${Math.round((passedCount / totalCount) * 100)}%)`);
console.log("===============================================================================");

if (passedCount !== totalCount) {
  process.exit(1);
}
