"""
=============================================================================
Skrip Generator Impor Data Contoh (Seed Data) ERP CV Sinar Abadi Niaga
Sumber: Data_Contoh_ERP.xlsx
Tujuan: Menghasilkan skrip SQL transaksi aman untuk seeding data awal.
=============================================================================
KEAMANAN & INTEGRITAS DATA:
1. TIDAK menggunakan session_replication_role = 'replica'.
2. Pemeriksaan Foreign Key PostgreSQL tetap AKTIF 100%.
3. Seluruh relasi profil dipetakan secara eksplisit ke akun riil terverifikasi.
4. Pre-flight check memastikan tabel kosong DAN akun profil terdaftar.
5. Bersifat read-only terhadap database (hanya menghasilkan seed_data_export.sql).
=============================================================================
"""

import os
import sys
import re
import zipfile
import xml.etree.ElementTree as ET

# Konfigurasi Path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCEL_PATH = os.path.join(BASE_DIR, 'Data_Contoh_ERP.xlsx')
OUTPUT_SQL_PATH = os.path.join(BASE_DIR, 'scripts', 'seed_data_export.sql')

# UUID Format Validator
UUID_REGEX = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)

# =============================================================================
# 1. KONFIGURASI AKUN & PEMETAAN PROFIL EKSPLISIT
# =============================================================================
# Akun profil aktual yang terverifikasi di public.profiles Supabase:
ACTUAL_PROFILES = {
    'alen_manajer': '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc',
    'jeonghan_penjualan': 'c6bf5e70-7620-4434-b58e-d3123b2d4e91',
    'wonwoo_gudang': '551b03db-5f3e-435b-b1ce-059ebefc712b',
}

# UUID Profil pada Data Contoh Excel:
EXCEL_UUID_HENDRA_MANAJER   = 'defeb8ce-05f6-5a28-90ea-d8c5921fe92e'
EXCEL_UUID_RINA_PENJUALAN   = '1eb18f29-66c1-5086-900e-874c2d3208e5'
EXCEL_UUID_DIMAS_PENJUALAN  = '0c99b1d9-84f8-5784-a479-3df27328aebd'
EXCEL_UUID_JOKO_GUDANG      = 'da8229f5-916d-55c1-aaee-cd3cfe3e0a7b'
EXCEL_UUID_AGUS_NONAKTIF    = '58306883-5223-5b88-8691-edb367c35df9'

# PERNYATAAN KONFIRMASI EKSPLISIT:
# Di data contoh terdapat 2 akun staf penjualan aktif: Rina Kartika dan Dimas Prasetyo.
# Namun di Supabase saat ini hanya ada 1 akun staf penjualan: Jeonghan.
# Menggabungkan transaksi Rina dan Dimas ke satu akun Jeonghan HARUS disetujui secara eksplisit.
# Secara default, bernilai FALSE agar generator menolak berjalan tanpa konfirmasi eksplisit.
# Konfirmasi dapat diberikan via:
# 1. Parameter CLI: --confirm-collapse-sales
# 2. Environment variable: CONFIRM_COLLAPSE_SALES=true
# 3. Atau mengubah nilai default di bawah ini secara manual dan sadar.
CONFIRM_COLLAPSE_SALES_TO_JEONGHAN = (
    os.getenv('CONFIRM_COLLAPSE_SALES', 'false').lower() in ('1', 'true', 'yes')
    or ('--confirm-collapse-sales' in sys.argv)
)

# Kamus Pemetaan Profil Eksplisit:

PROFILE_MAPPING = {
    EXCEL_UUID_HENDRA_MANAJER: ACTUAL_PROFILES['alen_manajer'],
    EXCEL_UUID_JOKO_GUDANG: ACTUAL_PROFILES['wonwoo_gudang'],
    EXCEL_UUID_RINA_PENJUALAN: ACTUAL_PROFILES['rina_penjualan'],
    EXCEL_UUID_DIMAS_PENJUALAN: ACTUAL_PROFILES['dimas_penjualan'],
}


