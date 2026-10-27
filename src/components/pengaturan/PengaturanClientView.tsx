"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Settings,
  Users,
  FileText,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Edit,
  Building,
  ShieldCheck,
  Info,
  RotateCcw,
  X,
  ChevronLeft,
  ChevronRight,
  Shield,
  UserCheck,
  Activity,
  Layers,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import {
  UserProfile,
  DbUserRole,
  VALID_ROLES,
  roleDisplayLabel,
  mapDbRoleToDashboardRole,
} from "@/types/auth";
import { logoutUser } from "@/lib/supabase/auth";
import { PengaturanDataPayload } from "@/types/pengaturan";
import { updateUserRoleAndStatus } from "@/app/pengaturan/actions";

interface PengaturanClientViewProps {
  serverProfile: UserProfile;
  initialData: PengaturanDataPayload;
}

export default function PengaturanClientView({
  serverProfile,
  initialData,
}: PengaturanClientViewProps) {
  const router = useRouter();
  const [data, setData] = useState<PengaturanDataPayload>(initialData);
  const [prevInitialData, setPrevInitialData] = useState<PengaturanDataPayload>(initialData);
  const [activeTab, setActiveTab] = useState<"users" | "audit" | "system">("users");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sinkronkan state saat initialData dari server berganti (pattern resmi React)
  if (prevInitialData !== initialData) {
    setPrevInitialData(initialData);
    setData(initialData);
  }

  // Modal edit user
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState<DbUserRole>("penjualan");
  const [editActive, setEditActive] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter Pengguna
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("semua");
  const [userStatusFilter, setUserStatusFilter] = useState<string>("semua");

  // Filter & Pagination Audit Log
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("semua");
  const [auditTableFilter, setAuditTableFilter] = useState("semua");
  const [auditPage, setAuditPage] = useState(1);
  const auditPageSize = 12;

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
      showToast("Data pengaturan berhasil disegarkan.");
    }, 600);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Buka modal edit pengguna
  const openEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setEditRole(user.peran);
    setEditActive(user.aktif);
    setModalError(null);
  };

  // Simpan perubahan role / status
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsSubmitting(true);
    setModalError(null);

    const res = await updateUserRoleAndStatus({
      targetUserId: editingUser.id,
      newRole: editRole,
      newStatus: editActive,
    });

    setIsSubmitting(false);

    if (!res.success) {
      setModalError(res.error || "Gagal menyimpan perubahan profil.");
      return;
    }

    // Perbarui state lokal seketika
    setData((prev) => ({
      ...prev,
      profilesList: prev.profilesList.map((p) =>
        p.id === editingUser.id ? { ...p, peran: editRole, aktif: editActive } : p
      ),
    }));

    const targetName = editingUser.nama_lengkap;
    setEditingUser(null);
    showToast(`Profil ${targetName} berhasil diperbarui.`);
    router.refresh();
  };

  // Format tanggal dan waktu ke WIB
  const formatDateTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return (
        new Intl.DateTimeFormat("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Jakarta",
        }).format(d) + " WIB"
      );
    } catch {
      return isoStr;
    }
  };

  // Badge warna untuk peran pengguna
  const renderRoleBadge = (role: DbUserRole) => {
    switch (role) {
      case "manajer":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200/70 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
            <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
            Manajer
          </span>
        );
      case "penjualan":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/70 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            <Users className="h-3.5 w-3.5 text-blue-600" />
            Staf Penjualan
          </span>
        );
      case "gudang":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200/70 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            <Building className="h-3.5 w-3.5 text-amber-600" />
            Staf Gudang
          </span>
        );
      default:
        return <span>{role}</span>;
    }
  };

  // Badge warna aksi audit log
  const renderActionBadge = (aksi: string) => {
    let bg = "bg-slate-100 text-slate-700 border-slate-200";
    if (aksi.includes("konfirmasi") || aksi.includes("pelunasan") || aksi.includes("lunas") || aksi.includes("setujui")) {
      bg = "bg-emerald-50 text-emerald-700 border-emerald-200/70";
    } else if (aksi.includes("batal") || aksi.includes("tolak") || aksi.includes("nonaktif")) {
      bg = "bg-rose-50 text-rose-700 border-rose-200/70";
    } else if (aksi.includes("peran") || aksi.includes("ubah") || aksi.includes("edit")) {
      bg = "bg-blue-50 text-blue-700 border-blue-200/70";
    } else if (aksi.includes("kirim") || aksi.includes("terima")) {
      bg = "bg-purple-50 text-purple-700 border-purple-200/70";
    } else if (aksi.includes("stok")) {
      bg = "bg-amber-50 text-amber-700 border-amber-200/70";
    }
    return (
      <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-mono font-semibold ${bg}`}>
        {aksi}
      </span>
    );
  };

  // Format visual object data diff audit log
  const renderDataDiff = (dataObj: Record<string, unknown> | null, isNew: boolean) => {
    if (!dataObj || Object.keys(dataObj).length === 0) {
      return <span className="text-slate-400 italic text-[10px]">-</span>;
    }
    return (
      <div className="flex flex-wrap gap-1.5 items-center">
        {Object.entries(dataObj).map(([key, val]) => (
          <span
            key={key}
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono ${
              isNew
                ? "bg-blue-50 text-blue-800 border border-blue-200/60"
                : "bg-slate-100 text-slate-600 border border-slate-200/60 line-through"
            }`}
          >
            <span className="font-semibold text-slate-500">{key}:</span>
            <span>{typeof val === "object" && val !== null ? JSON.stringify(val) : String(val)}</span>
          </span>
        ))}
      </div>
    );
  };

  // =========================================================================
  // FILTERING: AKUN PENGGUNA
  // =========================================================================
  const filteredUsers = useMemo(() => {
    let list = [...data.profilesList];

    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      list = list.filter(
        (u) =>
          u.nama_lengkap.toLowerCase().includes(q) ||
          u.id.toLowerCase().includes(q)
      );
    }

    if (userRoleFilter !== "semua") {
      list = list.filter((u) => u.peran === userRoleFilter);
    }

    if (userStatusFilter !== "semua") {
      const isActive = userStatusFilter === "aktif";
      list = list.filter((u) => u.aktif === isActive);
    }

    return list;
  }, [data.profilesList, userSearch, userRoleFilter, userStatusFilter]);

  const isUserFilterActive =
    userSearch.trim() !== "" || userRoleFilter !== "semua" || userStatusFilter !== "semua";

  const handleResetUserFilters = () => {
    setUserSearch("");
    setUserRoleFilter("semua");
    setUserStatusFilter("semua");
  };

  // =========================================================================
  // FILTERING & PAGINATION: AUDIT LOG
  // =========================================================================
  const filteredAuditLogs = useMemo(() => {
    let list = [...data.auditLogs];

    if (auditActionFilter !== "semua") {
      list = list.filter((l) => l.aksi.toLowerCase() === auditActionFilter.toLowerCase());
    }

    if (auditTableFilter !== "semua") {
      list = list.filter((l) => l.nama_tabel.toLowerCase() === auditTableFilter.toLowerCase());
    }

    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase();
      list = list.filter(
        (l) =>
          (l.pelaku_nama && l.pelaku_nama.toLowerCase().includes(q)) ||
          l.nama_tabel.toLowerCase().includes(q) ||
          l.aksi.toLowerCase().includes(q) ||
          l.data_id.toLowerCase().includes(q)
      );
    }

    return list;
  }, [data.auditLogs, auditActionFilter, auditTableFilter, auditSearch]);

  const totalAuditPages = Math.max(1, Math.ceil(filteredAuditLogs.length / auditPageSize));
  const paginatedAuditLogs = useMemo(() => {
    const start = (auditPage - 1) * auditPageSize;
    return filteredAuditLogs.slice(start, start + auditPageSize);
  }, [filteredAuditLogs, auditPage, auditPageSize]);

  const isAuditFilterActive =
    auditSearch.trim() !== "" || auditActionFilter !== "semua" || auditTableFilter !== "semua";

  const handleResetAuditFilters = () => {
    setAuditSearch("");
    setAuditActionFilter("semua");
    setAuditTableFilter("semua");
    setAuditPage(1);
  };

  // Daftar tabel unik dari audit log
  const uniqueTables = useMemo(() => {
    const set = new Set(data.auditLogs.map((l) => l.nama_tabel));
    return Array.from(set);
  }, [data.auditLogs]);

  // Statistik Ringkas Pengaturan
  const totalUsers = data.profilesList.length;
  const activeUsersCount = data.profilesList.filter((p) => p.aktif).length;
  const managerCount = data.profilesList.filter((p) => p.peran === "manajer").length;
  const salesCount = data.profilesList.filter((p) => p.peran === "penjualan").length;
  const warehouseCount = data.profilesList.filter((p) => p.peran === "gudang").length;

  return (
    <AppLayout
      currentRole={dashboardRole}
      activePath="/pengaturan"
      userProfile={serverProfile}
      onLogout={handleLogout}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* ================================================================= */}
        {/* TOAST FEEDBACK                                                    */}
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
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                    Pengaturan Sistem & Hak Akses
                  </h1>
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/70 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                    <ShieldCheck className="h-3 w-3" />
                    Khusus Akses Manajer
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Manajemen akun pengguna, audit log aktivitas, dan konfigurasi CV Sinar Abadi Niaga
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition active:scale-95 disabled:opacity-50"
                title="Segarkan data pengaturan dari database"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-blue-600" : ""}`} />
                <span>Segarkan</span>
              </button>
            </div>
          </div>
        </div>

        {/* Notifikasi error awal jika ada */}
        {data.error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-3 shadow-xs">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Pemberitahuan Sistem Pengaturan</p>
              <p className="text-xs text-red-600 mt-0.5">{data.error}</p>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* KPI METRIC CARDS                                                  */}
        {/* ================================================================= */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Card 1: Total Pengguna */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Pengguna Terdaftar
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-slate-900">
                {totalUsers} <span className="text-xs font-normal text-slate-500">Akun</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                  <UserCheck className="h-3 w-3" />
                  {activeUsersCount} Aktif
                </span>
                {totalUsers - activeUsersCount > 0 && (
                  <span className="text-[11px] text-rose-500 font-medium">
                    • {totalUsers - activeUsersCount} Nonaktif
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Distribusi Peran */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Distribusi Peran Akses
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <Shield className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-600" />
                  <span className="font-semibold text-slate-800">{managerCount}</span>
                  <span className="text-[11px] text-slate-500">Manajer</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  <span className="font-semibold text-slate-800">{salesCount}</span>
                  <span className="text-[11px] text-slate-500">Penjualan</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="font-semibold text-slate-800">{warehouseCount}</span>
                  <span className="text-[11px] text-slate-500">Gudang</span>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Otorisasi berjenjang berbasis peran (Role-Based Access)
              </p>
            </div>
          </div>

          {/* Card 3: Aktivitas Audit Log */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Riwayat Audit Log
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-slate-900">
                {data.auditLogs.length} <span className="text-xs font-normal text-slate-500">Catatan</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Jejak perubahan data krusial &amp; hak akses (BR-12)
              </p>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* TABS CONTROLS                                                     */}
        {/* ================================================================= */}
        <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-medium text-slate-600">
          <button
            onClick={() => setActiveTab("users")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 transition ${
              activeTab === "users"
                ? "bg-white font-semibold text-slate-900 shadow-xs"
                : "hover:text-slate-900"
            }`}
          >
            <Users className="h-4 w-4 text-blue-600" />
            <span>Akun &amp; Peran Pengguna ({data.profilesList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("audit")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 transition ${
              activeTab === "audit"
                ? "bg-white font-semibold text-slate-900 shadow-xs"
                : "hover:text-slate-900"
            }`}
          >
            <FileText className="h-4 w-4 text-emerald-600" />
            <span>Audit Log Sistem ({data.auditLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("system")}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 transition ${
              activeTab === "system"
                ? "bg-white font-semibold text-slate-900 shadow-xs"
                : "hover:text-slate-900"
            }`}
          >
            <Info className="h-4 w-4 text-purple-600" />
            <span>Informasi Bisnis &amp; Aturan ERP</span>
          </button>
        </div>

        {/* ================================================================= */}
        {/* TAB 1: MANAJEMEN AKUN & PERAN                                     */}
        {/* ================================================================= */}
        {activeTab === "users" && (
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    Daftar Akun Pengguna Terdaftar
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {filteredUsers.length} pengguna
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sesuai aturan BR-12, hanya Manajer yang berwenang mengubah peran dan status keaktifan akun.
                </p>
              </div>

              {/* Filter controls */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari nama / ID pengguna..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="h-9 w-44 sm:w-56 rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-hidden"
                  />
                  {userSearch && (
                    <button
                      onClick={() => setUserSearch("")}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-hidden"
                >
                  <option value="semua">Semua Peran</option>
                  <option value="manajer">Manajer</option>
                  <option value="penjualan">Staf Penjualan</option>
                  <option value="gudang">Staf Gudang</option>
                </select>

                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-hidden"
                >
                  <option value="semua">Semua Status</option>
                  <option value="aktif">Hanya Aktif</option>
                  <option value="nonaktif">Hanya Nonaktif</option>
                </select>
              </div>
            </div>

            {/* Filter Chips jika aktif */}
            {isUserFilterActive && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="text-slate-500 font-medium">Filter aktif:</span>
                {userSearch && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 font-medium text-blue-700">
                    Cari: &quot;{userSearch}&quot;
                    <button onClick={() => setUserSearch("")} className="hover:text-blue-900">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {userRoleFilter !== "semua" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 font-medium text-blue-700">
                    Peran: {roleDisplayLabel(userRoleFilter as DbUserRole)}
                    <button onClick={() => setUserRoleFilter("semua")} className="hover:text-blue-900">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {userStatusFilter !== "semua" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 font-medium text-blue-700">
                    Status: {userStatusFilter === "aktif" ? "Aktif" : "Nonaktif"}
                    <button onClick={() => setUserStatusFilter("semua")} className="hover:text-blue-900">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                <button
                  onClick={handleResetUserFilters}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 ml-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset Filter
                </button>
              </div>
            )}

            {/* Tabel Akun Pengguna */}
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100/90 text-[11px] font-semibold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Pengguna</th>
                    <th className="px-4 py-3">Peran (Role)</th>
                    <th className="px-4 py-3 text-center">Status Akun</th>
                    <th className="px-4 py-3">Terdaftar Pada</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Users className="h-8 w-8 text-slate-300" />
                          <p className="font-medium text-slate-600">Tidak ada akun yang sesuai kriteria.</p>
                          {isUserFilterActive && (
                            <button
                              onClick={handleResetUserFilters}
                              className="mt-1 text-xs font-semibold text-blue-600 hover:underline"
                            >
                              Reset filter pencarian
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const isCurrentUser = user.id === serverProfile.id;
                      return (
                        <tr key={user.id} className="hover:bg-slate-50/70 transition">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold text-xs shadow-2xs ${
                                  user.peran === "manajer"
                                    ? "bg-purple-100 text-purple-700 border border-purple-200"
                                    : user.peran === "penjualan"
                                    ? "bg-blue-100 text-blue-700 border border-blue-200"
                                    : "bg-amber-100 text-amber-700 border border-amber-200"
                                }`}
                              >
                                {user.nama_lengkap.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="font-semibold text-slate-900">{user.nama_lengkap}</p>
                                  {isCurrentUser && (
                                    <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200/80 px-2 py-0.2 text-[10px] font-semibold text-blue-700">
                                      Akun Anda
                                    </span>
                                  )}
                                </div>
                                <p className="font-mono text-[10px] text-slate-400 mt-0.5">
                                  ID: {user.id.slice(0, 8)}...
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">{renderRoleBadge(user.peran)}</td>
                          <td className="px-4 py-3.5 text-center">
                            {user.aktif ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                <CheckCircle2 className="h-3 w-3" />
                                Aktif
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-800">
                                <XCircle className="h-3 w-3" />
                                Nonaktif
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-slate-500 font-medium">
                            {user.dibuat_pada ? formatDateTime(user.dibuat_pada) : "-"}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <button
                              onClick={() => openEditModal(user)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-blue-700 hover:border-blue-200 transition active:scale-95"
                            >
                              <Edit className="h-3.5 w-3.5 text-slate-400" />
                              <span>Ubah Peran / Status</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: AUDIT LOG AKTIVITAS SISTEM                                 */}
        {/* ================================================================= */}
        {activeTab === "audit" && (
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    Audit Log Jejak Aktivitas
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {filteredAuditLogs.length} catatan
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rekaman riwayat perubahan data krusial, konfirmasi pesanan, dan penyesuaian hak akses (BR-12)
                </p>
              </div>

              {/* Filter Action & Search */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari pelaku / aksi / ID..."
                    value={auditSearch}
                    onChange={(e) => {
                      setAuditSearch(e.target.value);
                      setAuditPage(1);
                    }}
                    className="h-9 w-44 sm:w-56 rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-hidden"
                  />
                  {auditSearch && (
                    <button
                      onClick={() => {
                        setAuditSearch("");
                        setAuditPage(1);
                      }}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <select
                  value={auditActionFilter}
                  onChange={(e) => {
                    setAuditActionFilter(e.target.value);
                    setAuditPage(1);
                  }}
                  className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-hidden"
                >
                  <option value="semua">Semua Aksi</option>
                  <option value="ubah_peran">ubah_peran</option>
                  <option value="ubah_status_akun">ubah_status_akun</option>
                  <option value="ubah_batas_kredit">ubah_batas_kredit</option>
                  <option value="konfirmasi">konfirmasi</option>
                  <option value="kirim">kirim</option>
                  <option value="pelunasan">pelunasan</option>
                  <option value="pembatalan">pembatalan</option>
                  <option value="penyesuaian_stok">penyesuaian_stok</option>
                </select>

                <select
                  value={auditTableFilter}
                  onChange={(e) => {
                    setAuditTableFilter(e.target.value);
                    setAuditPage(1);
                  }}
                  className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-hidden"
                >
                  <option value="semua">Semua Tabel</option>
                  {uniqueTables.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter Chips jika aktif */}
            {isAuditFilterActive && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="text-slate-500 font-medium">Filter aktif:</span>
                {auditSearch && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 font-medium text-blue-700">
                    Cari: &quot;{auditSearch}&quot;
                    <button onClick={() => setAuditSearch("")} className="hover:text-blue-900">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {auditActionFilter !== "semua" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 font-medium text-blue-700">
                    Aksi: {auditActionFilter}
                    <button onClick={() => setAuditActionFilter("semua")} className="hover:text-blue-900">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {auditTableFilter !== "semua" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 font-medium text-blue-700">
                    Tabel: {auditTableFilter}
                    <button onClick={() => setAuditTableFilter("semua")} className="hover:text-blue-900">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                <button
                  onClick={handleResetAuditFilters}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 ml-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset Filter
                </button>
              </div>
            )}

            {/* Tabel Audit Log */}
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100/90 text-[11px] font-semibold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Waktu (WIB)</th>
                    <th className="px-4 py-3">Pelaku</th>
                    <th className="px-4 py-3">Aksi</th>
                    <th className="px-4 py-3">Tabel Objek</th>
                    <th className="px-4 py-3">Detail Perubahan Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <FileText className="h-8 w-8 text-slate-300" />
                          <p className="font-medium text-slate-600">
                            Tidak ada catatan audit log yang sesuai kriteria pencarian.
                          </p>
                          {isAuditFilterActive && (
                            <button
                              onClick={handleResetAuditFilters}
                              className="mt-1 text-xs font-semibold text-blue-600 hover:underline"
                            >
                              Reset filter pencarian
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedAuditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition">
                        <td className="px-4 py-3 whitespace-nowrap text-slate-500 font-medium">
                          {formatDateTime(log.dibuat_pada)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-semibold text-slate-900">{log.pelaku_nama}</p>
                          <p className="text-[10px] text-slate-400 capitalize">{log.pelaku_peran}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {renderActionBadge(log.aksi)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-700">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-800">
                            {log.nama_tabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[11px]">
                          <div className="max-w-md space-y-1">
                            {log.nilai_lama && (
                              <div className="flex items-start gap-1">
                                <span className="text-[10px] font-semibold text-slate-400 shrink-0">Lama:</span>
                                {renderDataDiff(log.nilai_lama, false)}
                              </div>
                            )}
                            {log.nilai_baru && (
                              <div className="flex items-start gap-1">
                                <span className="text-[10px] font-semibold text-blue-600 shrink-0">Baru:</span>
                                {renderDataDiff(log.nilai_baru, true)}
                              </div>
                            )}
                            {!log.nilai_lama && !log.nilai_baru && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                ID Objek: {log.data_id}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls untuk Audit Log */}
            {filteredAuditLogs.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-500">
                <div>
                  Menampilkan{" "}
                  <span className="font-semibold text-slate-900">
                    {Math.min(
                      (auditPage - 1) * auditPageSize + 1,
                      filteredAuditLogs.length
                    )}
                  </span>{" "}
                  sampai{" "}
                  <span className="font-semibold text-slate-900">
                    {Math.min(auditPage * auditPageSize, filteredAuditLogs.length)}
                  </span>{" "}
                  dari{" "}
                  <span className="font-semibold text-slate-900">
                    {filteredAuditLogs.length}
                  </span>{" "}
                  catatan audit
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    disabled={auditPage === 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Sebelumnya</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalAuditPages, 7) }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => setAuditPage(pageNum)}
                        className={`h-7 w-7 rounded-lg text-xs font-semibold transition ${
                          auditPage === pageNum
                            ? "bg-blue-600 text-white shadow-xs"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                    {totalAuditPages > 7 && (
                      <span className="text-slate-400 px-1">...</span>
                    )}
                  </div>

                  <button
                    onClick={() => setAuditPage((p) => Math.min(totalAuditPages, p + 1))}
                    disabled={auditPage === totalAuditPages}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                  >
                    <span>Selanjutnya</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: INFORMASI BISNIS & ATURAN ERP                             */}
        {/* ================================================================= */}
        {activeTab === "system" && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Profil Usaha */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Building className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-slate-900">Profil Usaha Distribusi</h3>
              </div>
              <dl className="space-y-3 text-xs text-slate-600">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <dt className="text-slate-500">Nama Badan Usaha</dt>
                  <dd className="font-semibold text-slate-900">CV Sinar Abadi Niaga</dd>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <dt className="text-slate-500">Fokus Operasional</dt>
                  <dd className="font-medium text-slate-800">Distributor Kebutuhan Toko Kelontong</dd>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <dt className="text-slate-500">Wilayah Layanan</dt>
                  <dd className="font-medium text-slate-800">Bekasi dan Jakarta Timur</dd>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <dt className="text-slate-500">Basis Data &amp; Keamanan</dt>
                  <dd className="font-medium text-slate-800">Supabase PostgreSQL (Row Level Security)</dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-slate-500">Framework Antarmuka</dt>
                  <dd className="font-medium text-slate-800">Next.js 16 (React Server Components)</dd>
                </div>
              </dl>
            </div>

            {/* Aturan Bisnis */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900">Aturan Bisnis (PRD Standard)</h3>
              </div>
              <ul className="space-y-2.5 text-xs text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600 shrink-0">BR-02:</span>
                  <span>Diskon Penjualan maks 10% (Staf Penjualan) atau maks 25% (Manajer).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600 shrink-0">BR-05:</span>
                  <span>Termin kredit pembayaran: 0 (Tunai), 7, 14, dan 30 hari kalender.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600 shrink-0">BR-06:</span>
                  <span>Pengurangan stok dilakukan serentak saat konfirmasi pesanan (anti-stok minus).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600 shrink-0">BR-12:</span>
                  <span>HPP dan Margin hanya boleh dibaca dan dianalisis oleh peran Manajer.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600 shrink-0">BR-12:</span>
                  <span>Setiap perubahan peran akun, batas kredit, dan pelunasan wajib dicatat di audit log.</span>
                </li>
              </ul>
            </div>

            {/* Kebijakan Keamanan & Audit Trail */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4 md:col-span-2">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Layers className="h-5 w-5 text-purple-600" />
                <h3 className="font-bold text-slate-900">Otorisasi &amp; Perlindungan Data Sistem</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="font-bold text-slate-800 mb-1">Proteksi Akun Sendiri</p>
                  <p className="text-slate-500">
                    Sistem secara otomatis mencegah Manajer menonaktifkan akun yang sedang aktif digunakan untuk login (anti-lockout).
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="font-bold text-slate-800 mb-1">Eksklusivitas Modul</p>
                  <p className="text-slate-500">
                    Halaman Laporan dan Pengaturan dilindungi di level server. Akses peran staf langsung ditolak sebelum query dijalankan.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="font-bold text-slate-800 mb-1">Audit Trail Otomatis</p>
                  <p className="text-slate-500">
                    Setiap aksi krusial merekam ID pelaku, nama tabel, ID data, serta pasangan nilai lama dan nilai baru secara permanen.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* MODAL UBAH PERAN & STATUS PENGGUNA                                */}
        {/* ================================================================= */}
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl transition animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-100 font-bold text-sm">
                    {editingUser.nama_lengkap.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Ubah Peran &amp; Status
                    </h3>
                    <p className="text-xs text-slate-500">
                      {editingUser.nama_lengkap}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {modalError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                  <p>{modalError}</p>
                </div>
              )}

              <form onSubmit={handleSaveUser} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Peran Akses (Role)
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as DbUserRole)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden"
                  >
                    {VALID_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleDisplayLabel(r)} ({r})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Manajer memiliki hak akses menyeluruh termasuk Laporan Finansial &amp; Pengaturan Sistem.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <label htmlFor="aktifCheckbox" className="text-xs font-semibold text-slate-800">
                        Status Akun Aktif
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Izinkan pengguna untuk login dan mengakses aplikasi ERP.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      id="aktifCheckbox"
                      checked={editActive}
                      disabled={editingUser.id === serverProfile.id}
                      onChange={(e) => setEditActive(e.target.checked)}
                      className="h-4 w-4 rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                  {editingUser.id === serverProfile.id && (
                    <p className="text-[11px] text-amber-700 font-medium">
                      Perlindungan Sistem: Anda tidak dapat menonaktifkan akun sendiri yang sedang aktif digunakan.
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-amber-50 p-3 border border-amber-200/80 text-[11px] text-amber-800 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <p>
                    Perubahan ini akan dicatat ke dalam audit log sistem secara permanen sesuai instruksi keamanan BR-12.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    disabled={isSubmitting}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50 active:scale-95"
                  >
                    {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    <span>{isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
