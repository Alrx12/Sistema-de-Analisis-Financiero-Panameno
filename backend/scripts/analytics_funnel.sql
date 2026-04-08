-- =============================================================================
-- SAFPRO · Funnel de Conversión
-- Sesión 46 — 2026-04-07
--
-- Nuevos eventos trackeados desde esta sesión:
--   user_registered   → auth.py register + oauth_google + oauth_github
--   email_verified    → auth.py verify-email
--   onboarding_completed → profile.py update_profile (primera vez)
--   plan_upgraded     → billing_service.py _on_checkout_completed
--
-- EJECUTAR (en el servidor):
--   PGPASSWORD=InsightLex psql -h localhost -U apineda -d safpro \
--     -f ~/safpro/backend/scripts/analytics_funnel.sql
--
-- NOTA SOBRE DATOS HISTÓRICOS:
--   Los eventos user_registered, email_verified, onboarding_completed y plan_upgraded
--   no existen para usuarios registrados antes del deploy de esta sesión.
--   mv_user_funnel usa fallbacks a columnas de la tabla users para reconstruir el
--   estado histórico (created_at, is_verified, plan='pro') en esos casos.
--   La columna *_at para pasos históricos quedará NULL — solo habrá timestamps
--   confiables para eventos disparados a partir de este deploy.
-- =============================================================================


-- =============================================================================
-- 1. VISTA MATERIALIZADA: mv_user_funnel
--    Una fila por usuario. Cada columna s{N}_* indica si completó ese paso
--    y cuándo (NULL = sin timestamp confiable / paso no completado).
-- =============================================================================

DROP MATERIALIZED VIEW IF EXISTS analytics.mv_user_funnel CASCADE;

CREATE MATERIALIZED VIEW analytics.mv_user_funnel AS
WITH

-- Eventos indexados por usuario (un MIN por tipo para obtener first occurrence)
ev AS (
    SELECT
        user_id,
        event_name,
        MIN(event_at) AS first_at
    FROM analytics.product_events
    GROUP BY user_id, event_name
),

-- Pivotear eventos a columnas
ev_pivot AS (
    SELECT
        user_id,
        MAX(first_at) FILTER (WHERE event_name = 'user_registered')     AS registered_event_at,
        MAX(first_at) FILTER (WHERE event_name = 'email_verified')      AS verified_event_at,
        MAX(first_at) FILTER (WHERE event_name = 'login')               AS first_login_at,
        MAX(first_at) FILTER (WHERE event_name = 'upload_queued')       AS first_upload_at,
        MAX(first_at) FILTER (WHERE event_name = 'job_success')         AS first_analysis_at,
        MAX(first_at) FILTER (WHERE event_name = 'learn_transaction')   AS first_learn_at,
        MAX(first_at) FILTER (WHERE event_name = 'onboarding_completed') AS onboarded_at,
        MAX(first_at) FILTER (WHERE event_name = 'plan_upgraded')       AS upgraded_at
    FROM ev
    GROUP BY user_id
)

