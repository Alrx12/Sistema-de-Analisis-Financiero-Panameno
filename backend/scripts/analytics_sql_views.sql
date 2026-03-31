-- ============================================================
-- SAFPRO — Vistas de Analytics para Power BI / consultas ad-hoc
-- Última actualización: 2026-03-30
--
-- Instrucciones:
--   psql -U apineda -d safpro -f analytics_sql_views.sql
--
-- Todas las vistas usan los nombres reales de columnas del schema.
-- PKs: user_id, file_id, snapshot_id, transaction_id, job_id
-- ============================================================

-- ── 1. ACTIVACIÓN DE USUARIOS ────────────────────────────────
-- Combina datos de registro con su primer upload y primer análisis

DROP VIEW IF EXISTS analytics_activation CASCADE;
CREATE VIEW analytics_activation AS
SELECT
    u.user_id,
    u.email,
    u.full_name,
    u.plan,
    u.is_suspended,
    u.created_at                                              AS registered_at,

    MIN(f.uploaded_at)                                        AS first_upload_at,
    EXTRACT(EPOCH FROM (MIN(f.uploaded_at) - u.created_at))
        / 3600.0                                              AS hours_to_first_upload,

    MIN(s.created_at)                                         AS first_analysis_at,

    COUNT(DISTINCT f.file_id)                                 AS total_uploads,
    COUNT(DISTINCT s.snapshot_id)                             AS total_analyses,

    CASE WHEN COUNT(DISTINCT f.file_id) > 0
         THEN TRUE ELSE FALSE END                             AS is_activated,

    CASE WHEN COUNT(DISTINCT s.snapshot_id) > 1
         THEN TRUE ELSE FALSE END                             AS is_retained

FROM users u
LEFT JOIN uploaded_files f   ON f.user_id = u.user_id
LEFT JOIN analysis_snapshots s ON s.user_id = u.user_id
GROUP BY u.user_id, u.email, u.full_name, u.plan, u.is_suspended, u.created_at;


-- ── 2. CALIDAD DEL SISTEMA POR USUARIO ──────────────────────
-- Promedio de confidence y ratio de transacciones sin clasificar

DROP VIEW IF EXISTS analytics_quality CASCADE;
CREATE VIEW analytics_quality AS
SELECT
    t.user_id,
    COUNT(t.transaction_id)                                         AS total_transactions,
    ROUND(AVG(t.confidence)::numeric, 4)                            AS avg_confidence,
    SUM(CASE WHEN t.confidence < 0.8 THEN 1 ELSE 0 END)            AS low_confidence_count,
    ROUND(
        SUM(CASE WHEN t.confidence < 0.8 THEN 1 ELSE 0 END)::numeric
        / NULLIF(COUNT(t.transaction_id), 0) * 100,
        2
    )                                                               AS low_confidence_pct,
    -- Distribución por método de clasificación (indica nivel de aprendizaje)
    SUM(CASE WHEN t.method LIKE 'kb_personal%'  THEN 1 ELSE 0 END) AS classified_by_personal_kb,
    SUM(CASE WHEN t.method LIKE 'kb_global%'    THEN 1 ELSE 0 END) AS classified_by_global_kb,
    SUM(CASE WHEN t.method LIKE 'builtin%'      THEN 1 ELSE 0 END) AS classified_by_builtin,
    SUM(CASE WHEN t.method = 'fallback'         THEN 1 ELSE 0 END) AS classified_by_fallback
FROM analysis_transactions t
GROUP BY t.user_id;


-- ── 3. TENDENCIA MENSUAL DE UPLOADS ──────────────────────────
-- Volumen de actividad por mes (últimos 24 meses)

DROP VIEW IF EXISTS analytics_uploads_monthly CASCADE;
CREATE VIEW analytics_uploads_monthly AS
SELECT
    TO_CHAR(f.uploaded_at, 'YYYY-MM')          AS month,
    f.detected_bank_name                        AS bank,
    COUNT(f.file_id)                            AS uploads,
    COUNT(DISTINCT f.user_id)                   AS unique_users
FROM uploaded_files f
WHERE f.uploaded_at >= NOW() - INTERVAL '24 months'
GROUP BY TO_CHAR(f.uploaded_at, 'YYYY-MM'), f.detected_bank_name
ORDER BY month, bank;


-- ── 4. COHORTES DE RETENCIÓN ─────────────────────────────────
-- Agrupa usuarios por mes de registro y muestra cuántos retuvieron (>1 análisis)

