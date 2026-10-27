import { SupabaseClient } from "@supabase/supabase-js";

export interface PesananSalesItem {
  id: string;
  nomor: string;
  namaToko: string;
  tanggal: string;
  total: number;
  status: string;
}

export interface PelangganStatusKreditItem {
  id: string;
  kode: string;
  namaToko: string;
  telepon: string;
  alamat: string;
  batasKredit: number;
  piutangBerjalan: number;
  persentaseKredit: number;
  adaTagihanLewatTempo: boolean;
  statusKredit: "Lewat Tempo" | "Mendekati Limit" | "Lancar";
}

export interface SalesDashboardMetrics {
  pesananHariIni: number;
  totalPelangganAktif: number;
  pelangganLewatJatuhTempo: number;
  pesananDrafSaya: number;
  antreanPesananList: PesananSalesItem[];
  statusPelangganList: PelangganStatusKreditItem[];
  error?: string | null;
}

/**
 * Mengonversi tanggal / timestamp ke format YYYY-MM-DD dalam zona waktu Indonesia Barat (WIB / Asia/Jakarta).
 * Mencegah pergeseran tanggal kalender yang disebabkan oleh penggunaan toISOString() berbasis UTC (GMT+0).
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
 * Mengambil metrik aktual Dashboard Penjualan langsung dari Supabase.
 *
 * MENEGAKKAN ATURAN BISNIS & KEAMANAN (PRD Bab 4, 6, 7 & 9, BR-03, BR-05, BR-12):
 * 1. Pesanan Hari Ini & Draf: Dibatasi hanya pada pesanan milik staf penjualan yang sedang login (PRD Bab 7).
 *    Dihitung menggunakan tanggal lokal zona waktu Asia/Jakarta (WIB) yang konsisten.
 * 2. Pelanggan Toko Aktif: Jumlah total toko mitra terdaftar dengan status aktif = true (global distributor).
 * 3. Evaluasi Risiko Toko & Batas Kredit (BR-05): Mengagregasi SELURUH transaksi relevan toko pelanggan
 *    (status 'dikonfirmasi' & 'dikirim') di tingkat distributor tanpa membatasi siapa staf yang menginput,
 *    karena status blokir pesanan jatuh tempo dan batas plafon kredit melekat pada entitas toko pelanggan.
 * 4. KEAMANAN BR-12: Kolom harga_pokok, harga_beli_satuan, dan margin DILARANG KERAS disertakan.
 */
