import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Membuat instance Supabase client untuk lingkungan Server (Server Components, Server Actions, Route Handlers).
 * Menggunakan @supabase/ssr dengan adaptasi cookies Next.js 16 (await cookies()).
 */
export async function createServerClientInstance(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Konfigurasi Supabase belum lengkap. Pastikan NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY telah disetel pada file .env.local."
    );
  }

  return createServerClient(
    supabaseUrl.trim().replace(/\/+$/, ""),
    supabasePublishableKey.trim(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Dipanggil dari Server Component murni (read-only cookie store).
            // Token refresh ditangani oleh layer proxy jika sesi perlu diperbarui.
          }
        },
      },
    }
  );
}
