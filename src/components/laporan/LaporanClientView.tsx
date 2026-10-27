"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  TrendingUp,
  CreditCard,
  Package,
  Download,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ShieldAlert,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  X,
  FileSpreadsheet,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { UserProfile, mapDbRoleToDashboardRole } from "@/types/auth";
import { logoutUser } from "@/lib/supabase/auth";
import { LaporanDataPayload } from "@/types/laporan";
import { formatRupiah } from "@/types/pelanggan";

interface LaporanClientViewProps {
  serverProfile: UserProfile;
  initialData: LaporanDataPayload;
}

type ProductSortField =
  | "kode"
  | "nama"
  | "kuantitasTerjual"
  | "totalOmzet"
  | "totalHpp"
  | "totalMargin"
  | "marginPersen";

type AgingSortField =
  | "namaToko"
  | "terminHari"
  | "batasKredit"
  | "totalPiutang"
  | "belumJatuhTempo"
  | "lewat1Sampai30Hari"
  | "lewatLebih30Hari"
  | "statusKredit";

export default function LaporanClientView({
  serverProfile,
  initialData,
}: LaporanClientViewProps) {
  const router = useRouter();
  const data = initialData;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter & Pagination Tab untuk Produk Margin
  const [marginTab, setMarginTab] = useState<"semua" | "top10" | "bottom5">("semua");
  const [productSearch, setProductSearch] = useState("");
  const [productSortField, setProductSortField] = useState<ProductSortField>("totalMargin");
  const [productSortDir, setProductSortDir] = useState<"asc" | "desc">("desc");
  const [productPage, setProductPage] = useState(1);
  const productPageSize = 10;

  // Filter & Pagination Tab untuk Aging Piutang
  const [agingFilter, setAgingFilter] = useState<"semua" | "hanya_piutang" | "menunggak">("hanya_piutang");
  const [customerSearch, setCustomerSearch] = useState("");
  const [agingSortField, setAgingSortField] = useState<AgingSortField>("totalPiutang");
  const [agingSortDir, setAgingSortDir] = useState<"asc" | "desc">("desc");
  const [agingPage, setAgingPage] = useState(1);
  const agingPageSize = 10;

  const dashboardRole = mapDbRoleToDashboardRole(serverProfile.peran);

  const handleLogout = async () => {
    await logoutUser();
    router.push("/login");
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // =========================================================================
  // EKSPOR CSV PENJUALAN & MARGIN
  // =========================================================================
  const exportMarginCSV = () => {
    try {
      const headers = [
        "Kode Barang",
        "Nama Barang",
        "Satuan",
        "Qty Terjual",
        "Total Omzet (Rp)",
        "Total HPP (Rp)",
        "Total Margin (Rp)",
        "Margin (%)",
      ];

      const rows = data.itemMarginList.map((item) => [
        `"${item.kode}"`,
        `"${item.nama.replace(/"/g, '""')}"`,
        `"${item.satuan}"`,
        item.kuantitasTerjual,
        item.totalOmzet,
        item.totalHpp,
        item.totalMargin,
        item.marginPersen.toFixed(2),
      ]);

      const csvContent =
        "\uFEFF" +
        [headers.join(","), ...rows.map((e) => e.join(","))].join("\r\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `laporan_margin_produk_${new Date().toISOString().split("T")[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Laporan margin produk berhasil diunduh (.CSV)");
    } catch {
      showToast("Gagal mengunduh laporan margin produk.");
    }
  };

  // =========================================================================
  // EKSPOR CSV UMUR PIUTANG (AGING)
  // =========================================================================
  const exportAgingCSV = () => {
    try {
      const headers = [
        "Nama Toko",
        "Termin (Hari)",
        "Batas Kredit (Rp)",
        "Total Piutang Berjalan (Rp)",
        "Belum Jatuh Tempo (Rp)",
        "Lewat 1-30 Hari (Rp)",
        "Lewat >30 Hari (Rp)",
        "Sisa Kredit (Rp)",
        "Status Kredit",
      ];

      const rows = data.customerAgingList.map((c) => [
        `"${c.namaToko.replace(/"/g, '""')}"`,
        c.terminHari ?? c.terminBayar ?? 0,
        c.batasKredit,
        c.totalPiutang,
        c.belumJatuhTempo,
        c.lewat1Sampai30Hari,
        c.lewatLebih30Hari,
        c.sisaKredit,
        `"${c.statusKredit}"`,
      ]);

      const csvContent =
        "\uFEFF" +
        [headers.join(","), ...rows.map((e) => e.join(","))].join("\r\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `laporan_aging_piutang_${new Date().toISOString().split("T")[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Laporan aging piutang pelanggan berhasil diunduh (.CSV)");
    } catch {
      showToast("Gagal mengunduh laporan aging piutang.");
    }
  };

  // =========================================================================
  // HANDLERS SORTING & FILTER
  // =========================================================================
  const handleProductSort = (field: ProductSortField) => {
    if (productSortField === field) {
      setProductSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setProductSortField(field);
      setProductSortDir(
        field === "kode" || field === "nama" ? "asc" : "desc"
      );
    }
    setProductPage(1);
  };

  const handleAgingSort = (field: AgingSortField) => {
    if (agingSortField === field) {
      setAgingSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setAgingSortField(field);
      setAgingSortDir(field === "namaToko" ? "asc" : "desc");
    }
    setAgingPage(1);
  };

  const handleResetProductFilters = () => {
    setMarginTab("semua");
    setProductSearch("");
    setProductSortField("totalMargin");
    setProductSortDir("desc");
    setProductPage(1);
  };

  const handleResetAgingFilters = () => {
    setAgingFilter("hanya_piutang");
    setCustomerSearch("");
    setAgingSortField("totalPiutang");
    setAgingSortDir("desc");
    setAgingPage(1);
  };

  // =========================================================================
  // FILTERING, SORTING & PAGINATION: PRODUK MARGIN
  // =========================================================================
  const filteredAndSortedProducts = useMemo(() => {
    let list = [...data.itemMarginList];

    // Filter pencarian
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      list = list.filter(
        (it) =>
          it.nama.toLowerCase().includes(q) || it.kode.toLowerCase().includes(q)
      );
    }

    // Filter tab
    if (marginTab === "top10") {
      list.sort((a, b) => b.totalMargin - a.totalMargin);
      list = list.slice(0, 10);
    } else if (marginTab === "bottom5") {
      list.sort((a, b) => a.totalMargin - b.totalMargin);
      list = list.slice(0, 5);
    }

    // Sorting dinamis
    list.sort((a, b) => {
      let comparison = 0;
      switch (productSortField) {
        case "kode":
          comparison = a.kode.localeCompare(b.kode);
          break;
        case "nama":
          comparison = a.nama.localeCompare(b.nama);
          break;
        case "kuantitasTerjual":
          comparison = a.kuantitasTerjual - b.kuantitasTerjual;
          break;
        case "totalOmzet":
          comparison = a.totalOmzet - b.totalOmzet;
          break;
        case "totalHpp":
          comparison = a.totalHpp - b.totalHpp;
          break;
        case "totalMargin":
          comparison = a.totalMargin - b.totalMargin;
          break;
        case "marginPersen":
          comparison = a.marginPersen - b.marginPersen;
          break;
        default:
          comparison = 0;
      }
      return productSortDir === "asc" ? comparison : -comparison;
    });

    return list;
  }, [data.itemMarginList, marginTab, productSearch, productSortField, productSortDir]);

  const totalProductPages = Math.max(1, Math.ceil(filteredAndSortedProducts.length / productPageSize));
  const paginatedProducts = useMemo(() => {
    const start = (productPage - 1) * productPageSize;
    return filteredAndSortedProducts.slice(start, start + productPageSize);
  }, [filteredAndSortedProducts, productPage, productPageSize]);

  // =========================================================================
  // FILTERING, SORTING & PAGINATION: AGING PIUTANG
  // =========================================================================
  const filteredAndSortedAging = useMemo(() => {
    let list = [...data.customerAgingList];

    if (customerSearch.trim()) {
      const q = customerSearch.toLowerCase();
      list = list.filter((c) => c.namaToko.toLowerCase().includes(q));
    }

    if (agingFilter === "hanya_piutang") {
      list = list.filter((c) => c.totalPiutang > 0);
    } else if (agingFilter === "menunggak") {
      list = list.filter((c) => c.lewat1Sampai30Hari > 0 || c.lewatLebih30Hari > 0);
    }

    list.sort((a, b) => {
      let comparison = 0;
      switch (agingSortField) {
        case "namaToko":
          comparison = a.namaToko.localeCompare(b.namaToko);
          break;
        case "terminHari": {
          const tA = a.terminHari ?? a.terminBayar ?? 0;
          const tB = b.terminHari ?? b.terminBayar ?? 0;
          comparison = tA - tB;
          break;
        }
        case "batasKredit":
          comparison = a.batasKredit - b.batasKredit;
          break;
        case "totalPiutang":
          comparison = a.totalPiutang - b.totalPiutang;
          break;
        case "belumJatuhTempo":
          comparison = a.belumJatuhTempo - b.belumJatuhTempo;
          break;
        case "lewat1Sampai30Hari":
          comparison = a.lewat1Sampai30Hari - b.lewat1Sampai30Hari;
          break;
        case "lewatLebih30Hari":
          comparison = a.lewatLebih30Hari - b.lewatLebih30Hari;
          break;
        case "statusKredit":
          comparison = a.statusKredit.localeCompare(b.statusKredit);
          break;
        default:
          comparison = 0;
      }
      return agingSortDir === "asc" ? comparison : -comparison;
    });

    return list;
  }, [data.customerAgingList, agingFilter, customerSearch, agingSortField, agingSortDir]);

  const totalAgingPages = Math.max(1, Math.ceil(filteredAndSortedAging.length / agingPageSize));
  const paginatedAging = useMemo(() => {
    const start = (agingPage - 1) * agingPageSize;
    return filteredAndSortedAging.slice(start, start + agingPageSize);
  }, [filteredAndSortedAging, agingPage, agingPageSize]);

  // Skala maksimum untuk grafik tren mingguan
  const maxWeeklyVal = useMemo(() => {
    const vals = data.weeklyTrend.flatMap((w) => [w.omzet, w.margin]);
    const max = Math.max(...vals, 1);
    return max;
  }, [data.weeklyTrend]);

  const isProductFilterActive = productSearch.trim() !== "" || marginTab !== "semua";
  const isAgingFilterActive = customerSearch.trim() !== "" || agingFilter !== "hanya_piutang";

  return (
    <AppLayout
      currentRole={dashboardRole}
      activePath="/laporan"
      userProfile={serverProfile}
      onLogout={handleLogout}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* ================================================================= */}
        {/* TOAST NOTIFIKASI SEMENTARA                                        */}
        {/* ================================================================= */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-800 shadow-xl transition animate-in fade-in slide-in-from-bottom-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-2 rounded-md p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* ================================================================= */}
        {/* HEADER BANNER ENTERPRISE                                          */}
        {/* ================================================================= */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-100/80 shadow-xs shrink-0">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                    Laporan Finansial & Operasional
                  </h1>
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/70 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                    <ShieldCheck className="h-3 w-3" />
                    Khusus Akses Manajer
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Data aktual per {data.tanggalLaporan} • CV Sinar Abadi Niaga
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition active:scale-95 disabled:opacity-50"
                title="Segarkan data laporan dari database"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-blue-600" : ""}`} />
                <span>Segarkan</span>
              </button>

              <button
                onClick={exportMarginCSV}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-blue-700 hover:border-blue-200 transition active:scale-95"
                title="Unduh data profitabilitas produk dalam format CSV"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
                <span>Margin Produk CSV</span>
              </button>

              <button
                onClick={exportAgingCSV}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition active:scale-95"
                title="Unduh analisis umur piutang toko pelanggan dalam format CSV"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Aging Piutang CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Notifikasi error jika ada */}
        {data.error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-3 shadow-xs">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Pemberitahuan Sistem Laporan</p>
              <p className="text-xs text-red-600 mt-0.5">{data.error}</p>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* KPI SUMMARY CARDS                                                 */}
        {/* ================================================================= */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Omzet Bulan Ini */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Omzet Penjualan (Bulan Ini)
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-slate-900">
                {formatRupiah(data.summary.omzetBulanIni)}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {data.summary.pesananTerkirimLunasBulanIni} pesanan terkirim & lunas
              </p>
            </div>
          </div>

          {/* Card 2: Margin Kotor Bulan Ini */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Margin Kotor (Bulan Ini)
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-emerald-600">
                {formatRupiah(data.summary.marginBulanIni)}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  {data.summary.marginPersenBulanIni.toFixed(1)}% Rata-rata
                </span>
                <span className="text-[11px] text-slate-400">dari omzet</span>
              </div>
            </div>
          </div>

          {/* Card 3: Total Piutang Berjalan */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Total Piutang Berjalan
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <CreditCard className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-slate-900">
                {formatRupiah(data.summary.totalPiutangBerjalan)}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Pesanan dikonfirmasi & terkirim aktif
              </p>
            </div>
          </div>

          {/* Card 4: Valuasi Persediaan */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Valuasi Persediaan Gudang
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <Package className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-slate-900">
                {formatRupiah(data.summary.totalNilaiPersediaan)}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Akumulasi nilai HPP stok di gudang
              </p>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* GRAFIK MINGGUAN: TREN OMZET & MARGIN 8 MINGGU TERAKHIR             */}
        {/* ================================================================= */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Tren Omzet & Margin Mingguan (8 Minggu Terakhir)
              </h2>
              <p className="text-xs text-slate-500">
                Perbandingan akumulasi omzet penjualan dan margin kotor pesanan terkirim & lunas
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-xs bg-blue-600" />
                <span className="text-slate-600">Omzet Penjualan</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-xs bg-emerald-500" />
                <span className="text-slate-600">Margin Kotor</span>
              </div>
            </div>
          </div>

          {/* Render Visual Bar Chart */}
          <div className="mt-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8 items-end h-64 pt-6 pb-2 border-b border-slate-100">
              {data.weeklyTrend.map((week) => {
                const omzetHeightPercent = maxWeeklyVal > 0 ? (week.omzet / maxWeeklyVal) * 100 : 0;
                const marginHeightPercent = maxWeeklyVal > 0 ? (week.margin / maxWeeklyVal) * 100 : 0;

                return (
                  <div
                    key={week.weekKey}
                    className="flex flex-col items-center justify-end h-full group relative"
                  >
                    {/* Tooltip Hover */}
                    <div className="absolute -top-16 z-20 hidden group-hover:flex flex-col items-center bg-slate-900 text-white text-[10px] rounded-xl p-2.5 shadow-xl whitespace-nowrap pointer-events-none border border-slate-700">
                      <span className="font-bold">{week.weekLabel}</span>
                      <span>Omzet: {formatRupiah(week.omzet)}</span>
                      <span className="text-emerald-300 font-semibold">
                        Margin: {formatRupiah(week.margin)} ({week.marginPersen.toFixed(1)}%)
                      </span>
                      <span className="text-slate-400">{week.jumlahPesanan} pesanan</span>
                    </div>

                    {/* Bars Container */}
                    <div className="flex items-end gap-1.5 h-44 w-full justify-center px-1">
                      {/* Omzet Bar */}
                      <div
                        style={{ height: `${Math.max(omzetHeightPercent, 3)}%` }}
                        className="w-1/2 max-w-[20px] rounded-t-md bg-blue-600 transition-all duration-300 group-hover:bg-blue-700 shadow-2xs"
                        title={`Omzet: ${formatRupiah(week.omzet)}`}
                      />
                      {/* Margin Bar */}
                      <div
                        style={{ height: `${Math.max(marginHeightPercent, 3)}%` }}
                        className="w-1/2 max-w-[20px] rounded-t-md bg-emerald-500 transition-all duration-300 group-hover:bg-emerald-600 shadow-2xs"
                        title={`Margin: ${formatRupiah(week.margin)}`}
                      />
                    </div>

                    {/* Label Bawah */}
                    <div className="mt-2 text-center w-full">
                      <p className="text-[10px] font-semibold text-slate-700 truncate" title={week.weekLabel}>
                        {week.weekLabel.split(" (")[0]}
                      </p>
                      <p className="text-[9px] text-slate-500 font-mono">
                        {formatRupiah(week.omzet).replace("Rp ", "")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* TABEL 1: LAPORAN MARGIN PER BARANG                                */}
        {/* ================================================================= */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Profitabilitas & Margin per Barang
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {filteredAndSortedProducts.length} produk
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluasi performa penjualan produk berdasarkan kontribusi nilai laba kotor
              </p>
            </div>

            {/* Tab Controls & Search */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-medium text-slate-600">
                <button
                  onClick={() => {
                    setMarginTab("semua");
                    setProductPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    marginTab === "semua"
                      ? "bg-white font-semibold text-slate-900 shadow-xs"
                      : "hover:text-slate-900"
                  }`}
                >
                  Semua ({data.itemMarginList.length})
                </button>
                <button
                  onClick={() => {
                    setMarginTab("top10");
                    setProductPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    marginTab === "top10"
                      ? "bg-white font-semibold text-emerald-700 shadow-xs"
                      : "hover:text-slate-900"
                  }`}
                >
                  Top 10 Margin
                </button>
                <button
                  onClick={() => {
                    setMarginTab("bottom5");
                    setProductPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    marginTab === "bottom5"
                      ? "bg-white font-semibold text-amber-700 shadow-xs"
                      : "hover:text-slate-900"
                  }`}
                >
                  5 Margin Terendah
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari kode/nama barang..."
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setProductPage(1);
                  }}
                  className="h-9 w-48 sm:w-56 rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-hidden"
                />
                {productSearch && (
                  <button
                    onClick={() => {
                      setProductSearch("");
                      setProductPage(1);
                    }}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Filter Chips & Reset jika aktif */}
          {isProductFilterActive && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="text-slate-500 font-medium">Filter aktif:</span>
              {marginTab !== "semua" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 font-medium text-blue-700">
                  {marginTab === "top10" ? "Top 10 Margin" : "5 Margin Terendah"}
                  <button onClick={() => setMarginTab("semua")} className="hover:text-blue-900">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {productSearch && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 font-medium text-blue-700">
                  Cari: &quot;{productSearch}&quot;
                  <button onClick={() => setProductSearch("")} className="hover:text-blue-900">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <button
                onClick={handleResetProductFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 ml-1"
              >
                <RotateCcw className="h-3 w-3" />
                Reset Filter
              </button>
            </div>
          )}

          {/* Tabel Margin Produk */}
          <div className="overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-100/90 text-[11px] font-semibold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-center w-12">No</th>
                  <th
                    onClick={() => handleProductSort("kode")}
                    className="px-4 py-3 cursor-pointer hover:bg-slate-200/60 transition select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span>Kode</span>
                      {productSortField === "kode" ? (
                        productSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleProductSort("nama")}
                    className="px-4 py-3 cursor-pointer hover:bg-slate-200/60 transition select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span>Nama Barang</span>
                      {productSortField === "nama" ? (
                        productSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleProductSort("kuantitasTerjual")}
                    className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200/60 transition select-none"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Qty Terjual</span>
                      {productSortField === "kuantitasTerjual" ? (
                        productSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleProductSort("totalOmzet")}
                    className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200/60 transition select-none"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Total Omzet</span>
                      {productSortField === "totalOmzet" ? (
                        productSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleProductSort("totalHpp")}
                    className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200/60 transition select-none"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Total HPP</span>
                      {productSortField === "totalHpp" ? (
                        productSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleProductSort("totalMargin")}
                    className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200/60 transition select-none"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Total Margin</span>
                      {productSortField === "totalMargin" ? (
                        productSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleProductSort("marginPersen")}
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-200/60 transition select-none"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Margin (%)</span>
                      {productSortField === "marginPersen" ? (
                        productSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {paginatedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Package className="h-8 w-8 text-slate-300" />
                        <p className="font-medium text-slate-600">Tidak ada produk yang sesuai kriteria.</p>
                        {isProductFilterActive && (
                          <button
                            onClick={handleResetProductFilters}
                            className="mt-1 text-xs font-semibold text-blue-600 hover:underline"
                          >
                            Reset filter pencarian
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedProducts.map((p, idx) => (
                    <tr key={p.barangId} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3 text-center font-medium text-slate-400">
                        {(productPage - 1) * productPageSize + idx + 1}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">{p.kode}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{p.nama}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {p.kuantitasTerjual} {p.satuan}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {formatRupiah(p.totalOmzet)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500">
                        {formatRupiah(p.totalHpp)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        {formatRupiah(p.totalMargin)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            p.marginPersen >= 20
                              ? "bg-emerald-100 text-emerald-800"
                              : p.marginPersen >= 10
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {p.marginPersen.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Pagination Produk */}
          {filteredAndSortedProducts.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-500">
              <div>
                Menampilkan{" "}
                <span className="font-semibold text-slate-900">
                  {Math.min(
                    (productPage - 1) * productPageSize + 1,
                    filteredAndSortedProducts.length
                  )}
                </span>{" "}
                sampai{" "}
                <span className="font-semibold text-slate-900">
                  {Math.min(productPage * productPageSize, filteredAndSortedProducts.length)}
                </span>{" "}
                dari{" "}
                <span className="font-semibold text-slate-900">
                  {filteredAndSortedProducts.length}
                </span>{" "}
                produk
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                  disabled={productPage === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Sebelumnya</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalProductPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      onClick={() => setProductPage(pageNum)}
                      className={`h-7 w-7 rounded-lg text-xs font-semibold transition ${
                        productPage === pageNum
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setProductPage((p) => Math.min(totalProductPages, p + 1))}
                  disabled={productPage === totalProductPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                >
                  <span>Selanjutnya</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* TABEL 2: LAPORAN UMUR PIUTANG (AGING RECEIVABLES)                 */}
        {/* ================================================================= */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Laporan Umur Tagihan Piutang (Aging Receivables)
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {filteredAndSortedAging.length} pelanggan
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Pemantauan piutang toko pelanggan berdasarkan hari lewat jatuh tempo
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-medium text-slate-600">
                <button
                  onClick={() => {
                    setAgingFilter("hanya_piutang");
                    setAgingPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    agingFilter === "hanya_piutang"
                      ? "bg-white font-semibold text-slate-900 shadow-xs"
                      : "hover:text-slate-900"
                  }`}
                >
                  Ada Piutang
                </button>
                <button
                  onClick={() => {
                    setAgingFilter("menunggak");
                    setAgingPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    agingFilter === "menunggak"
                      ? "bg-white font-semibold text-red-700 shadow-xs"
                      : "hover:text-slate-900"
                  }`}
                >
                  Menunggak
                </button>
                <button
                  onClick={() => {
                    setAgingFilter("semua");
                    setAgingPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    agingFilter === "semua"
                      ? "bg-white font-semibold text-slate-900 shadow-xs"
                      : "hover:text-slate-900"
                  }`}
                >
                  Semua Pelanggan
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari toko pelanggan..."
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setAgingPage(1);
                  }}
                  className="h-9 w-48 sm:w-56 rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-hidden"
                />
                {customerSearch && (
                  <button
                    onClick={() => {
                      setCustomerSearch("");
                      setAgingPage(1);
                    }}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Filter Chips & Reset jika aktif */}
          {isAgingFilterActive && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="text-slate-500 font-medium">Filter aktif:</span>
              {agingFilter !== "hanya_piutang" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 font-medium text-blue-700">
                  Status: {agingFilter === "menunggak" ? "Menunggak" : "Semua Pelanggan"}
                  <button onClick={() => setAgingFilter("hanya_piutang")} className="hover:text-blue-900">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {customerSearch && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 font-medium text-blue-700">
                  Cari: &quot;{customerSearch}&quot;
                  <button onClick={() => setCustomerSearch("")} className="hover:text-blue-900">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <button
                onClick={handleResetAgingFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 ml-1"
              >
                <RotateCcw className="h-3 w-3" />
                Reset Filter
              </button>
            </div>
          )}

          {/* Tabel Aging Piutang */}
          <div className="overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-100/90 text-[11px] font-semibold text-slate-700 border-b border-slate-200">
                <tr>
                  <th
                    onClick={() => handleAgingSort("namaToko")}
                    className="px-4 py-3 cursor-pointer hover:bg-slate-200/60 transition select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span>Nama Toko</span>
                      {agingSortField === "namaToko" ? (
                        agingSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleAgingSort("terminHari")}
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-200/60 transition select-none"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Termin</span>
                      {agingSortField === "terminHari" ? (
                        agingSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleAgingSort("batasKredit")}
                    className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200/60 transition select-none"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Batas Kredit</span>
                      {agingSortField === "batasKredit" ? (
                        agingSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleAgingSort("totalPiutang")}
                    className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200/60 transition select-none"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Total Piutang</span>
                      {agingSortField === "totalPiutang" ? (
                        agingSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleAgingSort("belumJatuhTempo")}
                    className="px-4 py-3 text-right text-emerald-800 bg-emerald-50/40 cursor-pointer hover:bg-emerald-100/50 transition select-none"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Belum Jatuh Tempo</span>
                      {agingSortField === "belumJatuhTempo" ? (
                        agingSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-emerald-700" /> : <ArrowDown className="h-3 w-3 text-emerald-700" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleAgingSort("lewat1Sampai30Hari")}
                    className="px-4 py-3 text-right text-amber-800 bg-amber-50/40 cursor-pointer hover:bg-amber-100/50 transition select-none"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Lewat 1-30 Hari</span>
                      {agingSortField === "lewat1Sampai30Hari" ? (
                        agingSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-amber-700" /> : <ArrowDown className="h-3 w-3 text-amber-700" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleAgingSort("lewatLebih30Hari")}
                    className="px-4 py-3 text-right text-red-800 bg-red-50/40 cursor-pointer hover:bg-red-100/50 transition select-none"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Lewat &gt;30 Hari</span>
                      {agingSortField === "lewatLebih30Hari" ? (
                        agingSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-red-700" /> : <ArrowDown className="h-3 w-3 text-red-700" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleAgingSort("statusKredit")}
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-200/60 transition select-none"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Status Limit</span>
                      {agingSortField === "statusKredit" ? (
                        agingSortDir === "asc" ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {paginatedAging.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <CreditCard className="h-8 w-8 text-slate-300" />
                        <p className="font-medium text-slate-600">Tidak ada data piutang pelanggan yang sesuai filter.</p>
                        {isAgingFilterActive && (
                          <button
                            onClick={handleResetAgingFilters}
                            className="mt-1 text-xs font-semibold text-blue-600 hover:underline"
                          >
                            Reset filter pencarian
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedAging.map((c) => (
                    <tr key={c.pelangganId} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{c.namaToko}</p>
                        <p className="text-[10px] text-slate-400">
                          {c.jumlahNotaPiutang > 0 ? `${c.jumlahNotaPiutang} nota berjalan` : "Tanpa tagihan"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {c.terminHari ?? c.terminBayar ?? 0} Hari
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {formatRupiah(c.batasKredit)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {formatRupiah(c.totalPiutang)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700 bg-emerald-50/20">
                        {c.belumJatuhTempo > 0 ? formatRupiah(c.belumJatuhTempo) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-amber-700 bg-amber-50/20">
                        {c.lewat1Sampai30Hari > 0 ? (
                          <span className="font-semibold text-amber-700">
                            {formatRupiah(c.lewat1Sampai30Hari)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-red-700 bg-red-50/20">
                        {c.lewatLebih30Hari > 0 ? (
                          <span className="font-bold text-red-600">
                            {formatRupiah(c.lewatLebih30Hari)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.statusKredit === "melebihi_limit" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-800">
                            <ShieldAlert className="h-3 w-3" />
                            Over Limit
                          </span>
                        ) : c.statusKredit === "mendekati_limit" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                            <AlertTriangle className="h-3 w-3" />
                            Waspada (&ge;80%)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            <CheckCircle2 className="h-3 w-3" />
                            Aman
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Pagination Aging */}
          {filteredAndSortedAging.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-500">
              <div>
                Menampilkan{" "}
                <span className="font-semibold text-slate-900">
                  {Math.min(
                    (agingPage - 1) * agingPageSize + 1,
                    filteredAndSortedAging.length
                  )}
                </span>{" "}
                sampai{" "}
                <span className="font-semibold text-slate-900">
                  {Math.min(agingPage * agingPageSize, filteredAndSortedAging.length)}
                </span>{" "}
                dari{" "}
                <span className="font-semibold text-slate-900">
                  {filteredAndSortedAging.length}
                </span>{" "}
                pelanggan
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setAgingPage((p) => Math.max(1, p - 1))}
                  disabled={agingPage === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Sebelumnya</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalAgingPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      onClick={() => setAgingPage(pageNum)}
                      className={`h-7 w-7 rounded-lg text-xs font-semibold transition ${
                        agingPage === pageNum
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setAgingPage((p) => Math.min(totalAgingPages, p + 1))}
                  disabled={agingPage === totalAgingPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                >
                  <span>Selanjutnya</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
