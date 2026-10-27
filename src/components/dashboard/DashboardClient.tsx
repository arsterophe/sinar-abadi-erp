"use client";

import React, { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import RoleSelector from "@/components/dashboard/RoleSelector";
import ManagerDashboardView from "@/components/dashboard/ManagerDashboardView";
import SalesDashboardView from "@/components/dashboard/SalesDashboardView";
import WarehouseDashboardView from "@/components/dashboard/WarehouseDashboardView";
import { UserRole } from "@/types/dashboard";
import { UserProfile, mapDbRoleToDashboardRole, roleDisplayLabel } from "@/types/auth";
import { logoutUser } from "@/lib/supabase/auth";
import { CheckCircle2 } from "lucide-react";

import { ManagerDashboardMetrics } from "@/lib/dashboard/getManagerMetrics";
import { WarehouseDashboardMetrics } from "@/lib/dashboard/getWarehouseMetrics";
import { SalesDashboardMetrics } from "@/lib/dashboard/getSalesMetrics";

interface DashboardClientProps {
  serverProfile: UserProfile;
  managerMetrics?: ManagerDashboardMetrics | null;
  warehouseMetrics?: WarehouseDashboardMetrics | null;
  salesMetrics?: SalesDashboardMetrics | null;
}

export default function DashboardClient({
  serverProfile,
  managerMetrics,
  warehouseMetrics,
  salesMetrics,
}: DashboardClientProps) {
  // Inisialisasi peran aktif dashboard berdasarkan profil server terverifikasi
  const [currentRole, setCurrentRole] = useState<UserRole>(() =>
    mapDbRoleToDashboardRole(serverProfile.peran)
  );

  const handleLogout = async () => {
    try {
      await logoutUser();
    } finally {
      // Hard navigation ke /login untuk mereset seluruh cache client dan memori router
      window.location.href = "/login";
    }
  };

  return (
    <AppLayout
      currentRole={currentRole}
      activePath="/"
      userProfile={serverProfile}
      onLogout={handleLogout}
    >
      {/* Sesi Pengguna Terverifikasi (Kompak & Elegan) */}
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

      {/* Role Switcher: Simulasi pratinjau wewenang peran */}
      <RoleSelector
        currentRole={currentRole}
        onSelectRole={(role) => setCurrentRole(role)}
      />

      {/* Role-Specific Dashboard Views */}
      <section aria-label="Konten Dashboard Sesuai Peran">
        {currentRole === "manager" && (
          <ManagerDashboardView metrics={managerMetrics} />
        )}
        {currentRole === "sales" && (
          <SalesDashboardView metrics={salesMetrics} />
        )}
        {currentRole === "warehouse" && (
          <WarehouseDashboardView metrics={warehouseMetrics} />
        )}
      </section>
    </AppLayout>
  );
}
