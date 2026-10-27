import { SupabaseClient } from "@supabase/supabase-js";

export interface PiutangJatuhTempoItem {
  id: string;
  nomor: string;
  namaToko: string;
  jatuhTempo: string;
  statusWarna: "Merah" | "Kuning" | "Normal";
  statusTeks: string;
  nominal: number;
}

export interface AntreanDrafItem {
  id: string;
  nomor: string;
  namaToko: string;
  tanggal: string;
  total: number;
}

export interface ManagerDashboardMetrics {
  omzetBulanIni: number;
  totalPiutangBerjalan: number;
  valuasiPersediaan: number;
  pesananMenungguKonfirmasi: number;
  jumlahStokMenipis: number;
  piutangJatuhTempoList: PiutangJatuhTempoItem[];
  antreanDrafList: AntreanDrafItem[];
  error?: string | null;
}

/**
 * Mengambil metrik aktual Dashboard Eksekutif Manajer langsung dari Supabase.
 *
 * MENEGAKKAN ATURAN BISNIS (PRD Bab 6 & 9, BR-05, BR-12):
 * 1. Omzet Penjualan: Total pesanan dengan status 'dikirim' dan 'lunas' (draf & dibatalkan DILARANG dihitung).
 * 2. Total Piutang Berjalan: Total pesanan dengan status 'dikonfirmasi' atau 'dikirim' (BR-05).
 * 3. Menunggu Konfirmasi: Jumlah pesanan berstatus 'draf' yang belum disetujui.
 * 4. Valuasi Persediaan: Akumulasi (stok * harga_pokok) barang aktif di gudang (BR-12).
 * 5. Query efisien dengan kolom eksplisit (tanpa SELECT *).
 */