SELECT
    u.user_id,
    u.email,
    u.plan,
    TO_CHAR(DATE_TRUNC('month', u.created_at), 'YYYY-MM') AS cohort_month,

    -- ── Paso 1: Registro ─────────────────────────────────────────────────────
    TRUE                                                AS s1_registered,
    u.created_at                                        AS s1_at,

    -- ── Paso 2: Email verificado ─────────────────────────────────────────────
    -- Fallback: si no hay evento, usar u.is_verified (dato histórico).
    -- Nota: COALESCE no sirve aquí porque IS NOT NULL devuelve FALSE (no NULL)
    -- cuando no hay evento. Usar OR directamente.
    (ep.verified_event_at IS NOT NULL OR u.is_verified)        AS s2_verified,
    ep.verified_event_at                                        AS s2_at,  -- NULL para históricos

    -- ── Paso 3: Primer login ─────────────────────────────────────────────────
    (ep.first_login_at IS NOT NULL)                     AS s3_logged_in,
    ep.first_login_at                                   AS s3_at,

    -- ── Paso 4: Primer upload ────────────────────────────────────────────────
    (ep.first_upload_at IS NOT NULL)                    AS s4_uploaded,
    ep.first_upload_at                                  AS s4_at,

    -- ── Paso 5: Primer análisis exitoso ──────────────────────────────────────
    (ep.first_analysis_at IS NOT NULL)                  AS s5_analyzed,
    ep.first_analysis_at                                AS s5_at,

    -- ── Paso 6: Primer entrenamiento ─────────────────────────────────────────
    (ep.first_learn_at IS NOT NULL)                     AS s6_trained,
    ep.first_learn_at                                   AS s6_at,

    -- ── Paso 7: Onboarding completado ────────────────────────────────────────
    (ep.onboarded_at IS NOT NULL)                       AS s7_onboarded,
    ep.onboarded_at                                     AS s7_at,

    -- ── Paso 8: Upgrade a Pro ────────────────────────────────────────────────
    -- Fallback: si no hay evento, usar plan='pro' (dato histórico).
    (ep.upgraded_at IS NOT NULL OR u.plan = 'pro')       AS s8_upgraded,
    ep.upgraded_at                                        AS s8_at,  -- NULL para históricos

    -- ── Tiempos entre pasos (en horas) ───────────────────────────────────────
    ROUND(
        EXTRACT(EPOCH FROM (ep.first_upload_at - u.created_at)) / 3600.0
    ::numeric, 1)                                       AS h_reg_to_upload,

    ROUND(
        EXTRACT(EPOCH FROM (ep.first_analysis_at - ep.first_upload_at)) / 3600.0
    ::numeric, 1)                                       AS h_upload_to_analysis,

    ROUND(
        EXTRACT(EPOCH FROM (ep.first_learn_at - ep.first_analysis_at)) / 3600.0
    ::numeric, 1)                                       AS h_analysis_to_learn,

    ROUND(
        EXTRACT(EPOCH FROM (ep.upgraded_at - u.created_at)) / 3600.0
    ::numeric, 1)                                       AS h_reg_to_upgrade

FROM users u
LEFT JOIN ev_pivot ep ON ep.user_id = u.user_id
WHERE u.is_suspended = FALSE;

-- Índice para lookups rápidos por usuario
CREATE UNIQUE INDEX ON analytics.mv_user_funnel(user_id);
-- Índice para filtros por cohorte en Power BI
CREATE INDEX ON analytics.mv_user_funnel(cohort_month);

COMMENT ON MATERIALIZED VIEW analytics.mv_user_funnel IS
    'Estado del funnel de conversión por usuario. Refrescar con analytics.refresh_all_materialized_views()';


-- =============================================================================
-- 2. VISTA: analytics.funnel_summary
--    Conteos y tasas de conversión agregadas — fuente para el gráfico de funnel
--    en Power BI (barra decreciente paso a paso).
-- =============================================================================

DROP VIEW IF EXISTS analytics.funnel_summary CASCADE;

