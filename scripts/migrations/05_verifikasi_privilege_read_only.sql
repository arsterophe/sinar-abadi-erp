-- =============================================================================
-- VERIFIKASI KEAMANAN PRIVILEGE & ACL RPC 05 (CV SINAR ABADI NIAGA)
-- Target Proyek: Supabase Production (ref: wvjccwatzmvjtoguaugh)
-- File: scripts/migrations/05_verifikasi_privilege_read_only.sql
-- Status: READ-ONLY (TIDAK MENGUBAH DATA ATAU SKEMA DATABASE)
-- =============================================================================
-- Tujuan:
-- 1. Memeriksa ACL fisik fungsi menggunakan pg_catalog.aclexplode().
-- 2. Menangani proacl IS NULL menggunakan pg_catalog.acldefault('f'::"char", p.proowner).
-- 3. Mengidentifikasi grantee OID 0 secara tepat sebagai pseudo-role PUBLIC.
-- 4. Menguji hak eksekusi efektif peran nyata (anon, authenticated, service_role, postgres)
--    tanpa menggunakan has_function_privilege('public', ...).
-- 5. Menjelaskan status bypass superuser postgres.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BAGIAN 1: PEMERIKSAAN ACL FISIK (IDENTIFIKASI GRANTEE OID 0 SEBAGAI PUBLIC)
-- -----------------------------------------------------------------------------
SELECT 
    p.proname AS nama_fungsi,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS signature_argumen,
    pg_catalog.pg_get_userbyid(p.proowner) AS pemilik_fungsi,
    p.prosecdef AS is_security_definer,
    p.proacl IS NULL AS acl_menggunakan_default,
    a.grantee AS grantee_oid,
    CASE 
        WHEN a.grantee = 0 THEN 'PUBLIC (Pseudo-Role)'
        ELSE COALESCE(r.rolname, pg_catalog.format('OID:%s', a.grantee))
    END AS penerima_hak,
    a.privilege_type AS jenis_hak,
    a.is_grantable AS dapat_diteruskan,
    pg_catalog.pg_get_userbyid(a.grantor) AS pemberi_hak
FROM pg_catalog.pg_proc p
CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(p.proacl, pg_catalog.acldefault('f'::"char", p.proowner))
) a
LEFT JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'selesaikan_pembayaran_mayar';

-- -----------------------------------------------------------------------------
-- BAGIAN 2: VERIFIKASI STATUS ISOLASI PSEUDO-ROLE PUBLIC
-- -----------------------------------------------------------------------------
-- Menguji apakah terdapat entri ACL aktif di mana grantee = 0 dengan jenis hak EXECUTE.
-- Kriteria Aman: Wajib bernilai FALSE (Tidak ada hak eksekusi bagi PUBLIC).
SELECT 
    p.proname AS nama_fungsi,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS signature_argumen,
    EXISTS (
        SELECT 1 
        FROM pg_catalog.aclexplode(
            COALESCE(p.proacl, pg_catalog.acldefault('f'::"char", p.proowner))
        ) acl
        WHERE acl.grantee = 0 
          AND acl.privilege_type = 'EXECUTE'
    ) AS public_memiliki_hak_execute,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM pg_catalog.aclexplode(
                COALESCE(p.proacl, pg_catalog.acldefault('f'::"char", p.proowner))
            ) acl
            WHERE acl.grantee = 0 
              AND acl.privilege_type = 'EXECUTE'
        ) THEN 'BAHAYA: PUBLIC belum dicabut!'
        ELSE 'AMAN: Hak akses PUBLIC telah dicabut (Revoked)'
    END AS status_keamanan_public
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'selesaikan_pembayaran_mayar';

-- -----------------------------------------------------------------------------
-- BAGIAN 3: HAK EKSEKUSI EFEKTIF PERAN NYATA DATABASE (pg_roles)
-- -----------------------------------------------------------------------------
-- Menguji has_function_privilege hanya pada peran terdaftar di pg_roles.
-- Kriteria Keberhasilan:
-- - anon: DENIED
-- - authenticated: DENIED
-- - service_role: GRANTED
-- - postgres: SUPERUSER_BYPASS (Pemilik / Superuser)
SELECT 
    p.proname AS nama_fungsi,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS signature_argumen,
    r.rolname AS nama_role,
    r.rolsuper AS is_superuser,
    CASE 
        WHEN r.rolsuper THEN 'SUPERUSER_BYPASS (Aman: Superuser Database Selalu Memiliki Akses)'
        WHEN pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE') THEN 'GRANTED'
        ELSE 'DENIED'
    END AS hak_eksekusi_efektif,
    CASE 
        WHEN r.rolname IN ('anon', 'authenticated') AND pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE') 
            THEN 'KRITIS: Peran tidak aman memiliki hak eksekusi!'
        WHEN r.rolname = 'service_role' AND NOT pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE')
            THEN 'GAGAL: service_role tidak memiliki hak eksekusi!'
        ELSE 'SESUAI (Aman)'
    END AS evaluasi_keamanan
FROM pg_catalog.pg_proc p
CROSS JOIN pg_catalog.pg_roles r
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'selesaikan_pembayaran_mayar'
  AND r.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
ORDER BY p.oid, r.rolname;
