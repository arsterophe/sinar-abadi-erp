"use client";

import React, { useState, useTransition } from "react";
import AppLayout from "@/components/layout/AppLayout";
import RoleSelector from "@/components/dashboard/RoleSelector";
import ManagerDashboardView from "@/components/dashboard/ManagerDashboardView";
import SalesDashboardView from "@/components/dashboard/SalesDashboardView";
import WarehouseDashboardView from "@/components/dashboard/WarehouseDashboardView";
import { UserRole } from "@/types/dashboard";
import { UserProfile, mapDbRoleToDashboardRole, roleDisplayLabel } from "@/types/auth";
import { logoutUser } from "@/lib/supabase/auth";
import { CheckCircle2, AlertCircle } from "lucide-react";

import { ManagerDashboardMetrics } from "@/lib/dashboard/getManagerMetrics";
import { WarehouseDashboardMetrics } from "@/lib/dashboard/getWarehouseMetrics";
import { SalesDashboardMetrics } from "@/lib/dashboard/getSalesMetrics";
import {
  AnalyticsPayload,
  DateRangeFilter as IDateRangeFilter,
  ManagerAnalyticsPayload,
  SalesAnalyticsPayload,
  WarehouseAnalyticsPayload,
} from "@/types/analytics";
import { getAnalyticsDataAction } from "@/app/dashboard/actions";

interface DashboardClientProps {
  serverProfile: UserProfile;
  managerMetrics?: ManagerDashboardMetrics | null;
  warehouseMetrics?: WarehouseDashboardMetrics | null;
  salesMetrics?: SalesDashboardMetrics | null;
  initialAnalytics?: AnalyticsPayload | null;
}

export default function DashboardClient({
  serverProfile,
  managerMetrics,
  warehouseMetrics,
  salesMetrics,
  initialAnalytics,
}: DashboardClientProps) {
  // Inisialisasi peran aktif dashboard berdasarkan profil server terverifikasi
  const [currentRole, setCurrentRole] = useState<UserRole>(() =>
    mapDbRoleToDashboardRole(serverProfile.peran)
  );

  // State analitik bisnis terintegrasi
  const [analyticsData, setAnalyticsData] = useState<AnalyticsPayload | null>(
    initialAnalytics || null
  );
  const [isPendingFilter, startTransition] = useTransition();
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } finally {
      window.location.href = "/login";
    }
  };

  const handleFilterChange = (newFilter: IDateRangeFilter) => {
    startTransition(async () => {
      setAnalyticsError(null);
      const res = await getAnalyticsDataAction(newFilter);
      if (res.success && res.data) {
        setAnalyticsData(res.data);
      } else {
        setAnalyticsError(res.error || "Gagal memuat analitik bisnis.");
      }
    });
  };

  // Helper untuk mengekstrak payload sesuai wewenang peran aktif
  const isServerManager = serverProfile.peran === "manajer";

  const managerAnalyticsPayload: ManagerAnalyticsPayload | null =
    analyticsData?.role === "manajer" ? analyticsData : null;

  const salesAnalyticsPayload: SalesAnalyticsPayload | null =
    analyticsData?.role === "penjualan"
      ? analyticsData
      : isServerManager && analyticsData?.role === "manajer"
      ? {
          role: "penjualan",
          kpi: {
            totalNilaiPenjualanSah: analyticsData.kpi.totalNilaiPenjualanSah,
            jumlahPesananSah: analyticsData.kpi.jumlahPesananSah,
            rataRataNilaiPesanan: analyticsData.kpi.rataRataNilaiPesanan,
            jumlahPesananDraf: analyticsData.kpi.jumlahPesananDraf,
            totalNilaiDraf: analyticsData.kpi.totalNilaiDraf,
          },
          trend: analyticsData.trend,
          topProducts: analyticsData.topProducts,
          orderStatusDistribution: analyticsData.orderStatusDistribution,
          stockSummary: analyticsData.stockSummary,
          filter: analyticsData.filter,
          error: analyticsData.error,
        }
      : null;

  const warehouseAnalyticsPayload: WarehouseAnalyticsPayload | null =
    analyticsData?.role === "gudang"
      ? analyticsData
      : isServerManager && analyticsData?.role === "manajer"
      ? {
          role: "gudang",
          kpi: {
            jumlahPesananSiapKirim:
              analyticsData.orderStatusDistribution.find(
                (s) => s.status === "dikonfirmasi"
              )?.jumlahPesanan || 0,
            jumlahPesananTerkirim:
              analyticsData.orderStatusDistribution.find(
                (s) => s.status === "dikirim"
              )?.jumlahPesanan || 0,
            totalKuantitasBarangKeluar: analyticsData.topProducts.reduce(
              (sum, p) => sum + p.kuantitasTerjual,
              0
            ),
          },
          topProducts: analyticsData.topProducts.map((p) => ({
            barangId: p.barangId,
            kodeBarang: p.kodeBarang,
            namaBarang: p.namaBarang,
            satuan: p.satuan,
            kuantitasTerjual: p.kuantitasTerjual,
          })),
          orderStatusDistribution: analyticsData.orderStatusDistribution.map(
            (s) => ({
              status: s.status,
              label: s.label,
              jumlahPesanan: s.jumlahPesanan,
              persentase: s.persentase,
            })
          ),
          stockSummary: analyticsData.stockSummary,
          filter: analyticsData.filter,
          error: analyticsData.error,
        }
      : null;

  return (
    <AppLayout
      currentRole={currentRole}
      activePath="/"
      userProfile={serverProfile}
      onLogout={handleLogout}
    >
      {/* Sesi Pengguna Terverifikasi */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-white px-4 py-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
          <span className="text-xs text-slate-500">Sesi Aktif:</span>
          <span className="text-xs font-semibold text-slate-800">
            {serverProfile.nama_lengkap}
          </span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">
            {roleDisplayLabel(serverProfile.peran)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>Sesi terotentikasi Supabase</span>
        </div>
      </div>

      {/* Global Error Alert jika Analitik Gagal Query */}
      {analyticsError && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{analyticsError}</span>
          </div>
          <button
            type="button"
            onClick={() => setAnalyticsError(null)}
            className="text-[11px] font-semibold underline hover:text-rose-900 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Role Switcher: Simulasi pratinjau wewenang peran */}
      <RoleSelector
        currentRole={currentRole}
        onSelectRole={(role) => {
          if (serverProfile.peran === "manajer") {
            setCurrentRole(role);
          }
        }}
        userRole={serverProfile.peran}
      />

      {/* Role-Specific Dashboard Views */}
      <section aria-label="Konten Dashboard Sesuai Peran">
        {currentRole === "manager" && (
          <ManagerDashboardView
            metrics={managerMetrics}
            analytics={managerAnalyticsPayload}
            isLoadingAnalytics={isPendingFilter}
            onFilterChange={handleFilterChange}
          />
        )}
        {currentRole === "sales" && (
          <SalesDashboardView
            metrics={salesMetrics}
            analytics={salesAnalyticsPayload}
            isLoadingAnalytics={isPendingFilter}
            onFilterChange={handleFilterChange}
          />
        )}
        {currentRole === "warehouse" && (
          <WarehouseDashboardView
            metrics={warehouseMetrics}
            analytics={warehouseAnalyticsPayload}
            isLoadingAnalytics={isPendingFilter}
            onFilterChange={handleFilterChange}
          />
        )}
      </section>
    </AppLayout>
  );
}