# =============================================================================
# 2. DEFINISI SKEMA TABEL RESMI (KOLOM BANTU DIABAIKAN)
# =============================================================================
TABLE_SCHEMAS = {
    'pemasok': {
        'sheet_id': 4,
        'columns': ['id', 'kode', 'nama', 'telepon', 'alamat', 'aktif', 'dibuat_pada'],
        'types': ['uuid', 'text', 'text', 'text', 'text', 'boolean', 'timestamptz'],
        'profile_fks': []
    },
    'pelanggan': {
        'sheet_id': 5,
        'columns': ['id', 'kode', 'nama_toko', 'telepon', 'alamat', 'batas_kredit', 'termin_hari', 'aktif', 'dibuat_oleh', 'dibuat_pada'],
        'types': ['uuid', 'text', 'text', 'text', 'text', 'numeric', 'integer', 'boolean', 'uuid', 'timestamptz'],
        'profile_fks': ['dibuat_oleh']
    },
    'barang': {
        'sheet_id': 6,
        'columns': ['id', 'kode', 'nama', 'satuan', 'harga_jual', 'harga_pokok', 'stok', 'stok_minimum', 'aktif', 'diperbarui_pada'],
        'types': ['uuid', 'text', 'text', 'text', 'numeric', 'numeric', 'integer', 'integer', 'boolean', 'timestamptz'],
        'profile_fks': []
    },
    'pembelian': {
        'sheet_id': 7,
        'columns': ['id', 'nomor', 'pemasok_id', 'barang_id', 'jumlah_dipesan', 'jumlah_diterima', 'harga_beli_satuan', 'status', 'alasan_tolak', 'diajukan_oleh', 'diajukan_pada', 'diputuskan_oleh', 'diputuskan_pada', 'diterima_oleh', 'diterima_pada'],
        'types': ['uuid', 'text', 'uuid', 'uuid', 'integer', 'integer', 'numeric', 'text', 'text', 'uuid', 'timestamptz', 'uuid', 'timestamptz', 'uuid', 'timestamptz'],
        'profile_fks': ['diajukan_oleh', 'diputuskan_oleh', 'diterima_oleh']
    },
    'pesanan_jual': {
        'sheet_id': 8,
        'columns': ['id', 'nomor', 'pelanggan_id', 'status', 'total', 'dibuat_oleh', 'dibuat_pada', 'dikonfirmasi_pada', 'dikirim_pada', 'jatuh_tempo', 'dilunasi_pada', 'dibatalkan_pada', 'alasan_batal'],
        'types': ['uuid', 'text', 'uuid', 'text', 'numeric', 'uuid', 'timestamptz', 'timestamptz', 'timestamptz', 'date', 'timestamptz', 'timestamptz', 'text'],
        'profile_fks': ['dibuat_oleh']
    },
    'item_pesanan_jual': {
        'sheet_id': 9,
        'columns': ['id', 'pesanan_jual_id', 'barang_id', 'jumlah', 'harga_satuan', 'diskon_persen', 'subtotal', 'hpp_satuan'],
        'types': ['uuid', 'uuid', 'uuid', 'integer', 'numeric', 'numeric', 'numeric', 'numeric'],
        'profile_fks': []
    },
    'mutasi_stok': {
        'sheet_id': 10,
        'columns': ['id', 'barang_id', 'jenis', 'jumlah', 'stok_sesudah', 'nomor_dokumen', 'alasan', 'dibuat_oleh', 'dibuat_pada'],
        'types': ['bigint', 'uuid', 'text', 'integer', 'integer', 'text', 'text', 'uuid', 'timestamptz'],
        'profile_fks': ['dibuat_oleh']
    },
    'audit_log': {
        'sheet_id': 11,
        'columns': ['id', 'pelaku_id', 'aksi', 'nama_tabel', 'data_id', 'nilai_lama', 'nilai_baru', 'dibuat_pada'],
        'types': ['bigint', 'uuid', 'text', 'text', 'uuid', 'jsonb', 'jsonb', 'timestamptz'],
        'profile_fks': ['pelaku_id']
    }
}

