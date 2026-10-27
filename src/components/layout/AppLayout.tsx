"use client";

import React, { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { UserRole } from "@/types/dashboard";
import { UserProfile, DbUserRole } from "@/types/auth";

interface AppLayoutProps {
  children: React.ReactNode;
  currentRole: UserRole;
  activePath?: string;
  userProfile?: UserProfile | null;
  onLogout?: () => void;
}

export default function AppLayout({
  children,
  currentRole,
  activePath = "/",
  userProfile,
  onLogout,
}: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Penentuan peran untuk menu Sidebar secara konsisten di server dan client:
  // 1. Gunakan profil riil dari database (userProfile.peran) jika tersedia.
  // 2. Jika userProfile belum dimuat/null, fallback deterministik ke pemetaan currentRole.
  const effectiveUserRole: DbUserRole =
    userProfile?.peran ??
    (currentRole === "warehouse"
      ? "gudang"
      : currentRole === "sales"
      ? "penjualan"
      : "manajer");

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Sidebar Component */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activePath={activePath}
        userRole={effectiveUserRole}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-x-hidden">
        <Header
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          currentRole={currentRole}
          userProfile={userProfile}
          onLogout={onLogout}
          activePath={activePath}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-500">
          <p>
            &copy; 2026 CV Sinar Abadi Niaga • Sinar Abadi ERP Internal System
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Sistem Informasi Distribusi Barang Kelontong • Next.js & Supabase
          </p>
        </footer>
      </div>
    </div>
  );
}
