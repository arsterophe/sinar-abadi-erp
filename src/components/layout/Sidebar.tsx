"use client";

import React from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  Radar,
  Users,
  ShoppingCart,
  Truck,
  BarChart3,
  Settings,
  Building2,
  Boxes,
  Lock,
  X,
} from "lucide-react";

import { DbUserRole } from "@/types/auth";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  activePath?: string;
  userRole?: DbUserRole;
}

interface NavMenuItem {
  name: string;
  href: string;
  icon: React.ElementType;
  isImplemented: boolean;
  tag?: string;
}

const MENU_ITEMS: NavMenuItem[] = [
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    isImplemented: true,
    tag: "Aktif",
  },
  {
    name: "Barang dan Stok",
    href: "/barang-dan-stok",
    icon: Package,
    isImplemented: true,
    tag: "Aktif",
  },
  {
    name: "Radar Stok",
    href: "/radar-stok",
    icon: Radar,
    isImplemented: true,
    tag: "Aktif",
  },
  {
    name: "Pelanggan",
    href: "/pelanggan",
    icon: Users,
    isImplemented: true,
    tag: "Aktif",
  },
  {
    name: "Pesanan Jual",
    href: "/pesanan-jual",
    icon: ShoppingCart,
    isImplemented: true,
    tag: "Aktif",
  },
  {
    name: "Pembelian",
    href: "/pembelian",
    icon: Truck,
    isImplemented: true,
    tag: "Aktif",
  },
  {
    name: "Laporan",
    href: "/laporan",
    icon: BarChart3,
    isImplemented: true,
    tag: "Aktif",
  },
  {
    name: "Pengaturan",
    href: "/pengaturan",
    icon: Settings,
    isImplemented: true,
    tag: "Aktif",
  },
];

export default function Sidebar({
  isOpen = false,
  onClose,
  activePath = "/",
  userRole,
}: SidebarProps) {
  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-[#0b1329] text-slate-100 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } border-r border-slate-800/80 shadow-xl`}
      >
        {/* Header / Brand */}
        <div className="flex h-20 items-center justify-between border-b border-slate-800/80 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-1 ring-white/10">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white block">
                Sinar Abadi ERP
              </span>
              <p className="text-xs font-medium text-slate-400">
                CV Sinar Abadi Niaga
              </p>
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
              aria-label="Tutup Menu"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Business Context Sub-header */}
        <div className="border-b border-slate-800/60 bg-slate-900/60 px-6 py-3">
          <div className="flex items-center gap-2 text-slate-300">
            <Building2 className="h-4 w-4 text-blue-400 shrink-0" />
            <span className="text-xs font-medium truncate">
              Distributor Kebutuhan Toko Kelontong
            </span>
          </div>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Menu Utama
          </div>

          <nav className="space-y-1.5">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activePath === item.href;

              // Deteksi pembatasan hak akses sesuai PRD Bab 7
              const isRestricted =
                userRole !== "manajer" &&
                ((item.name === "Pelanggan" && userRole === "gudang") ||
                  (item.name === "Pembelian" && userRole === "penjualan") ||
                  item.name === "Laporan" ||
                  item.name === "Pengaturan");

              return (
                <div key={item.name} className="relative group">
                  {item.isImplemented ? (
                    <Link
                      href={item.href}
                      className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-all ${
                        isActive
                          ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                          : isRestricted
                          ? "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                          : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                      }`}
                      title={
                        isRestricted
                          ? `${item.name}: Akses terbatas untuk peran Anda (akan menampilkan halaman 403 Akses Ditolak)`
                          : item.name
                      }
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          className={`h-5 w-5 ${
                            isActive
                              ? "text-white"
                              : isRestricted
                              ? "text-slate-500"
                              : "text-slate-400"
                          }`}
                        />
                        <span>{item.name}</span>
                      </div>

                      {isRestricted && (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-800/90 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300 border border-slate-700">
                          <Lock className="h-2.5 w-2.5 text-rose-400" />
                          <span>403</span>
                        </span>
                      )}
                    </Link>
                  ) : (
                    <div
                      className="flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium text-slate-400/90 transition-all cursor-not-allowed hover:bg-slate-800/40"
                      title={`${item.name} - Kerangka menu`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-slate-500" />
                        <span className="text-slate-300">{item.name}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Info */}
        <div className="border-t border-slate-800/80 p-4 bg-[#080e1e]">
          <div className="rounded-lg bg-slate-900/90 p-3 border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <div>
                <p className="font-semibold text-slate-200">Sistem Operasional Online</p>
                <p className="text-[11px] text-slate-400">
                  Terhubung ke Supabase DB
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