# Urutan eksekusi impor berdasarkan ketergantungan Foreign Key
IMPORT_ORDER = [
    'pemasok',
    'pelanggan',
    'barang',
    'pembelian',
    'pesanan_jual',
    'item_pesanan_jual',
    'mutasi_stok',
    'audit_log'
]

def parse_sheet_rows(z, sheet_id):
    filename = f'xl/worksheets/sheet{sheet_id}.xml'
    xml = ET.fromstring(z.read(filename))
    rows = []
    for r in xml.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
        row_cells = []
        for c in r.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
            t = c.attrib.get('t')
            v_elem = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
            val = v_elem.text if v_elem is not None else ''
            if t == 'inlineStr':
                t_elem = c.find('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                val = t_elem.text if t_elem is not None else ''
            row_cells.append(val)
        if any(row_cells):
            rows.append(row_cells)
    return rows

def validate_configuration():
    """
    Validasi ketat sebelum menghasilkan SQL:
    1. Pastikan seluruh UUID aktual berformat valid.
    2. Pastikan tidak ada duplikasi UUID tidak sah antar peran aktual (Alen != Jeonghan != Wonwoo).
    3. Pastikan tidak ada pemetaan yang bernilai None atau belum terkonfirmasi.
    4. Pastikan penggabungan staf penjualan (Rina & Dimas -> Jeonghan) disetujui secara eksplisit.
    5. Pastikan pemetaan antar peran tidak saling tumpang tindih (manajer != gudang != penjualan).
    """
    print("[VALIDASI] Memeriksa konfigurasi akun dan pemetaan profil...")

    # 1. Validasi format UUID aktual
    for name, uid in ACTUAL_PROFILES.items():
        if not uid or not UUID_REGEX.match(uid):
            raise ValueError(f"ERROR: UUID aktual untuk '{name}' tidak valid: '{uid}'")

    # 2. Validasi duplikasi pada akun profil aktual (Pemisahan Peran Wajib)
    actual_uids = list(ACTUAL_PROFILES.values())
    if len(set(actual_uids)) != len(actual_uids):
        duplicates = [uid for uid in set(actual_uids) if actual_uids.count(uid) > 1]
        raise ValueError(f"ERROR: Ditemukan UUID duplikat pada konfigurasi profil aktual: {duplicates}. Setiap peran wajib memiliki akun terpisah!")

    # 3. Validasi kelengkapan dan format pemetaan
    required_sample_uuids = [
        ('Hendra (manajer)', EXCEL_UUID_HENDRA_MANAJER),
        ('Joko (gudang)', EXCEL_UUID_JOKO_GUDANG),
        ('Rina (penjualan)', EXCEL_UUID_RINA_PENJUALAN),
        ('Dimas (penjualan)', EXCEL_UUID_DIMAS_PENJUALAN)
    ]

    for label, req_uuid in required_sample_uuids:
        mapped_uuid = PROFILE_MAPPING.get(req_uuid)
        if not mapped_uuid:
            if req_uuid == EXCEL_UUID_DIMAS_PENJUALAN and not CONFIRM_COLLAPSE_SALES_TO_JEONGHAN:
                raise ValueError(
                    f"KONFIRMASI DIPERLUKAN: Pemetaan untuk {label} belum dikonfirmasi eksplisit.\n"
                    "Data contoh memiliki 2 staf penjualan (Rina dan Dimas), sedangkan Supabase saat ini hanya memiliki 1 akun (Jeonghan).\n"
                    "Opsi:\n"
                    "  a) Konfirmasi penggabungan transaksi Rina & Dimas ke Jeonghan dengan menyertakan argumen: --confirm-collapse-sales\n"
                    "     atau menyetel environment variable: CONFIRM_COLLAPSE_SALES=true\n"
                    "  b) Buat akun staf penjualan kedua di Supabase dan daftarkan UUID-nya ke ACTUAL_PROFILES['dimas_penjualan']."
                )
            raise ValueError(f"ERROR: Akun {label} (UUID: '{req_uuid}') belum memiliki pemetaan yang valid di PROFILE_MAPPING.")

        if not UUID_REGEX.match(mapped_uuid):
            raise ValueError(f"ERROR: Target UUID '{mapped_uuid}' untuk '{label}' tidak berformat UUID valid.")

    # 4. Validasi integritas pemisahan peran pada hasil pemetaan
    # Manajer dan Gudang TIDAK BOLEH dipetakan ke target UUID yang sama
    target_hendra = PROFILE_MAPPING[EXCEL_UUID_HENDRA_MANAJER]
    target_joko = PROFILE_MAPPING[EXCEL_UUID_JOKO_GUDANG]
    target_rina = PROFILE_MAPPING[EXCEL_UUID_RINA_PENJUALAN]
    target_dimas = PROFILE_MAPPING.get(EXCEL_UUID_DIMAS_PENJUALAN)

    if target_hendra == target_joko:
        raise ValueError("ERROR INTEGRITAS: Akun manajer (Hendra) dan gudang (Joko) tidak boleh dipetakan ke target UUID yang sama!")
    if target_hendra == target_rina:
        raise ValueError("ERROR INTEGRITAS: Akun manajer (Hendra) dan penjualan (Rina) tidak boleh dipetakan ke target UUID yang sama!")
    if target_joko == target_rina:
        raise ValueError("ERROR INTEGRITAS: Akun gudang (Joko) dan penjualan (Rina) tidak boleh dipetakan ke target UUID yang sama!")

    # Rina dan Dimas hanya boleh memiliki target UUID yang sama jika CONFIRM_COLLAPSE_SALES_TO_JEONGHAN disetujui
    if target_rina == target_dimas and not CONFIRM_COLLAPSE_SALES_TO_JEONGHAN:
        raise ValueError("ERROR INTEGRITAS: Pemetaan duplikat akun penjualan (Rina & Dimas) ke UUID yang sama belum dikonfirmasi secara eksplisit.")

    print("[VALIDASI] Seluruh konfigurasi pemetaan profil valid, bebas konflik duplikasi, dan terkonfirmasi.")
    return True

def format_sql_value(val, col_type, col_name, profile_fks, row_dict=None):
    if val is None or val == '':
        return 'NULL'
    
    # Pemetaan profil jika kolom merupakan referensi FK profiles
    if col_name in profile_fks:
        if val in PROFILE_MAPPING and PROFILE_MAPPING[val]:
            val = PROFILE_MAPPING[val]
        else:
            raise ValueError(f"ERROR: Nilai FK '{col_name}' = '{val}' tidak memiliki pemetaan valid dalam PROFILE_MAPPING.")

    # Khusus audit_log: jika nama_tabel == 'profiles' dan kolom data_id, petakan ke UUID profil riil
    if col_name == 'data_id' and row_dict and row_dict.get('nama_tabel') == 'profiles':
        if val in PROFILE_MAPPING and PROFILE_MAPPING[val]:
            val = PROFILE_MAPPING[val]
        else:
            raise ValueError(f"ERROR: data_id profil '{val}' pada audit_log tidak memiliki pemetaan valid dalam PROFILE_MAPPING.")

    if col_type == 'boolean':
        return 'TRUE' if str(val) in ('1', 'true', 'TRUE', 'True') else 'FALSE'
    elif col_type in ('integer', 'bigint', 'numeric'):
        return str(val)
    elif col_type == 'jsonb':
        escaped = str(val).replace("'", "''")
        return f"'{escaped}'::jsonb"
    elif col_type in ('uuid', 'text', 'timestamptz', 'date'):
        escaped = str(val).replace("'", "''")
        return f"'{escaped}'"
    else:
        escaped = str(val).replace("'", "''")
        return f"'{escaped}'"

def generate_seed_sql():
    if not os.path.exists(EXCEL_PATH):
        print(f"Error: File {EXCEL_PATH} tidak ditemukan.")
        return False

    validate_configuration()

    os.makedirs(os.path.dirname(OUTPUT_SQL_PATH), exist_ok=True)

    with zipfile.ZipFile(EXCEL_PATH, 'r') as z:
        sql_lines = []
        sql_lines.append("-- =============================================================================")
        sql_lines.append("-- SKRIP IMPOR DATA CONTOH RESMI: CV SINAR ABADI NIAGA")
        sql_lines.append("-- Dihasilkan secara otomatis dari Data_Contoh_ERP.xlsx")
        sql_lines.append("-- =============================================================================")
        sql_lines.append("-- KETENTUAN KEAMANAN & INTEGRITAS:")
        sql_lines.append("-- 1. Pemeriksaan FOREIGN KEY tetap AKTIF (TIDAK memakai session_replication_role).")
        sql_lines.append("-- 2. Trigger tabel TIDAK dimatikan secara massal.")
        sql_lines.append("-- 3. Seluruh tabel tujuan HARUS dalam kondisi kosong (0 baris).")
        sql_lines.append("-- 4. Akun profil aktual (Alen, Jeonghan, Wonwoo) WAJIB sudah ada di public.profiles.")
        sql_lines.append("-- 5. Transaksi ATOMIK penuh (BEGIN ... COMMIT).")
        sql_lines.append("-- =============================================================================\n")
        sql_lines.append("BEGIN;\n")

        # 1. Pre-flight check: Pastikan tabel kosong DAN profil tujuan tersedia
        sql_lines.append("-- 1. PEMERIKSAAN AWAL (PRE-FLIGHT CHECK)")
        sql_lines.append("DO $$")
        sql_lines.append("DECLARE")
        sql_lines.append("  v_alen_id uuid := '7e3c2f8e-4d6a-4e20-9c20-eabd17cb0fdc';")
        sql_lines.append("  v_jeonghan_id uuid := 'c6bf5e70-7620-4434-b58e-d3123b2d4e91';")
        sql_lines.append("  v_wonwoo_id uuid := '551b03db-5f3e-435b-b1ce-059ebefc712b';")
        sql_lines.append("BEGIN")
        sql_lines.append("  -- A. Validasi keberadaan akun profil aktual di public.profiles")
        sql_lines.append("  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_alen_id AND peran = 'manajer') THEN")
        sql_lines.append("    RAISE EXCEPTION 'PRE-FLIGHT CHECK GAGAL: Akun manajer Alen (%) tidak ditemukan di public.profiles.', v_alen_id;")
        sql_lines.append("  END IF;")
        sql_lines.append("  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_jeonghan_id AND peran = 'penjualan') THEN")
        sql_lines.append("    RAISE EXCEPTION 'PRE-FLIGHT CHECK GAGAL: Akun penjualan Jeonghan (%) tidak ditemukan di public.profiles.', v_jeonghan_id;")
        sql_lines.append("  END IF;")
        sql_lines.append("  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_wonwoo_id AND peran = 'gudang') THEN")
        sql_lines.append("    RAISE EXCEPTION 'PRE-FLIGHT CHECK GAGAL: Akun gudang Wonwoo (%) tidak ditemukan di public.profiles.', v_wonwoo_id;")
        sql_lines.append("  END IF;\n")
        sql_lines.append("  -- B. Validasi seluruh tabel tujuan kosong untuk mencegah tabrakan data")
        sql_lines.append("  IF EXISTS (SELECT 1 FROM public.pemasok LIMIT 1) OR")
        sql_lines.append("     EXISTS (SELECT 1 FROM public.pelanggan LIMIT 1) OR")
        sql_lines.append("     EXISTS (SELECT 1 FROM public.barang LIMIT 1) OR")
        sql_lines.append("     EXISTS (SELECT 1 FROM public.pembelian LIMIT 1) OR")
        sql_lines.append("     EXISTS (SELECT 1 FROM public.pesanan_jual LIMIT 1) OR")
        sql_lines.append("     EXISTS (SELECT 1 FROM public.item_pesanan_jual LIMIT 1) OR")
        sql_lines.append("     EXISTS (SELECT 1 FROM public.mutasi_stok LIMIT 1) OR")
        sql_lines.append("     EXISTS (SELECT 1 FROM public.audit_log LIMIT 1) THEN")
        sql_lines.append("    RAISE EXCEPTION 'PRE-FLIGHT CHECK GAGAL: Satu atau lebih tabel tujuan sudah memiliki data. Impor dibatalkan untuk mencegah tabrakan data.';")
        sql_lines.append("  END IF;")
        sql_lines.append("END $$;\n")

        # 2. Iterasi setiap tabel sesuai urutan dependensi
        total_rows = 0
        for table_name in IMPORT_ORDER:
            meta = TABLE_SCHEMAS[table_name]
            sheet_id = meta['sheet_id']
            cols = meta['columns']
            types = meta['types']
            profile_fks = meta['profile_fks']

            rows = parse_sheet_rows(z, sheet_id)
            if not rows or len(rows) <= 1:
                print(f"Peringatan: Tabel {table_name} tidak memiliki data di sheet {sheet_id}.")
                continue

            excel_header = rows[0]
            col_map = {}
            for col in cols:
                if col in excel_header:
                    col_map[col] = excel_header.index(col)
                else:
                    print(f"Error fatal: Kolom {col} tidak ditemukan pada header sheet {table_name}: {excel_header}")
                    return False

            data_rows = rows[1:]
            total_rows += len(data_rows)
            sql_lines.append(f"-- -----------------------------------------------------------------------------")
            sql_lines.append(f"-- TABEL: public.{table_name} ({len(data_rows)} baris)")
            sql_lines.append(f"-- -----------------------------------------------------------------------------")

            col_list_str = ', '.join(cols)
            sql_lines.append(f"INSERT INTO public.{table_name} ({col_list_str}) VALUES")

            val_lines = []
            for r in data_rows:
                row_dict = {c_name: (r[col_map[c_name]] if col_map[c_name] < len(r) else '') for c_name in cols}
                row_vals = []
                for c_name, c_type in zip(cols, types):
                    raw_val = row_dict[c_name]
                    formatted = format_sql_value(raw_val, c_type, c_name, profile_fks, row_dict)
                    row_vals.append(formatted)
                val_lines.append(f"  ({', '.join(row_vals)})")

            sql_lines.append(',\n'.join(val_lines) + ';\n')

        # 3. Sinkronisasi sequence identity serial pada tabel dengan primary key integer
        sql_lines.append("-- 3. SINKRONISASI SEQUENCE IDENTITY (mutasi_stok & audit_log)")
        sql_lines.append("SELECT setval(pg_get_serial_sequence('public.mutasi_stok', 'id'), COALESCE((SELECT MAX(id) FROM public.mutasi_stok), 1));")
        sql_lines.append("SELECT setval(pg_get_serial_sequence('public.audit_log', 'id'), COALESCE((SELECT MAX(id) FROM public.audit_log), 1));\n")

        # 4. Selesaikan transaksi
        sql_lines.append("-- 4. COMMIT TRANSAKSI")
        sql_lines.append("COMMIT;\n")

        with open(OUTPUT_SQL_PATH, 'w', encoding='utf-8') as out:
            out.write('\n'.join(sql_lines))

        print(f"BERHASIL: File SQL impor siap pakai dibuat di: {OUTPUT_SQL_PATH}")
        print(f"Total baris data yang diekspor: {total_rows} baris dari 8 tabel.")
        return True

if __name__ == '__main__':
    generate_seed_sql()