export async function getSalesDashboardMetrics(
  supabase: SupabaseClient,
  userId: string,
  isManager: boolean = false
): Promise<SalesDashboardMetrics> {
  try {
    // Tanggal hari ini dalam kalender lokal Indonesia Barat (WIB)
    const todayWIBStr = getWIBDateString(new Date());

    // 1. Ambil data katalog pelanggan aktif beserta batas kreditnya
    const { data: rawPelanggan, error: pelangganError } = await supabase
      .from("pelanggan")
      .select("id, kode, nama_toko, telepon, alamat, batas_kredit, termin_hari, aktif")
      .order("nama_toko", { ascending: true });

    if (pelangganError) {
      console.error("Gagal mengambil data pelanggan untuk sales:", pelangganError.message);
      return createEmptySalesMetrics(pelangganError.message);
    }

    const pelangganList = rawPelanggan || [];
    const pelangganAktifList = pelangganList.filter((p) => p.aktif === true);
    const totalPelangganAktif = pelangganAktifList.length;

    const pelangganMap = new Map<string, { kode: string; nama_toko: string; telepon: string; alamat: string; batas_kredit: number }>();
    for (const p of pelangganList) {
      pelangganMap.set(p.id, {
        kode: p.kode || "-",
        nama_toko: p.nama_toko,
        telepon: p.telepon || "-",
        alamat: p.alamat || "-",
        batas_kredit: Number(p.batas_kredit) || 0,
      });
    }

    // 2. QUERY 1: Pesanan Pribadi Milik Sales yang Sedang Login (atau semua jika peran Manajer)
    // Digunakan untuk metrik personal sales: Pesanan Hari Ini, Pesanan Draf Saya, dan Antrean Terkini
    let queryPesananPribadi = supabase
      .from("pesanan_jual")
      .select("id, nomor, pelanggan_id, status, total, dibuat_oleh, dibuat_pada, dikirim_pada, jatuh_tempo")
      .order("dibuat_pada", { ascending: false });

    if (!isManager && userId) {
      queryPesananPribadi = queryPesananPribadi.eq("dibuat_oleh", userId);
    }

    const { data: rawPesananPribadi, error: pesananPribadiError } = await queryPesananPribadi;

    if (pesananPribadiError) {
      console.error("Gagal mengambil pesanan pribadi untuk sales:", pesananPribadiError.message);
      return createEmptySalesMetrics(pesananPribadiError.message);
    }

    const pesananPribadiList = rawPesananPribadi || [];

    let pesananHariIni = 0;
    let pesananDrafSaya = 0;
    const antreanPesananList: PesananSalesItem[] = [];

    for (const ord of pesananPribadiList) {
      const ordTotal = Number(ord.total) || 0;
      // Konversi tanggal dibuat ke zona waktu WIB untuk mencocokkan hari ini secara presisi
      const tglDibuatWIB = getWIBDateString(ord.dibuat_pada);

      if (tglDibuatWIB === todayWIBStr) {
        pesananHariIni += 1;
      }

      if (ord.status === "draf") {
        pesananDrafSaya += 1;
      }

      const pel = pelangganMap.get(ord.pelanggan_id);
      antreanPesananList.push({
        id: ord.id,
        nomor: ord.nomor,
        namaToko: pel?.nama_toko || "Toko Mitra",
        tanggal: tglDibuatWIB || "-",
        total: ordTotal,
        status: ord.status,
      });
    }

    // 3. QUERY 2: Data Risiko Piutang & Jatuh Tempo Global Pelanggan (Sesuai Aturan Bisnis BR-05)
    // PENEGASAN ATURAN BISNIS BR-05:
    // Plafon kredit dan blokir akibat keterlambatan jatuh tempo melekat pada toko pelanggan,
    // bukan pada siapa sales yang melayani. Seluruh pesanan aktif ('dikonfirmasi' dan 'dikirim')
    // dari seluruh transaksi distributor harus diperhitungkan agar staf penjualan tidak salah
    // mengonfirmasi pesanan untuk toko yang sudah menunggak atau melebihi limit kredit.
    // KEAMANAN BR-12: Kolom harga_pokok / hpp_satuan TIDAK diminta.
    const { data: rawPesananRisiko, error: pesananRisikoError } = await supabase
      .from("pesanan_jual")
      .select("id, pelanggan_id, status, total, jatuh_tempo")
      .in("status", ["dikonfirmasi", "dikirim"]);

    if (pesananRisikoError) {
      console.warn("Peringatan query risiko piutang global pesanan_jual:", pesananRisikoError.message);
    }

    const pesananRisikoList = rawPesananRisiko || [];

    // Peta piutang berjalan dan tunggakan per pelanggan global
    const piutangPerPelanggan = new Map<string, number>();
    const tokoLewatTempoSet = new Set<string>();

    for (const ord of pesananRisikoList) {
      const ordTotal = Number(ord.total) || 0;

      // Akumulasi piutang berjalan toko pelanggan: status 'dikonfirmasi' atau 'dikirim' (BR-05)
      const curPiutang = piutangPerPelanggan.get(ord.pelanggan_id) || 0;
      piutangPerPelanggan.set(ord.pelanggan_id, curPiutang + ordTotal);

      // Deteksi tagihan lewat jatuh tempo pada pesanan yang sudah dikirim (status 'dikirim')
      // Membandingkan tanggal jatuh tempo dengan tanggal hari ini dalam zona waktu WIB
      if (ord.status === "dikirim" && ord.jatuh_tempo) {
        // ord.jatuh_tempo berupa string "YYYY-MM-DD"
        if (ord.jatuh_tempo < todayWIBStr) {
          tokoLewatTempoSet.add(ord.pelanggan_id);
        }
      }
    }

    const pelangganLewatJatuhTempo = tokoLewatTempoSet.size;

    // 4. Susun daftar status limit & tagihan pelanggan untuk monitoring sales
    const statusPelangganList: PelangganStatusKreditItem[] = [];

    for (const p of pelangganAktifList) {
      const piutang = piutangPerPelanggan.get(p.id) || 0;
      const limit = Number(p.batas_kredit) || 0;
      const isOverdue = tokoLewatTempoSet.has(p.id);
      const persentase = limit > 0 ? Math.round((piutang / limit) * 100) : 0;

      let statusKredit: "Lewat Tempo" | "Mendekati Limit" | "Lancar" = "Lancar";
      if (isOverdue) {
        statusKredit = "Lewat Tempo";
      } else if (persentase >= 80) {
        statusKredit = "Mendekati Limit";
      }

      statusPelangganList.push({
        id: p.id,
        kode: p.kode,
        namaToko: p.nama_toko,
        telepon: p.telepon || "-",
        alamat: p.alamat || "-",
        batasKredit: limit,
        piutangBerjalan: piutang,
        persentaseKredit: persentase,
        adaTagihanLewatTempo: isOverdue,
        statusKredit,
      });
    }

    // Urutkan pelanggan: yang lewat tempo di atas, lalu yang mendekati batas limit persentase tertinggi
    statusPelangganList.sort((a, b) => {
      if (a.statusKredit === "Lewat Tempo" && b.statusKredit !== "Lewat Tempo") return -1;
      if (b.statusKredit === "Lewat Tempo" && a.statusKredit !== "Lewat Tempo") return 1;
      if (a.statusKredit === "Mendekati Limit" && b.statusKredit === "Lancar") return -1;
      if (b.statusKredit === "Mendekati Limit" && a.statusKredit === "Lancar") return 1;
      return b.persentaseKredit - a.persentaseKredit;
    });

    return {
      pesananHariIni,
      totalPelangganAktif,
      pelangganLewatJatuhTempo,
      pesananDrafSaya,
      antreanPesananList: antreanPesananList.slice(0, 5),
      statusPelangganList: statusPelangganList.slice(0, 5),
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat metrik penjualan.";
    console.error("Exception in getSalesDashboardMetrics:", err);
    return createEmptySalesMetrics(msg);
  }
}

function createEmptySalesMetrics(errorMsg?: string | null): SalesDashboardMetrics {
  return {
    pesananHariIni: 0,
    totalPelangganAktif: 0,
    pelangganLewatJatuhTempo: 0,
    pesananDrafSaya: 0,
    antreanPesananList: [],
    statusPelangganList: [],
    error: errorMsg || null,
  };
}
