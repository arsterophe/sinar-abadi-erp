"use server";

import { revalidatePath } from "next/cache";
import { createServerClientInstance } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createSinglePayment,
  getPaymentStatus,
  findInvoiceByOrderRef,
  validateMayarPaymentUrl,
} from "@/lib/mayar/client";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  BuatPesananJualInput,
  PESANAN_JUAL_LIMITS,
  getMaxDiskonByRole,
  hitungSubtotalItem,
  DetailPesananPayload,
  ItemPesananJual,
  PesananJualHeader,
} from "@/types/pesanan_jual";

export interface ActionResult<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface BuatTagihanMayarResult {
  id: string;
  nomor: string;
  mayar_payment_id: string;
  mayar_payment_url: string;
  mayar_status: string;
}

export interface ValidasiDrafResult {
  pelanggan_id: string;
  nama_toko: string;
  total: number;
  jumlah_item: number;
  items_terkalkulasi: Array<{
    barang_id: string;
    kode_barang: string;
    nama_barang: string;
    jumlah: number;
    harga_satuan: number;
    diskon_persen: number;
    subtotal: number;
  }>;
}

export interface SimpanDrafSuccessData {
  id: string;
  nomor: string;
  total: number;
  status: "draf";
}

// ============================================================================
// DIAGNOSTIK SERVER-SIDE & SANITASI RESPONS (ALLOWLIST ONLY)
// ============================================================================
const ALLOWED_CAUSE_NAMES = new Set<string>([
  "SocketError",
  "ConnectTimeoutError",
  "HeadersTimeoutError",
  "BodyTimeoutError",
  "HeadersOverflowError",
  "AbortError",
  "TimeoutError",
  "SystemError",
  "TypeError",
  "FetchError",
  "Error",
]);

const ALLOWED_NETWORK_CODES = new Set<string>([
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_ABORTED",
  "UND_ERR_HEADERS_OVERFLOW",
  "UND_ERR_DESTROYED",
  "UND_ERR_CLOSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ABORT_ERR",
]);

function extractAllowedNameAndMessage(err: unknown): {
  namaError: string;
  pesanError: string;
} {
  if (!err || typeof err !== "object") {
    return { namaError: "tidak tersedia", pesanError: "tidak tersedia" };
  }

  const name = "name" in err && typeof err.name === "string" ? err.name : "";
  const message = "message" in err && typeof err.message === "string" ? err.message : "";

  // Hanya mengizinkan pasangan nama dan pesan yang sudah terverifikasi aman
  if (
    (name === "TypeError" && message === "fetch failed") ||
    (name === "PostgrestError" && message === "TypeError: fetch failed")
  ) {
    return { namaError: "TypeError", pesanError: "fetch failed" };
  }

  return { namaError: "tidak tersedia", pesanError: "tidak tersedia" };
}

function extractAllowedCauseAndNetworkCode(err: unknown): {
  kodeJaringan: string;
  causeName: string;
  causeCode: string;
} {
  let kodeJaringan = "tidak tersedia";
  let causeName = "tidak tersedia";
  let causeCode = "tidak tersedia";

  if (!err || typeof err !== "object") {
    return { kodeJaringan, causeName, causeCode };
  }

  // 1. Periksa properti `code` langsung jika ada pada objek error
  if ("code" in err && typeof err.code === "string") {
    const rawCode = err.code.trim();
    if (ALLOWED_NETWORK_CODES.has(rawCode)) {
      kodeJaringan = rawCode;
    }
  }

  // 2. Periksa objek `cause` langsung jika tersedia secara terstruktur
  if ("cause" in err && err.cause && typeof err.cause === "object") {
    const c = err.cause;
    if ("name" in c && typeof c.name === "string" && ALLOWED_CAUSE_NAMES.has(c.name)) {
      causeName = c.name;
    }
    if ("code" in c && typeof c.code === "string" && ALLOWED_NETWORK_CODES.has(c.code)) {
      causeCode = c.code;
      if (kodeJaringan === "tidak tersedia") {
        kodeJaringan = c.code;
      }
    }
  }

  // 3. Ekstraksi dari format aktual @supabase/postgrest-js:
  // "Caused by: <cause.name>: <causeMessage> (<causeCode>)"
  if ("details" in err && typeof err.details === "string") {
    const causedByLineMatch = err.details.match(/Caused by:\s*([^\r\n]+)/);
    if (causedByLineMatch) {
      const line = causedByLineMatch[1];

      // A. Nama kelas error: identifier sebelum tanda titik dua pertama
      const nameMatch = line.match(/^([A-Za-z0-9_]+):/);
      if (nameMatch && ALLOWED_CAUSE_NAMES.has(nameMatch[1])) {
        causeName = nameMatch[1];
      }

      // B. Kode jaringan: hanya dari tanda kurung terakhir di baris sebelum baris baru
      const codeMatch = line.match(/\(([A-Z0-9_]+)\)\s*$/);
      if (codeMatch && ALLOWED_NETWORK_CODES.has(codeMatch[1])) {
        causeCode = codeMatch[1];
        if (kodeJaringan === "tidak tersedia") {
          kodeJaringan = codeMatch[1];
        }
      }
    }
  }

  return { kodeJaringan, causeName, causeCode };
}

function logRpcDiagnosticError(params: {
  rpcName: "tambah_item_pesanan";
  barisKe: number;
  error: unknown;
}): void {
  const { namaError, pesanError } = extractAllowedNameAndMessage(params.error);
  const { kodeJaringan, causeName, causeCode } = extractAllowedCauseAndNetworkCode(params.error);

  console.error(
    `[DIAGNOSTIK_RPC] rpc=${params.rpcName} baris=${params.barisKe} ` +
    `nama_error=${namaError} pesan_error=${pesanError} ` +
    `kode_jaringan=${kodeJaringan} cause_name=${causeName} cause_code=${causeCode}`
  );
}

function getSafeBrowserErrorMessage(err: unknown): string {
  const { namaError, pesanError } = extractAllowedNameAndMessage(err);
  if (namaError === "TypeError" && pesanError === "fetch failed") {
    return "Koneksi jaringan terputus saat menghubungi database.";
  }
  return "Gagal menyimpan item ke pesanan.";
}

/**
 * Server Action: Validasi & Pembuatan Draf Pesanan Jual Baru (Tahap 3).
 *
 * MENEGAKKAN ATURAN BISNIS & KEAMANAN:
 * 1. Autentikasi ketat via supabase.auth.getUser() di sisi server.
 * 2. Hanya peran 'manajer' dan 'penjualan' yang berhak membuat draf. Peran 'gudang' DITOLAK (PRD Bab 7).
 * 3. BR-02: Pelanggan wajib aktif, 1–20 baris barang aktif, tanpa duplikasi barang, kuantitas integer >= 1.
 * 4. BR-03: Harga satuan SELALU diambil dari database (public.barang.harga_jual), mengabaikan input harga dari client.
 * 5. BR-03: Batas diskon Staf Penjualan maks 10%, Manajer maks 25%.
 * 6. BR-12: Kolom harga_pokok/hpp_satuan tidak dibocorkan ke client/response.
 * 7. Anti-Side Effect: Pembuatan draf TIDAK mengurangi stok, TIDAK menulis mutasi stok, dan TIDAK mengubah piutang.
 * 8. Integritas Atomik: Memeriksa ketersediaan mekanisme transaksi RPC database sebelum melakukan insert ganda.
 */