export async function getManagerDashboardMetrics(
  supabase: SupabaseClient
): Promise<ManagerDashboardMetrics> {
  try {
    // 1. Ambil data pesanan jual yang relevan
    const { data: orders, error: ordersError } = await supabase
      .from("pesanan_jual")
      .select("id, nomor, pelanggan_id, status, total, dikirim_pada, jatuh_tempo, dibuat_pada")
      .in("status", ["draf", "dikonfirmasi", "dikirim", "lunas"]);

    if (ordersError) {
      console.error("Gagal mengambil metrik pesanan_jual:", ordersError.message);
      return createEmptyMetrics(ordersError.message);
    }

    // 2. Ambil data katalog pelanggan untuk mapping nama toko
    const { data: pelangganList } = await supabase
      .from("pelanggan")
      .select("id, nama_toko");

    const namaTokoMap: Record<string, string> = {};
    if (pelangganList && Array.isArray(pelangganList)) {
      for (const p of pelangganList) {
        namaTokoMap[p.id] = p.nama_toko;
      }
    }

    // 3. Ambil data persediaan barang untuk valuasi dan stok menipis
    // KEAMANAN & OTORISASI (BR-12):
    // Tabel public.barang membatasi pembacaan kolom harga_pokok secara langsung dari klien/role authenticated.
    // Sesuai pola arsitektur proyek pada src/app/barang-dan-stok/page.tsx, peran 'manajer'
    // mengakses data persediaan beserta HPP melalui RPC resmi `get_katalog_barang_manajer`
    // yang memverifikasi peran manajer di tingkat database secara aman.
    let barangList: { stok?: number; harga_pokok?: number | null; stok_minimum?: number; aktif?: boolean }[] | null = null;

    const { data: rpcBarang, error: rpcError } = await supabase.rpc(
      "get_katalog_barang_manajer"
    );

    if (rpcError) {
      console.warn("Peringatan query RPC get_katalog_barang_manajer:", rpcError.message);

      // Fallback aman: jika RPC belum aktif/terkendala, ambil stok dan stok_minimum tanpa kolom harga_pokok
      const { data: fallbackBarang, error: fbError } = await supabase
        .from("barang")
        .select("id, stok, stok_minimum, aktif")
        .eq("aktif", true);

      if (fbError) {
        console.warn("Fallback query barang non-HPP juga tidak dapat diakses:", fbError.message);
      } else if (fallbackBarang) {
        barangList = fallbackBarang;
      }
    } else if (rpcBarang && Array.isArray(rpcBarang)) {
      barangList = rpcBarang;
    }

    // Kalkulasi Valuasi Persediaan & Stok Menipis
    let valuasiPersediaan = 0;
    let jumlahStokMenipis = 0;

    if (barangList && Array.isArray(barangList)) {
      for (const b of barangList) {
        if (b.aktif !== true) continue;
        const stok = Number(b.stok) || 0;
        const hpp = Number(b.harga_pokok) || 0;
        const min = Number(b.stok_minimum) || 0;

        valuasiPersediaan += stok * hpp;
        if (stok <= min) {
          jumlahStokMenipis += 1;
        }
      }
    }

    // 4. Kalkulasi Metrik Pesanan Jual
    let totalPiutangBerjalan = 0;
    let pesananMenungguKonfirmasi = 0;
    let omzetBulanIni = 0;

    // Dapatkan tahun dan bulan kalender dalam zona waktu Indonesia Barat (WIB / Asia/Jakarta)
    const nowWIB = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const currentYear = nowWIB.getFullYear();
    const currentMonth = nowWIB.getMonth(); // 0-indexed

    const piutangJatuhTempoList: PiutangJatuhTempoItem[] = [];
    const antreanDrafList: AntreanDrafItem[] = [];

    if (orders && Array.isArray(orders)) {
      for (const ord of orders) {
        const total = Number(ord.total) || 0;

        // A. Piutang Berjalan: status 'dikonfirmasi' atau 'dikirim' (PRD Bab 6 & BR-05)
        if (ord.status === "dikonfirmasi" || ord.status === "dikirim") {
          totalPiutangBerjalan += total;
        }

        // B. Pesanan Menunggu Konfirmasi: status 'draf'
        if (ord.status === "draf") {
          pesananMenungguKonfirmasi += 1;

          let tglDrafStr = "-";
          if (ord.dibuat_pada) {
            try {
              tglDrafStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(ord.dibuat_pada));
            } catch {
              tglDrafStr = ord.dibuat_pada.split("T")[0];
            }
          }

          antreanDrafList.push({
            id: ord.id,
            nomor: ord.nomor,
            namaToko: ord.pelanggan_id ? namaTokoMap[ord.pelanggan_id] || "Toko Mitra" : "Toko Mitra",
            tanggal: tglDrafStr,
            total,
          });
        }

        // C. Omzet Penjualan (Bulan Ini): pesanan 'dikirim' dan 'lunas' berdasarkan tanggal pengiriman (PRD Bab 9)
        if (ord.status === "dikirim" || ord.status === "lunas") {
          const tanggalKirimStr = ord.dikirim_pada || ord.dibuat_pada;
          if (tanggalKirimStr) {
            const dateKirim = new Date(tanggalKirimStr);
            const dateKirimWIB = new Date(dateKirim.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
            if (
              dateKirimWIB.getFullYear() === currentYear &&
              dateKirimWIB.getMonth() === currentMonth
            ) {
              omzetBulanIni += total;
            }
          }
        }

        // D. Pantauan Piutang Jatuh Tempo (untuk status 'dikirim' yang memiliki tempo)
        if (ord.status === "dikirim" && ord.jatuh_tempo) {
          const dueDate = new Date(ord.jatuh_tempo);
          const diffMs = dueDate.getTime() - nowWIB.getTime();
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

          let statusWarna: "Merah" | "Kuning" | "Normal" = "Normal";
          let statusTeks = `Tempo: ${ord.jatuh_tempo}`;

          if (diffDays < 0) {
            statusWarna = "Merah";
            statusTeks = `Lewat tempo ${Math.abs(diffDays)} hari`;
          } else if (diffDays === 0) {
            statusWarna = "Merah";
            statusTeks = "Jatuh tempo hari ini";
          } else if (diffDays <= 3) {
            statusWarna = "Kuning";
            statusTeks = `Tempo ${diffDays} hari lagi`;
          } else {
            statusWarna = "Normal";
            statusTeks = `Tempo ${diffDays} hari lagi`;
          }

          piutangJatuhTempoList.push({
            id: ord.id,
            nomor: ord.nomor,
            namaToko: ord.pelanggan_id ? namaTokoMap[ord.pelanggan_id] || "Toko Mitra" : "Toko Mitra",
            jatuhTempo: ord.jatuh_tempo,
            statusWarna,
            statusTeks,
            nominal: total,
          });
        }
      }
    }

    // Urutkan piutang jatuh tempo: yang merah (terlambat) di paling atas
    piutangJatuhTempoList.sort((a, b) => {
      if (a.statusWarna === "Merah" && b.statusWarna !== "Merah") return -1;
      if (b.statusWarna === "Merah" && a.statusWarna !== "Merah") return 1;
      if (a.statusWarna === "Kuning" && b.statusWarna === "Normal") return -1;
      if (b.statusWarna === "Kuning" && a.statusWarna === "Normal") return 1;
      return a.jatuhTempo.localeCompare(b.jatuhTempo);
    });

    // Batasi daftar tampilan ringkas (top 5)
    const limitedPiutang = piutangJatuhTempoList.slice(0, 5);
    const limitedDraf = antreanDrafList.slice(0, 5);

    return {
      omzetBulanIni,
      totalPiutangBerjalan,
      valuasiPersediaan,
      pesananMenungguKonfirmasi,
      jumlahStokMenipis,
      piutangJatuhTempoList: limitedPiutang,
      antreanDrafList: limitedDraf,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menghitung metrik manajer.";
    console.error("Exception in getManagerDashboardMetrics:", err);
    return createEmptyMetrics(msg);
  }
}

function createEmptyMetrics(errorMsg?: string | null): ManagerDashboardMetrics {
  return {
    omzetBulanIni: 0,
    totalPiutangBerjalan: 0,
    valuasiPersediaan: 0,
    pesananMenungguKonfirmasi: 0,
    jumlahStokMenipis: 0,
    piutangJatuhTempoList: [],
    antreanDrafList: [],
    error: errorMsg || null,
  };
}
