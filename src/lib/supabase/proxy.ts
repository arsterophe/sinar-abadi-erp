import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Memperbarui sesi autentikasi pengguna secara aman di lapisan Proxy / Request Server
 * dan menulis token cookie baru ke response jika token disegarkan.
 * Mengikuti pola resmi Supabase SSR.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl.trim().replace(/\/+$/, ""),
    supabaseKey.trim(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Panggil getUser() untuk memvalidasi token sesi secara langsung ke server Supabase Auth
  // Pola resmi: token refresh otomatis tertulis ke cookiesResponse
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLoginRoute = path.startsWith("/login");

  // Rute halaman privat ERP Sinar Abadi yang mewajibkan sesi autentikasi aktif
  // Meliputi: Dashboard (/), Barang & Stok, Radar Stok, Pelanggan, Pesanan Jual,
  // Pembelian, Laporan Finansial, dan Pengaturan Sistem.
  const isPrivateRoute =
    path === "/" ||
    path.startsWith("/barang-dan-stok") ||
    path.startsWith("/radar-stok") ||
    path.startsWith("/pelanggan") ||
    path.startsWith("/pesanan-jual") ||
    path.startsWith("/pembelian") ||
    path.startsWith("/laporan") ||
    path.startsWith("/pengaturan");

  // Jika mencoba membuka halaman terlindungi tanpa sesi auth, arahkan langsung ke /login
  if (isPrivateRoute && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Jika sudah terotentikasi dan mencoba mengakses /login, arahkan ke dashboard
  if (isLoginRoute && user) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/";
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}
