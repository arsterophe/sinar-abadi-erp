import "server-only";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Membuat instance Supabase Client dengan hak akses Service Role (Admin).
 * 
 * PERINGATAN KEAMANAN & ARSITEKTUR:
 * 1. File ini diisolasi menggunakan 'server-only'. Upaya mengimpor file ini
 *    dari Client Component atau bundle browser akan memicu build error otomatis.
 * 2. Menggunakan SUPABASE_SERVICE_ROLE_KEY yang beroperasi tanpa RLS. Kunci ini
 *    dilarang keras menggunakan prefix NEXT_PUBLIC_ dan tidak boleh dibocorkan ke log/browser.
 * 3. Helper ini HANYA digunakan untuk operasi server tepercaya, seperti pemanggilan
 *    RPC privat Mayar (simpan_tagihan_mayar dan rekonsiliasi_klaim_mayar) yang hak
 *    eksekusinya telah dicabut dari publik dan peran authenticated.
 * 4. Helper ini BUKAN pengganti autentikasi. Pemanggil Server Action tetap wajib
 *    memverifikasi sesi pengguna dan peran Manajer terlebih dahulu menggunakan
 *    client sesi pengguna sebelum memanggil fungsi admin ini.
 */
export function createAdminClient(): SupabaseClient {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseUrl.trim()) {
    throw new Error(
      "Konfigurasi Supabase Admin gagal: NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_URL belum disetel pada file environment server."
    );
  }

  if (!serviceRoleKey || !serviceRoleKey.trim()) {
    throw new Error(
      "Konfigurasi Supabase Admin gagal: SUPABASE_SERVICE_ROLE_KEY belum disetel pada file environment server."
    );
  }

  return createClient(
    supabaseUrl.trim().replace(/\/+$/, ""),
    serviceRoleKey.trim(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}
