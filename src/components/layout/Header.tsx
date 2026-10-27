"use client";

import React from "react";
import Link from "next/link";
import { Menu, LogOut, LogIn } from "lucide-react";
import { UserRole, USER_ROLES } from "@/types/dashboard";
import { UserProfile, roleDisplayLabel } from "@/types/auth";

interface HeaderProps {
  onToggleSidebar: () => void;
  currentRole: UserRole;
  userProfile?: UserProfile | null;
  onLogout?: () => void;
  activePath?: string;
}

const PAGE_INFO: Record<string, { title: string; subtitle: string }> = {
  "/": {
    title: "Dashboard Operasional",
    subtitle: "Monitoring eksekutif, stok gudang, dan aktivitas penjualan",
  },
  "/barang-dan-stok": {
    title: "Barang & Persediaan Stok",
    subtitle: "Katalog barang distributor, pemantauan stok menipis, dan kartu stok",
  },
  "/pelanggan": {
    title: "Manajemen Toko Pelanggan",
    subtitle: "Daftar toko mitra, kontrol plafon kredit, dan pantauan piutang",
  },
  "/pesanan-jual": {
    title: "Pesanan Jual (Sales Order)",
    subtitle: "Alur transaksi penjualan, konfirmasi stok gudang, dan pelunasan",
  },
  "/pembelian": {
    title: "Pembelian & Pemasok",
    subtitle: "Pengajuan PO ke pemasok, persetujuan HPP, dan penerimaan fisik",
  },
  "/laporan": {
    title: "Laporan Finansial & Operasional",
    subtitle: "Grafik omzet mingguan, analisis margin kotor, dan aging piutang toko",
  },
  "/pengaturan": {
    title: "Pengaturan Sistem & Hak Akses",
    subtitle: "Manajemen akun pengguna dan rekaman audit log aktivitas",
  },
};

export default function Header({
  onToggleSidebar,
  currentRole,
  userProfile,
  onLogout,
  activePath = "/",
}: HeaderProps) {
  const roleConfig = USER_ROLES[currentRole];
  const pageMeta = PAGE_INFO[activePath] || {
    title: "Sinar Abadi ERP",
    subtitle: "Sistem Informasi Distribusi CV Sinar Abadi Niaga",
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/90 bg-white/95 px-4 sm:px-6 backdrop-blur-md shadow-xs transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 lg:hidden cursor-pointer shrink-0 transition-colors"
          aria-label="Buka Menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-bold tracking-tight text-slate-900 truncate">
            {pageMeta.title}
          </h1>
          <p className="text-[11px] text-slate-500 hidden sm:block truncate">
            {pageMeta.subtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Current Active Role Badge */}
        <div className="hidden sm:flex items-center gap-2 rounded-lg bg-slate-100/80 px-2.5 py-1 border border-slate-200/80 text-xs">
          <span className="text-[11px] text-slate-500">Peran:</span>
          <span className="font-semibold text-slate-800 text-[11px]">
            {roleConfig.badgeLabel}
          </span>
        </div>

        {/* User Auth Section */}
        {userProfile ? (
          <div className="flex items-center gap-2 border-l border-slate-200 pl-2 sm:pl-3">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1 border border-slate-200/90">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-xs shadow-xs">
                {userProfile.nama_lengkap.charAt(0).toUpperCase()}
              </div>
              <div className="text-left hidden md:block">
                <div className="text-xs font-semibold text-slate-800 leading-tight">
                  {userProfile.nama_lengkap}
                </div>
                <div className="text-[10px] text-blue-700 font-medium leading-tight">
                  {roleDisplayLabel(userProfile.peran)}
                </div>
              </div>
            </div>

            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors cursor-pointer"
                title="Keluar dari akun (Logout)"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 border-l border-slate-200 pl-2 sm:pl-3">
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 active:scale-98 transition-all"
            >
              <LogIn className="h-4 w-4" />
              <span>Masuk (Login)</span>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