CREATE VIEW analytics.funnel_summary AS
SELECT
    -- Conteo absoluto en cada paso
    COUNT(*)                                                   AS total_users,
    COUNT(*) FILTER (WHERE s1_registered)                      AS s1_registered,
    COUNT(*) FILTER (WHERE s2_verified)                        AS s2_verified,
    COUNT(*) FILTER (WHERE s3_logged_in)                       AS s3_logged_in,
    COUNT(*) FILTER (WHERE s4_uploaded)                        AS s4_uploaded,
    COUNT(*) FILTER (WHERE s5_analyzed)                        AS s5_analyzed,
    COUNT(*) FILTER (WHERE s6_trained)                         AS s6_trained,
    COUNT(*) FILTER (WHERE s7_onboarded)                       AS s7_onboarded,
    COUNT(*) FILTER (WHERE s8_upgraded)                        AS s8_upgraded,

    -- Conversión desde registro (tasa acumulada)
    ROUND(COUNT(*) FILTER (WHERE s2_verified)::numeric
          / NULLIF(COUNT(*), 0) * 100, 1)                     AS cr_to_verified,
    ROUND(COUNT(*) FILTER (WHERE s3_logged_in)::numeric
          / NULLIF(COUNT(*), 0) * 100, 1)                     AS cr_to_login,
    ROUND(COUNT(*) FILTER (WHERE s4_uploaded)::numeric
          / NULLIF(COUNT(*), 0) * 100, 1)                     AS cr_to_upload,
    ROUND(COUNT(*) FILTER (WHERE s5_analyzed)::numeric
          / NULLIF(COUNT(*), 0) * 100, 1)                     AS cr_to_analysis,
    ROUND(COUNT(*) FILTER (WHERE s6_trained)::numeric
          / NULLIF(COUNT(*), 0) * 100, 1)                     AS cr_to_train,
    ROUND(COUNT(*) FILTER (WHERE s8_upgraded)::numeric
          / NULLIF(COUNT(*), 0) * 100, 1)                     AS cr_to_pro,

    -- Conversión entre pasos consecutivos (tasa marginal — dónde se pierde)
    ROUND(COUNT(*) FILTER (WHERE s3_logged_in)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE s2_verified), 0) * 100, 1) AS cr_verified_to_login,
    ROUND(COUNT(*) FILTER (WHERE s4_uploaded)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE s3_logged_in), 0) * 100, 1) AS cr_login_to_upload,
    ROUND(COUNT(*) FILTER (WHERE s5_analyzed)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE s4_uploaded), 0) * 100, 1) AS cr_upload_to_analysis,
    ROUND(COUNT(*) FILTER (WHERE s6_trained)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE s5_analyzed), 0) * 100, 1) AS cr_analysis_to_train,
    ROUND(COUNT(*) FILTER (WHERE s8_upgraded)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE s5_analyzed), 0) * 100, 1) AS cr_analyzed_to_pro

FROM analytics.mv_user_funnel;

COMMENT ON VIEW analytics.funnel_summary IS
    'Tasas de conversión agregadas del funnel completo. Una sola fila.';


-- =============================================================================
-- 3. VISTA: analytics.funnel_dropoff
--    Usuarios atascados en cada transición — identifica dónde romper el funnel.
--    "Llegaron al paso N pero no avanzaron al paso N+1"
-- =============================================================================

DROP VIEW IF EXISTS analytics.funnel_dropoff CASCADE;

CREATE VIEW analytics.funnel_dropoff AS
SELECT 1 AS step_order, 'Registrado → Email verificado'    AS transition,
       COUNT(*) AS stuck_users,
       ROUND(COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM analytics.mv_user_funnel), 0) * 100, 1) AS pct_of_total
FROM analytics.mv_user_funnel WHERE s1_registered AND NOT s2_verified

UNION ALL
SELECT 2, 'Email verificado → Primer login',
       COUNT(*),
       ROUND(COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM analytics.mv_user_funnel), 0) * 100, 1)
FROM analytics.mv_user_funnel WHERE s2_verified AND NOT s3_logged_in

UNION ALL
SELECT 3, 'Primer login → Primer upload',
       COUNT(*),
       ROUND(COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM analytics.mv_user_funnel), 0) * 100, 1)
FROM analytics.mv_user_funnel WHERE s3_logged_in AND NOT s4_uploaded

UNION ALL
SELECT 4, 'Upload → Análisis exitoso',
       COUNT(*),
       ROUND(COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM analytics.mv_user_funnel), 0) * 100, 1)
FROM analytics.mv_user_funnel WHERE s4_uploaded AND NOT s5_analyzed

UNION ALL
SELECT 5, 'Análisis exitoso → Entrenamiento',
       COUNT(*),
       ROUND(COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM analytics.mv_user_funnel), 0) * 100, 1)