export async function buatPesananJualDrafAction(
  input: BuatPesananJualInput
): Promise<ActionResult<SimpanDrafSuccessData>> {
  try {
    const supabase = await createServerClientInstance();

    // 1. Verifikasi Sesi Pengguna Melalui Supabase Auth
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Akses ditolak: sesi telah berakhir atau pengguna belum terautentikasi. Silakan login kembali.",
      };
    }

    // 2. Verifikasi Profil & Peran Pengguna di public.profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, nama_lengkap, peran, aktif")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || profile.aktif !== true) {
      return {
        success: false,
        error: "Akses ditolak: akun Anda tidak terdaftar atau telah dinonaktifkan.",
      };
    }

    // Penolakan Peran Staf Gudang (PRD Bab 7)
    if (profile.peran === "gudang") {
      return {
        success: false,
        error: "Akses ditolak: Staf Gudang tidak memiliki wewenang menyusun atau membuat pesanan jual.",
      };
    }

    // Hanya Manajer dan Penjualan yang berhak menyusun pesanan jual
    if (profile.peran !== "manajer" && profile.peran !== "penjualan") {
      return {
        success: false,
        error: `Akses ditolak: peran '${profile.peran}' tidak memiliki izin membuat pesanan jual.`,
      };
    }

    // 3. Validasi Payload Awal
    if (!input || typeof input !== "object") {
      return {
        success: false,
        error: "Payload pesanan jual tidak valid.",
      };
    }

    const pelangganId = (input.pelanggan_id || "").trim();
    if (!pelangganId) {
      return {
        success: false,
        error: "Toko pelanggan wajib dipilih (BR-02).",
      };
    }

    const rawItems = input.items;
    if (!Array.isArray(rawItems) || rawItems.length < PESANAN_JUAL_LIMITS.MIN_ITEMS) {
      return {
        success: false,
        error: `Pesanan jual harus berisi minimal ${PESANAN_JUAL_LIMITS.MIN_ITEMS} baris item barang (BR-02).`,
      };
    }

    if (rawItems.length > PESANAN_JUAL_LIMITS.MAX_ITEMS) {
      return {
        success: false,
        error: `Pesanan jual maksimal berisi ${PESANAN_JUAL_LIMITS.MAX_ITEMS} baris item barang (BR-02).`,
      };
    }

    // 4. Validasi Toko Pelanggan Aktif di Database (BR-02)
    const { data: pelanggan, error: pelangganError } = await supabase
      .from("pelanggan")
      .select("id, kode, nama_toko, aktif")
      .eq("id", pelangganId)
      .maybeSingle();

    if (pelangganError || !pelanggan) {
      return {
        success: false,
        error: "Data pelanggan tidak ditemukan pada database sistem.",
      };
    }

    if (pelanggan.aktif !== true) {
      return {
        success: false,
        error: `Pelanggan '${pelanggan.nama_toko}' berstatus nonaktif dan tidak dapat menerima pesanan baru (BR-02).`,
      };
    }

    // 5. Validasi Aturan Baris Item (Kuantitas, Duplikasi, Batas Diskon per Peran)
    const uniqueBarangIds = new Set<string>();
    const maxDiskonAllowed = getMaxDiskonByRole(profile.peran);

    for (let i = 0; i < rawItems.length; i++) {
      const row = rawItems[i];
      const barangId = (row.barang_id || "").trim();

      if (!barangId) {
        return {
          success: false,
          error: `Baris ke-${i + 1}: Barang wajib dipilih.`,
        };
      }

      // Deteksi barang duplikat (BR-02)
      if (uniqueBarangIds.has(barangId)) {
        return {
          success: false,
          error: `Satu barang hanya boleh muncul satu kali dalam satu pesanan. Gabungkan kuantitas pada satu baris (BR-02).`,
        };
      }
      uniqueBarangIds.add(barangId);

      // Kuantitas integer >= 1 (BR-02)
      const jumlah = Number(row.jumlah);
      if (!Number.isInteger(jumlah) || jumlah < PESANAN_JUAL_LIMITS.MIN_JUMLAH_PER_BARIS) {
        return {
          success: false,
          error: `Baris ke-${i + 1}: Jumlah barang harus berupa bilangan bulat minimal ${PESANAN_JUAL_LIMITS.MIN_JUMLAH_PER_BARIS} (BR-02).`,
        };
      }

      // Validasi batas diskon persen per peran (BR-03)
      const diskon = Number(row.diskon_persen);
      if (isNaN(diskon) || diskon < 0) {
        return {
          success: false,
          error: `Baris ke-${i + 1}: Diskon persen tidak boleh bernilai negatif.`,
        };
      }

      if (diskon > maxDiskonAllowed) {
        const roleLabel = profile.peran === "manajer" ? "Manajer (maks 25%)" : "Staf Penjualan (maks 10%)";
        return {
          success: false,
          error: `Baris ke-${i + 1}: Diskon ${diskon}% melebihi batas wewenang peran ${roleLabel} (BR-03).`,
        };
      }
    }

    // 6. Ambil Data Harga Jual Terpercaya dari Tabel public.barang (BR-03)
    // Server sama sekali TIDAK mempercayai harga atau subtotal yang dikirim client!
    // KEAMANAN BR-12: Kolom harga_pokok TIDAK diminta karena role authenticated tidak memiliki izin SELECT.
    const barangIdList = Array.from(uniqueBarangIds);
    const { data: barangList, error: barangError } = await supabase
      .from("barang")
      .select("id, kode, nama, harga_jual, aktif")
      .in("id", barangIdList);

    if (barangError || !barangList) {
      return {
        success: false,
        error: "Gagal memverifikasi data barang dari database.",
      };
    }

    if (barangList.length !== barangIdList.length) {
      return {
        success: false,
        error: "Satu atau beberapa barang yang dipilih tidak terdaftar di katalog sistem.",
      };
    }

    const barangMap = new Map(barangList.map((b) => [b.id, b]));

    // Periksa status keaktifan masing-masing barang (BR-02)
    for (const b of barangList) {
      if (b.aktif !== true) {
        return {
          success: false,
          error: `Barang '${b.nama}' (${b.kode}) berstatus nonaktif dan tidak dapat dipesan (BR-02).`,
        };
      }
    }

    // 7. Kalkulasi Estimasi Subtotal di Sisi Server (BR-03)
    const verifiedItems = rawItems.map((row) => {
      const b = barangMap.get(row.barang_id)!;
      const jumlah = Math.floor(Number(row.jumlah));
      const diskonPersen = Number(row.diskon_persen) || 0;
      const hargaSatuan = Number(b.harga_jual) || 0;
      const subtotal = hitungSubtotalItem(jumlah, hargaSatuan, diskonPersen);

      return {
        barang_id: b.id,
        jumlah,
        diskon_persen: diskonPersen,
        harga_satuan: hargaSatuan,
        subtotal,
      };
    });

    // 8. Eksekusi RPC Remote: Langkah 1 - Buat Header Draf Pesanan
    // Kontrak Remote: public.buat_draf_pesanan(p_pelanggan_id uuid) RETURNS uuid
    const { data: pesananId, error: buatDrafError } = await supabase.rpc(
      "buat_draf_pesanan",
      {
        p_pelanggan_id: pelangganId,
      }
    );

    if (buatDrafError || !pesananId) {
      const errMsg = buatDrafError?.message || "";
      if (
        errMsg.includes("Could not find the function") ||
        errMsg.includes("schema cache") ||
        buatDrafError?.code === "PGRST202"
      ) {
        return {
          success: false,
          error:
            "Fungsi database RPC 'buat_draf_pesanan' belum terpasang atau tidak dapat diakses di remote Supabase.",
        };
      }
      return {
        success: false,
        error: `Gagal membuat header draf pesanan: ${errMsg || "ID pesanan tidak diterima dari database."}`,
      };
    }

    // 9. Eksekusi RPC Remote: Langkah 2 - Tambah Item Baris per Item
    // Kontrak Remote: public.tambah_item_pesanan(p_pesanan_id uuid, p_barang_id uuid, p_jumlah integer, p_diskon_persen numeric) RETURNS uuid
    // PENTING: Kedua RPC ini berjalan sebagai panggilan terpisah (bukan satu transaksi database atomik tunggal).
    const addedItemIds: string[] = [];
    let itemFailureError: string | null = null;

    for (let i = 0; i < verifiedItems.length; i++) {
      const item = verifiedItems[i];
      const { data: itemId, error: tambahItemError } = await supabase.rpc(
        "tambah_item_pesanan",
        {
          p_pesanan_id: pesananId,
          p_barang_id: item.barang_id,
          p_jumlah: item.jumlah,
          p_diskon_persen: item.diskon_persen,
        }
      );

      if (tambahItemError || !itemId) {
        logRpcDiagnosticError({
          rpcName: "tambah_item_pesanan",
          barisKe: i + 1,
          error: tambahItemError,
        });
        const safeErrorMsg = getSafeBrowserErrorMessage(tambahItemError);
        itemFailureError = `Baris ke-${i + 1}: ${safeErrorMsg}`;
        break;
      }

      addedItemIds.push(itemId as string);
    }

    // 10. Penanganan Kegagalan Parsial (Kompensasi Manual Non-Atomik)
    if (itemFailureError) {
      // A. Upayakan kompensasi item: hapus item yang sempat berhasil tersimpan menggunakan RPC hapus_item_pesanan
      const cleanupErrors: string[] = [];
      let itemsDeletedCount = 0;

      for (const addedId of addedItemIds) {
        try {
          const { error: delErr } = await supabase.rpc("hapus_item_pesanan", {
            p_item_id: addedId,
          });
          if (delErr) {
            cleanupErrors.push(`Item ID ${addedId}: ${delErr.message}`);
          } else {
            itemsDeletedCount++;
          }
        } catch (e) {
          cleanupErrors.push(`Item ID ${addedId}: ${e instanceof Error ? e.message : "Error hapus"}`);
        }
      }

      // B. Upayakan pembatalan header draf menggunakan RPC resmi batalkan_draf_pesanan (SECURITY DEFINER)
      let cancelHeaderSuccess = false;
      let cancelHeaderErrorMsg: string | null = null;

      try {
        const { error: cancelRpcError } = await supabase.rpc(
          "batalkan_draf_pesanan",
          {
            p_pesanan_id: pesananId,
          }
        );

        if (cancelRpcError) {
          cancelHeaderErrorMsg = cancelRpcError.message;
        } else {
          cancelHeaderSuccess = true;
        }
      } catch (cancelEx) {
        cancelHeaderErrorMsg =
          cancelEx instanceof Error
            ? cancelEx.message
            : "Eksepsi saat memanggil RPC batalkan_draf_pesanan";
      }

      // C. Laporan status kompensasi secara transparan dan terpisah
      const itemStatusReport =
        addedItemIds.length === 0
          ? "Belum ada item yang sempat tersimpan."
          : cleanupErrors.length === 0
            ? `Seluruh ${itemsDeletedCount} item yang sempat tersimpan berhasil dihapus via hapus_item_pesanan.`
            : `Gagal menghapus sebagian item (${cleanupErrors.length} dari ${addedItemIds.length} item gagal dibersihkan: ${cleanupErrors.join("; ")}). Sisa item mungkin masih tertinggal pada pesanan ini.`;

      const headerStatusReport = cancelHeaderSuccess
        ? "Header draf berhasil ditandai sebagai 'dibatalkan' via RPC batalkan_draf_pesanan."
        : `Header draf GAGAL dibatalkan via RPC batalkan_draf_pesanan (${cancelHeaderErrorMsg || "status tidak berubah"}). Draf dengan ID ${pesananId} mungkin masih tertinggal dengan status 'draf' di database.`;

      return {
        success: false,
        error: `Pembuatan draf pesanan gagal saat penambahan item (${itemFailureError}). Status kompensasi non-atomik: [1] ${itemStatusReport} [2] ${headerStatusReport}`,
      };
    }

    // 11. Ambil Dokumen Asli dari Database untuk Mendapatkan Nomor Dokumen & Total Terkalkulasi Nyata
    const { data: pesananRow, error: fetchRowError } = await supabase
      .from("pesanan_jual")
      .select("id, nomor, total, status")
      .eq("id", pesananId)
      .maybeSingle();

    if (fetchRowError || !pesananRow) {
      // JANGAN gunakan total perkiraan sebagai total resmi database jika query gagal!
      return {
        success: false,
        error: `Draf pesanan dan item berhasil disimpan ke database (ID: ${pesananId}), namun gagal memverifikasi nomor dokumen dan total akhir dari database (${fetchRowError?.message || "Data pesanan tidak ditemukan"}). Harap muat ulang halaman daftar pesanan untuk memeriksa dokumen tersebut.`,
      };
    }

    // 12. Revalidasi Halaman Daftar Pesanan
    revalidatePath("/pesanan-jual");

    return {
      success: true,
      data: {
        id: pesananId as string,
        nomor: pesananRow.nomor,
        total: Number(pesananRow.total) || 0,
        status: "draf",
      },
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Terjadi kesalahan internal pada server.";
    return {
      success: false,
      error: errorMsg,
    };
  }
}

export interface KonfirmasiPesananSuccessData {
  id: string;
  nomor: string;
  status: "dikonfirmasi";
}

/**
 * Server Action: Konfirmasi Draf Pesanan Jual (Tahap 4).
 *
 * MENEGAKKAN ATURAN BISNIS & KEAMANAN:
 * 1. Autentikasi ketat via supabase.auth.getUser() di sisi server menggunakan sesi SSR pengguna.
 * 2. Hanya peran 'manajer' dan 'penjualan' yang berhak mengonfirmasi. Staf Gudang ditolak.
 * 3. BR-07: Staf Penjualan hanya boleh mengonfirmasi draf yang dibuatnya sendiri.
 * 4. Memanggil RPC 'konfirmasi_pesanan' (SECURITY DEFINER) menggunakan client pengguna (bukan service_role).
 *    Fungsi SQL di level database memvalidasi:
 *    - Status pesanan wajib 'draf'.
 *    - BR-04: Subtotal baris tidak di bawah HPP (jika di bawah HPP, hanya Manajer yang boleh).
 *    - BR-05: Pelanggan tidak memiliki tagihan 'dikirim' yang lewat jatuh tempo, dan piutang berjalan + nilai pesanan <= batas kredit.
 *    - BR-06: Stok seluruh barang di pesanan mencukupi (dikunci dengan SELECT ... FOR UPDATE).
 *    - BR-11: Mutasi stok 'keluar' dicatat otomatis dengan kuantitas negatif sesuai constraint.
 * 5. Revalidasi path /pesanan-jual setelah berhasil.
 */
