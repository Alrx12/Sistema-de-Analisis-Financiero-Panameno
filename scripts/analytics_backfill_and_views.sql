-- =============================================================================
-- SAFPRO · Analytics Backfill + Vistas para Power BI
-- Sesión 38 — 2026-04-04
--
-- PROBLEMA CORREGIDO:
--   analytics_service.py insertaba en columnas inexistentes (event_type, metadata).
--   La tabla real tiene (event_name, properties). Todos los eventos fallaban
--   silenciosamente desde la sesión 28 hasta hoy.
--
-- ESTE SCRIPT:
--   1) Hace backfill de eventos históricos que se perdieron
--   2) Crea (o recrea) la vista public.analytics_powerbi_main que Power BI necesita
--
-- EJECUTAR:
--   PGPASSWORD=InsightLex psql -h localhost -U apineda -d safpro \
--     -f ~/safpro/scripts/analytics_backfill_and_views.sql
-- =============================================================================

-- =============================================================================
-- PARTE 1: BACKFILL DE EVENTOS HISTÓRICOS
-- No podemos reconstruir logins (no hay log de sesiones). Sí podemos reconstruir:
--   · upload_queued  → desde uploaded_files
--   · job_success    → desde processing_jobs WHERE status='success'
--   · job_error      → desde processing_jobs WHERE status='error'
--   · learn_transaction → desde analysis_transactions WHERE user_reclassified=TRUE
-- =============================================================================

-- 1a) BACKFILL: upload_queued
-- Una fila por archivo subido exitosamente (uploaded_files).
-- Solo inserta los que aún NO existen en product_events para ser idempotente.
INSERT INTO analytics.product_events (
    user_id, event_name, plan, job_id, properties, event_at, created_at
)
SELECT
    uf.user_id::uuid,
    'upload_queued'::text,
    u.plan,
    NULL,                   -- job_id no está en uploaded_files
    jsonb_build_object(
        'original_filename', uf.original_filename,
        'detected_bank',     uf.detected_bank,
        'backfill',          true
    ),
    uf.uploaded_at,
    uf.uploaded_at
FROM uploaded_files uf
JOIN users u ON u.user_id = uf.user_id
WHERE NOT EXISTS (
    SELECT 1
    FROM analytics.product_events pe
    WHERE pe.event_name = 'upload_queued'
      AND pe.user_id = uf.user_id::uuid
      AND pe.event_at = uf.uploaded_at
      AND (pe.properties->>'backfill')::boolean IS TRUE
);

-- 1b) BACKFILL: job_success
INSERT INTO analytics.product_events (
    user_id, event_name, plan, job_id, properties, event_at, created_at
)
SELECT
    j.user_id::uuid,
    'job_success'::text,
    u.plan,
    j.job_id::uuid,
    jsonb_build_object(
        'original_filename', j.original_filename,
        'backfill',          true
    ),
    COALESCE(j.completed_at, j.created_at),
    COALESCE(j.completed_at, j.created_at)
FROM processing_jobs j
JOIN users u ON u.user_id = j.user_id
WHERE j.status = 'success'
  AND NOT EXISTS (
    SELECT 1
    FROM analytics.product_events pe
    WHERE pe.event_name = 'job_success'
      AND pe.job_id = j.job_id::uuid
);

-- 1c) BACKFILL: job_error
INSERT INTO analytics.product_events (
    user_id, event_name, plan, job_id, properties, event_at, created_at
)
SELECT
    j.user_id::uuid,
    'job_error'::text,
    u.plan,
    j.job_id::uuid,
    jsonb_build_object(
        'error_message', j.error_message,
        'original_filename', j.original_filename,
        'backfill',          true
    ),
    COALESCE(j.completed_at, j.created_at),
    COALESCE(j.completed_at, j.created_at)
FROM processing_jobs j
JOIN users u ON u.user_id = j.user_id
WHERE j.status = 'error'
  AND NOT EXISTS (
    SELECT 1
    FROM analytics.product_events pe
    WHERE pe.event_name = 'job_error'
      AND pe.job_id = j.job_id::uuid
);

-- 1d) BACKFILL: learn_transaction
-- Una fila por transacción reclasificada por el usuario.
-- Usamos snapshot_id + transaction_id como clave de deduplicación.
INSERT INTO analytics.product_events (
    user_id, event_name, plan, snapshot_id, transaction_id, properties, event_at, created_at
)
SELECT
    t.user_id::uuid,
    'learn_transaction'::text,
    u.plan,
    t.snapshot_id::uuid,
    t.transaction_id::uuid,
    jsonb_build_object(
        'budget_category', t.budget_category,
        'confidence',      t.confidence,
        'backfill',        true
    ),
    s.created_at,    -- mejor aproximación: fecha del snapshot
    s.created_at
