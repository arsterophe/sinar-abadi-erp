"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  Database,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import {
  checkSupabaseConnection,
  ConnectionTestResult,
} from "@/lib/supabase/client";

export default function DemoNoticeBanner() {
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleTestConnection = async () => {
    setIsLoading(true);
    try {
      const result = await checkSupabaseConnection();
      setTestResult(result);
    } catch {
      setTestResult({
        status: "unknown_error",
        message: "Terjadi Kesalahan",
        detail: "Tidak dapat menyelesaikan permintaan pemeriksaan koneksi.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-blue-200/90 bg-blue-50/80 p-4 sm:p-5 text-blue-950 shadow-xs space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Deskripsi Status Fondasi */}
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-600/10 p-2 text-blue-700 shrink-0 mt-0.5 sm:mt-0">
            <AlertCircle className="h-5 w-5 text-blue-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-blue-900">
                Tahap 1: Fondasi Proyek & Kerangka Antarmuka
              </h2>
              <span className="rounded bg-blue-200/80 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                Data Placeholder
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-blue-800/90 leading-relaxed">
              Seluruh kartu metrik, tabel, dan indikator di halaman ini adalah <strong className="font-semibold text-blue-950">kerangka visual demo</strong> untuk memvalidasi tata letak antarmuka B2B. Sesuai instruksi tahap 1, belum ada tabel bisnis atau data transaksi yang dimanipulasi.
            </p>
          </div>
        </div>

        {/* Tombol Uji Koneksi Sesuai Permintaan */}
        <div className="flex items-center gap-2 shrink-0 self-start lg:self-center">
          <button
            onClick={handleTestConnection}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-blue-800 shadow-xs border border-blue-200/90 hover:bg-blue-100/60 active:scale-98 transition-all disabled:opacity-60 cursor-pointer"
            title="Klik untuk menguji validitas URL dan API Key ke server Supabase"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span>Menguji Koneksi...</span>
              </>
            ) : (
              <>
                <Database className="h-4 w-4 text-blue-600" />
                <span>Uji Koneksi Supabase</span>
                <RefreshCw className="h-3.5 w-3.5 text-blue-400 ml-0.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Panel Hasil Uji Koneksi (Hanya tampil saat diminta) */}
      {testResult && (
        <div
          className={`rounded-lg p-3.5 text-xs border transition-all ${
            testResult.status === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : testResult.status === "invalid_credentials" ||
                testResult.status === "access_denied"
              ? "bg-rose-50 border-rose-200 text-rose-900"
              : testResult.status === "network_error"
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-slate-50 border-slate-200 text-slate-800"
          }`}
        >
          <div className="flex items-start gap-2.5">
            {testResult.status === "success" && (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            )}
            {testResult.status === "invalid_credentials" && (
              <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            {testResult.status === "access_denied" && (
              <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            {testResult.status === "network_error" && (
              <WifiOff className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            {(testResult.status === "config_missing" ||
              testResult.status === "unknown_error") && (
              <AlertCircle className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
            )}

            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{testResult.message}</span>
                {testResult.httpStatus && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
                      testResult.status === "success"
                        ? "bg-emerald-200/80 text-emerald-900"
                        : "bg-rose-200/80 text-rose-900"
                    }`}
                  >
                    HTTP {testResult.httpStatus}
                  </span>
                )}
              </div>
              <p className="mt-1 leading-relaxed opacity-90">
                {testResult.detail}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