export async function konfirmasiPesananJualAction(
  pesananId: string
): Promise<ActionResult<KonfirmasiPesananSuccessData>> {
  try {
    // 1. Validasi parameter input (format UUID)
    if (!pesananId || typeof pesananId !== "string") {
      return {
        success: false,
        error: "ID pesanan wajib diisi.",
      };
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(pesananId.trim())) {
      return {
        success: false,
        error: "Format ID pesanan tidak valid.",
      };
    }

    const cleanPesananId = pesananId.trim();

    // 2. Inisialisasi Supabase Server Client (terikat sesi cookie pengguna, bukan admin/service_role)
    const supabase = await createServerClientInstance();

    // 3. Verifikasi Sesi Pengguna
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Akses ditolak: sesi telah berakhir atau pengguna belum terautentikasi. Silakan login kembali.",
      };
    }

    // 4. Verifikasi Profil & Peran Pengguna
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, nama_lengkap, peran, aktif")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || profile.aktif !== true) {
      return {
        success: false,
        error: "Akses ditolak: akun Anda tidak terdaftar atau telah dinonaktifkan.",
      };
    }

    if (profile.peran === "gudang") {
      return {
        success: false,
        error: "Akses ditolak: Staf Gudang tidak memiliki wewenang mengonfirmasi pesanan jual.",
      };
    }

    if (profile.peran !== "manajer" && profile.peran !== "penjualan") {
      return {
        success: false,
        error: "Akses ditolak: peran Anda tidak berwenang mengonfirmasi pesanan jual.",
      };
    }

    // 5. Cek Pesanan di Database untuk Validasi Pra-RPC
    const { data: pesanan, error: pesananError } = await supabase
      .from("pesanan_jual")
      .select("id, nomor, status, dibuat_oleh")
      .eq("id", cleanPesananId)
      .maybeSingle();

    if (pesananError || !pesanan) {
      return {
        success: false,
        error: "Pesanan tidak ditemukan di database.",
      };
    }

    if (pesanan.status !== "draf") {
      return {
        success: false,
        error: `Pesanan tidak dapat dikonfirmasi karena status saat ini adalah "${pesanan.status}" (hanya pesanan berstatus draf yang dapat dikonfirmasi).`,
      };
    }

    // BR-07: Staf Penjualan hanya boleh mengonfirmasi draf yang dibuatnya sendiri
    if (profile.peran === "penjualan" && pesanan.dibuat_oleh !== user.id) {
      return {
        success: false,
        error: "Akses ditolak: Staf Penjualan hanya boleh mengonfirmasi pesanan yang dibuat sendiri (BR-07).",
      };
    }

    // 6. Eksekusi RPC Remote konfirmasi_pesanan (SECURITY DEFINER)
    const { error: rpcError } = await supabase.rpc("konfirmasi_pesanan", {
      p_pesanan_id: cleanPesananId,
    });

    if (rpcError) {
      return {
        success: false,
        error: rpcError.message || "Gagal mengonfirmasi pesanan jual.",
      };
    }

    // 7. Revalidasi Cache Halaman Pesanan Jual
    revalidatePath("/pesanan-jual");

    return {
      success: true,
      data: {
        id: cleanPesananId,
        nomor: pesanan.nomor,
        status: "dikonfirmasi",
      },
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Terjadi kesalahan internal pada server.";
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Server Action: Mengambil Rincian Item Baris Pesanan Jual (PRD Bab 7 & 8).
 *
 * MENEGAKKAN ATURAN BISNIS & KEAMANAN (BR-03, BR-12):
 * 1. Autentikasi sesi di server Supabase via cookies SSR.
 * 2. Hanya peran valid (manajer, penjualan, gudang) yang dapat membaca rincian pesanan.
 * 3. Mengambil item baris dari tabel public.item_pesanan_jual dan data referensi public.barang.
 * 4. PENEGAKAN KEAMANAN FINANSIAL BR-12:
 *    Kolom hpp_satuan dan kalkulasi margin HANYA boleh diakses oleh peran 'manajer'.
 *    Untuk peran 'penjualan' dan 'gudang', hpp_satuan secara ketat di-strip (dihapus/null)
 *    di server sebelum payload dikirimkan ke client/browser.
 */
export async function ambilDetailItemPesananAction(
  pesananId: string
): Promise<ActionResult<DetailPesananPayload>> {
  try {
    if (!pesananId || typeof pesananId !== "string") {
      return { success: false, error: "ID pesanan wajib diisi." };
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(pesananId.trim())) {
      return { success: false, error: "Format ID pesanan tidak valid." };
    }

    const cleanPesananId = pesananId.trim();
    const supabase = await createServerClientInstance();

    // 1. Verifikasi Sesi Pengguna
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Akses ditolak: sesi telah berakhir. Silakan login kembali.",
      };
    }

    // 2. Verifikasi Profil & Peran Pengguna
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, nama_lengkap, peran, aktif")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || profile.aktif !== true) {
      return {
        success: false,
        error: "Akses ditolak: akun tidak ditemukan atau telah dinonaktifkan.",
      };
    }

    const isManager = profile.peran === "manajer";

    // 3. Query Header Pesanan
    const { data: pesananRow, error: pesananError } = await supabase
      .from("pesanan_jual")
      .select(`
        id,
        nomor,
        pelanggan_id,
        status,
        total,
        dibuat_oleh,
        dibuat_pada,
        dikonfirmasi_pada,
        dikirim_pada,
        jatuh_tempo,
        dilunasi_pada,
        dibatalkan_pada,
        alasan_batal,
        pelanggan:pelanggan!pelanggan_id (
          id,
          kode,
          nama_toko,
          telepon,
          alamat,
          termin_hari
        )
      `)
      .eq("id", cleanPesananId)
      .maybeSingle();

    if (pesananError || !pesananRow) {
      return {
        success: false,
        error: "Data pesanan jual tidak ditemukan di database.",
      };
    }

    // Penegakan sisi server untuk Staf Gudang (PRD Bab 7)
    if (profile.peran === "gudang" && pesananRow.status === "draf") {
      return {
        success: false,
        error: "Akses ditolak: Staf Gudang hanya berhak melihat pesanan berstatus dikonfirmasi ke atas.",
      };
    }

    // 4. Query Item Baris (view berkeamanan tinggi public.v_item_pesanan_jual)
    // Sesuai BR-12: hpp_satuan hanya terisi untuk manajer, NULL untuk staf penjualan dan gudang
    const { data: rawItems, error: itemsError } = await supabase
      .from("v_item_pesanan_jual")
      .select(`
        id,
        pesanan_jual_id,
        barang_id,
        jumlah,
        harga_satuan,
        diskon_persen,
        subtotal,
        hpp_satuan
      `)
      .eq("pesanan_jual_id", cleanPesananId);

    if (itemsError) {
      return {
        success: false,
        error: `Gagal memuat rincian item pesanan: ${itemsError.message}`,
      };
    }

    // 5. Query Referensi Barang untuk Melengkapi Kode, Nama, dan Satuan
    const barangIds = Array.from(new Set((rawItems || []).map((it) => it.barang_id)));
    const barangMap = new Map<string, { kode: string; nama: string; satuan: string; stok: number }>();

    if (barangIds.length > 0) {
      const { data: barangList } = await supabase
        .from("barang")
        .select("id, kode, nama, satuan, stok")
        .in("id", barangIds);

      if (barangList) {
        for (const b of barangList) {
          barangMap.set(b.id, {
            kode: b.kode,
            nama: b.nama,
            satuan: b.satuan,
            stok: Number(b.stok) || 0,
          });
        }
      }
    }

    // 6. Susun Item Terverifikasi & Terapkan Filter Kerahasiaan Finansial BR-12
    let totalMarginRupiah = 0;
    const verifiedItems: ItemPesananJual[] = (rawItems || []).map((row) => {
      const bInfo = barangMap.get(row.barang_id);
      const subtotal = Number(row.subtotal) || 0;
      const jumlah = Number(row.jumlah) || 0;

      let hppSatuan: number | null = null;
      let marginRupiah: number | null = null;
      let marginPersen: number | null = null;

      if (isManager) {
        // HANYA Manajer yang memperoleh HPP dan Margin (BR-12)
        hppSatuan = row.hpp_satuan !== null && row.hpp_satuan !== undefined ? Number(row.hpp_satuan) : null;
        if (hppSatuan !== null) {
          marginRupiah = subtotal - (hppSatuan * jumlah);
          marginPersen = subtotal > 0 ? (marginRupiah / subtotal) * 100 : 0;
          totalMarginRupiah += marginRupiah;
        }
      }

      return {
        id: row.id,
        pesanan_jual_id: row.pesanan_jual_id,
        barang_id: row.barang_id,
        jumlah,
        harga_satuan: Number(row.harga_satuan) || 0,
        diskon_persen: Number(row.diskon_persen) || 0,
        subtotal,
        hpp_satuan: isManager ? hppSatuan : null, // Sanitasi ketat di sisi server (BR-12)
        margin: isManager ? marginRupiah : null,
        margin_persen: isManager && marginPersen !== null ? Math.round(marginPersen * 10) / 10 : null,
        kode_barang: bInfo?.kode || "N/A",
        nama_barang: bInfo?.nama || "Barang tidak dikenal",
        satuan: bInfo?.satuan || "pcs",
        stok_tersedia: bInfo?.stok ?? 0,
      };
    });

    // Petakan data header pesanan
    const plg = Array.isArray(pesananRow.pelanggan)
      ? pesananRow.pelanggan[0]
      : pesananRow.pelanggan;

    const header: PesananJualHeader = {
      id: pesananRow.id,
      nomor: pesananRow.nomor,
      pelanggan_id: pesananRow.pelanggan_id,
      status: pesananRow.status,
      total: Number(pesananRow.total) || 0,
      dibuat_oleh: pesananRow.dibuat_oleh,
      dibuat_pada: pesananRow.dibuat_pada,
      dikonfirmasi_pada: pesananRow.dikonfirmasi_pada,
      dikirim_pada: pesananRow.dikirim_pada,
      jatuh_tempo: pesananRow.jatuh_tempo,
      dilunasi_pada: pesananRow.dilunasi_pada,
      dibatalkan_pada: pesananRow.dibatalkan_pada,
      alasan_batal: pesananRow.alasan_batal,
      nama_toko: plg?.nama_toko || "",
      kode_pelanggan: plg?.kode || "",
      telepon_pelanggan: plg?.telepon || "",
      alamat_pelanggan: plg?.alamat || "",
      termin_hari_pelanggan: plg?.termin_hari ?? 0,
      jumlah_item: verifiedItems.length,
    };

    const totalPesanan = header.total;
    const totalMarginPersen =
      isManager && totalPesanan > 0
        ? Math.round((totalMarginRupiah / totalPesanan) * 1000) / 10
        : null;

    return {
      success: true,
      data: {
        pesanan: header,
        items: verifiedItems,
        total_margin: isManager ? totalMarginRupiah : null,
        total_margin_persen: totalMarginPersen,
      },
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Terjadi kesalahan internal pada server.";
    return { success: false, error: errorMsg };
  }
}