FROM analysis_transactions t
JOIN analysis_snapshots s ON s.snapshot_id = t.snapshot_id
JOIN users u ON u.user_id = t.user_id
WHERE t.user_reclassified = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM analytics.product_events pe
    WHERE pe.event_name = 'learn_transaction'
      AND pe.transaction_id = t.transaction_id::uuid
);

-- =============================================================================
-- PARTE 2: VISTA public.analytics_powerbi_main
-- Power BI consulta esta vista en el schema public.
-- Devuelve una fila por usuario con todas las métricas relevantes.
-- =============================================================================

DROP VIEW IF EXISTS public.analytics_powerbi_main CASCADE;

CREATE VIEW public.analytics_powerbi_main AS
WITH uploads AS (
    SELECT
        uf.user_id,
        COUNT(*)                                AS total_uploads,
        MIN(uf.uploaded_at)                     AS first_upload_at
    FROM uploaded_files uf
    GROUP BY uf.user_id
),
snapshots AS (
    SELECT
        s.user_id,
        COUNT(*)                                AS total_analyses
    FROM analysis_snapshots s
    GROUP BY s.user_id
),
transactions_agg AS (
    SELECT
        t.user_id,
        COUNT(*)                                AS total_transactions,
        ROUND(AVG(t.confidence)::numeric, 4)    AS avg_confidence,
        ROUND(
            COUNT(*) FILTER (WHERE t.confidence < 0.8)::numeric
            / NULLIF(COUNT(*), 0), 4
        )                                       AS low_confidence_pct,
        COUNT(*) FILTER (WHERE t.classified_by LIKE 'personal:%')  AS classified_by_personal_kb,
        COUNT(*) FILTER (WHERE t.classified_by LIKE 'global:%')    AS classified_by_global_kb,
        COUNT(*) FILTER (WHERE t.classified_by LIKE 'fallback%')   AS classified_by_fallback,
        COUNT(*) FILTER (WHERE t.classified_by LIKE 'builtin:%')   AS classified_by_builtin
    FROM analysis_transactions t
    GROUP BY t.user_id
)
SELECT
    u.user_id::text                                     AS user_id,
    u.email,
    u.plan,
    u.is_suspended,
    TO_CHAR(DATE_TRUNC('month', u.created_at), 'YYYY-MM') AS cohort_month,
    u.created_at                                        AS registered_at,
    COALESCE(up.total_uploads, 0)                       AS total_uploads,
    COALESCE(sn.total_analyses, 0)                      AS total_analyses,
    up.first_upload_at,
    EXTRACT(EPOCH FROM (up.first_upload_at - u.created_at)) / 3600.0
                                                        AS hours_to_first_upload,
    (up.first_upload_at IS NOT NULL)                    AS is_activated,
    (COALESCE(sn.total_analyses, 0) >= 2)               AS is_retained,
    COALESCE(ta.total_transactions, 0)                  AS total_transactions,
    COALESCE(ta.avg_confidence, 0)                      AS avg_confidence,
    COALESCE(ta.low_confidence_pct, 0)                  AS low_confidence_pct,
    COALESCE(ta.classified_by_personal_kb, 0)           AS classified_by_personal_kb,
    COALESCE(ta.classified_by_global_kb, 0)             AS classified_by_global_kb,
    COALESCE(ta.classified_by_fallback, 0)              AS classified_by_fallback,
    COALESCE(ta.classified_by_builtin, 0)               AS classified_by_builtin
FROM users u
LEFT JOIN uploads       up ON up.user_id = u.user_id
LEFT JOIN snapshots     sn ON sn.user_id = u.user_id
LEFT JOIN transactions_agg ta ON ta.user_id = u.user_id;

COMMENT ON VIEW public.analytics_powerbi_main IS
    'Vista consolidada una fila por usuario — fuente principal del PBIR de SAFPRO';

-- =============================================================================
-- PARTE 3: REFRESCAR VISTAS MATERIALIZADAS DE ANALYTICS
-- Después del backfill, refrescar todas las vistas para que Power BI
-- vea los datos actualizados inmediatamente al hacer Refresh.
-- =============================================================================

SELECT analytics.refresh_all_materialized_views();

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================

SELECT
    event_name,
    COUNT(*)                                    AS total_eventos,
    COUNT(DISTINCT user_id)                     AS usuarios_distintos,
    ROUND(100.0 * COUNT(*) FILTER (WHERE (properties->>'backfill')::boolean IS TRUE)
          / NULLIF(COUNT(*), 0), 1) || '%'      AS pct_backfill
FROM analytics.product_events
GROUP BY event_name
ORDER BY total_eventos DESC;

SELECT 'analytics_powerbi_main rows:' AS check_name, COUNT(*) AS valor
FROM public.analytics_powerbi_main;
