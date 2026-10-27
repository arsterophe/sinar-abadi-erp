"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShoppingCart,
  Search,
  Plus,
  RefreshCw,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  FileText,
  Eye,
  Info,
  X,
  RotateCcw,
  Loader2,
  Ban,
  TrendingUp,
  CreditCard,
  ExternalLink,
  Copy,
  Check,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { UserProfile, mapDbRoleToDashboardRole } from "@/types/auth";
import { logoutUser } from "@/lib/supabase/auth";
import {
  PesananJualHeader,
  StatusPesananJual,
  PesananJualFilterStatus,
  DateFilterPreset,
  statusPesananDisplayLabel,
  ItemPesananJual,
  PESANAN_JUAL_LIMITS,
} from "@/types/pesanan_jual";
import { formatRupiah } from "@/types/pelanggan";
import BuatPesananModal, {
  PelangganOption,
  BarangOption,
} from "@/components/pesanan-jual/BuatPesananModal";
import {
  konfirmasiPesananJualAction,
  ambilDetailItemPesananAction,
  kirimPesananJualAction,
  lunasiPesananJualAction,
  batalkanPesananJualAction,
  buatTagihanMayarAction,
} from "@/app/pesanan-jual/actions";

export type { PelangganOption, BarangOption };

interface PesananJualClientViewProps {
  serverProfile: UserProfile;
  initialPesanan: PesananJualHeader[];
  dbError?: string | null;
  pelangganList?: PelangganOption[];
  barangList?: BarangOption[];
  pelangganError?: string | null;
  barangError?: string | null;
}