FROM analytics.mv_user_funnel WHERE s5_analyzed AND NOT s6_trained

UNION ALL
SELECT 6, 'Cualquier paso → Upgrade Pro',
       COUNT(*),
       ROUND(COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM analytics.mv_user_funnel), 0) * 100, 1)
FROM analytics.mv_user_funnel WHERE s1_registered AND NOT s8_upgraded

ORDER BY step_order;

COMMENT ON VIEW analytics.funnel_dropoff IS
    'Usuarios atascados en cada transición del funnel. Úsalo para priorizar mejoras de producto.';


-- =============================================================================
-- 4. VISTA: analytics.funnel_time
--    Tiempo mediano y promedio entre pasos. Identifica fricción temporal.
-- =============================================================================

DROP VIEW IF EXISTS analytics.funnel_time CASCADE;

CREATE VIEW analytics.funnel_time AS
SELECT
    -- Registro → Primer upload
    ROUND(AVG(h_reg_to_upload)::numeric, 1)                                 AS avg_h_to_upload,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP
          (ORDER BY h_reg_to_upload)::numeric, 1)                           AS median_h_to_upload,

    -- Primer upload → Análisis exitoso
    ROUND(AVG(h_upload_to_analysis)::numeric, 1)                            AS avg_h_upload_to_analysis,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP
          (ORDER BY h_upload_to_analysis)::numeric, 1)                      AS median_h_upload_to_analysis,

    -- Análisis → Primer entrenamiento
    ROUND(AVG(h_analysis_to_learn)::numeric, 1)                             AS avg_h_analysis_to_learn,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP
          (ORDER BY h_analysis_to_learn)::numeric, 1)                       AS median_h_analysis_to_learn,

    -- Registro → Upgrade Pro
    ROUND(AVG(h_reg_to_upgrade) FILTER (WHERE s8_upgraded)::numeric, 1)    AS avg_h_to_upgrade,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP
          (ORDER BY h_reg_to_upgrade) FILTER (WHERE s8_upgraded)::numeric, 1) AS median_h_to_upgrade

FROM analytics.mv_user_funnel
WHERE s1_registered;

COMMENT ON VIEW analytics.funnel_time IS
    'Tiempo mediano y promedio entre cada paso del funnel. Una sola fila.';


-- =============================================================================
-- 5. ACTUALIZAR refresh_all_materialized_views() para incluir mv_user_funnel
-- =============================================================================

CREATE OR REPLACE FUNCTION analytics.refresh_all_materialized_views()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    -- Vistas de la sesión 28
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_user_lifecycle;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quality_user_month;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quality_snapshot;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_activation_funnel_daily;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_plan_metrics;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_merchants_to_review;

    -- mv_user_funnel requiere REFRESH sin CONCURRENTLY la primera vez
    -- (la vista se acaba de crear sin datos previos)
    REFRESH MATERIALIZED VIEW analytics.mv_user_funnel;
END;
$$;

COMMENT ON FUNCTION analytics.refresh_all_materialized_views() IS
    'Refresca todas las vistas materializadas de analytics. Cron cada 4h.';


-- =============================================================================
-- 6. PRIMER REFRESH + VERIFICACIÓN
-- =============================================================================

REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_user_funnel;

-- Resumen del funnel con los datos actuales
SELECT
    s1_registered,
    s2_verified,
    s3_logged_in,
    s4_uploaded,
    s5_analyzed,
    s6_trained,
    s7_onboarded,
    s8_upgraded,
    cr_to_upload     AS "% reg→upload",
    cr_to_analysis   AS "% reg→análisis",
    cr_to_pro        AS "% reg→pro",
    cr_login_to_upload  AS "% login→upload (marginal)",
    cr_upload_to_analysis AS "% upload→análisis (marginal)"
FROM analytics.funnel_summary;

-- Dónde se pierde la gente
SELECT step_order, transition, stuck_users, pct_of_total || '%' AS pct
FROM analytics.funnel_dropoff
ORDER BY step_order;
