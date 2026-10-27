/**
 * Definisi tipe data resmi Mayar Headless API V2 & Webhook.
 * Dokumen Acuan: PRD Bab 11 & Dokumentasi Resmi docs.mayar.id/api-reference-v2
 * Terakhir diperbarui mengacu pada kontrak: POST /hl/v2/invoices/create
 */

/**
 * Parameter request untuk membuat Invoice Mayar (POST /hl/v2/invoices/create).
 * Field wajib API V2: name, email, mobile, items[].
 * Field amount digunakan untuk menyusun items[0].rate secara internal.
 */
export interface MayarCreatePaymentRequest {
  name: string;
  amount: number;
  email?: string;
  mobile?: string;
  description?: string;
  redirectUrl?: string;
  uniqueRef?: string;
}

/**
 * Data invoice yang dikembalikan oleh POST /hl/v2/invoices/create.
 * PENTING: Respons create V2 TIDAK memiliki `status`, `amount`, atau `expired_date`.
 * Field yang tersedia: id, transactionId, link, expiredAt (epoch ms), extraData.
 * Sumber: https://docs.mayar.id/api-reference-v2/invoice/create.md
 */
export interface MayarInvoiceCreateData {
  id: string;
  transactionId?: string;
  link: string;             // URL checkout pelanggan — selalu ada pada respons 200
  expiredAt?: number;       // Epoch milliseconds (bukan string ISO, bukan expired_date)
  extraData?: Record<string, unknown>;
}

/**
 * Data terstandarisasi yang dikembalikan fungsi createSinglePayment().
 * Merupakan tipe internal (bukan tipe API mentah) yang dinormalisasi dari
 * MayarInvoiceCreateData. Field `status` dan `amount` diisi secara lokal.
 */
export interface MayarPaymentData {
  id: string;
  link: string;
  url: string;
  paymentUrl: string;
  status: string;           // Diisi default "unpaid" — V2 tidak mengembalikan status saat create
  amount: number;           // Diisi dari nilai yang dikirim (cleanAmount) — V2 tidak echo amount
  expiredAt?: number;       // Epoch ms dari data.expiredAt
  /** @deprecated Gunakan expiredAt (number epoch ms). Field ini tidak dikembalikan API V2. */
  expired_date?: string;
}

/**
 * Response pembungkus standar dari API pembuatan Invoice Mayar V2.
 * messages: selalu string pada create invoice V2.
 * data: dapat null jika terjadi error server.
 */
export interface MayarCreatePaymentResponse {
  statusCode: number;
  messages?: string | null;
  message?: string | null;  // Beberapa endpoint V2 mengembalikan 'message' (singular)
  data: MayarInvoiceCreateData | null;
}

/**
 * Detail data transaksi saat pemeriksaan ulang status tagihan (GET /hl/v1/payment/{id}).
 */
export interface MayarPaymentStatusData {
  id: string;
  status: string;
  amount: number;
  name?: string;
  email?: string;
  currency?: string;
  paymentMethod?: string;
  transactionId?: string;
  paidAt?: string;
  customer?: {
    name?: string;
    email?: string;
    mobile?: string;
  };
  link?: string;
  paymentUrl?: string;
  url?: string;
}

/**
 * Response pembungkus status pembayaran Mayar V1.
 */
export interface MayarPaymentStatusResponse {
  statusCode: number;
  messages?: string;
  message?: string;
  data: MayarPaymentStatusData;
}

/**
 * Payload event incoming webhook resmi Mayar (event: "payment.received").
 * Dokumen Acuan: Dokumentasi Webhook Mayar (POST application/json)
 */
export interface MayarWebhookPayload {
  event: string;
  data: {
    id: string;
    status?: string | boolean;
    amount: number;
    transactionId?: string;
    paymentLinkId?: string;
    invoiceId?: string;
    paymentMethod?: string;
    customerName?: string;
    customerEmail?: string;
    customerMobile?: string;
    productId?: string;
    productName?: string;
    paidAt?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}