export default function PesananJualClientView({
  serverProfile,
  initialPesanan = [],
  dbError = null,
  pelangganList = [],
  barangList = [],
  pelangganError = null,
  barangError = null,
}: PesananJualClientViewProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<PesananJualFilterStatus>("semua");
  const [customerFilter, setCustomerFilter] = useState<string>("semua");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("semua");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPesanan, setSelectedPesanan] = useState<PesananJualHeader | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [successNotification, setSuccessNotification] = useState<{
    nomor: string;
    total: number;
  } | null>(null);
  const [confirmModalPesanan, setConfirmModalPesanan] = useState<PesananJualHeader | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccessNotification, setConfirmSuccessNotification] = useState<{
    nomor: string;
    total: number;
  } | null>(null);

  // State Pengurutan (Sorting) & Paginasi (Pagination)
  const [sortField, setSortField] = useState<"nomor" | "nama_toko" | "dibuat_pada" | "total" | "status">("dibuat_pada");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  const dashboardRole = mapDbRoleToDashboardRole(serverProfile.peran);
  const isManager = serverProfile.peran === "manajer";
  const isWarehouse = serverProfile.peran === "gudang";
  const isSales = serverProfile.peran === "penjualan";

  const handleLogout = async () => {
    await logoutUser();
    router.push("/login");
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  // State Pesanan List lokal untuk sinkronisasi seketika & pencegahan aksi kedaluwarsa
  const [pesananList, setPesananList] = useState<PesananJualHeader[]>(initialPesanan);

  useEffect(() => {
    setPesananList(initialPesanan);
  }, [initialPesanan]);

  // State Fitur 1: Detail Item Baris Pesanan Jual
  const [selectedPesananItems, setSelectedPesananItems] = useState<ItemPesananJual[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(false);
  const [itemsFetchError, setItemsFetchError] = useState<string | null>(null);
  const [selectedTotalMargin, setSelectedTotalMargin] = useState<number | null>(null);
  const [selectedTotalMarginPersen, setSelectedTotalMarginPersen] = useState<number | null>(null);

  // State Fitur 2: Pengiriman Pesanan Jual (Gudang & Manajer)
  const [shipModalPesanan, setShipModalPesanan] = useState<PesananJualHeader | null>(null);
  const [isShipping, setIsShipping] = useState(false);
  const isShippingRef = useRef(false);
  const [shipError, setShipError] = useState<string | null>(null);
  const [shipSuccessNotification, setShipSuccessNotification] = useState<{
    nomor: string;
    jatuh_tempo: string;
  } | null>(null);

  // State Fitur 3: Pelunasan Tagihan Pesanan Jual (Manajer)
  const [settleModalPesanan, setSettleModalPesanan] = useState<PesananJualHeader | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [settleSuccessNotification, setSettleSuccessNotification] = useState<{
    nomor: string;
    total: number;
  } | null>(null);

  // State Pembatalan Pesanan Jual (BR-07, BR-08)
  const [cancelModalPesanan, setCancelModalPesanan] = useState<PesananJualHeader | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccessNotification, setCancelSuccessNotification] = useState<{
    nomor: string;
  } | null>(null);

  // State Integrasi Mayar (Migrasi 04, PRD Bab 11)
  const [isCreatingMayar, setIsCreatingMayar] = useState(false);
  const [creatingMayarPesananId, setCreatingMayarPesananId] = useState<string | null>(null);
  const [mayarError, setMayarError] = useState<string | null>(null);
  const [mayarInputModalPesanan, setMayarInputModalPesanan] = useState<PesananJualHeader | null>(null);
  const [mayarCustomerEmail, setMayarCustomerEmail] = useState("");
  const [mayarEmailError, setMayarEmailError] = useState<string | null>(null);
  const [mayarResultModal, setMayarResultModal] = useState<{
    nomor: string;
    payment_id: string;
    payment_url: string;
    status: string;
    total: number;
    isExisting?: boolean;
  } | null>(null);
  const [isCopiedUrl, setIsCopiedUrl] = useState(false);

  const handleOpenDetailPesanan = async (pesanan: PesananJualHeader) => {
    setSelectedPesanan(pesanan);
    setIsLoadingItems(true);
    setItemsFetchError(null);
    setSelectedPesananItems([]);
    setSelectedTotalMargin(null);
    setSelectedTotalMarginPersen(null);

    try {
      const res = await ambilDetailItemPesananAction(pesanan.id);
      if (res.success && res.data) {
        setSelectedPesananItems(res.data.items);
        setSelectedTotalMargin(res.data.total_margin ?? null);
        setSelectedTotalMarginPersen(res.data.total_margin_persen ?? null);
      } else {
        setItemsFetchError(res.error || "Gagal memuat rincian item baris pesanan.");
      }
    } catch (err) {
      setItemsFetchError(
        err instanceof Error ? err.message : "Terjadi kesalahan saat memuat rincian item."
      );
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Validasi peran untuk mengonfirmasi pesanan (PRD Bab 6 & BR-07)
  const canConfirmPesanan = (pesanan: PesananJualHeader) => {
    if (pesanan.status !== "draf") return false;
    if (serverProfile.peran === "manajer") return true;
    if (serverProfile.peran === "penjualan") {
      return pesanan.dibuat_oleh === serverProfile.id;
    }
    return false;
  };

  // Validasi peran untuk menandai pesanan dikirim (PRD Bab 6.1, BR-07)
  const canShipPesanan = (pesanan: PesananJualHeader) => {
    if (pesanan.status !== "dikonfirmasi") return false;
    return serverProfile.peran === "gudang" || serverProfile.peran === "manajer";
  };

  // Validasi peran untuk menandai pesanan lunas (PRD Bab 6.1, BR-07, BR-12)
  const canSettlePesanan = (pesanan: PesananJualHeader) => {
    if (pesanan.status !== "dikirim") return false;
    return serverProfile.peran === "manajer";
  };

  // Validasi peran untuk membatalkan pesanan (PRD Bab 6.1, BR-07, BR-08)
  const canCancelPesanan = (pesanan: PesananJualHeader) => {
    if (pesanan.status === "draf") {
      return (
        serverProfile.peran === "manajer" ||
        (serverProfile.peran === "penjualan" && pesanan.dibuat_oleh === serverProfile.id)
      );
    }
    if (pesanan.status === "dikonfirmasi") {
      return serverProfile.peran === "manajer";
    }
    return false;
  };

  // Validasi peran untuk membuat tagihan Mayar (Hanya Manajer pada status 'dikirim' yang belum bertagihan)
  const canCreateMayarInvoice = (pesanan: PesananJualHeader) => {
    if (pesanan.status !== "dikirim") return false;
    if (serverProfile.peran !== "manajer") return false;
    return !pesanan.mayar_payment_id;
  };

  // Apakah pesanan memiliki tagihan Mayar terdaftar
  const hasMayarInvoice = (pesanan: PesananJualHeader) => {
    return Boolean(pesanan.mayar_payment_id && pesanan.mayar_payment_url);
  };

  const handleExecuteKonfirmasi = async () => {
    if (!confirmModalPesanan || isConfirming) return;
    setIsConfirming(true);
    setConfirmError(null);

    try {
      const res = await konfirmasiPesananJualAction(confirmModalPesanan.id);
      if (!res.success) {
        setConfirmError(res.error || "Gagal mengonfirmasi pesanan.");
        setIsConfirming(false);
        return;
      }

      const confirmedNomor = confirmModalPesanan.nomor;
      const confirmedTotal = confirmModalPesanan.total;
      setIsConfirming(false);
      setConfirmModalPesanan(null);
      setPesananList((prevList) =>
        prevList.map((p) =>
          p.id === confirmModalPesanan.id
            ? {
                ...p,
                status: "dikonfirmasi" as const,
                dikonfirmasi_pada: p.dikonfirmasi_pada || new Date().toISOString(),
              }
            : p
        )
      );
      if (selectedPesanan?.id === confirmModalPesanan.id) {
        setSelectedPesanan((prev) => (prev ? { ...prev, status: "dikonfirmasi" } : null));
      }
      setConfirmSuccessNotification({
        nomor: confirmedNomor,
        total: confirmedTotal,
      });
      router.refresh();
    } catch (err) {
      setIsConfirming(false);
      setConfirmError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan sistem saat mengonfirmasi pesanan."
      );
    }
  };

  const handleExecuteKirim = async () => {
    if (!shipModalPesanan || isShippingRef.current || isShipping) return;

    // Proteksi status UI: jika pesanan sudah berstatus 'dikirim', batalkan eksekusi
    if (shipModalPesanan.status === "dikirim") {
      setShipModalPesanan(null);
      return;
    }

    isShippingRef.current = true;
    setIsShipping(true);
    setShipError(null);

    try {
      const res = await kirimPesananJualAction(shipModalPesanan.id);
      if (!res.success) {
        setShipError(res.error || "Gagal memproses pengiriman pesanan.");
        isShippingRef.current = false;
        setIsShipping(false);
        // Refresh latar belakang agar data UI tersinkronisasi jika status DB telah berubah
        router.refresh();
        return;
      }

      const nomor = shipModalPesanan.nomor;
      const jatuhTempo = res.data?.jatuh_tempo || "";
      isShippingRef.current = false;
      setIsShipping(false);
      setShipModalPesanan(null);

      // Mutasi status lokal seketika ke 'dikirim' agar tombol Kirim langsung nonaktif
      setPesananList((prevList) =>
        prevList.map((p) =>
          p.id === shipModalPesanan.id
            ? {
                ...p,
                status: "dikirim" as const,
                jatuh_tempo: jatuhTempo,
                dikirim_pada: p.dikirim_pada || new Date().toISOString(),
              }
            : p
        )
      );

      if (selectedPesanan?.id === shipModalPesanan.id) {
        setSelectedPesanan((prev) =>
          prev
            ? {
                ...prev,
                status: "dikirim",
                jatuh_tempo: jatuhTempo,
                dikirim_pada: prev.dikirim_pada || new Date().toISOString(),
              }
            : null
        );
      }
      setShipSuccessNotification({ nomor, jatuh_tempo: jatuhTempo });
      router.refresh();
    } catch (err) {
      isShippingRef.current = false;
      setIsShipping(false);
      setShipError(
        err instanceof Error ? err.message : "Terjadi kesalahan sistem saat memproses pengiriman."
      );
    }
  };

  const handleExecutePelunasan = async () => {
    if (!settleModalPesanan || isSettling) return;
    setIsSettling(true);
    setSettleError(null);

    try {
      const res = await lunasiPesananJualAction(settleModalPesanan.id);
      if (!res.success) {
        setSettleError(res.error || "Gagal mencatat pelunasan pesanan.");
        setIsSettling(false);
        return;
      }

      const nomor = settleModalPesanan.nomor;
      const total = settleModalPesanan.total;
      setIsSettling(false);
      setSettleModalPesanan(null);
      setPesananList((prevList) =>
        prevList.map((p) =>
          p.id === settleModalPesanan.id
            ? {
                ...p,
                status: "lunas" as const,
                dilunasi_pada: new Date().toISOString(),
              }
            : p
        )
      );
      if (selectedPesanan?.id === settleModalPesanan.id) {
        setSelectedPesanan((prev) =>
          prev ? { ...prev, status: "lunas", dilunasi_pada: new Date().toISOString() } : null
        );
      }
      setSettleSuccessNotification({ nomor, total });
      router.refresh();
    } catch (err) {
      setIsSettling(false);
      setSettleError(
        err instanceof Error ? err.message : "Terjadi kesalahan sistem saat mencatat pelunasan."
      );
    }
  };

  const handleExecuteBatal = async () => {
    if (!cancelModalPesanan || isCancelling) return;
    if (
      cancelModalPesanan.status === "dikonfirmasi" &&
      cancelReason.trim().length < PESANAN_JUAL_LIMITS.MIN_ALASAN_BATAL_LEN
    ) {
      setCancelError(
        `Alasan pembatalan pesanan dikonfirmasi wajib diisi minimal ${PESANAN_JUAL_LIMITS.MIN_ALASAN_BATAL_LEN} karakter (BR-08).`
      );
      return;
    }

    setIsCancelling(true);
    setCancelError(null);

    try {
      const res = await batalkanPesananJualAction(
        cancelModalPesanan.id,
        cancelReason.trim()
      );
      if (!res.success) {
        setCancelError(res.error || "Gagal membatalkan pesanan.");
        setIsCancelling(false);
        return;
      }

      const nomor = cancelModalPesanan.nomor;
      setIsCancelling(false);
      setCancelModalPesanan(null);
      setCancelReason("");
      setPesananList((prevList) =>
        prevList.map((p) =>
          p.id === cancelModalPesanan.id
            ? {
                ...p,
                status: "dibatalkan" as const,
                dibatalkan_pada: new Date().toISOString(),
                alasan_batal: cancelReason.trim(),
              }
            : p
        )
      );
      if (selectedPesanan?.id === cancelModalPesanan.id) {
        setSelectedPesanan((prev) =>
          prev
            ? {
                ...prev,
                status: "dibatalkan",
                dibatalkan_pada: new Date().toISOString(),
                alasan_batal: cancelReason.trim(),
              }
            : null
        );
      }
      setCancelSuccessNotification({ nomor });
      router.refresh();
    } catch (err) {
      setIsCancelling(false);
      setCancelError(
        err instanceof Error ? err.message : "Terjadi kesalahan sistem saat membatalkan pesanan."
      );
    }
  };

  const handleOpenBuatTagihanMayarModal = (pesanan: PesananJualHeader) => {
    if (isCreatingMayar || creatingMayarPesananId) return;
    if (!canCreateMayarInvoice(pesanan)) return;
    setMayarError(null);
    setMayarEmailError(null);
    setMayarCustomerEmail("");
    setMayarInputModalPesanan(pesanan);
  };

  const handleExecuteBuatTagihanMayar = async (
    pesanan: PesananJualHeader,
    emailPelanggan?: string
  ) => {
    if (isCreatingMayar || creatingMayarPesananId) return;
    if (!canCreateMayarInvoice(pesanan)) return;

    setIsCreatingMayar(true);
    setCreatingMayarPesananId(pesanan.id);
    setMayarError(null);

    try {
      const res = await buatTagihanMayarAction(pesanan.id, emailPelanggan);
      if (!res.success) {
        setMayarError(res.error || "Gagal membuat tagihan Mayar.");
        setIsCreatingMayar(false);
        setCreatingMayarPesananId(null);
        return;
      }

      // Berhasil: tutup modal dialog input email
      setMayarInputModalPesanan(null);
      setMayarEmailError(null);

      if (res.data) {
        const { nomor, mayar_payment_id, mayar_payment_url, mayar_status } = res.data;

        setMayarResultModal({
          nomor: nomor || pesanan.nomor,
          payment_id: mayar_payment_id,
          payment_url: mayar_payment_url,
          status: mayar_status,
          total: pesanan.total,
        });

        if (selectedPesanan?.id === pesanan.id) {
          setSelectedPesanan((prev) =>
            prev
              ? {
                  ...prev,
                  mayar_payment_id,
                  mayar_payment_url,
                  mayar_status,
                }
              : null
          );
        }

        router.refresh();
      }
    } catch (err) {
      setMayarError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan sistem saat memproses pembuatan tagihan Mayar."
      );
    } finally {
      setIsCreatingMayar(false);
      setCreatingMayarPesananId(null);
    }
  };

  const handleCopyMayarUrl = (url: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setIsCopiedUrl(true);
    setTimeout(() => setIsCopiedUrl(false), 2000);
  };

  // Format tanggal ke format lokal Indonesia
  const formatTanggalLokal = (isoString?: string | null) => {
    if (!isoString) return "-";
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  // Format tanggal lengkap dengan jam
  const formatWaktuLokal = (isoString?: string | null) => {
    if (!isoString) return "-";
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  // Metrik KPI
  const totalPesananCount = pesananList.length;
  const totalNilaiTransaksi = pesananList.reduce(
    (acc, p) => acc + (Number(p.total) || 0),
    0
  );
  const dikonfirmasiCount = pesananList.filter((p) => p.status === "dikonfirmasi").length;
  const dikirimCount = pesananList.filter((p) => p.status === "dikirim").length;
  const lunasCount = pesananList.filter((p) => p.status === "lunas").length;
  const dibatalkanCount = pesananList.filter((p) => p.status === "dibatalkan").length;

  // Nilai piutang berjalan (status dikonfirmasi + dikirim) sesuai aturan PRD BR-05
  const nilaiPiutangBerjalan = pesananList
    .filter((p) => p.status === "dikonfirmasi" || p.status === "dikirim")
    .reduce((acc, p) => acc + (Number(p.total) || 0), 0);

  // Daftar pelanggan unik dari dataset transaksi untuk opsi filter pelanggan (PRD Bab 7)
  const uniqueCustomers = useMemo(() => {
    const map = new Map<string, { id: string; nama: string; kode: string }>();
    for (const p of pesananList) {
      if (p.pelanggan_id && !map.has(p.pelanggan_id)) {
        map.set(p.pelanggan_id, {
          id: p.pelanggan_id,
          nama: p.nama_toko || "Toko Tidak Dikenal",
          kode: p.kode_pelanggan || "-",
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama));
  }, [pesananList]);

  // Status apakah ada filter yang sedang aktif
  const isFilterActive =
    searchTerm.trim() !== "" ||
    statusFilter !== "semua" ||
    customerFilter !== "semua" ||
    datePreset !== "semua" ||
    startDate !== "" ||
    endDate !== "";

  const handleResetFilters = () => {
    setSearchTerm("");
    setStatusFilter("semua");
    setCustomerFilter("semua");
    setDatePreset("semua");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const handleSort = (field: "nomor" | "nama_toko" | "dibuat_pada" | "total" | "status") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  // Filter, Search & Sort data
  const filteredAndSortedPesanan = useMemo(() => {
    const list = pesananList.filter((item) => {
      // 1. Filter Status
      if (statusFilter !== "semua" && item.status !== statusFilter) {
        return false;
      }

      // 2. Filter Pelanggan (PRD Bab 7)
      if (customerFilter !== "semua" && item.pelanggan_id !== customerFilter) {
        return false;
      }

      // 3. Filter Rentang Periode Tanggal (Inklusif berdasarkan tanggal transaksi dibuat_pada)
      if (datePreset !== "semua") {
        const itemDateStr = item.dibuat_pada ? item.dibuat_pada.slice(0, 10) : "";
        if (!itemDateStr) return false;

        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);

        if (datePreset === "hari_ini") {
          if (itemDateStr !== todayStr) return false;
        } else if (datePreset === "7_hari") {
          const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const d7Str = d7.toISOString().slice(0, 10);
          if (itemDateStr < d7Str || itemDateStr > todayStr) return false;
        } else if (datePreset === "30_hari") {
          const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          const d30Str = d30.toISOString().slice(0, 10);
          if (itemDateStr < d30Str || itemDateStr > todayStr) return false;
        } else if (datePreset === "bulan_ini") {
          const thisMonthPrefix = todayStr.slice(0, 7);
          if (!itemDateStr.startsWith(thisMonthPrefix)) return false;
        } else if (datePreset === "kustom") {
          // Batas tanggal inklusif: membandingkan string YYYY-MM-DD
          if (startDate && itemDateStr < startDate) return false;
          if (endDate && itemDateStr > endDate) return false;
        }
      }

      // 4. Pencarian Teks (Nomor Dokumen, Nama Toko, Kode Pelanggan)
      if (searchTerm.trim() !== "") {
        const query = searchTerm.toLowerCase().trim();
        const matchNomor = item.nomor.toLowerCase().includes(query);
        const matchToko = (item.nama_toko || "").toLowerCase().includes(query);
        const matchKode = (item.kode_pelanggan || "").toLowerCase().includes(query);
        return matchNomor || matchToko || matchKode;
      }

      return true;
    });

    // Pengurutan
    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === "nomor") {
        comparison = a.nomor.localeCompare(b.nomor);
      } else if (sortField === "nama_toko") {
        comparison = (a.nama_toko || "").localeCompare(b.nama_toko || "");
      } else if (sortField === "dibuat_pada") {
        comparison = (a.dibuat_pada || "").localeCompare(b.dibuat_pada || "");
      } else if (sortField === "total") {
        comparison = Number(a.total) - Number(b.total);
      } else if (sortField === "status") {
        comparison = a.status.localeCompare(b.status);
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return list;
  }, [pesananList, statusFilter, customerFilter, datePreset, startDate, endDate, searchTerm, sortField, sortDirection]);

  // Data Terpaginasi Sejati
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedPesanan.length / pageSize));
  const paginatedPesanan = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedPesanan.slice(start, start + pageSize);
  }, [filteredAndSortedPesanan, currentPage, pageSize]);

  // Badge Status Rendering
  const renderStatusBadge = (status: StatusPesananJual) => {
    switch (status) {
      case "draf":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
            Draf
          </span>
        );
      case "dikonfirmasi":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            Dikonfirmasi
          </span>
        );
      case "dikirim":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
            <Truck className="h-3 w-3 text-blue-600" />
            Dikirim
          </span>
        );
      case "lunas":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Lunas
          </span>
        );
      case "dibatalkan":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
            <XCircle className="h-3 w-3 text-rose-600" />
            Dibatalkan
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            {statusPesananDisplayLabel(status)}
          </span>
        );
    }
  };

  return (
    <AppLayout
      currentRole={dashboardRole}
      activePath="/pesanan-jual"
      userProfile={serverProfile}
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        {/* Breadcrumb & Action Toolbar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Link
              href="/"
              className="flex items-center gap-1 text-slate-600 hover:text-blue-600 transition-colors"
            >
              <span>Dashboard</span>
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-900 font-semibold">Pesanan Jual</span>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all disabled:opacity-60 cursor-pointer"
              title="Perbarui Data Transaksi"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-slate-500 ${
                  isRefreshing ? "animate-spin" : ""
                }`}
              />
              <span>Perbarui</span>
            </button>

            {/* Tombol Buat Pesanan: Hanya ditampilkan jika bukan Gudang.
                Membuka modal formulir pembuatan draf pesanan jual baru */}
            {!isWarehouse && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-500 transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Buat Pesanan Baru</span>
              </button>
            )}

            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Kembali</span>
            </Link>
          </div>
        </div>

        {/* Page Banner Header */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-1 ring-blue-500/30 shrink-0">
                <ShoppingCart className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                    Daftar Pesanan Jual (Sales Order)
                  </h1>
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                    Modul Transaksi
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  CV Sinar Abadi Niaga • Monitoring transaksi penjualan, konfirmasi ketersediaan stok, logistik pengiriman, dan pelunasan Mayar.
                </p>
              </div>
            </div>

            {/* Role Security Badge */}
            <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs">
              {isManager && (
                <>
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-800">Akses Manajer</span>
                    <p className="text-[11px] text-slate-500">Penuh: Konfirmasi, Tagih Mayar, &amp; Pelunasan</p>
                  </div>
                </>
              )}
              {isSales && (
                <>
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-800">Akses Staf Penjualan</span>
                    <p className="text-[11px] text-slate-500">Penyusunan Draf &amp; Konfirmasi Toko Mitra</p>
                  </div>
                </>
              )}
              {isWarehouse && (
                <>
                  <Truck className="h-4 w-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-800">Akses Staf Gudang</span>
                    <p className="text-[11px] text-slate-500">Pemrosesan Pengiriman Pesanan Terkonfirmasi</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Database Error Banner jika terjadi kegagalan query */}
        {dbError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 shadow-2xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-rose-900">Pemberitahuan Sistem</h3>
                <p className="mt-1 text-xs text-rose-700">
                  {dbError} Silakan hubungi administrator atau muat ulang halaman beberapa saat lagi.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Banner Notifikasi Keberhasilan Pembuatan Draf */}
        {successNotification && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-2xs flex items-start justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-emerald-950">
                  Draf Pesanan Jual Berhasil Dibuat
                </h3>
                <p className="mt-0.5 text-xs text-emerald-800">
                  Dokumen pesanan resmi telah tersimpan dengan nomor{" "}
                  <strong className="font-mono font-bold text-emerald-900">
                    {successNotification.nomor}
                  </strong>{" "}
                  senilai <strong>{formatRupiah(successNotification.total)}</strong> (Status: Draf). Memperbarui data transaksi...
                </p>
              </div>
            </div>
            <button
              onClick={() => setSuccessNotification(null)}
              className="text-emerald-700 hover:text-emerald-900 p-1 rounded-md hover:bg-emerald-100/60 cursor-pointer"
              title="Tutup Notifikasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Banner Notifikasi Keberhasilan Konfirmasi Pesanan */}
        {confirmSuccessNotification && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-2xs flex items-start justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-emerald-950">
                  Pesanan Jual Berhasil Dikonfirmasi
                </h3>
                <p className="mt-0.5 text-xs text-emerald-800">
                  Dokumen pesanan resmi{" "}
                  <strong className="font-mono font-bold text-emerald-900">
                    {confirmSuccessNotification.nomor}
                  </strong>{" "}
                  senilai <strong>{formatRupiah(confirmSuccessNotification.total)}</strong> telah resmi berstatus{" "}
                  <span className="font-semibold text-emerald-900">Dikonfirmasi</span>. Stok gudang telah dipotong dan dokumen siap diproses kirim oleh Staf Gudang.
                </p>
              </div>
            </div>
            <button
              onClick={() => setConfirmSuccessNotification(null)}
              className="text-emerald-700 hover:text-emerald-900 p-1 rounded-md hover:bg-emerald-100/60 cursor-pointer"
              title="Tutup Notifikasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Banner Notifikasi Keberhasilan Pengiriman Pesanan (Fitur 2) */}
        {shipSuccessNotification && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900 shadow-2xs flex items-start justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <Truck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-blue-950">
                  Pesanan Jual Berhasil Ditandai Dikirim
                </h3>
                <p className="mt-0.5 text-xs text-blue-800">
                  Dokumen logistik{" "}
                  <strong className="font-mono font-bold text-blue-900">
                    {shipSuccessNotification.nomor}
                  </strong>{" "}
                  telah resmi berstatus <span className="font-semibold text-blue-900">Dikirim</span>.
                  {shipSuccessNotification.jatuh_tempo ? (
                    <>
                      {" "}Tanggal jatuh tempo tagihan dicatat pada{" "}
                      <strong className="font-semibold text-blue-950">
                        {formatTanggalLokal(shipSuccessNotification.jatuh_tempo)}
                      </strong>{" "}
                      (berdasarkan termin hari toko pelanggan, BR-07).
                    </>
                  ) : (
                    <> Waktu pengiriman dicatat hari ini secara otomatis (BR-07).</>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShipSuccessNotification(null)}
              className="text-blue-700 hover:text-blue-900 p-1 rounded-md hover:bg-blue-100/60 cursor-pointer"
              title="Tutup Notifikasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Banner Notifikasi Keberhasilan Pelunasan Pesanan (Fitur 3) */}
        {settleSuccessNotification && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-2xs flex items-start justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-emerald-950">
                  Pelunasan Pesanan Berhasil Dicatat (Lunas)
                </h3>
                <p className="mt-0.5 text-xs text-emerald-800">
                  Tagihan penjualan dokumen{" "}
                  <strong className="font-mono font-bold text-emerald-900">
                    {settleSuccessNotification.nomor}
                  </strong>{" "}
                  senilai <strong>{formatRupiah(settleSuccessNotification.total)}</strong> telah resmi ditandai{" "}
                  <span className="font-semibold text-emerald-900">Lunas</span>. Piutang toko pelanggan berkurang dan aksi finansial ini telah diverifikasi serta tercatat pada audit log sistem (BR-12).
                </p>
              </div>
            </div>
            <button
              onClick={() => setSettleSuccessNotification(null)}
              className="text-emerald-700 hover:text-emerald-900 p-1 rounded-md hover:bg-emerald-100/60 cursor-pointer"
              title="Tutup Notifikasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Banner Notifikasi Keberhasilan Pembatalan Pesanan */}
        {cancelSuccessNotification && (
          <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-slate-800 shadow-2xs flex items-start justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Pesanan Jual Berhasil Dibatalkan
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Dokumen pesanan{" "}
                  <strong className="font-mono font-bold text-slate-900">
                    {cancelSuccessNotification.nomor}
                  </strong>{" "}
                  telah resmi berstatus <span className="font-semibold text-rose-700">Dibatalkan</span>. Jika pesanan sebelumnya telah dikonfirmasi, stok barang telah otomatis dikembalikan ke katalog barang dan dicatat pada audit log (BR-08, BR-12).
                </p>
              </div>
            </div>
            <button
              onClick={() => setCancelSuccessNotification(null)}
              className="text-slate-600 hover:text-slate-900 p-1 rounded-md hover:bg-slate-200/60 cursor-pointer"
              title="Tutup Notifikasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Banner Notifikasi Error Pembuatan Tagihan Mayar */}
        {mayarError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 shadow-2xs flex items-start justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-rose-950">
                  Pembuatan Tagihan Mayar Ditolak
                </h3>
                <p className="mt-0.5 text-xs text-rose-800">
                  {mayarError}
                </p>
              </div>
            </div>
            <button
              onClick={() => setMayarError(null)}
              className="text-rose-700 hover:text-rose-900 p-1 rounded-md hover:bg-rose-100/60 cursor-pointer"
              title="Tutup Notifikasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* KPI Metrics Cards Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Total Dokumen Pesanan */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Dokumen
              </span>
              <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                <ShoppingCart className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {totalPesananCount}
              </span>
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                Dokumen
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Total nilai: <strong className="text-slate-700">{formatRupiah(totalNilaiTransaksi)}</strong>
            </p>
          </div>

          {/* Card 2: Menunggu Pengiriman */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Siap Kirim
              </span>
              <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {dikonfirmasiCount}
              </span>
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                Dikonfirmasi
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Stok sudah dipotong & menunggu pengiriman gudang
            </p>
          </div>

          {/* Card 3: Piutang Berjalan */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Piutang Berjalan
              </span>
              <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-slate-900 truncate">
                {formatRupiah(nilaiPiutangBerjalan)}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Total tagihan status dikonfirmasi & dikirim (BR-05)
            </p>
          </div>

          {/* Card 4: Transaksi Selesai (Lunas) */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pesanan Lunas
              </span>
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {lunasCount}
              </span>
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                Selesai
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Pembayaran telah dilunasi oleh pelanggan toko
            </p>
          </div>
        </div>

        {/* Filter and Search Bar Section */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-center">
            {/* Search Input (5 cols) */}
            <div className="relative lg:col-span-5">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari nomor dokumen (SO-00001) atau nama toko..."
                className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-8 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter Pelanggan (PRD Bab 7) (3 cols) */}
            <div className="lg:col-span-3">
              <select
                value={customerFilter}
                onChange={(e) => {
                  setCustomerFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 font-medium focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
              >
                <option value="semua">Semua Pelanggan</option>
                {uniqueCustomers.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.nama} ({cust.kode})
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Periode Preset (4 cols) */}
            <div className="flex items-center gap-2 lg:col-span-4">
              <div className="relative flex-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <select
                  value={datePreset}
                  onChange={(e) => {
                    setDatePreset(e.target.value as DateFilterPreset);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-2 text-xs text-slate-700 font-medium focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                >
                  <option value="semua">Semua Periode</option>
                  <option value="hari_ini">Hari Ini</option>
                  <option value="7_hari">7 Hari Terakhir</option>
                  <option value="30_hari">30 Hari Terakhir</option>
                  <option value="bulan_ini">Bulan Berjalan</option>
                  <option value="kustom">Rentang Tanggal Kustom...</option>
                </select>
              </div>

              {isFilterActive && (
                <button
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0 cursor-pointer"
                  title="Reset Semua Filter"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Sub-baris: Input Rentang Tanggal Kustom (Inklusif) */}
          {datePreset === "kustom" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-blue-50/60 border border-blue-200/60 p-2.5 text-xs animate-in fade-in duration-150">
              <span className="font-semibold text-blue-900 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-blue-600" />
                Batas Tanggal Inklusif:
              </span>
              <div className="flex items-center gap-2">
                <label className="text-slate-600 text-[11px]">Dari:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-slate-600 text-[11px]">Sampai:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setCurrentPage(1);
                  }}
                  className="text-[11px] text-blue-700 underline hover:text-blue-900 ml-auto cursor-pointer"
                >
                  Hapus Rentang
                </button>
              )}
            </div>
          )}

          {/* Status Tabs Bar - Mengikuti Alur Status Bisnis PRD Bab 6 */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
            <span className="text-xs font-semibold text-slate-500 mr-2">Status:</span>

            {/* Tab: Semua */}
            <button
              onClick={() => {
                setStatusFilter("semua");
                setCurrentPage(1);
              }}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "semua"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Semua ({totalPesananCount})
            </button>

            {/* Tab: Draf (HANYA tampil jika bukan Gudang, PRD Bab 7) */}
            {!isWarehouse && (
              <button
                onClick={() => {
                  setStatusFilter("draf");
                  setCurrentPage(1);
                }}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === "draf"
                    ? "bg-slate-700 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Draf
              </button>
            )}

            {/* Tab: Dikonfirmasi */}
            <button
              onClick={() => {
                setStatusFilter("dikonfirmasi");
                setCurrentPage(1);
              }}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "dikonfirmasi"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100"
              }`}
            >
              Dikonfirmasi ({dikonfirmasiCount})
            </button>

            {/* Tab: Dikirim */}
            <button
              onClick={() => {
                setStatusFilter("dikirim");
                setCurrentPage(1);
              }}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "dikirim"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100"
              }`}
            >
              Dikirim ({dikirimCount})
            </button>

            {/* Tab: Lunas */}
            <button
              onClick={() => {
                setStatusFilter("lunas");
                setCurrentPage(1);
              }}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "lunas"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              Lunas ({lunasCount})
            </button>

            {/* Tab: Dibatalkan */}
            <button
              onClick={() => {
                setStatusFilter("dibatalkan");
                setCurrentPage(1);
              }}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === "dibatalkan"
                  ? "bg-rose-600 text-white shadow-2xs"
                  : "bg-rose-50 text-rose-700 hover:bg-rose-100"
              }`}
            >
              Dibatalkan ({dibatalkanCount})
            </button>
          </div>

          {/* Indikator Filter Aktif */}
          {isFilterActive && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5">
              <span className="text-[11px] font-semibold text-slate-500 mr-1">Filter Aktif:</span>
              {searchTerm && (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200">
                  Cari: &ldquo;{searchTerm}&rdquo;
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setCurrentPage(1);
                    }}
                    className="hover:text-blue-900 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {customerFilter !== "semua" && (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200">
                  Pelanggan: {uniqueCustomers.find((c) => c.id === customerFilter)?.nama || customerFilter}
                  <button
                    onClick={() => {
                      setCustomerFilter("semua");
                      setCurrentPage(1);
                    }}
                    className="hover:text-blue-900 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {datePreset !== "semua" && (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200">
                  Periode: {datePreset === "kustom" ? `${startDate || "..."} s/d ${endDate || "..."}` : datePreset.replace("_", " ")}
                  <button
                    onClick={() => {
                      setDatePreset("semua");
                      setStartDate("");
                      setEndDate("");
                      setCurrentPage(1);
                    }}
                    className="hover:text-blue-900 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {statusFilter !== "semua" && (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200">
                  Status: {statusFilter}
                  <button
                    onClick={() => {
                      setStatusFilter("semua");
                      setCurrentPage(1);
                    }}
                    className="hover:text-blue-900 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <button
                onClick={handleResetFilters}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 ml-1.5 cursor-pointer underline underline-offset-2"
              >
                Reset Semua Filter
              </button>
            </div>
          )}
        </div>

        {/* Data Table Section */}
        <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-100/90 text-[11px] font-semibold tracking-wider text-slate-700">
                <tr>
                  <th scope="col" className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => handleSort("nomor")}
                      className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      <span>Nomor Dokumen</span>
                      {sortField === "nomor" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => handleSort("nama_toko")}
                      className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      <span>Toko Pelanggan</span>
                      {sortField === "nama_toko" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => handleSort("dibuat_pada")}
                      className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      <span>Tanggal Dibuat</span>
                      {sortField === "dibuat_pada" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => handleSort("status")}
                      className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      <span>Status</span>
                      {sortField === "status" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-slate-700">
                    Jatuh Tempo
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("total")}
                      className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-blue-600 transition-colors cursor-pointer ml-auto"
                    >
                      <span>Total Transaksi</span>
                      {sortField === "total" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-center text-slate-700">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Penanganan Kegagalan Pengambilan Data (Tidak Disamarkan Sebagai Data Kosong) */}
                {dbError && pesananList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="rounded-full bg-rose-100 p-3 text-rose-600">
                          <AlertTriangle className="h-6 w-6" />
                        </div>
                        <h3 className="mt-2 text-sm font-semibold text-rose-900">
                          Gagal Memuat Data Transaksi
                        </h3>
                        <p className="mt-1 text-xs text-rose-600 max-w-md">
                          {dbError}
                        </p>
                        <button
                          onClick={handleRefresh}
                          disabled={isRefreshing}
                          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-500 transition-all cursor-pointer disabled:opacity-60"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                          />
                          <span>Coba Muat Ulang</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : filteredAndSortedPesanan.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="rounded-full bg-slate-100 p-3 text-slate-400">
                          <ShoppingCart className="h-6 w-6" />
                        </div>
                        <h3 className="mt-2 text-sm font-semibold text-slate-800">
                          Tidak ada pesanan jual yang cocok
                        </h3>
                        <p className="mt-1 text-xs text-slate-500 max-w-sm">
                          {isFilterActive
                            ? "Coba ubah kata kunci pencarian atau sesuaikan opsi filter status, pelanggan, dan periode tanggal."
                            : "Belum ada data pesanan jual yang tercatat di database."}
                        </p>
                        {isFilterActive && (
                          <button
                            onClick={handleResetFilters}
                            className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Reset Semua Filter</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedPesanan.map((pesanan: PesananJualHeader) => (
                    <tr
                      key={pesanan.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Nomor Pesanan */}
                      <td className="px-4 py-3.5 font-bold text-slate-900">
                        <span className="font-mono text-blue-600 bg-blue-50/60 px-2 py-0.5 rounded">
                          {pesanan.nomor}
                        </span>
                      </td>

                      {/* Pelanggan */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900">
                          {pesanan.nama_toko}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {pesanan.kode_pelanggan} • {pesanan.telepon_pelanggan}
                        </div>
                      </td>

                      {/* Tanggal Dibuat */}
                      <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                        {formatWaktuLokal(pesanan.dibuat_pada)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          {renderStatusBadge(pesanan.status)}
                          {pesanan.mayar_payment_id && (
                            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              pesanan.mayar_status === "paid"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            }`}>
                              <CreditCard className="h-2.5 w-2.5" />
                              <span>Mayar: {pesanan.mayar_status || "unpaid"}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Jatuh Tempo */}
                      <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                        {pesanan.jatuh_tempo ? (
                          <span className="font-medium text-slate-800">
                            {formatTanggalLokal(pesanan.jatuh_tempo)}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Belum terbit</span>
                        )}
                      </td>

                      {/* Total Transaksi */}
                      <td className="px-4 py-3.5 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatRupiah(pesanan.total)}
                      </td>

                      {/* Aksi: Buka Modal Detail & Tombol Transaksional */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenDetailPesanan(pesanan)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition-colors cursor-pointer"
                            title="Lihat Rincian Item & Aksi Transaksional"
                          >
                            <Eye className="h-3.5 w-3.5 text-slate-500" />
                            <span>Rincian</span>
                          </button>
                          {canConfirmPesanan(pesanan) && (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmError(null);
                                setConfirmModalPesanan(pesanan);
                              }}
                              disabled={isConfirming}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-50 transition-colors cursor-pointer"
                              title="Konfirmasi Draf Pesanan Ini"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Konfirmasi</span>
                            </button>
                          )}
                          {canShipPesanan(pesanan) && (
                            <button
                              type="button"
                              onClick={() => {
                                setShipError(null);
                                setShipModalPesanan(pesanan);
                              }}
                              disabled={isShipping}
                              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 hover:border-blue-300 disabled:opacity-50 transition-colors cursor-pointer"
                              title="Tandai Pesanan Telah Dikirim Gudang (BR-07)"
                            >
                              <Truck className="h-3.5 w-3.5 text-blue-600" />
                              <span>Kirim</span>
                            </button>
                          )}
                          {canCreateMayarInvoice(pesanan) && (
                            <button
                              type="button"
                              onClick={() => handleOpenBuatTagihanMayarModal(pesanan)}
                              disabled={isCreatingMayar && creatingMayarPesananId === pesanan.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 disabled:opacity-50 transition-colors cursor-pointer"
                              title="Buat Tautan Tagihan Online Mayar (Manajer, BR-07)"
                            >
                              {creatingMayarPesananId === pesanan.id ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                                  <span>Memproses...</span>
                                </>
                              ) : (
                                <>
                                  <CreditCard className="h-3.5 w-3.5 text-indigo-600" />
                                  <span>Tagih Mayar</span>
                                </>
                              )}
                            </button>
                          )}
                          {hasMayarInvoice(pesanan) && (
                            <button
                              type="button"
                              onClick={() => {
                                setMayarResultModal({
                                  nomor: pesanan.nomor,
                                  payment_id: pesanan.mayar_payment_id!,
                                  payment_url: pesanan.mayar_payment_url!,
                                  status: pesanan.mayar_status || "unpaid",
                                  total: pesanan.total,
                                  isExisting: true,
                                });
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/80 px-2 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 hover:border-indigo-300 transition-colors cursor-pointer"
                              title="Lihat Tautan Tagihan Mayar"
                            >
                              <ExternalLink className="h-3.5 w-3.5 text-indigo-600" />
                              <span>Link Mayar</span>
                            </button>
                          )}
                          {canSettlePesanan(pesanan) && (
                            <button
                              type="button"
                              onClick={() => {
                                setSettleError(null);
                                setSettleModalPesanan(pesanan);
                              }}
                              disabled={isSettling}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-50 transition-colors cursor-pointer"
                              title="Catat Pelunasan Tagihan Pelanggan (Manajer, BR-07, BR-12)"
                            >
                              <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Lunasi</span>
                            </button>
                          )}
                          {canCancelPesanan(pesanan) && (
                            <button
                              type="button"
                              onClick={() => {
                                setCancelError(null);
                                setCancelReason("");
                                setCancelModalPesanan(pesanan);
                              }}
                              disabled={isCancelling}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 hover:border-rose-300 disabled:opacity-50 transition-colors cursor-pointer"
                              title="Batalkan Pesanan (BR-07, BR-08)"
                            >
                              <Ban className="h-3.5 w-3.5 text-rose-600" />
                              <span>Batal</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Baris Info & Paginasi Sejati */}
          <div className="border-t border-slate-200/80 bg-slate-50/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500">
            <div>
              {filteredAndSortedPesanan.length === 0 ? (
                <span>Menampilkan 0 pesanan</span>
              ) : (
                <span>
                  Menampilkan{" "}
                  <strong>{(currentPage - 1) * pageSize + 1}</strong>
                  {" - "}
                  <strong>
                    {Math.min(currentPage * pageSize, filteredAndSortedPesanan.length)}
                  </strong>{" "}
                  dari <strong>{filteredAndSortedPesanan.length}</strong> pesanan
                  {filteredAndSortedPesanan.length !== totalPesananCount && (
                    <span className="text-slate-400"> (total {totalPesananCount})</span>
                  )}
                </span>
              )}
            </div>

            {/* Tombol Paginasi */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 self-center sm:self-auto">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sebelumnya</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    // Hanya tampilkan halaman pertama, terakhir, dan yang dekat dengan halaman aktif
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={page}
                          type="button"
                          onClick={() => setCurrentPage(page)}
                          className={`min-w-[32px] h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            currentPage === page
                              ? "bg-blue-600 text-white shadow-2xs"
                              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    }
                    if (page === currentPage - 2 || page === currentPage + 2) {
                      return (
                        <span key={page} className="px-1 text-slate-400">
                          ...
                        </span>
                      );
                    }
                    return null;
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="hidden sm:inline">Selanjutnya</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Dialog: Rincian Lengkap Pesanan Jual & Item Baris (PRD Bab 7 & 8) */}
      {selectedPesanan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      Rincian Pesanan: {selectedPesanan.nomor}
                    </h3>
                    {renderStatusBadge(selectedPesanan.status)}
                  </div>
                  <p className="text-xs text-slate-500 font-mono">
                    ID Transaksi: {selectedPesanan.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedPesanan(null);
                  setSelectedPesananItems([]);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                title="Tutup Modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Info Pelanggan & Linimasa Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Info Pelanggan */}
                <div className="rounded-xl border border-slate-200/90 bg-slate-50 p-4 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <span className="font-semibold text-slate-700">Toko Mitra / Pelanggan:</span>
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {selectedPesanan.kode_pelanggan || "PLG"}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">
                    {selectedPesanan.nama_toko}
                  </div>
                  <div className="text-slate-600">
                    <span className="text-slate-400">Telepon:</span> {selectedPesanan.telepon_pelanggan || "-"}
                  </div>
                  <div className="text-slate-600">
                    <span className="text-slate-400">Alamat:</span> {selectedPesanan.alamat_pelanggan || "-"}
                  </div>
                </div>

                {/* Linimasa Dokumen */}
                <div className="rounded-xl border border-slate-200/90 bg-slate-50 p-4 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <span className="font-semibold text-slate-700">Linimasa Transaksi:</span>
                    <span className="text-[11px] text-slate-500">Alur Status (PRD Bab 6)</span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">1. Dibuat (Draf):</span>
                      <span className="font-medium text-slate-800">
                        {formatWaktuLokal(selectedPesanan.dibuat_pada)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">2. Dikonfirmasi:</span>
                      <span className="font-medium text-slate-800">
                        {selectedPesanan.dikonfirmasi_pada ? formatWaktuLokal(selectedPesanan.dikonfirmasi_pada) : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">3. Dikirim Gudang:</span>
                      <span className="font-medium text-slate-800">
                        {selectedPesanan.dikirim_pada ? formatWaktuLokal(selectedPesanan.dikirim_pada) : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">4. Jatuh Tempo:</span>
                      <span className="font-medium text-slate-800">
                        {selectedPesanan.jatuh_tempo ? formatTanggalLokal(selectedPesanan.jatuh_tempo) : "-"}
                      </span>
                    </div>
                    {selectedPesanan.dilunasi_pada && (
                      <div className="flex justify-between text-emerald-700 font-semibold pt-1 border-t border-slate-200/60">
                        <span>5. Dilunasi:</span>
                        <span>{formatWaktuLokal(selectedPesanan.dilunasi_pada)}</span>
                      </div>
                    )}
                    {selectedPesanan.dibatalkan_pada && (
                      <div className="text-rose-700 space-y-0.5 pt-1 border-t border-rose-200">
                        <div className="flex justify-between font-semibold">
                          <span>Dibatalkan:</span>
                          <span>{formatWaktuLokal(selectedPesanan.dibatalkan_pada)}</span>
                        </div>
                        {selectedPesanan.alasan_batal && (
                          <p className="italic text-[11px] bg-rose-50 p-1.5 rounded border border-rose-200">
                            Alasan: &quot;{selectedPesanan.alasan_batal}&quot;
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Status & Tautan Mayar Gateway (PRD Bab 11, Migrasi 04) */}
              {selectedPesanan.mayar_payment_id && (
                <div className="rounded-xl border border-indigo-200/90 bg-indigo-50/60 p-4 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-indigo-200/60 pb-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-indigo-600" />
                      <span className="font-semibold text-indigo-950">Gateway Pembayaran Mayar:</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                      selectedPesanan.mayar_status === "paid"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-amber-100 text-amber-900 border border-amber-300"
                    }`}>
                      {selectedPesanan.mayar_status || "UNPAID"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <span className="text-indigo-700/80">ID Transaksi Mayar:</span>
                      <p className="font-mono font-bold text-slate-800 break-all">{selectedPesanan.mayar_payment_id}</p>
                    </div>
                    {selectedPesanan.mayar_payment_url && (
                      <div className="flex flex-col gap-1 sm:items-end justify-center">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyMayarUrl(selectedPesanan.mayar_payment_url!)}
                            className="inline-flex items-center gap-1 rounded border border-indigo-300 bg-white px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 cursor-pointer"
                            title="Salin Tautan Pembayaran"
                          >
                            {isCopiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                            <span>{isCopiedUrl ? "Tersalin" : "Salin Link"}</span>
                          </button>
                          <a
                            href={selectedPesanan.mayar_payment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 shadow-xs cursor-pointer"
                          >
                            <span>Buka Pembayaran</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Rincian Item Baris (Fitur 1: PRD Bab 7 & 8, BR-03, BR-12) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">
                      Rincian Barang yang Dipesan
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-200">
                      {isLoadingItems ? "Memuat..." : `${selectedPesananItems.length} SKU Barang`}
                    </span>
                  </div>
                  {isManager && selectedTotalMargin !== null && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 border border-emerald-200">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Total Margin:</span>
                      <strong className="font-bold text-emerald-900">
                        {formatRupiah(selectedTotalMargin)}
                      </strong>
                      {selectedTotalMarginPersen !== null && (
                        <span className="text-[11px] font-semibold text-emerald-700">
                          ({selectedTotalMarginPersen}%)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {isLoadingItems ? (
                  <div className="rounded-xl border border-slate-200 p-8 text-center bg-slate-50/50 space-y-2">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
                    <p className="text-slate-600 text-xs">Memuat rincian item baris dari database...</p>
                  </div>
                ) : itemsFetchError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 text-xs flex items-center justify-between">
                    <span>{itemsFetchError}</span>
                    <button
                      onClick={() => handleOpenDetailPesanan(selectedPesanan)}
                      className="inline-flex items-center gap-1 rounded bg-rose-600 text-white px-2.5 py-1 font-semibold hover:bg-rose-500 cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Coba Lagi</span>
                    </button>
                  </div>
                ) : selectedPesananItems.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 p-6 text-center text-slate-500 bg-slate-50/50">
                    Tidak ada item baris barang yang tercatat pada pesanan ini.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-100/90 text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                          <th className="px-3 py-2.5 w-10 text-center">#</th>
                          <th className="px-3 py-2.5">Barang</th>
                          <th className="px-3 py-2.5 text-center">Qty</th>
                          <th className="px-3 py-2.5 text-right">Harga Satuan</th>
                          <th className="px-3 py-2.5 text-center">Diskon</th>
                          <th className="px-3 py-2.5 text-right">Subtotal</th>
                          {isManager && (
                            <>
                              <th className="px-3 py-2.5 text-right bg-amber-50/50 text-amber-900 border-l border-amber-100">
                                HPP Satuan
                              </th>
                              <th className="px-3 py-2.5 text-right bg-emerald-50/50 text-emerald-900 border-l border-emerald-100">
                                Margin
                              </th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {selectedPesananItems.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-3 py-2.5 text-center text-slate-400 font-medium">
                              {idx + 1}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-semibold text-slate-900">
                                {item.nama_barang}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                {item.kode_barang} • Satuan: {item.satuan || "pcs"}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold text-slate-900">
                              {item.jumlah}
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-700 whitespace-nowrap">
                              {formatRupiah(item.harga_satuan)}
                            </td>
                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                              {item.diskon_persen > 0 ? (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                  {item.diskon_persen}%
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
                              {formatRupiah(item.subtotal)}
                            </td>
                            {isManager && (
                              <>
                                <td className="px-3 py-2.5 text-right text-slate-600 font-mono whitespace-nowrap bg-amber-50/20 border-l border-amber-100">
                                  {item.hpp_satuan !== null && item.hpp_satuan !== undefined
                                    ? formatRupiah(item.hpp_satuan)
                                    : "-"}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50/20 border-l border-emerald-100">
                                  {item.margin !== null && item.margin !== undefined ? (
                                    <div className="flex flex-col items-end">
                                      <span>{formatRupiah(item.margin)}</span>
                                      {item.margin_persen !== null && (
                                        <span className="text-[10px] text-emerald-600">
                                          ({item.margin_persen}%)
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    "-"
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 bg-slate-50/80 font-bold text-xs text-slate-900">
                          <td colSpan={2} className="px-3 py-2.5 text-slate-700">
                            Total Ringkasan:
                          </td>
                          <td className="px-3 py-2.5 text-center text-blue-700">
                            {selectedPesananItems.reduce((acc, it) => acc + it.jumlah, 0)} unit
                          </td>
                          <td colSpan={2} className="px-3 py-2.5 text-right text-slate-500">
                            Total Tagihan Dokumen:
                          </td>
                          <td className="px-3 py-2.5 text-right text-blue-700 font-extrabold text-sm whitespace-nowrap">
                            {formatRupiah(selectedPesanan.total)}
                          </td>
                          {isManager && (
                            <>
                              <td className="px-3 py-2.5 bg-amber-50/40 border-l border-amber-100"></td>
                              <td className="px-3 py-2.5 text-right text-emerald-800 font-extrabold bg-emerald-50/40 border-l border-emerald-100 whitespace-nowrap">
                                {selectedTotalMargin !== null ? formatRupiah(selectedTotalMargin) : "-"}
                              </td>
                            </>
                          )}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Catatan Hak Akses & Privasi BR-12 */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] text-slate-600 flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  {isManager ? (
                    <p>
                      <strong>Kerahasiaan Finansial (BR-12):</strong> Sebagai Manajer, Anda memiliki akses membaca HPP Satuan dan kalkulasi margin keuntungan. Data ini dirahasiakan dan tidak pernah dibocorkan kepada peran Staf Penjualan maupun Gudang.
                    </p>
                  ) : (
                    <p>
                      <strong>Kebijakan Akses (BR-12):</strong> Tampilan ini menyajikan rincian item baris pesanan, kuantitas, harga jual satuan, diskon, dan subtotal yang disepakati toko.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer with Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-6 py-4 bg-slate-50/50 rounded-b-2xl shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                {/* Aksi 1: Konfirmasi Pesanan (Draf -> Dikonfirmasi) */}
                {canConfirmPesanan(selectedPesanan) && (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmError(null);
                      setConfirmModalPesanan(selectedPesanan);
                    }}
                    disabled={isConfirming}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Konfirmasi Pesanan</span>
                  </button>
                )}

                {/* Aksi 2: Kirim Pesanan (Dikonfirmasi -> Dikirim) (Fitur 2) */}
                {canShipPesanan(selectedPesanan) && (
                  <button
                    type="button"
                    onClick={() => {
                      setShipError(null);
                      setShipModalPesanan(selectedPesanan);
                    }}
                    disabled={isShipping}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Truck className="h-4 w-4" />
                    <span>Tandai Dikirim Gudang</span>
                  </button>
                )}

                {/* Pesan Informatif jika Pesanan Sudah Dikirim */}
                {selectedPesanan.status === "dikirim" && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-800">
                    <Truck className="h-4 w-4 text-blue-600" />
                    <span>Pesanan Telah Dikirim Gudang</span>
                  </div>
                )}

                {/* Aksi Buat Tagihan Mayar (Dikirim -> Tagihan Online Terbit) */}
                {canCreateMayarInvoice(selectedPesanan) && (
                  <button
                    type="button"
                    onClick={() => handleOpenBuatTagihanMayarModal(selectedPesanan)}
                    disabled={isCreatingMayar}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
                    title="Terbitkan Tautan Pembayaran Resmi Mayar (BR-07)"
                  >
                    {isCreatingMayar && creatingMayarPesananId === selectedPesanan.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Menghubungi Mayar...</span>
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4" />
                        <span>Buat Tagihan Mayar</span>
                      </>
                    )}
                  </button>
                )}

                {/* Aksi 3: Catat Pelunasan (Dikirim -> Lunas) (Fitur 3) */}
                {canSettlePesanan(selectedPesanan) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSettleError(null);
                      setSettleModalPesanan(selectedPesanan);
                    }}
                    disabled={isSettling}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <DollarSign className="h-4 w-4" />
                    <span>Catat Pelunasan Tagihan</span>
                  </button>
                )}

                {/* Aksi 4: Pembatalan Pesanan (BR-07, BR-08) */}
                {canCancelPesanan(selectedPesanan) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelError(null);
                      setCancelReason("");
                      setCancelModalPesanan(selectedPesanan);
                    }}
                    disabled={isCancelling}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Ban className="h-4 w-4 text-rose-600" />
                    <span>Batalkan Pesanan</span>
                  </button>
                )}
              </div>

              <button
                onClick={() => {
                  setSelectedPesanan(null);
                  setSelectedPesananItems([]);
                }}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Tutup Rincian
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog: Formulir Pembuatan Draf Pesanan Jual Baru */}
      <BuatPesananModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        userRole={serverProfile.peran}
        pelangganList={pelangganList}
        barangList={barangList}
        pelangganError={pelangganError}
        barangError={barangError}
        onSuccess={(data) => {
          setIsCreateModalOpen(false);
          setSuccessNotification({
            nomor: data.nomor,
            total: data.total,
          });
          router.refresh();
        }}
      />

      {/* Modal Dialog: Konfirmasi Pesanan Jual Visual (Tahap 4) */}
      {confirmModalPesanan && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 shrink-0">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Konfirmasi Pesanan Jual?
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Dokumen: <strong className="font-mono text-slate-800">{confirmModalPesanan.nomor}</strong>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-xs space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Toko / Pelanggan:</span>
                <span className="font-semibold text-slate-900">{confirmModalPesanan.nama_toko}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Tagihan:</span>
                <span className="font-bold text-slate-900">{formatRupiah(confirmModalPesanan.total)}</span>
              </div>
            </div>

            <div className="rounded-xl bg-amber-50/80 border border-amber-200/80 p-3 text-[11px] text-amber-900 space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-amber-950">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Konsekuensi Bisnis (PRD Bab 6):</span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
                <li>Stok barang di gudang akan otomatis dipotong secara permanen.</li>
                <li>Nilai pesanan akan masuk ke dalam piutang berjalan pelanggan.</li>
                <li>Status berubah menjadi <strong>Dikonfirmasi</strong> dan siap dikirim Gudang.</li>
                <li>Staf Penjualan tidak dapat membatalkan pesanan setelah dikonfirmasi.</li>
              </ul>
            </div>

            {confirmError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-rose-900">Konfirmasi Ditolak Sistem:</span>
                  <p className="mt-0.5">{confirmError}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isConfirming}
                onClick={() => {
                  setConfirmModalPesanan(null);
                  setConfirmError(null);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isConfirming}
                onClick={handleExecuteKonfirmasi}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Ya, Konfirmasi Pesanan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog: Pengiriman Pesanan Jual (Dikonfirmasi -> Dikirim) */}
      {shipModalPesanan && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 shrink-0">
                <Truck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {shipModalPesanan.status === "dikirim"
                    ? "Pesanan Telah Dikirim"
                    : "Kirim Pesanan Jual?"}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Dokumen: <strong className="font-mono text-slate-800">{shipModalPesanan.nomor}</strong>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-xs space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Toko / Pelanggan:</span>
                <span className="font-semibold text-slate-900">{shipModalPesanan.nama_toko}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Tagihan:</span>
                <span className="font-bold text-slate-900">{formatRupiah(shipModalPesanan.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status Saat Ini:</span>
                <span className="font-semibold capitalize text-slate-900">{shipModalPesanan.status}</span>
              </div>
            </div>

            {shipModalPesanan.status === "dikirim" ? (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-blue-950">Informasi Pengiriman:</span>
                  <p className="mt-0.5 text-blue-800">
                    Pesanan jual ini telah berstatus <strong>Dikirim</strong>. Dokumen pengiriman sudah diproses oleh Staf Gudang dan tidak perlu dikirim ulang.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-indigo-50/70 border border-indigo-200/70 p-3 text-[11px] text-indigo-900 space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-indigo-950">
                  <Truck className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span>Ketentuan Pengiriman (PRD Bab 6.1 & BR-07):</span>
                </div>
                <ul className="list-disc pl-4 space-y-0.5 text-indigo-800">
                  <li>Status dokumen akan diperbarui menjadi <strong>Dikirim</strong>.</li>
                  <li>Waktu pengiriman dicatat hari ini secara otomatis.</li>
                  <li>Tanggal jatuh tempo dihitung berdasarkan termin toko dari hari ini.</li>
                  <li>Hanya Staf Gudang &amp; Manajer yang berhak memproses pengiriman.</li>
                </ul>
              </div>
            )}

            {shipError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-rose-900">Pengiriman Ditolak:</span>
                  <p className="mt-0.5">{shipError}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isShipping}
                onClick={() => {
                  setShipModalPesanan(null);
                  setShipError(null);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {shipError || shipModalPesanan.status === "dikirim" ? "Tutup" : "Batal"}
              </button>
              {shipModalPesanan.status !== "dikirim" && (
                <button
                  type="button"
                  disabled={isShipping}
                  onClick={handleExecuteKirim}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {isShipping ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <Truck className="h-4 w-4" />
                      <span>Ya, Kirim Pesanan</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog: Pelunasan Pesanan Jual (Dikirim -> Lunas) */}
      {settleModalPesanan && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-teal-50 p-2.5 text-teal-600 shrink-0">
                <DollarSign className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Konfirmasi Pelunasan Tagihan?
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Dokumen: <strong className="font-mono text-slate-800">{settleModalPesanan.nomor}</strong>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-xs space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Toko / Pelanggan:</span>
                <span className="font-semibold text-slate-900">{settleModalPesanan.nama_toko}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Tagihan Dilunasi:</span>
                <span className="font-bold text-teal-700 text-sm">{formatRupiah(settleModalPesanan.total)}</span>
              </div>
            </div>

            <div className="rounded-xl bg-teal-50/70 border border-teal-200/70 p-3 text-[11px] text-teal-900 space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-teal-950">
                <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0" />
                <span>Otorisasi &amp; Audit Log (PRD Bab 6.1, BR-07, BR-12):</span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-teal-800">
                <li>Status dokumen akan diperbarui menjadi <strong>Lunas</strong>.</li>
                <li>Tagihan piutang toko dianggap telah diselesaikan secara penuh.</li>
                <li>Tindakan dicatat dalam <em>Audit Log</em> sistem dengan identitas akun Anda.</li>
                <li>Hanya <strong>Manajer</strong> yang memiliki wewenang mencatat pelunasan.</li>
              </ul>
            </div>

            {settleError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-rose-900">Pelunasan Ditolak:</span>
                  <p className="mt-0.5">{settleError}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isSettling}
                onClick={() => {
                  setSettleModalPesanan(null);
                  setSettleError(null);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSettling}
                onClick={handleExecutePelunasan}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isSettling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Ya, Tandai Lunas</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog: Pembatalan Pesanan Jual (Draf / Dikonfirmasi -> Batal) */}
      {cancelModalPesanan && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-rose-50 p-2.5 text-rose-600 shrink-0">
                <Ban className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Batalkan Pesanan Jual?
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Dokumen: <strong className="font-mono text-slate-800">{cancelModalPesanan.nomor}</strong>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-xs space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Toko / Pelanggan:</span>
                <span className="font-semibold text-slate-900">{cancelModalPesanan.nama_toko}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status Saat Ini:</span>
                <span className="font-semibold uppercase text-slate-900">{cancelModalPesanan.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nilai Pesanan:</span>
                <span className="font-bold text-slate-900">{formatRupiah(cancelModalPesanan.total)}</span>
              </div>
            </div>

            {cancelModalPesanan.status === 'dikonfirmasi' ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-amber-50/80 border border-amber-200/80 p-3 text-[11px] text-amber-900 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-950">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Ketentuan Pembatalan Pesanan Dikonfirmasi (BR-08):</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
                    <li>Hanya <strong>Manajer</strong> yang berwenang membatalkan pesanan yang telah dikonfirmasi.</li>
                    <li>Wajib memberikan alasan pembatalan yang jelas (minimal 10 karakter).</li>
                    <li>Stok barang akan otomatis dikembalikan ke saldo gudang (mutasi tipe batal).</li>
                    <li>Tindakan dicatat dalam <em>Audit Log</em> sistem.</li>
                  </ul>
                </div>

                <div>
                  <label htmlFor="cancelReasonInput" className="block text-xs font-semibold text-slate-700 mb-1">
                    Alasan Pembatalan <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="cancelReasonInput"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Contoh: Pelanggan meminta penundaan karena renovasi gudang toko..."
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none resize-none"
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                    <span>Minimal 10 karakter</span>
                    <span className={cancelReason.trim().length >= 10 ? 'text-emerald-600 font-semibold' : 'text-slate-400'}>
                      {cancelReason.trim().length}/10 karakter
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-slate-100 p-3 text-[11px] text-slate-600">
                Pesanan masih berstatus <strong>Draf</strong>. Pembatalan tidak akan memengaruhi saldo stok gudang karena stok belum terpotong.
              </div>
            )}

            {cancelError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-rose-900">Pembatalan Ditolak:</span>
                  <p className="mt-0.5">{cancelError}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isCancelling}
                onClick={() => {
                  setCancelModalPesanan(null);
                  setCancelError(null);
                  setCancelReason('');
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={
                  isCancelling ||
                  (cancelModalPesanan.status === 'dikonfirmasi' && cancelReason.trim().length < 10)
                }
                onClick={handleExecuteBatal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Membatalkan...</span>
                  </>
                ) : (
                  <>
                    <Ban className="h-4 w-4" />
                    <span>Ya, Batalkan Pesanan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog: Input Email Pelanggan untuk Tagihan Mayar */}
      {mayarInputModalPesanan && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 shrink-0">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Buat Tagihan Mayar
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Dokumen: <strong className="font-mono text-slate-800">{mayarInputModalPesanan.nomor}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isCreatingMayar}
                onClick={() => {
                  setMayarInputModalPesanan(null);
                  setMayarEmailError(null);
                  setMayarError(null);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-xs space-y-2 text-slate-700">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Toko / Pelanggan:</span>
                <span className="font-semibold text-slate-900">{mayarInputModalPesanan.nama_toko || "Pelanggan Toko"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Nomor Telepon / WA:</span>
                <span className="font-mono font-medium text-slate-900">
                  {mayarInputModalPesanan.telepon_pelanggan || (
                    <span className="text-rose-500 font-sans italic">Belum terdaftar</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                <span className="text-slate-500">Total Nominal:</span>
                <span className="font-bold text-slate-900 text-sm">{formatRupiah(mayarInputModalPesanan.total)}</span>
              </div>
            </div>

            {!mayarInputModalPesanan.telepon_pelanggan && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-amber-900">Nomor Telepon Belum Terdaftar:</span>
                  <p className="mt-0.5 text-[11px]">
                    Sesuai spesifikasi Mayar API v1, nomor ponsel pelanggan wajib tersedia untuk penerbitan tagihan. Mohon lengkapi nomor telepon pelanggan terlebih dahulu pada master data pelanggan.
                  </p>
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const email = mayarCustomerEmail.trim();
                if (!email) {
                  setMayarEmailError("Alamat email pelanggan wajib diisi.");
                  return;
                }
                if (!email.includes("@") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                  setMayarEmailError("Format alamat email tidak valid (contoh: nama@domain.com).");
                  return;
                }
                handleExecuteBuatTagihanMayar(mayarInputModalPesanan, email);
              }}
              className="space-y-3"
            >
              <div>
                <label htmlFor="mayarCustomerEmailInput" className="block text-xs font-semibold text-slate-700 mb-1">
                  Alamat Email Pelanggan <span className="text-rose-500">*</span>
                </label>
                <input
                  id="mayarCustomerEmailInput"
                  type="email"
                  value={mayarCustomerEmail}
                  onChange={(e) => {
                    setMayarCustomerEmail(e.target.value);
                    setMayarEmailError(null);
                    setMayarError(null);
                  }}
                  disabled={isCreatingMayar || !mayarInputModalPesanan.telepon_pelanggan}
                  placeholder="contoh: keuangan@tokoberkah.com"
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none disabled:bg-slate-100 disabled:opacity-60"
                  autoFocus
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Tautan pembayaran dan bukti tagihan Mayar akan dikirimkan ke alamat email ini.
                </p>
                {mayarEmailError && (
                  <p className="mt-1 text-xs text-rose-600 font-medium">{mayarEmailError}</p>
                )}
              </div>

              {mayarError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-rose-900">Pembuatan Tagihan Gagal:</span>
                    <p className="mt-0.5 text-[11px]">{mayarError}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isCreatingMayar}
                  onClick={() => {
                    setMayarInputModalPesanan(null);
                    setMayarEmailError(null);
                    setMayarError(null);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    isCreatingMayar ||
                    !mayarInputModalPesanan.telepon_pelanggan ||
                    !mayarCustomerEmail.trim()
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isCreatingMayar ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Memproses ke Mayar...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      <span>Lanjutkan & Terbitkan Tagihan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Dialog: Hasil & Tautan Tagihan Mayar (Migrasi 04, PRD Bab 11) */}
      {mayarResultModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 shrink-0">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {mayarResultModal.isExisting ? "Informasi Tagihan Mayar" : "Tagihan Mayar Berhasil Dibuat"}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Dokumen: <strong className="font-mono text-slate-800">{mayarResultModal.nomor}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMayarResultModal(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 text-xs space-y-2 text-slate-700">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                <span className="text-slate-500">Total Nominal Tagihan:</span>
                <span className="font-bold text-slate-900 text-sm">{formatRupiah(mayarResultModal.total)}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                <span className="text-slate-500">Status Invoice Mayar:</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                  mayarResultModal.status === "paid"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : "bg-amber-100 text-amber-900 border border-amber-300"
                }`}>
                  {mayarResultModal.status || "UNPAID"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Mayar Payment ID:</span>
                <span className="font-mono text-xs font-semibold text-slate-800 select-all break-all bg-white p-1.5 rounded border border-slate-200 block">
                  {mayarResultModal.payment_id}
                </span>
              </div>
            </div>

            {/* Box Tautan Pembayaran */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Tautan Pembayaran Pelanggan:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={mayarResultModal.payment_url}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-800 select-all focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => handleCopyMayarUrl(mayarResultModal.payment_url)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors shrink-0 cursor-pointer"
                  title="Salin Tautan"
                >
                  {isCopiedUrl ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  <span>{isCopiedUrl ? "Tersalin" : "Salin"}</span>
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-indigo-50/70 border border-indigo-200/70 p-3 text-[11px] text-indigo-900 space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-indigo-950">
                <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>Informasi Alur Transaksi (PRD Bab 6.1, BR-07):</span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-indigo-800">
                <li>Status dokumen pesanan <strong>tetap Dikirim</strong> (piutang belum berkurang sebelum pembayaran terverifikasi).</li>
                <li>Kirimkan tautan pembayaran di atas kepada toko pelanggan via WhatsApp/Email.</li>
                <li>Pelunasan otomatis akan dicatat saat webhook resmi Mayar menerima pelunasan dari pelanggan.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMayarResultModal(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Tutup
              </button>
              <a
                href={mayarResultModal.payment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-xs transition-colors cursor-pointer"
              >
                <span>Buka Halaman Pembayaran</span>
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