/**
 * Server Action: Pengiriman Pesanan Jual (PRD Bab 6.1, BR-07, US-04).
 *
 * MENEGAKKAN ATURAN BISNIS & KEAMANAN:
 * 1. Autentikasi sesi di server Supabase via cookies SSR.
 * 2. Hanya peran 'gudang' dan 'manajer' yang berhak menandai pesanan dikirim. Peran 'penjualan' DITOLAK (BR-07).
 * 3. Status awal wajib 'dikonfirmasi'. Transisi dari status lain ditolak (BR-07).
 * 4. Memanggil RPC 'kirim_pesanan' (SECURITY DEFINER) menggunakan client pengguna untuk pemutakhiran atomik di database.
 * 5. Revalidasi cache halaman /pesanan-jual, /pelanggan, dan dashboard /.
 */
export async function kirimPesananJualAction(
  pesananId: string
): Promise<ActionResult<{ id: string; nomor: string; status: "dikirim"; jatuh_tempo: string }>> {
  try {
    if (!pesananId || typeof pesananId !== "string") {
      return { success: false, error: "ID pesanan wajib diisi." };
    }

    const cleanPesananId = pesananId.trim();
    const supabase = await createServerClientInstance();

    // 1. Verifikasi Sesi Pengguna
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Akses ditolak: sesi telah berakhir. Silakan login kembali.",
      };
    }

    // 2. Verifikasi Profil & Otorisasi Peran
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, nama_lengkap, peran, aktif")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || profile.aktif !== true) {
      return {
        success: false,
        error: "Akses ditolak: akun tidak ditemukan atau telah dinonaktifkan.",
      };
    }

    if (profile.peran === "penjualan") {
      return {
        success: false,
        error: "Akses ditolak: Staf Penjualan tidak memiliki wewenang menandai pesanan telah dikirim (BR-07). Hanya Staf Gudang dan Manajer yang berhak.",
      };
    }

    if (profile.peran !== "gudang" && profile.peran !== "manajer") {
      return {
        success: false,
        error: `Akses ditolak: peran '${profile.peran}' tidak berwenang memproses pengiriman pesanan.`,
      };
    }

    // 3. Verifikasi Pesanan Saat Ini di Database
    const { data: pesanan, error: pesananError } = await supabase
      .from("pesanan_jual")
      .select("id, nomor, status, pelanggan_id, jatuh_tempo")
      .eq("id", cleanPesananId)
      .maybeSingle();

    if (pesananError || !pesanan) {
      return { success: false, error: "Data pesanan jual tidak ditemukan di database." };
    }

    // IDEMPOTENSI (BR-07): Jika pesanan sudah berstatus 'dikirim' (misalnya akibat klik ganda,
    // pengulangan jaringan, atau aksi konkuren), kembalikan respons sukses secara aman
    // tanpa memanggil RPC kirim_pesanan lagi agar mutasi stok dan audit log tidak terduplikasi.
    if (pesanan.status === "dikirim") {
      revalidatePath("/pesanan-jual");
      revalidatePath("/pelanggan");
      revalidatePath("/");

      return {
        success: true,
        data: {
          id: cleanPesananId,
          nomor: pesanan.nomor,
          status: "dikirim",
          jatuh_tempo: pesanan.jatuh_tempo ? String(pesanan.jatuh_tempo) : "",
        },
      };
    }

    // BR-07: Hanya pesanan berstatus 'dikonfirmasi' yang dapat dikirim
    if (pesanan.status !== "dikonfirmasi") {
      return {
        success: false,
        error: `Pengiriman ditolak: Status pesanan saat ini adalah "${pesanan.status}". Hanya pesanan berstatus 'dikonfirmasi' yang dapat dikirim (BR-07).`,
      };
    }

    // 4. Eksekusi RPC Remote kirim_pesanan (SECURITY DEFINER)
    const { error: rpcError } = await supabase.rpc("kirim_pesanan", {
      p_pesanan_id: cleanPesananId,
    });

    if (rpcError) {
      // Periksa kembali status di DB: jika aksi paralel telah berhasil mengubahnya menjadi 'dikirim',
      // tangani secara idempoten agar tidak memicu error palsu ke pengguna
      const { data: pesananTerkini } = await supabase
        .from("pesanan_jual")
        .select("id, nomor, status, jatuh_tempo")
        .eq("id", cleanPesananId)
        .maybeSingle();

      if (pesananTerkini && pesananTerkini.status === "dikirim") {
        revalidatePath("/pesanan-jual");
        revalidatePath("/pelanggan");
        revalidatePath("/");

        return {
          success: true,
          data: {
            id: cleanPesananId,
            nomor: pesananTerkini.nomor,
            status: "dikirim",
            jatuh_tempo: pesananTerkini.jatuh_tempo ? String(pesananTerkini.jatuh_tempo) : "",
          },
        };
      }

      return {
        success: false,
        error: `Gagal memproses pengiriman pesanan di database: ${rpcError.message || "Terjadi kesalahan pada fungsi RPC."}`,
      };
    }

    // 5. Ambil data pesanan terbaru dari database untuk mendapatkan tanggal jatuh tempo resmi
    const { data: updatedPesanan } = await supabase
      .from("pesanan_jual")
      .select("jatuh_tempo")
      .eq("id", cleanPesananId)
      .maybeSingle();

    // Pastikan nilai jatuh_tempo HANYA menggunakan tanggal yang benar-benar tersimpan di database
    const jatuhTempoString = updatedPesanan?.jatuh_tempo
      ? String(updatedPesanan.jatuh_tempo)
      : "";

    // 6. Revalidasi Seluruh Rute Terkait
    revalidatePath("/pesanan-jual");
    revalidatePath("/pelanggan");
    revalidatePath("/");

    return {
      success: true,
      data: {
        id: cleanPesananId,
        nomor: pesanan.nomor,
        status: "dikirim",
        jatuh_tempo: jatuhTempoString,
      },
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Terjadi kesalahan internal pada server.";
    return { success: false, error: errorMsg };
  }
}

/**
 * Server Action: Pencatatan Pelunasan Pesanan Jual (PRD Bab 6.1, BR-07, BR-12, US-09).
 *
 * MENEGAKKAN ATURAN BISNIS & KEAMANAN:
 * 1. Autentikasi sesi di server Supabase via cookies SSR.
 * 2. Otorisasi peran ketat: HANYA peran 'manajer' yang berhak mencatat pelunasan (BR-07, BR-12, US-09).
 *    Staf Penjualan dan Staf Gudang DITOLAK secara eksplisit.
 * 3. Status awal wajib 'dikirim'. Transisi dari status lain ditolak (BR-07).
 * 4. PENCATATAN AUDIT LOG WAJIB (BR-12):
 *    Aksi pelunasan wajib dicatat di tabel public.audit_log dengan pelaku_id, aksi 'pelunasan',
 *    nama_tabel 'pesanan_jual', serta nilai_lama {"status": "dikirim"} dan nilai_baru {"status": "lunas", ...}.
 * 5. Revalidasi cache halaman /pesanan-jual, /pelanggan, dan dashboard /.
 */
