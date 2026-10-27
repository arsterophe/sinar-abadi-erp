"use client";

import React from "react";
import Link from "next/link";
import { ShieldAlert, ArrowLeft, Home } from "lucide-react";
import AppLayout from "./AppLayout";
import { UserProfile, mapDbRoleToDashboardRole } from "@/types/auth";

interface AksesDitolakProps {
  userProfile: UserProfile;
  activePath: string;
  title?: string;
  pesan?: string;
}

export default function AksesDitolak({
  userProfile,
  activePath,
  title = "403 — Akses Ditolak",
  pesan = "Anda tidak memiliki wewenang untuk membuka halaman ini sesuai aturan hak akses operasional (PRD Bab 7).",
}: AksesDitolakProps) {
  const dashboardRole = mapDbRoleToDashboardRole(userProfile.peran);

  return (
    <AppLayout
      currentRole={dashboardRole}
      userProfile={userProfile}
      activePath={activePath}
    >
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 shadow-sm text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 mb-5 border border-rose-100">
            <ShieldAlert className="h-8 w-8 text-rose-600" />
          </div>

          <span className="inline-flex items-center rounded-md bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
            HTTP 403 Forbidden
          </span>

          <h2 className="mt-3 text-xl font-bold text-slate-900 tracking-tight">
            {title}
          </h2>

          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            {pesan}
          </p>

          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs text-slate-700 text-left space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Pengguna:</span>
              <span className="font-semibold text-slate-900">{userProfile.nama_lengkap}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Peran Aktif:</span>
              <span className="font-semibold capitalize text-slate-900">{userProfile.peran}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Rute Diminta:</span>
              <span className="font-mono text-slate-800">{activePath}</span>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <Link
              href="/"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors"
            >
              <Home className="h-4 w-4" />
              <span>Kembali ke Dashboard</span>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
