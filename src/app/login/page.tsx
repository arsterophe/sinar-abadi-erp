"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Boxes,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { UserProfile, isValidRole } from "@/types/auth";

function getErrorMessageFromParam(errorParam: string | null): string | null {
  if (!errorParam) return null;
  switch (errorParam) {
    case "profile_not_found":
      return "Akun Anda terdaftar tetapi profil tidak ditemukan pada sistem CV Sinar Abadi Niaga. Hubungi Manajer.";
    case "account_inactive":
      return "Akun Anda berstatus non-aktif. Akses ke sistem ERP ditolak oleh Manajer CV Sinar Abadi Niaga.";
    case "invalid_role":
      return "Peran pengguna Anda tidak memiliki hak akses operasional ERP. Hubungi Manajer.";
    case "unauthorized":
      return "Sesi Anda telah berakhir atau belum terotentikasi. Silakan masuk kembali.";
    default:
      return null;
  }
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    getErrorMessageFromParam(searchParams.get("error"))
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Bersihkan timer redirect jika komponen unmount untuk mencegah memory leak
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  // Pastikan form selalu kembali ke kondisi normal dan bersih dari pesan sesi sebelumnya
  useEffect(() => {
    setIsLoading(false);
    setSuccessMessage(null);
    setPassword("");
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setErrorMessage(getErrorMessageFromParam(errorParam));
    } else {
      setErrorMessage(null);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validasi input awal di client
    if (!email.trim() || !password) {
      setErrorMessage("Silakan masukkan email dan kata sandi Anda.");
      return;
    }

    setIsLoading(true);

    // Normalisasi: jika pengguna hanya mengetik username (misal: "alen"),
    // otomatis diarahkan ke domain email internal CV Sinar Abadi Niaga ("alen@sinarabadi.com")
    const cleanInput = email.trim();
    const resolvedEmail = cleanInput.includes("@")
      ? cleanInput
      : `${cleanInput}@sinarabadi.com`;

    try {
      // 1. Autentikasi dengan Supabase Auth (token otomatis disimpan di cookie melalui @supabase/ssr)
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: resolvedEmail,
          password: password,
        });

      if (authError || !authData?.user) {
        const msg = authError?.message || "";
        if (
          msg.toLowerCase().includes("invalid login credentials") ||
          msg.toLowerCase().includes("invalid grant")
        ) {
          setErrorMessage(
            "Email atau kata sandi yang Anda masukkan salah. Silakan periksa kembali."
          );
        } else if (msg.toLowerCase().includes("email not confirmed")) {
          setErrorMessage(
            "Email akun belum dikonfirmasi. Silakan hubungi Manajer."
          );
        } else if (msg.toLowerCase().includes("too many requests")) {
          setErrorMessage(
            "Terlalu banyak percobaan masuk. Mohon tunggu beberapa saat sebelum mencoba lagi."
          );
        } else {
          setErrorMessage(
            "Gagal masuk: " + (msg || "Terjadi kesalahan pada server autentikasi.")
          );
        }
        setIsLoading(false);
        return;
      }

      // 2. Ambil profil pengguna dari tabel `profiles`
      const userId = authData.user.id;
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, nama_lengkap, peran, aktif, dibuat_pada")
        .eq("id", userId)
        .maybeSingle();

      if (profileError || !profileData) {
        await supabase.auth.signOut();
        setErrorMessage(
          "Akun Anda terdaftar tetapi profil tidak ditemukan pada sistem CV Sinar Abadi Niaga. Hubungi Manajer untuk melengkapi profil peran Anda."
        );
        setIsLoading(false);
        return;
      }

      const profile = profileData as UserProfile;

      // 3. Validasi status aktif akun
      if (!profile.aktif) {
        await supabase.auth.signOut();
        setErrorMessage(
          "Akun Anda telah dinonaktifkan oleh Manajer CV Sinar Abadi Niaga. Akses ke sistem ERP ditolak."
        );
        setIsLoading(false);
        return;
      }

      // 4. Validasi peran pengguna
      if (!isValidRole(profile.peran)) {
        await supabase.auth.signOut();
        setErrorMessage(
          "Peran pengguna (" +
            (profile.peran || "tidak ada") +
            ") tidak memiliki hak akses operasional ERP. Hubungi Manajer."
        );
        setIsLoading(false);
        return;
      }

      // 5. Berhasil: Tampilkan konfirmasi sejenak lalu alihkan ke dashboard server
      setSuccessMessage(
        `Selamat datang, ${profile.nama_lengkap}! Mengalihkan ke Dashboard...`
      );
      setPassword("");

      // Navigasi ke root dashboard yang diverifikasi di server
      redirectTimerRef.current = setTimeout(() => {
        setIsLoading(false);
        window.location.href = "/";
      }, 600);
    } catch (err) {
      const errorText =
        err instanceof Error ? err.message : "Kesalahan tidak terduga";
      setErrorMessage("Terjadi kendala saat memproses login: " + errorText);
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-[#0c1631]/90 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
      {/* Header & Identitas Perusahaan */}
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25 ring-1 ring-white/20">
          <Boxes className="h-8 w-8" />
        </div>

        <h1 className="mt-4 text-xl sm:text-2xl font-bold tracking-tight text-white">
          Sinar Abadi ERP
        </h1>
        <p className="mt-1 text-xs sm:text-sm font-medium text-blue-300">
          CV Sinar Abadi Niaga
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Portal Akses Sistem Distribusi Toko Kelontong
        </p>
      </div>

      {/* Banner Pemberitahuan Akun Manajerial */}
      <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-400">
        <div className="flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Pendaftaran publik tidak dibuka. Akun staf diterbitkan dan dikelola langsung oleh <strong>Manajer</strong>.
          </p>
        </div>
      </div>

      {/* Pesan Kesalahan */}
      {errorMessage && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3.5 text-xs text-rose-200 animate-fadeIn">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
          </div>
        </div>
      )}

      {/* Pesan Sukses */}
      {successMessage && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-3.5 text-xs text-emerald-200">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{successMessage}</div>
          </div>
        </div>
      )}

      {/* Form Login */}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {/* Input Email */}
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
          >
            Email atau Username
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Mail className="h-4 w-4" />
            </div>
            <input
              id="email"
              name="email"
              type="text"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alen atau alen@sinarabadi.com"
              disabled={isLoading}
              className="block w-full rounded-xl border border-slate-700/80 bg-slate-900/90 py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all disabled:opacity-50"
            />
          </div>
        </div>

        {/* Input Password */}
        <div>
          <label
            htmlFor="password"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
          >
            Kata Sandi
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Lock className="h-4 w-4" />
            </div>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
              className="block w-full rounded-xl border border-slate-700/80 bg-slate-900/90 py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-500 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-200 transition-colors"
              aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Tombol Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 active:scale-98 transition-all disabled:opacity-60 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Memverifikasi Akun...</span>
              </>
            ) : (
              <span>Masuk ke Sistem</span>
            )}
          </button>
        </div>
      </form>

      {/* Informasi Tambahan Bantuan */}
      <div className="mt-6 border-t border-slate-800/80 pt-4 text-center text-xs text-slate-500">
        <p>Mengalami kendala login atau lupa kata sandi?</p>
        <p className="mt-0.5 text-slate-400">
          Hubungi <strong>Administrator / Manajer</strong> untuk reset akun.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-br from-[#070d1d] via-[#0b1329] to-[#0f1d3d] px-4 py-12 sm:px-6 lg:px-8 text-slate-100 selection:bg-blue-600 selection:text-white">
      {/* Tombol Navigasi Kembali ke Dashboard */}
      <div className="mx-auto w-full max-w-md mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Kembali ke Beranda Dashboard</span>
        </Link>
      </div>

      <div className="mx-auto w-full max-w-md">
        <Suspense
          fallback={
            <div className="rounded-2xl border border-slate-800/90 bg-[#0c1631]/90 p-8 text-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500 mb-2" />
              <p className="text-xs">Memuat formulir login...</p>
            </div>
          }
        >
          <LoginFormContent />
        </Suspense>

        {/* Footer Hak Cipta */}
        <div className="mt-6 text-center text-xs text-slate-500">
          <p>&copy; 2026 CV Sinar Abadi Niaga • Sinar Abadi ERP</p>
        </div>
      </div>
    </div>
  );
}