export async function lunasiPesananJualAction(
  pesananId: string
): Promise<ActionResult<{ id: string; nomor: string; status: "lunas"; dilunasi_pada: string }>> {
  try {
    if (!pesananId || typeof pesananId !== "string") {
      return { success: false, error: "ID pesanan wajib diisi." };
    }

    const cleanPesananId = pesananId.trim();
    const supabase = await createServerClientInstance();

    // 1. Verifikasi Sesi Pengguna
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Akses ditolak: sesi telah berakhir. Silakan login kembali.",
      };
    }

    // 2. Verifikasi Profil & Otorisasi Peran Manajer Saja (BR-07, BR-12)
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, nama_lengkap, peran, aktif")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || profile.aktif !== true) {
      return {
        success: false,
        error: "Akses ditolak: akun tidak ditemukan atau telah dinonaktifkan.",
      };
    }

    if (profile.peran !== "manajer") {
      return {
        success: false,
        error: "Akses ditolak: Hanya Manajer yang berwenang mencatat pelunasan tagihan pelanggan (BR-07, BR-12).",
      };
    }

    // 3. Verifikasi Pesanan Saat Ini di Database
    const { data: pesanan, error: pesananError } = await supabase
      .from("pesanan_jual")
      .select("id, nomor, status, total, mayar_payment_id, mayar_status, dilunasi_pada")
      .eq("id", cleanPesananId)
      .maybeSingle();

    if (pesananError || !pesanan) {
      return { success: false, error: "Data pesanan jual tidak ditemukan di database." };
    }

    // Penanganan idempoten jika pesanan sudah berstatus 'lunas' sebelumnya
    if (pesanan.status === "lunas") {
      return {
        success: true,
        data: {
          id: cleanPesananId,
          nomor: pesanan.nomor,
          status: "lunas",
          dilunasi_pada: pesanan.dilunasi_pada || new Date().toISOString(),
        },
      };
    }

    if (pesanan.status !== "dikirim") {
      return {
        success: false,
        error: `Pelunasan ditolak: Status pesanan saat ini adalah "${pesanan.status}". Hanya pesanan berstatus 'dikirim' yang dapat dicatat lunas (BR-07).`,
      };
    }

    // 4. Verifikasi Pembayaran jika Pesanan Menggunakan Gateway Digital Mayar
    // Aturan Bisnis & Keamanan:
    // Status pesanan HANYA boleh berubah menjadi 'lunas' setelah pembayaran benar-benar terverifikasi sah.
    // Jika pembayaran menggunakan Mayar, jangan menganggap pembayaran berhasil hanya karena pengguna menekan tombol.
    if (pesanan.mayar_payment_id) {
      let isVerifiedPaid = false;
      let verifiedAmount = Math.round(Number(pesanan.total));
      let transactionId: string | null = null;
      let paymentMethod: string | null = "mayar";

      if (pesanan.mayar_status === "paid") {
        isVerifiedPaid = true;
      } else {
        // mayar_status belum paid di database. Verifikasi keaslian transaksi langsung ke gateway Mayar.
        try {
          const verifyRes = await getPaymentStatus(pesanan.mayar_payment_id);
          if (verifyRes.success && verifyRes.data) {
            const remoteStatus = (verifyRes.data.status || "").toLowerCase().trim();
            const remoteAmount = Math.round(Number(verifyRes.data.amount));
            const cleanTotal = Math.round(Number(pesanan.total));

            if (remoteStatus === "paid" && remoteAmount === cleanTotal) {
              isVerifiedPaid = true;
              verifiedAmount = remoteAmount;
              transactionId = verifyRes.data.transactionId || null;
              paymentMethod = verifyRes.data.paymentMethod || "mayar";
            } else if (remoteStatus === "paid" && remoteAmount !== cleanTotal) {
              return {
                success: false,
                error: `Pelunasan ditolak: Nominal terverifikasi pada gateway Mayar (Rp${remoteAmount.toLocaleString("id-ID")}) tidak sesuai dengan total pesanan (Rp${cleanTotal.toLocaleString("id-ID")}).`,
              };
            } else {
              return {
                success: false,
                error: `Pelunasan ditolak: Tagihan Mayar untuk pesanan ini belum terverifikasi lunas di gateway pembayaran (status saat ini: "${verifyRes.data.status || "unpaid"}"). Pembayaran Mayar yang belum terverifikasi tidak dapat menandai pesanan sebagai lunas.`,
              };
            }
          } else {
            return {
              success: false,
              error: `Pelunasan ditolak: Verifikasi tagihan Mayar ke gateway gagal (${verifyRes.error || "Transaksi tidak ditemukan"}). Pembayaran Mayar yang belum terverifikasi tidak dapat menandai pesanan sebagai lunas.`,
            };
          }
        } catch (verifyEx) {
          return {
            success: false,
            error: `Pelunasan ditolak: Gagal menghubungi gateway Mayar untuk memverifikasi pembayaran: ${verifyEx instanceof Error ? verifyEx.message : "Gangguan koneksi"}.`,
          };
        }
      }

      if (!isVerifiedPaid) {
        return {
          success: false,
          error: "Pelunasan ditolak: Pembayaran Mayar belum terverifikasi lunas.",
        };
      }

      // Pembayaran terbukti sah dan lunas di Mayar -> selesaikan secara atomik via RPC privat selesaikan_pembayaran_mayar
      const adminSupabase = createAdminClient();
      const { error: mayarRpcError } = await adminSupabase.rpc(
        "selesaikan_pembayaran_mayar",
        {
          p_pesanan_id: cleanPesananId,
          p_payment_id: pesanan.mayar_payment_id,
          p_verified_amount: verifiedAmount,
          p_verified_status: "paid",
          p_transaction_id: transactionId,
          p_payment_method: paymentMethod,
          p_pelaku_id: user.id,
        }
      );

      if (mayarRpcError) {
        return {
          success: false,
          error: `Gagal menyelesaikan pelunasan Mayar di database: ${mayarRpcError.message || "Kesalahan RPC"}`,
        };
      }

      const nowIso = new Date().toISOString();
      revalidatePath("/pesanan-jual");
      revalidatePath("/pelanggan");
      revalidatePath("/");

      return {
        success: true,
        data: {
          id: cleanPesananId,
          nomor: pesanan.nomor,
          status: "lunas",
          dilunasi_pada: nowIso,
        },
      };
    }

    // 5. Eksekusi RPC Remote catat_pembayaran (SECURITY DEFINER)
    // Untuk pelunasan manual / tunai tempo (PRD Bab 6.1, BR-07, BR-12)
    // Menggunakan client pengguna terautentikasi (supabase) - BUKAN service-role key.
    // RPC ini secara atomik di database:
    // - Memvalidasi peran Manajer pemanggil via auth.uid() sesi Supabase
    // - Memvalidasi status pesanan saat ini wajib 'dikirim'
    // - Memperbarui status ke 'lunas' dan mengisi 'dilunasi_pada'
    // - Menulis jejak audit ke tabel public.audit_log (aksi: 'catat_pembayaran')
    const { error: rpcError } = await supabase.rpc("catat_pembayaran", {
      p_pesanan_id: cleanPesananId,
    });

    if (rpcError) {
      return {
        success: false,
        error: `Gagal mencatat pelunasan pesanan di database: ${rpcError.message || "Terjadi kesalahan pada fungsi RPC."}`,
      };
    }

    const nowIso = new Date().toISOString();

    // 6. Revalidasi Seluruh Rute Terkait
    revalidatePath("/pesanan-jual");
    revalidatePath("/pelanggan");
    revalidatePath("/");

    return {
      success: true,
      data: {
        id: cleanPesananId,
        nomor: pesanan.nomor,
        status: "lunas",
        dilunasi_pada: nowIso,
      },
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Terjadi kesalahan internal pada server.";
    return { success: false, error: errorMsg };
  }
}

/**
 * Server Action: Pembatalan Pesanan Jual (PRD Bab 6.1, BR-07, BR-08, BR-12).
 *
 * MENEGAKKAN ATURAN BISNIS & KEAMANAN:
 * 1. Status 'draf':
 *    - Boleh dibatalkan oleh Staf Penjualan (pembuat draf) atau Manajer (BR-07).
 *    - Stok belum berkurang, sehingga tidak ada pengembalian stok.
 * 2. Status 'dikonfirmasi':
 *    - HANYA Manajer yang boleh membatalkan (BR-08).
 *    - Wajib menyertakan alasan minimal 10 karakter (BR-08: MIN_ALASAN_BATAL_LEN).
 *    - Stok barang yang sempat dikurangi saat konfirmasi DIKEMBALIKAN (+ jumlah item).
 *    - Dicatat di kartu stok (public.mutasi_stok) dengan jenis 'batal' (BR-11).
 *    - Wajib dicatat di audit log dengan aksi 'batal_pesanan_dikonfirmasi' (BR-12).
 * 3. Status 'dikirim' atau 'lunas':
 *    - DITOLAK secara permanen (BR-08).
 */
export async function batalkanPesananJualAction(
  pesananId: string,
  alasan?: string
): Promise<ActionResult<{ id: string; nomor: string; status: "dibatalkan" }>> {
  try {
    if (!pesananId || typeof pesananId !== "string") {
      return { success: false, error: "ID pesanan wajib diisi." };
    }

    const cleanPesananId = pesananId.trim();
    const cleanAlasan = (alasan || "").trim();
    const supabase = await createServerClientInstance();

    // 1. Verifikasi Sesi Pengguna
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Akses ditolak: sesi telah berakhir. Silakan login kembali.",
      };
    }

    // 2. Verifikasi Profil & Peran Pengguna
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, nama_lengkap, peran, aktif")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || profile.aktif !== true) {
      return {
        success: false,
        error: "Akses ditolak: akun tidak ditemukan atau telah dinonaktifkan.",
      };
    }

    // 3. Verifikasi Pesanan Saat Ini di Database
    const { data: pesanan, error: pesananError } = await supabase
      .from("pesanan_jual")
      .select("id, nomor, status, dibuat_oleh")
      .eq("id", cleanPesananId)
      .maybeSingle();

    if (pesananError || !pesanan) {
      return { success: false, error: "Data pesanan jual tidak ditemukan di database." };
    }

    // BR-08: Pesanan berstatus dikirim atau lunas tidak bisa dibatalkan
    if (pesanan.status === "dikirim" || pesanan.status === "lunas") {
      return {
        success: false,
        error: `Pembatalan ditolak: Pesanan berstatus '${pesanan.status}' tidak dapat dibatalkan (BR-08).`,
      };
    }

    if (pesanan.status === "dibatalkan") {
      return {
        success: false,
        error: "Pesanan ini sudah berstatus dibatalkan.",
      };
    }

    const nowIso = new Date().toISOString();

    // 4. Kasus A: Pembatalan Draf Pesanan
    if (pesanan.status === "draf") {
      // Staf Penjualan hanya boleh membatalkan draf miliknya sendiri (BR-07)
      if (profile.peran === "penjualan" && pesanan.dibuat_oleh !== user.id) {
        return {
          success: false,
          error: "Akses ditolak: Staf Penjualan hanya boleh membatalkan draf yang dibuat sendiri (BR-07).",
        };
      }

      if (profile.peran === "gudang") {
        return {
          success: false,
          error: "Akses ditolak: Staf Gudang tidak memiliki wewenang membatalkan draf pesanan.",
        };
      }

      // Upayakan memanggil RPC batalkan_draf_pesanan jika ada, atau fallback update langsung
      const { error: rpcCancelErr } = await supabase.rpc("batalkan_draf_pesanan", {
        p_pesanan_id: cleanPesananId,
      });

      if (rpcCancelErr) {
        const { error: directUpdateErr } = await supabase
          .from("pesanan_jual")
          .update({
            status: "dibatalkan",
            dibatalkan_pada: nowIso,
            alasan_batal: cleanAlasan || "Dibatalkan saat draf",
          })
          .eq("id", cleanPesananId);

        if (directUpdateErr) {
          return {
            success: false,
            error: `Gagal membatalkan draf pesanan: ${directUpdateErr.message}`,
          };
        }
      }

      revalidatePath("/pesanan-jual");
      revalidatePath("/");

      return {
        success: true,
        data: {
          id: cleanPesananId,
          nomor: pesanan.nomor,
          status: "dibatalkan",
        },
      };
    }

    // 5. Kasus B: Pembatalan Pesanan Dikonfirmasi (BR-08)
    if (pesanan.status === "dikonfirmasi") {
      // HANYA Manajer yang boleh membatalkan pesanan yang sudah dikonfirmasi (BR-08)
      if (profile.peran !== "manajer") {
        return {
          success: false,
          error: "Akses ditolak: Pesanan yang sudah dikonfirmasi hanya boleh dibatalkan oleh Manajer (BR-08).",
        };
      }

      // Alasan pembatalan wajib minimal 10 karakter (BR-08)
      if (cleanAlasan.length < PESANAN_JUAL_LIMITS.MIN_ALASAN_BATAL_LEN) {
        return {
          success: false,
          error: `Alasan pembatalan pesanan dikonfirmasi wajib diisi minimal ${PESANAN_JUAL_LIMITS.MIN_ALASAN_BATAL_LEN} karakter (BR-08).`,
        };
      }

      // Eksekusi RPC Remote batalkan_pesanan_terkonfirmasi (SECURITY DEFINER)
      // RPC ini secara atomik di database:
      // - Memvalidasi peran Manajer (BR-08)
      // - Memvalidasi panjang alasan minimal 10 karakter (BR-08)
      // - Mengunci baris (FOR UPDATE) dan mengembalikan stok seluruh barang ke public.barang
      // - Menulis kartu stok public.mutasi_stok jenis 'batal' dengan kuantitas positif (BR-11)
      // - Memperbarui status pesanan menjadi 'dibatalkan' dan mencatat alasan_batal
      // - Menulis jejak audit ke public.audit_log (aksi: 'pembatalan_pesanan', BR-12)
      const { error: rpcCancelErr } = await supabase.rpc(
        "batalkan_pesanan_terkonfirmasi",
        {
          p_pesanan_id: cleanPesananId,
          p_alasan: cleanAlasan,
        }
      );

      if (rpcCancelErr) {
        return {
          success: false,
          error: `Gagal membatalkan pesanan terkonfirmasi: ${rpcCancelErr.message || "Terjadi kesalahan RPC."}`,
        };
      }

      revalidatePath("/pesanan-jual");
      revalidatePath("/barang-dan-stok");
      revalidatePath("/pelanggan");
      revalidatePath("/");

      return {
        success: true,
        data: {
          id: cleanPesananId,
          nomor: pesanan.nomor,
          status: "dibatalkan",
        },
      };
    }

    return {
      success: false,
      error: `Status pesanan "${pesanan.status}" tidak dapat diproses untuk pembatalan.`,
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Terjadi kesalahan internal pada server.";
    return { success: false, error: errorMsg };
  }
}