DROP VIEW IF EXISTS analytics_cohorts CASCADE;
CREATE VIEW analytics_cohorts AS
WITH user_counts AS (
    SELECT
        TO_CHAR(u.created_at, 'YYYY-MM')            AS cohort_month,
        COUNT(DISTINCT u.user_id)                    AS cohort_size,
        COUNT(DISTINCT CASE
            WHEN sub.analysis_count > 1 THEN u.user_id
        END)                                         AS retained_users
    FROM users u
    LEFT JOIN (
        SELECT user_id, COUNT(snapshot_id) AS analysis_count
        FROM analysis_snapshots
        GROUP BY user_id
    ) sub ON sub.user_id = u.user_id
    GROUP BY TO_CHAR(u.created_at, 'YYYY-MM')
)
SELECT
    cohort_month,
    cohort_size,
    retained_users,
    ROUND(retained_users::numeric / NULLIF(cohort_size, 0) * 100, 1) AS retention_pct
FROM user_counts
ORDER BY cohort_month;


-- ── 5. DISTRIBUCIÓN POR PLAN ─────────────────────────────────
-- Vista simple para pie chart de monetización

DROP VIEW IF EXISTS analytics_plan_distribution CASCADE;
CREATE VIEW analytics_plan_distribution AS
SELECT
    plan,
    COUNT(user_id)                                      AS user_count,
    ROUND(COUNT(user_id)::numeric / SUM(COUNT(user_id)) OVER () * 100, 1) AS pct
FROM users
WHERE is_suspended = FALSE
GROUP BY plan
ORDER BY user_count DESC;


-- ── 6. JOBS FALLIDOS RECIENTES ───────────────────────────────
-- Para monitoreo operacional

DROP VIEW IF EXISTS analytics_failed_jobs CASCADE;
CREATE VIEW analytics_failed_jobs AS
SELECT
    j.job_id,
    j.user_id,
    u.email,
    j.original_filename,
    j.created_at,
    j.completed_at,
    j.error_message,
    EXTRACT(EPOCH FROM (j.completed_at - j.created_at)) AS processing_seconds
FROM processing_jobs j
JOIN users u ON u.user_id = j.user_id
WHERE j.status = 'error'
ORDER BY j.created_at DESC;


-- ── 7. SNAPSHOT CONSOLIDADO PARA POWER BI ───────────────────
-- Vista "ancha" que Power BI puede consumir directamente sin joins

DROP VIEW IF EXISTS analytics_powerbi_main CASCADE;
CREATE VIEW analytics_powerbi_main AS
SELECT
    u.user_id,
    u.email,
    u.plan,
    u.is_suspended,
    TO_CHAR(u.created_at, 'YYYY-MM')             AS cohort_month,
    u.created_at                                  AS registered_at,

    a.total_uploads,
    a.total_analyses,
    a.first_upload_at,
    a.hours_to_first_upload,
    a.is_activated,
    a.is_retained,

    q.total_transactions,
    q.avg_confidence,
    q.low_confidence_pct,
    q.classified_by_personal_kb,
    q.classified_by_global_kb,
    q.classified_by_builtin,
    q.classified_by_fallback

FROM users u
LEFT JOIN analytics_activation a ON a.user_id = u.user_id
LEFT JOIN analytics_quality    q ON q.user_id = u.user_id;


-- ============================================================
-- INSTRUCCIONES PARA POWER BI
-- ============================================================
--
-- 1. CONECTAR DESDE POWER BI (requiere gateway de datos o VPN/SSH tunnel):
--    Home → Get Data → PostgreSQL database
--    Server:   192.168.0.34:5432  (desde red local)
--              ó tunnel SSH desde tu laptop: ssh -L 5433:localhost:5432 lex@servidor
--    Database: safpro
--    Mode:     Import (no DirectQuery — la DB es small, Import es más rápido)
--    Refresh:  cada 4 horas
--
-- 2. TABLAS A IMPORTAR EN POWER BI:
--    → analytics_powerbi_main     (vista principal — un row por usuario)
--    → analytics_uploads_monthly  (tendencia mensual)
--    → analytics_cohorts          (retención por cohorte)
--    → analytics_plan_distribution (pie de monetización)
--    → analytics_failed_jobs      (monitor operacional)
--
-- 3. NUNCA importar tablas crudas (analysis_transactions tiene miles de rows)
--    Usa siempre las vistas que pre-agregan los datos.
--
-- ============================================================
