import { SupabaseClient } from "@supabase/supabase-js";
import {
  LaporanDataPayload,
  WeeklySalesMargin,
  ItemMarginReport,
  CustomerAgingReceivable,
  LaporanSummary,
} from "@/types/laporan";

/**
 * Mengambil dan mengagregasi data aktual untuk Laporan Finansial dan Operasional Manajer.
 * Sesuai PRD Bab 7 & 9 serta Penegakan Keamanan Finansial BR-12.
 *
 * MENGGUNAKAN DATA AKTUAL DARI SUPABASE TANPA DATA PALSU / HARDCODED:
 * 1. Ringkasan KPI: Omzet & Margin bulan berjalan, Total Piutang berjalan, Valuasi Persediaan.
 * 2. Grafik Mingguan: Omzet dan Margin 8 minggu terakhir (pesanan berstatus dikirim & lunas).
 * 3. Profitabilitas Barang: Kuantitas, Omzet, HPP, Margin nominal & persentase.
 * 4. Umur Tagihan Piutang (Aging Receivables): Belum jatuh tempo, lewat 1-30 hari, lewat >30 hari.
 */
export async function getLaporanData(
  supabase: SupabaseClient
): Promise<LaporanDataPayload> {
  const nowWIB = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const todayDateOnly = new Date(nowWIB.getFullYear(), nowWIB.getMonth(), nowWIB.getDate());
  const tanggalLaporan = nowWIB.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  try {
    // 1. Ambil data katalog pelanggan
    const { data: rawPelanggan, error: pelangganErr } = await supabase
      .from("pelanggan")
      .select("id, kode, nama_toko, batas_kredit, termin_hari, aktif");

    if (pelangganErr) {
      throw new Error(`Gagal memuat katalog pelanggan: ${pelangganErr.message}`);
    }

    // 2. Ambil data katalog barang (dengan HPP khusus manajer)
    // Sesuai pola BR-12, coba RPC get_katalog_barang_manajer atau select langsung
    let rawBarang: Array<{
      id: string;
      kode: string;
      nama: string;
      satuan: string;
      harga_pokok?: number | null;
      harga_jual?: number;
      stok?: number;
      aktif?: boolean;
    }> = [];

    const { data: rpcBarang, error: rpcErr } = await supabase.rpc(
      "get_katalog_barang_manajer"
    );

    if (!rpcErr && Array.isArray(rpcBarang)) {
      rawBarang = rpcBarang;
    } else {
      const { data: fallbackBarang, error: fbErr } = await supabase
        .from("barang")
        .select("id, kode, nama, satuan, harga_pokok, harga_jual, stok, aktif");
      if (!fbErr && fallbackBarang) {
        rawBarang = fallbackBarang;
      }
    }

    const barangMap = new Map<string, { kode: string; nama: string; satuan: string; hpp: number }>();
    let totalNilaiPersediaan = 0;
    for (const b of rawBarang) {
      const hpp = Number(b.harga_pokok) || 0;
      const stok = Number(b.stok) || 0;
      barangMap.set(b.id, {
        kode: b.kode,
        nama: b.nama,
        satuan: b.satuan,
        hpp,
      });
      if (b.aktif !== false) {
        totalNilaiPersediaan += stok * hpp;
      }
    }

    // 3. Ambil data pesanan jual relevan (dikonfirmasi, dikirim, lunas)
    const { data: rawOrders, error: ordersErr } = await supabase
      .from("pesanan_jual")
      .select("id, nomor, pelanggan_id, status, total, dikirim_pada, jatuh_tempo, dilunasi_pada, dibuat_pada")
      .in("status", ["dikonfirmasi", "dikirim", "lunas"])
      .order("dibuat_pada", { ascending: false });

    if (ordersErr) {
      throw new Error(`Gagal memuat transaksi pesanan jual: ${ordersErr.message}`);
    }

    const completedOrderIds = (rawOrders || [])
      .filter((o) => o.status === "dikirim" || o.status === "lunas")
      .map((o) => o.id);

    // 4. Ambil item baris pesanan jual untuk pesanan yang dikirim & lunas
    // Kolom eksplisit: hpp_satuan hanya boleh dibaca peran manajer (BR-12)
    let rawItems: Array<{
      id: string;
      pesanan_jual_id: string;
      barang_id: string;
      jumlah: number;
      harga_satuan: number;
      diskon_persen: number;
      subtotal: number;
      hpp_satuan?: number | null;
    }> = [];

    if (completedOrderIds.length > 0) {
      const { data: itemsData, error: itemsErr } = await supabase
        .from("v_item_pesanan_jual")
        .select("id, pesanan_jual_id, barang_id, jumlah, harga_satuan, diskon_persen, subtotal, hpp_satuan")
        .in("pesanan_jual_id", completedOrderIds);

      if (itemsErr) {
        console.error(
          `[getLaporanData] Gagal mengambil v_item_pesanan_jual: ${itemsErr.message} (kode: ${itemsErr.code})`
        );
      } else if (itemsData) {
        rawItems = itemsData;
      }
    }

    // Peta item per pesanan jual id untuk kalkulasi margin pesanan & mingguan
    const itemsByOrderMap = new Map<string, typeof rawItems>();
    for (const it of rawItems) {
      const list = itemsByOrderMap.get(it.pesanan_jual_id) || [];
      list.push(it);
      itemsByOrderMap.set(it.pesanan_jual_id, list);
    }

    // =========================================================================
    // A. KALKULASI RINGKASAN KPI BULAN BERJALAN (WIB)
    // =========================================================================
    const curYear = nowWIB.getFullYear();
    const curMonth = nowWIB.getMonth();

    let omzetBulanIni = 0;
    let marginBulanIni = 0;
    let pesananTerkirimLunasBulanIni = 0;
    let totalPiutangBerjalan = 0;

    for (const ord of rawOrders || []) {
      const total = Number(ord.total) || 0;

      // Piutang Berjalan: status 'dikonfirmasi' atau 'dikirim' (belum lunas)
      if (ord.status === "dikonfirmasi" || ord.status === "dikirim") {
        totalPiutangBerjalan += total;
      }

      // Omzet & Margin Bulan Ini: pesanan dikirim/lunas pada bulan berjalan
      if (ord.status === "dikirim" || ord.status === "lunas") {
        const orderDateStr = ord.dikirim_pada || ord.dibuat_pada;
        if (orderDateStr) {
          const d = new Date(orderDateStr);
          if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
            omzetBulanIni += total;
            pesananTerkirimLunasBulanIni += 1;

            const orderItems = itemsByOrderMap.get(ord.id) || [];
            for (const item of orderItems) {
              const subtotal = Number(item.subtotal) || 0;
              const hpp = item.hpp_satuan != null
                ? Number(item.hpp_satuan)
                : (barangMap.get(item.barang_id)?.hpp || 0);
              const marginItem = subtotal - (hpp * (Number(item.jumlah) || 0));
              marginBulanIni += marginItem;
            }
          }
        }
      }
    }

    const marginPersenBulanIni = omzetBulanIni > 0
      ? (marginBulanIni / omzetBulanIni) * 100
      : 0;

    const summary: LaporanSummary = {
      omzetBulanIni,
      marginBulanIni,
      marginPersenBulanIni,
      totalPiutangBerjalan,
      pesananTerkirimLunasBulanIni,
      totalNilaiPersediaan,
    };

    // =========================================================================
    // B. KALKULASI TREN MINGGUAN (8 MINGGU TERAKHIR)
    // =========================================================================
    // Hitung jendela 8 minggu kalender (Senin - Minggu)
    const weeklyBuckets: Array<{
      weekKey: string;
      weekLabel: string;
      start: Date;
      end: Date;
      omzet: number;
      margin: number;
      jumlahPesanan: number;
    }> = [];

    // Cari hari Senin minggu berjalan
    const currentDayOfWeek = nowWIB.getDay(); // 0 = Minggu, 1 = Senin, ...
    const distToMonday = (currentDayOfWeek + 6) % 7;
    const currentWeekMonday = new Date(todayDateOnly);
    currentWeekMonday.setDate(todayDateOnly.getDate() - distToMonday);
    currentWeekMonday.setHours(0, 0, 0, 0);

    for (let i = 7; i >= 0; i--) {
      const wStart = new Date(currentWeekMonday);
      wStart.setDate(currentWeekMonday.getDate() - (i * 7));
      wStart.setHours(0, 0, 0, 0);

      const wEnd = new Date(wStart);
      wEnd.setDate(wStart.getDate() + 6);
      wEnd.setHours(23, 59, 59, 999);

      const startLabel = wStart.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
      const endLabel = wEnd.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
      const weekLabel = `${startLabel} - ${endLabel}`;

      weeklyBuckets.push({
        weekKey: `W-${i}`,
        weekLabel: i === 0 ? `${weekLabel} (Minggu Ini)` : weekLabel,
        start: wStart,
        end: wEnd,
        omzet: 0,
        margin: 0,
        jumlahPesanan: 0,
      });
    }

    // Masukkan pesanan dikirim & lunas ke dalam bucket mingguan
    for (const ord of rawOrders || []) {
      if (ord.status !== "dikirim" && ord.status !== "lunas") continue;
      const orderDateStr = ord.dikirim_pada || ord.dibuat_pada;
      if (!orderDateStr) continue;
      const orderDate = new Date(orderDateStr);

      for (const bucket of weeklyBuckets) {
        if (orderDate >= bucket.start && orderDate <= bucket.end) {
          const total = Number(ord.total) || 0;
          bucket.omzet += total;
          bucket.jumlahPesanan += 1;

          const orderItems = itemsByOrderMap.get(ord.id) || [];
          for (const it of orderItems) {
            const subtotal = Number(it.subtotal) || 0;
            const hpp = it.hpp_satuan != null
              ? Number(it.hpp_satuan)
              : (barangMap.get(it.barang_id)?.hpp || 0);
            const marginItem = subtotal - (hpp * (Number(it.jumlah) || 0));
            bucket.margin += marginItem;
          }
          break;
        }
      }
    }

    const weeklyTrend: WeeklySalesMargin[] = weeklyBuckets.map((b) => ({
      weekKey: b.weekKey,
      weekLabel: b.weekLabel,
      startDate: b.start.toISOString().split("T")[0],
      endDate: b.end.toISOString().split("T")[0],
      omzet: b.omzet,
      margin: b.margin,
      marginPersen: b.omzet > 0 ? (b.margin / b.omzet) * 100 : 0,
      jumlahPesanan: b.jumlahPesanan,
    }));

    // =========================================================================
    // C. KALKULASI MARGIN PER BARANG (PROFITABILITAS KATALOG)
    // =========================================================================
    const itemMarginMap = new Map<string, {
      kuantitasTerjual: number;
      totalOmzet: number;
      totalHpp: number;
      totalMargin: number;
    }>();

    for (const it of rawItems) {
      const prev = itemMarginMap.get(it.barang_id) || {
        kuantitasTerjual: 0,
        totalOmzet: 0,
        totalHpp: 0,
        totalMargin: 0,
      };

      const qty = Number(it.jumlah) || 0;
      const subtotal = Number(it.subtotal) || 0;
      const hpp = it.hpp_satuan != null
        ? Number(it.hpp_satuan)
        : (barangMap.get(it.barang_id)?.hpp || 0);
      const totalHpp = hpp * qty;
      const margin = subtotal - totalHpp;

      prev.kuantitasTerjual += qty;
      prev.totalOmzet += subtotal;
      prev.totalHpp += totalHpp;
      prev.totalMargin += margin;

      itemMarginMap.set(it.barang_id, prev);
    }

    const itemMarginList: ItemMarginReport[] = [];
    for (const [barangId, stats] of itemMarginMap.entries()) {
      const bInfo = barangMap.get(barangId);
      itemMarginList.push({
        barangId,
        kode: bInfo?.kode || "-",
        nama: bInfo?.nama || "Barang Terhapus",
        satuan: bInfo?.satuan || "pcs",
        kuantitasTerjual: stats.kuantitasTerjual,
        totalOmzet: stats.totalOmzet,
        totalHpp: stats.totalHpp,
        totalMargin: stats.totalMargin,
        marginPersen: stats.totalOmzet > 0 ? (stats.totalMargin / stats.totalOmzet) * 100 : 0,
      });
    }

    // Default urutan: Total Margin tertinggi ke terendah
    itemMarginList.sort((a, b) => b.totalMargin - a.totalMargin);

    // =========================================================================
    // D. KALKULASI AGING PIUTANG PER PELANGGAN (UMUR TAGIHAN)
    // =========================================================================
    const agingMap = new Map<string, {
      totalPiutang: number;
      belumJatuhTempo: number;
      lewat1Sampai30Hari: number;
      lewatLebih30Hari: number;
      jumlahNota: number;
    }>();

    for (const ord of rawOrders || []) {
      // Hanya pesanan yang belum lunas (status dikonfirmasi atau dikirim)
      if (ord.status !== "dikonfirmasi" && ord.status !== "dikirim") continue;

      const total = Number(ord.total) || 0;
      const prev = agingMap.get(ord.pelanggan_id) || {
        totalPiutang: 0,
        belumJatuhTempo: 0,
        lewat1Sampai30Hari: 0,
        lewatLebih30Hari: 0,
        jumlahNota: 0,
      };

      prev.totalPiutang += total;
      prev.jumlahNota += 1;

      // Bandingkan tanggal jatuh tempo dengan hari ini (WIB)
      if (ord.jatuh_tempo) {
        const datePart = ord.jatuh_tempo.split("T")[0];
        const [y, m, d] = datePart.split("-").map(Number);
        const dueDate = new Date(y, m - 1, d);
        const diffMs = todayDateOnly.getTime() - dueDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 3600 * 24));

        if (diffDays <= 0) {
          // Belum jatuh tempo / masih dalam masa kredit lancar
          prev.belumJatuhTempo += total;
        } else if (diffDays <= 30) {
          // Lewat jatuh tempo 1 - 30 hari
          prev.lewat1Sampai30Hari += total;
        } else {
          // Lewat jatuh tempo lebih dari 30 hari
          prev.lewatLebih30Hari += total;
        }
      } else {
        // Fallback jika tidak ada jatuh_tempo (misal status dikonfirmasi dan belum dikirim):
        // sesuai aturan bisnis BR-05, masa kredit baru dihitung sejak barang dikirim.
        prev.belumJatuhTempo += total;
      }

      agingMap.set(ord.pelanggan_id, prev);
    }

    const customerAgingList: CustomerAgingReceivable[] = [];
    for (const p of rawPelanggan || []) {
      const stats = agingMap.get(p.id);
      const totalPiutang = stats?.totalPiutang || 0;
      const batasKredit = Number(p.batas_kredit) || 0;
      const sisaKredit = batasKredit - totalPiutang;

      let statusKredit: "aman" | "mendekati_limit" | "melebihi_limit" = "aman";
      if (totalPiutang > batasKredit) {
        statusKredit = "melebihi_limit";
      } else if (batasKredit > 0 && totalPiutang >= 0.8 * batasKredit) {
        statusKredit = "mendekati_limit";
      }

      // Hanya masukkan pelanggan yang memiliki piutang berjalan atau aktif
      if (totalPiutang > 0 || p.aktif) {
        customerAgingList.push({
          pelangganId: p.id,
          namaToko: p.nama_toko,
          terminHari: Number(p.termin_hari) || 0,
          terminBayar: Number(p.termin_hari) || 0,
          batasKredit,
          totalPiutang,
          belumJatuhTempo: stats?.belumJatuhTempo || 0,
          lewat1Sampai30Hari: stats?.lewat1Sampai30Hari || 0,
          lewatLebih30Hari: stats?.lewatLebih30Hari || 0,
          sisaKredit,
          statusKredit,
          jumlahNotaPiutang: stats?.jumlahNota || 0,
        });
      }
    }

    // Urutkan pelanggan berdasarkan piutang tertinggi atau yang menunggak
    customerAgingList.sort((a, b) => {
      // Prioritaskan yang lewat >30 hari, lalu lewat 1-30 hari, lalu total piutang
      if (b.lewatLebih30Hari !== a.lewatLebih30Hari) {
        return b.lewatLebih30Hari - a.lewatLebih30Hari;
      }
      return b.totalPiutang - a.totalPiutang;
    });

    return {
      summary,
      weeklyTrend,
      itemMarginList,
      customerAgingList,
      tanggalLaporan,
      error: null,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Error pada getLaporanData:", errorMsg);
    return {
      summary: {
        omzetBulanIni: 0,
        marginBulanIni: 0,
        marginPersenBulanIni: 0,
        totalPiutangBerjalan: 0,
        pesananTerkirimLunasBulanIni: 0,
        totalNilaiPersediaan: 0,
      },
      weeklyTrend: [],
      itemMarginList: [],
      customerAgingList: [],
      tanggalLaporan,
      error: errorMsg,
    };
  }
}