interface KlaimTagihanMayarResponse {
  status: "CLAIMED" | "ALREADY_EXISTS" | "IN_PROGRESS" | "IN_DOUBT_STALE" | "DATA_ANOMALY" | string;
  id?: string;
  nomor?: string;
  total?: number | string;
  pelanggan_id?: string;
  claim_token?: string;
  mayar_payment_id?: string;
  mayar_payment_url?: string;
  mayar_status?: string;
  message?: string;
}

interface SimpanTagihanMayarResponse {
  success?: boolean;
  id?: string;
  nomor?: string;
  mayar_payment_id?: string;
  mayar_payment_url?: string;
  mayar_status?: string;
}

/**
 * Helper internal untuk melepas klaim sewa konkurensi secara aman.
 * HANYA dipanggil jika dipastikan panggilan ke gateway Mayar belum/tidak dilakukan.
 */
async function lepasKlaimMayarAman(
  supabase: SupabaseClient,
  pesananId: string,
  claimToken: string
): Promise<void> {
  try {
    await supabase.rpc("lepas_klaim_tagihan_mayar", {
      p_pesanan_id: pesananId,
      p_claim_token: claimToken,
    });
  } catch (err) {
    console.error(
      `[LEPAS_KLAIM_MAYAR] Gagal melepas klaim untuk pesanan ${pesananId}: ${err instanceof Error ? err.message : "Error tidak diketahui"
      }`
    );
  }
}

/**
 * Server Action: Buat Tagihan Mayar untuk Pesanan Jual (PRD Bab 11, BR-07, BR-12).
 *
 * MENEGAKKAN ATURAN BISNIS, KEAMANAN & INTEGRASI RPC MAYAR (MIGRASI 04):
 * 1. Otorisasi & Akses (BR-07):
 *    - HANYA pengguna dengan peran 'manajer' aktif yang diizinkan membuat tautan tagihan Mayar.
 *    - Identitas pelaku audit (p_pelaku_id) HANYA diambil dari sesi auth terverifikasi di server.
 *    - Client pengguna (session SSR) digunakan untuk verifikasi dan pemanggilan RPC klaim.
 *    - Admin client (service_role) TIDAK digunakan untuk mem-bypass otorisasi pengguna.
 * 2. Alur Klaim Konkurensi & Idempotensi (RPC klaim_tagihan_mayar):
 *    - Memanggil klaim_tagihan_mayar menggunakan client sesi pengguna (authenticated).
 *    - Menangani seluruh kemungkinan status dari kontrak RPC:
 *      * ALREADY_EXISTS: Tagihan valid sudah ada, kembalikan langsung tanpa memanggil Mayar.
 *      * IN_PROGRESS: Sedang diproses permintaan lain (< 60 detik). Tolak untuk mencegah race condition.
 *      * IN_DOUBT_STALE: Batas waktu klaim sebelumnya kedaluwarsa (>= 60 detik) atau inkonsisten.
 *        Pertahankan kondisi klaim untuk rekonsiliasi administratif, dilarang membuat invoice kedua.
 *      * DATA_ANOMALY: Inkonsistensi metadata parsial. Tolak pembuatan tagihan baru.
 *      * CLAIMED: Berhasil mengunci pesanan dan menerbitkan sewa token (TTL 60 detik).
 * 3. Integrasi Gateway Mayar:
 *    - Total nominal diverifikasi langsung dari nilai total di database (claimData.total),
 *      mengabaikan input dari browser.
 *    - Memanggil createSinglePayment() via Mayar Headless API V1 secara aman di sisi server.
 * 4. Penanganan Kegagalan & Batas Pelepasan Klaim:
 *    - lepas_klaim_tagihan_mayar HANYA dipanggil jika dapat dipastikan panggilan ke Mayar
 *      belum/tidak menghasilkan invoice (misal validasi pra-Mayar gagal).
 *    - Jika Mayar telah dipanggil namun gagal atau terjadi error, kondisi klaim dipertahankan
 *      agar tidak memicu duplikasi invoice di gateway.
 * 5. Penyimpanan Metadata Tagihan (RPC privat simpan_tagihan_mayar):
 *    - Verifikasi respons Mayar (payment_id, payment_url domain Mayar resmi, nominal sesuai).
 *    - Status invoice baru SELALU 'unpaid'. Status pesanan TETAP 'dikirim' (tidak diubah ke 'lunas').
 *    - simpan_tagihan_mayar adalah RPC privat yang HANYA dapat dieksekusi oleh service_role
 *      (createAdminClient). Pencatatan audit log dilakukan secara atomik di dalam fungsi database.
 * 6. Keamanan Kredensial & Log:
 *    - Tidak mencatat API key, service role key, atau token rahasia ke log sistem.
 * 7. Revalidasi cache halaman /pesanan-jual dan /.
 */
export async function buatTagihanMayarAction(
  pesananId: string,
  emailPelangganInput?: string
): Promise<ActionResult<BuatTagihanMayarResult>> {
  try {
    // 1. Validasi Input Parameter pesananId
    if (!pesananId || typeof pesananId !== "string" || !pesananId.trim()) {
      return { success: false, error: "ID pesanan wajib diisi." };
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(pesananId.trim())) {
      return { success: false, error: "Format ID pesanan tidak valid." };
    }

    const cleanPesananId = pesananId.trim();

    // 2. Inisialisasi Supabase Server Client (Terikat Sesi Cookie Pengguna)
    const supabase = await createServerClientInstance();

    // 3. Verifikasi Sesi Pengguna Melalui Supabase Auth
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Akses ditolak: sesi telah berakhir atau pengguna belum terautentikasi. Silakan login kembali.",
      };
    }

    // 4. Verifikasi Profil & Otorisasi Peran Manajer Saja (BR-07)
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, nama_lengkap, peran, aktif")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || profile.aktif !== true) {
      return {
        success: false,
        error: "Akses ditolak: akun tidak ditemukan atau telah dinonaktifkan.",
      };
    }

    if (profile.peran !== "manajer") {
      return {
        success: false,
        error: "Akses ditolak: Hanya Manajer aktif yang berwenang membuat tagihan Mayar.",
      };
    }

    // Identitas pelaku audit strictly dari sesi terverifikasi
    const pelakuId = user.id;

    // 5. Eksekusi RPC klaim_tagihan_mayar Menggunakan Client Sesi Pengguna
    const { data: claimRaw, error: claimRpcError } = await supabase.rpc(
      "klaim_tagihan_mayar",
      {
        p_pesanan_id: cleanPesananId,
      }
    );

    if (claimRpcError) {
      const errMsg = claimRpcError.message || "";
      if (
        errMsg.includes("Could not find the function") ||
        errMsg.includes("schema cache") ||
        claimRpcError.code === "PGRST202"
      ) {
        return {
          success: false,
          error:
            "Fungsi database RPC 'klaim_tagihan_mayar' belum terpasang atau tidak dapat diakses di remote Supabase. Pastikan draf migrasi 04 telah diterapkan ke database.",
        };
      }
      return {
        success: false,
        error: `Gagal mengklaim tagihan pesanan: ${errMsg}`,
      };
    }

    // 6. Parsing dan Evaluasi Hasil Klaim Sesuai Kontrak SQL Migrasi 04
    let claimData: KlaimTagihanMayarResponse;
    if (typeof claimRaw === "string") {
      try {
        claimData = JSON.parse(claimRaw) as KlaimTagihanMayarResponse;
      } catch {
        return {
          success: false,
          error: "Format respons RPC klaim_tagihan_mayar tidak valid.",
        };
      }
    } else if (claimRaw && typeof claimRaw === "object") {
      claimData = claimRaw as KlaimTagihanMayarResponse;
    } else {
      return {
        success: false,
        error: "Respons RPC klaim_tagihan_mayar kosong atau tidak valid.",
      };
    }

    // Status: ALREADY_EXISTS (Tagihan valid sudah terpasang di database)
    if (claimData.status === "ALREADY_EXISTS") {
      return {
        success: true,
        data: {
          id: cleanPesananId,
          nomor: String(claimData.nomor || ""),
          mayar_payment_id: String(claimData.mayar_payment_id || ""),
          mayar_payment_url: String(claimData.mayar_payment_url || ""),
          mayar_status: String(claimData.mayar_status || "unpaid"),
        },
      };
    }

    // Status: IN_PROGRESS (Sedang diproses oleh permintaan lain, sewa < 60 detik)
    if (claimData.status === "IN_PROGRESS") {
      return {
        success: false,
        error:
          claimData.message ||
          "Pembuatan tagihan sedang diproses oleh permintaan lain. Mohon tunggu beberapa saat.",
      };
    }

    // Status: IN_DOUBT_STALE (Sewa kedaluwarsa atau token tidak konsisten, butuh rekonsiliasi)
    if (claimData.status === "IN_DOUBT_STALE") {
      const cleanTotal = Math.round(Number(claimData.total));
      const customerEmail = (emailPelangganInput || "").trim();

      if (cleanTotal > 0) {
        try {
          const findRes = await findInvoiceByOrderRef(cleanPesananId, cleanTotal, customerEmail);
          if (findRes.success && findRes.data) {
            const autoInvoice = findRes.data;
            const safePaymentUrl = autoInvoice.paymentUrl;
            const urlValidation = validateMayarPaymentUrl(safePaymentUrl);
            if (!urlValidation.valid || !urlValidation.cleanUrl) {
              return {
                success: false,
                error: `URL tagihan Mayar dari invoice otomatis tidak valid: ${urlValidation.error || "Format tidak resmi"}. Status klaim dipertahankan.`,
              };
            }

            const cleanUrlToSave = urlValidation.cleanUrl;
            const adminSupabase = createAdminClient();

            const { error: rekonErr } = await adminSupabase.rpc(
              "rekonsiliasi_klaim_mayar",
              {
                p_pesanan_id: cleanPesananId,
                p_tindakan: "TAUTKAN_INVOICE",
                p_nominal: cleanTotal,
                p_payment_id: autoInvoice.id,
                p_payment_url: cleanUrlToSave,
                p_payment_status: autoInvoice.status || "unpaid",
                p_pelaku_id: pelakuId,
                p_alasan: "Auto-reconciled: Ditemukan invoice sah di gateway Mayar saat klaim sewa menggantung.",
              }
            );

            if (!rekonErr) {
              revalidatePath("/pesanan-jual");
              revalidatePath("/");
              return {
                success: true,
                data: {
                  id: cleanPesananId,
                  nomor: String(claimData.nomor || ""),
                  mayar_payment_id: autoInvoice.id,
                  mayar_payment_url: cleanUrlToSave,
                  mayar_status: autoInvoice.status || "unpaid",
                },
              };
            }
          } else {
            // Invoice belum terbit di gateway Mayar -> batalkan sewa klaim kedaluwarsa secara aman
            const adminSupabase = createAdminClient();
            await adminSupabase.rpc("rekonsiliasi_klaim_mayar", {
              p_pesanan_id: cleanPesananId,
              p_tindakan: "BATALKAN_KLAIM",
              p_nominal: null,
              p_payment_id: null,
              p_payment_url: null,
              p_payment_status: "unpaid",
              p_pelaku_id: pelakuId,
              p_alasan: "Auto-reconciled: Pembatalan sewa kedaluwarsa setelah diverifikasi invoice belum terbit di Mayar.",
            });
            return {
              success: false,
              error:
                "Sewa klaim sebelumnya yang kedaluwarsa telah dibersihkan secara aman. Silakan klik 'Lanjutkan & Terbitkan Tagihan' sekali lagi untuk menerbitkan tagihan.",
            };
          }
        } catch (autoErr) {
          console.error("[AUTO_RECONCILE_STALE_ERROR]", autoErr);
        }
      }

      return {
        success: false,
        error:
          claimData.message ||
          "Proses pembuatan tagihan sebelumnya terputus atau batas waktu sewa (60 detik) terlampaui. Periksa dashboard Mayar atau jalankan rekonsiliasi klaim sebelum mencoba kembali.",
      };
    }

    // Status: DATA_ANOMALY (Metadata pembayaran sebagian / tidak konsisten)
    if (claimData.status === "DATA_ANOMALY") {
      return {
        success: false,
        error:
          claimData.message ||
          "Inkonsistensi data tagihan Mayar: Metadata pembayaran tidak lengkap. Hubungi administrator atau lakukan rekonsiliasi manual sebelum membuat tagihan baru.",
      };
    }

    // Status selain CLAIMED ditolak
    if (claimData.status !== "CLAIMED") {
      return {
        success: false,
        error:
          claimData.message ||
          `Klaim tagihan Mayar ditolak oleh basis data dengan status '${claimData.status}'.`,
      };
    }

    // 7. Validasi Token Klaim & Nominal Total dari Database
    const claimToken = claimData.claim_token ? String(claimData.claim_token).trim() : "";
    if (!claimToken) {
      return {
        success: false,
        error: "Respons klaim basis data berhasil namun token sewa klaim tidak diterima.",
      };
    }

    const cleanTotal = Math.round(Number(claimData.total));
    if (isNaN(cleanTotal) || cleanTotal <= 0) {
      // Belum ada panggilan HTTP ke Mayar -> aman melepas klaim
      await lepasKlaimMayarAman(supabase, cleanPesananId, claimToken);
      return {
        success: false,
        error: "Total nominal tagihan dari database tidak valid atau bernilai Rp0.",
      };
    }

    // 8. Ambil Info Pelanggan untuk Kontak & Deskripsi Mayar (Pra-Mayar)
    let customerName = "Pelanggan Toko";
    let customerPhone: string | undefined = undefined;
    const customerEmail = (emailPelangganInput || "").trim();

    if (claimData.pelanggan_id) {
      try {
        const { data: pelanggan, error: pelangganErr } = await supabase
          .from("pelanggan")
          .select("nama_toko, telepon")
          .eq("id", claimData.pelanggan_id)
          .maybeSingle();

        if (!pelangganErr && pelanggan) {
          if (pelanggan.nama_toko && typeof pelanggan.nama_toko === "string") {
            customerName = pelanggan.nama_toko.trim();
          }
          if (pelanggan.telepon && typeof pelanggan.telepon === "string") {
            customerPhone = pelanggan.telepon.trim();
          }
        }
      } catch (custErr) {
        console.warn(
          `[MAYAR_CUSTOMER_INFO] Gagal memuat info pelanggan pesanan ${cleanPesananId}:`,
          custErr instanceof Error ? custErr.message : "Error tidak diketahui"
        );
      }
    }

    // Validasi Pra-Mayar: Kewajiban Email dan Nomor Ponsel sesuai Kontrak Mayar API V1
    // Aturan: Jangan mengirim email palsu atau default jika pelanggan tidak memilikinya.
    if (!customerEmail || !customerEmail.includes("@")) {
      await lepasKlaimMayarAman(supabase, cleanPesananId, claimToken);
      return {
        success: false,
        error:
          "Pembuatan tagihan Mayar dibatalkan: Alamat email pelanggan belum tersedia atau tidak valid. Sesuai spesifikasi resmi Mayar API V1 (POST /hl/v1/payment/create), alamat email pelanggan wajib disediakan untuk mengirimkan bukti tagihan. Silakan lengkapi email pelanggan terlebih dahulu.",
      };
    }

    if (!customerPhone) {
      await lepasKlaimMayarAman(supabase, cleanPesananId, claimToken);
      return {
        success: false,
        error:
          "Pembuatan tagihan Mayar dibatalkan: Nomor telepon/ponsel pelanggan belum tersedia. Sesuai spesifikasi resmi Mayar API V1, nomor ponsel pelanggan wajib disediakan.",
      };
    }

    // Pre-flight check konfigurasi server: Pastikan Service Role Key tersedia
    // SEBELUM memanggil gateway Mayar, untuk mencegah timbulnya tagihan Mayar yatim
    // yang tidak dapat disimpan ke database.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey || !serviceRoleKey.trim()) {
      // Aman melepas sewa klaim karena gateway Mayar belum dihubungi sama sekali
      await lepasKlaimMayarAman(supabase, cleanPesananId, claimToken);
      return {
        success: false,
        error:
          "Pembuatan tagihan Mayar dibatalkan: Kredensial server admin (SUPABASE_SERVICE_ROLE_KEY) belum disetel pada server. Kredensial ini diperlukan untuk menyimpan metadata tagihan secara aman. Klaim sewa telah dilepas.",
      };
    }

    // Pre-flight check kredensial gateway Mayar
    const mayarApiKey = process.env.MAYAR_API_KEY;
    if (!mayarApiKey || !mayarApiKey.trim()) {
      await lepasKlaimMayarAman(supabase, cleanPesananId, claimToken);
      return {
        success: false,
        error:
          "Pembuatan tagihan Mayar dibatalkan: Konfigurasi kredensial gateway Mayar (MAYAR_API_KEY) belum disetel pada server. Klaim sewa telah dilepas.",
      };
    }

    // 9. Panggil Mayar Headless API V2 via createSinglePayment dengan Unique Ref Pesanan
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const redirectUrl = `${baseUrl.replace(/\/+$/, "")}/pesanan-jual`;

    let mayarRes;
    try {
      mayarRes = await createSinglePayment({
        name: customerName,
        amount: cleanTotal,
        email: customerEmail,
        mobile: customerPhone,
        description: `Tagihan pesanan ${claimData.nomor || cleanPesananId} [REF:${cleanPesananId}]`,
        redirectUrl,
        uniqueRef: cleanPesananId,
      });
    } catch (mayarEx) {
      console.error(
        `[MAYAR_API_EXCEPTION] Eksepsi saat menghubungi gateway Mayar untuk pesanan ${cleanPesananId}: ${mayarEx instanceof Error ? mayarEx.message : "Network/Runtime error"
        }`
      );
      // PENTING: Karena request HTTP telah dikirim ke Mayar dan gangguan koneksi / timeout terjadi pasca-pengiriman,
      // invoice MUNGKIN telah tersimpan di gateway Mayar.
      // DILARANG melepas sewa klaim secara otomatis untuk mencegah duplikasi tagihan.
      // Status sewa klaim DIPERTAHANKAN agar admin/manajer dapat merekonsiliasi.
      return {
        success: false,
        error:
          "Terjadi gangguan koneksi saat memverifikasi respons gateway Mayar. Status klaim dipertahankan untuk mencegah duplikasi tagihan. Silakan lakukan rekonsiliasi sebelum mencoba kembali.",
      };
    }

    if (!mayarRes.success || !mayarRes.data) {
      console.error(
        `[MAYAR_API_ERROR] Gateway Mayar menolak/gagal membuat tagihan untuk pesanan ${cleanPesananId}: ${mayarRes.error || "Respons gagal dari Mayar"
        }`
      );
      // Evaluasi apakah penolakan merupakan penolakan validasi client definitif (4xx)
      // ATAU kegagalan server / rekonsiliasi tidak pasti (5xx).
      // Klaim HANYA aman dilepas jika gateway secara definitif menolak validasi client (HTTP 4xx / validasi input).
      // Jika error server 5xx atau respons ambigu di mana invoice mungkin sudah terbit di gateway:
      // Klaim WAJIB DIPERTAHANKAN untuk rekonsiliasi manual!
      const isDefinitiveClientError =
        mayarRes.error?.includes("HTTP 4") ||
        mayarRes.error?.includes("wajib") ||
        mayarRes.error?.includes("format valid");

      if (isDefinitiveClientError) {
        await lepasKlaimMayarAman(supabase, cleanPesananId, claimToken);
      }

      return {
        success: false,
        error:
          mayarRes.error ||
          "Gagal membuat tagihan pembayaran pada gateway Mayar. Status klaim dipertahankan untuk rekonsiliasi.",
      };
    }

    // 10. Verifikasi Respons Invoice Mayar & Integritas Nominal
    const paymentData = mayarRes.data;
    const paymentId = paymentData.id ? String(paymentData.id).trim() : "";
    const paymentUrl = String(paymentData.link || paymentData.url || "").trim();
    // Mayar API V2 tidak selalu mengembalikan field amount.
    // Nominal yang dikirim berasal dari total pesanan yang sudah diverifikasi dari database.
    if (!Number.isFinite(cleanTotal) || cleanTotal <= 0) {
      console.error(
        `[MAYAR_VERIFY_ERROR] Total pesanan tidak valid: ${cleanTotal} pada pesanan ${cleanPesananId}.`,
      );

      return {
        success: false,
        error: "Total pesanan tidak valid. Klaim dipertahankan untuk rekonsiliasi.",
      };
    }

    if (!paymentId) {
      console.error(
        `[MAYAR_VERIFY_ERROR] Respons Mayar untuk pesanan ${cleanPesananId} tidak menyertakan payment ID.`
      );
      return {
        success: false,
        error:
          "Respons gateway Mayar berhasil namun ID pembayaran tidak lengkap. Status klaim dipertahankan untuk rekonsiliasi.",
      };
    }

    // Validasi URL tagihan resmi Mayar menggunakan helper terstandarisasi
    const urlValidation = validateMayarPaymentUrl(paymentUrl);
    if (!urlValidation.valid || !urlValidation.cleanUrl) {
      console.error(
        `[MAYAR_VERIFY_ERROR] URL tagihan Mayar untuk pesanan ${cleanPesananId} tidak valid: ${urlValidation.error}`
      );
      return {
        success: false,
        error: `Respons gateway Mayar menyertakan URL tagihan yang tidak valid: ${urlValidation.error || "Format tidak resmi"}. Status klaim dipertahankan untuk rekonsiliasi.`,
      };
    }

    const cleanPaymentUrl = urlValidation.cleanUrl;

    // 11. Simpan Metadata Tagihan via Admin Client (RPC privat simpan_tagihan_mayar)
    // Hak eksekusi simpan_tagihan_mayar telah di-REVOKE dari authenticated dan HANYA diizinkan untuk service_role.
    let adminSupabase: SupabaseClient;
    try {
      adminSupabase = createAdminClient();
    } catch (adminInitErr) {
      // Jangan membuat fallback yang melemahkan keamanan jika service role key belum ada!
      console.error(
        `[ADMIN_CLIENT_INIT_FAILED] Gagal inisialisasi Supabase Admin Client untuk pesanan ${cleanPesananId}:`,
        adminInitErr instanceof Error ? adminInitErr.message : "Kredensial belum disetel"
      );
      return {
        success: false,
        error:
          "Konfigurasi server admin (SUPABASE_SERVICE_ROLE_KEY) belum disetel. Tagihan Mayar telah terbit di gateway; status klaim dipertahankan untuk rekonsiliasi.",
      };
    }

    const { data: simpanRaw, error: simpanRpcError } = await adminSupabase.rpc(
      "simpan_tagihan_mayar",
      {
        p_pesanan_id: cleanPesananId,
        p_claim_token: claimToken,
        p_payment_id: paymentId,
        p_payment_url: cleanPaymentUrl,
        p_nominal: cleanTotal,
        p_pelaku_id: pelakuId,
        p_payment_status: "unpaid",
      }
    );

    if (simpanRpcError) {
      console.error(
        `[SIMPAN_TAGIHAN_ERROR] RPC simpan_tagihan_mayar gagal untuk pesanan ${cleanPesananId}: ${simpanRpcError.message}`
      );

      const simpanErrMsg = simpanRpcError.message || "";
      if (
        simpanErrMsg.includes("Could not find the function") ||
        simpanErrMsg.includes("schema cache") ||
        simpanRpcError.code === "PGRST202"
      ) {
        return {
          success: false,
          error:
            "Tagihan Mayar telah diterbitkan di gateway, tetapi RPC 'simpan_tagihan_mayar' belum terpasang di database Supabase (migrasi 04 belum dijalankan). Status klaim dipertahankan untuk rekonsiliasi.",
        };
      }

      return {
        success: false,
        error: `Gagal menyimpan metadata pembayaran Mayar ke database: ${simpanErrMsg}. Status klaim dipertahankan untuk rekonsiliasi.`,
      };
    }

    let simpanData: SimpanTagihanMayarResponse | null = null;
    if (typeof simpanRaw === "string") {
      try {
        simpanData = JSON.parse(simpanRaw) as SimpanTagihanMayarResponse;
      } catch {
        simpanData = null;
      }
    } else if (simpanRaw && typeof simpanRaw === "object") {
      simpanData = simpanRaw as SimpanTagihanMayarResponse;
    }

    // 12. Revalidasi Halaman Terkait
    revalidatePath("/pesanan-jual");
    revalidatePath("/");

    return {
      success: true,
      data: {
        id: cleanPesananId,
        nomor: String(simpanData?.nomor || claimData.nomor || ""),
        mayar_payment_id: paymentId,
        mayar_payment_url: paymentUrl,
        mayar_status: "unpaid",
      },
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Terjadi kesalahan internal pada server.";
    return { success: false, error: errorMsg };
  }
}

/**
 * Server Action: Rekonsiliasi Klaim Mayar (PRD Bab 11, BR-07, BR-12)
 *
 * Digunakan secara administratif oleh Manajer aktif untuk memulihkan
 * status klaim menggantung (IN_DOUBT_STALE) pada pesanan.
 * - 'BATALKAN_KLAIM': Membatalkan sewa klaim agar pesanan dapat ditagih kembali.
 * - 'TAUTKAN_INVOICE': Memverifikasi invoice Mayar via getPaymentStatus dan menautkannya ke pesanan.
 */
export async function rekonsiliasiKlaimMayarAction(params: {
  pesananId: string;
  tindakan: "BATALKAN_KLAIM" | "TAUTKAN_INVOICE";
  alasan: string;
  paymentId?: string;
}): Promise<ActionResult<{ success: boolean; pesan: string }>> {
  try {
    const { pesananId, tindakan, alasan, paymentId } = params;

    if (!pesananId || typeof pesananId !== "string" || !pesananId.trim()) {
      return { success: false, error: "ID pesanan wajib diisi." };
    }

    const cleanPesananId = pesananId.trim();
    const cleanAlasan = (alasan || "").trim();

    if (cleanAlasan.length < 5) {
      return {
        success: false,
        error: "Alasan rekonsiliasi wajib diisi minimal 5 karakter untuk jejak audit.",
      };
    }

    if (tindakan !== "BATALKAN_KLAIM" && tindakan !== "TAUTKAN_INVOICE") {
      return {
        success: false,
        error: "Tindakan rekonsiliasi tidak valid. Pilihan: BATALKAN_KLAIM atau TAUTKAN_INVOICE.",
      };
    }

    // 1. Verifikasi Sesi Pengguna
    const supabase = await createServerClientInstance();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: "Akses ditolak: sesi telah berakhir. Silakan login kembali.",
      };
    }

    // 2. Verifikasi Profil & Peran Manajer Saja (BR-07, BR-12)
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, peran, aktif")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || profile.aktif !== true) {
      return {
        success: false,
        error: "Akses ditolak: akun tidak ditemukan atau telah dinonaktifkan.",
      };
    }

    if (profile.peran !== "manajer") {
      return {
        success: false,
        error: "Akses ditolak: Hanya Manajer aktif yang berwenang melakukan rekonsiliasi klaim.",
      };
    }

    // 3. Verifikasi Pesanan di Database
    const { data: pesanan, error: pesananErr } = await supabase
      .from("pesanan_jual")
      .select("id, nomor, status, total, mayar_payment_id, mayar_claim_token, mayar_claim_at")
      .eq("id", cleanPesananId)
      .maybeSingle();

    if (pesananErr || !pesanan) {
      return { success: false, error: "Data pesanan tidak ditemukan di database." };
    }

    // 4. Inisialisasi Admin Client (karena RPC rekonsiliasi_klaim_mayar khusus service_role)
    const adminSupabase = createAdminClient();

    let nominalParam: number | null = null;
    let paymentIdParam: string | null = null;
    let paymentUrlParam: string | null = null;
    let paymentStatusParam: string = "unpaid";

    if (tindakan === "TAUTKAN_INVOICE") {
      if (!paymentId || typeof paymentId !== "string" || !paymentId.trim()) {
        return {
          success: false,
          error: "ID pembayaran Mayar wajib disertakan untuk tindakan TAUTKAN_INVOICE.",
        };
      }

      const cleanPaymentId = paymentId.trim();

      // Verifikasi riil ke server Mayar via getPaymentStatus
      const verifyRes = await getPaymentStatus(cleanPaymentId);
      if (!verifyRes.success || !verifyRes.data) {
        return {
          success: false,
          error: `Verifikasi invoice ke gateway Mayar gagal: ${verifyRes.error || "Data tidak ditemukan"}`,
        };
      }

      const invoiceData = verifyRes.data;
      const cleanTotal = Math.round(Number(pesanan.total));
      const invoiceAmount = Math.round(Number(invoiceData.amount));

      if (invoiceAmount !== cleanTotal) {
        return {
          success: false,
          error: `Integritas nominal gagal: nominal tagihan Mayar (Rp${invoiceAmount.toLocaleString("id-ID")}) tidak sesuai dengan total pesanan (Rp${cleanTotal.toLocaleString("id-ID")}).`,
        };
      }

      const rawPaymentUrl =
        invoiceData.paymentUrl ||
        (invoiceData.link?.startsWith("http") ? invoiceData.link : undefined);

      if (!rawPaymentUrl) {
        return {
          success: false,
          error:
            "Verifikasi invoice gagal: gateway Mayar tidak mengembalikan tautan pembayaran (paymentUrl) yang valid untuk invoice ini.",
        };
      }

      const urlValidation = validateMayarPaymentUrl(rawPaymentUrl);
      if (!urlValidation.valid || !urlValidation.cleanUrl) {
        return {
          success: false,
          error: `URL pembayaran invoice dari gateway Mayar tidak valid: ${urlValidation.error || "Format URL tidak resmi"}.`,
        };
      }

      nominalParam = cleanTotal;
      paymentIdParam = invoiceData.id;
      paymentUrlParam = urlValidation.cleanUrl;
      paymentStatusParam = invoiceData.status || "unpaid";
    }

    // 5. Eksekusi RPC privat rekonsiliasi_klaim_mayar
    const { data: rpcRaw, error: rpcErr } = await adminSupabase.rpc(
      "rekonsiliasi_klaim_mayar",
      {
        p_pesanan_id: cleanPesananId,
        p_tindakan: tindakan,
        p_nominal: nominalParam,
        p_payment_id: paymentIdParam,
        p_payment_url: paymentUrlParam,
        p_payment_status: paymentStatusParam,
        p_pelaku_id: user.id,
        p_alasan: cleanAlasan,
      }
    );

    if (rpcErr) {
      return {
        success: false,
        error: `Rekonsiliasi database gagal: ${rpcErr.message}`,
      };
    }

    revalidatePath("/pesanan-jual");
    revalidatePath("/");

    const pesanSukses =
      typeof rpcRaw === "object" && rpcRaw && "pesan" in rpcRaw
        ? String((rpcRaw as Record<string, unknown>).pesan)
        : `Rekonsiliasi ${tindakan} berhasil diterapkan.`;

    return {
      success: true,
      data: {
        success: true,
        pesan: pesanSukses,
      },
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Terjadi kesalahan internal pada server.";
    return { success: false, error: errorMsg };
  }
}



