-- =============================================================================
-- SAFPRO · Analytics Views — corrección de columnas reales
-- Ejecutar: PGPASSWORD=InsightLex psql -h localhost -U apineda -d safpro -f ~/safpro/scripts/analytics_views.sql
-- Correcciones aplicadas:
--   uploaded_files.created_at  → uploaded_at
--   analysis_transactions.transaction_date → date
--   analysis_transactions.canonical_detail → detail
-- =============================================================================

-- =============================================================================
-- 4) VISTA MATERIALIZADA: CICLO DE VIDA DEL USUARIO
-- =============================================================================
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_user_lifecycle CASCADE;
CREATE MATERIALIZED VIEW analytics.mv_user_lifecycle AS
WITH uploads AS (
    SELECT uf.user_id,
           COUNT(*)::INTEGER          AS total_uploads,
           MIN(uf.uploaded_at)        AS first_upload_at,
           MAX(uf.uploaded_at)        AS last_upload_at
    FROM uploaded_files uf
    GROUP BY uf.user_id
),
snapshots AS (
    SELECT s.user_id,
           COUNT(*)::INTEGER          AS total_snapshots,
           MIN(s.created_at)          AS first_snapshot_at,
           MAX(s.created_at)          AS last_snapshot_at,
           MIN(s.period_start)        AS first_period_start,
           MAX(s.period_end)          AS last_period_end
    FROM analysis_snapshots s
    GROUP BY s.user_id
),
jobs AS (
    SELECT j.user_id,
           COUNT(*)::INTEGER                                             AS total_jobs,
           COUNT(*) FILTER (WHERE j.status = 'success')::INTEGER        AS jobs_success,
           COUNT(*) FILTER (WHERE j.status = 'error')::INTEGER          AS jobs_error,
           COUNT(*) FILTER (WHERE j.status IN ('queued','processing'))::INTEGER AS jobs_open,
           MIN(j.created_at)                                             AS first_job_at,
           MAX(j.created_at)                                             AS last_job_at
    FROM processing_jobs j
    GROUP BY j.user_id
),
profiles AS (
    SELECT p.user_id,
           p.onboarding_completed,
           p.expected_monthly_income
    FROM user_profiles p
),
kb AS (
    SELECT k.user_id,
           k.personal_exact_matches,
           k.personal_patterns,
           k.personal_total_entries,
           k.learn_events_count,
           k.first_learn_at,
           k.last_learn_at
    FROM analytics.kb_user_stats k
)
SELECT
    u.user_id,
    u.email,
    u.created_at                                    AS registered_at,
    u.plan,
    COALESCE(p.onboarding_completed, FALSE)         AS onboarding_completed,
    p.expected_monthly_income,

    COALESCE(up.total_uploads, 0)                   AS total_uploads,
    up.first_upload_at,
    up.last_upload_at,

    COALESCE(sn.total_snapshots, 0)                 AS total_snapshots,
    sn.first_snapshot_at,
    sn.last_snapshot_at,
    sn.first_period_start,
    sn.last_period_end,

    COALESCE(j.total_jobs, 0)                       AS total_jobs,
    COALESCE(j.jobs_success, 0)                     AS jobs_success,
    COALESCE(j.jobs_error, 0)                       AS jobs_error,
    COALESCE(j.jobs_open, 0)                        AS jobs_open,
    j.first_job_at,
    j.last_job_at,

    COALESCE(k.personal_exact_matches, 0)           AS personal_exact_matches,
    COALESCE(k.personal_patterns, 0)                AS personal_patterns,
    COALESCE(k.personal_total_entries, 0)           AS personal_total_entries,
    COALESCE(k.learn_events_count, 0)               AS learn_events_count,
    k.first_learn_at,
    k.last_learn_at,

    (up.first_upload_at IS NOT NULL)                AS reached_first_upload,
    (sn.first_snapshot_at IS NOT NULL)              AS reached_first_snapshot,
    (COALESCE(sn.total_snapshots, 0) >= 2)          AS reached_second_snapshot,
    (COALESCE(k.learn_events_count, 0) > 0)         AS has_trained_system

FROM users u
LEFT JOIN uploads   up ON up.user_id = u.user_id
LEFT JOIN snapshots sn ON sn.user_id = u.user_id
LEFT JOIN jobs       j ON j.user_id  = u.user_id
LEFT JOIN profiles   p ON p.user_id  = u.user_id
LEFT JOIN kb         k ON k.user_id  = u.user_id;

CREATE UNIQUE INDEX ux_mv_user_lifecycle_user_id
    ON analytics.mv_user_lifecycle (user_id);
CREATE INDEX ix_mv_user_lifecycle_plan
    ON analytics.mv_user_lifecycle (plan);
CREATE INDEX ix_mv_user_lifecycle_registered_at
    ON analytics.mv_user_lifecycle (registered_at);

-- =============================================================================
-- 5) VISTA MATERIALIZADA: CALIDAD POR USUARIO Y MES
-- =============================================================================
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_quality_user_month CASCADE;
CREATE MATERIALIZED VIEW analytics.mv_quality_user_month AS
SELECT
    t.user_id,
    DATE_TRUNC('month', t.date)::date               AS month_start,
    COUNT(*)::INTEGER                               AS total_transactions,
    COUNT(*) FILTER (WHERE t.confidence < 0.8)::INTEGER AS low_confidence_transactions,
    COUNT(*) FILTER (WHERE t.confidence >= 0.8)::INTEGER AS high_confidence_transactions,
    ROUND(AVG(t.confidence)::numeric, 4)            AS avg_confidence,
    ROUND(
        (COUNT(*) FILTER (WHERE t.confidence < 0.8)::numeric
         / NULLIF(COUNT(*), 0)),
        4
    )                                               AS low_confidence_ratio,
    COUNT(DISTINCT t.snapshot_id)::INTEGER          AS snapshots_covered
FROM analysis_transactions t
GROUP BY t.user_id, DATE_TRUNC('month', t.date)::date;

CREATE UNIQUE INDEX ux_mv_quality_user_month
    ON analytics.mv_quality_user_month (user_id, month_start);
CREATE INDEX ix_mv_quality_user_month_month_start
    ON analytics.mv_quality_user_month (month_start);

-- =============================================================================
-- 6) VISTA MATERIALIZADA: CALIDAD POR SNAPSHOT
-- =============================================================================
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_quality_snapshot CASCADE;
CREATE MATERIALIZED VIEW analytics.mv_quality_snapshot AS
SELECT
    s.snapshot_id,
    s.user_id,
    s.bank_account_id,
    s.created_at                                    AS snapshot_created_at,
    s.period_start,
    s.period_end,
    COUNT(t.transaction_id)::INTEGER                AS total_transactions,
    COUNT(*) FILTER (WHERE t.confidence < 0.8)::INTEGER AS low_confidence_transactions,
    ROUND(AVG(t.confidence)::numeric, 4)            AS avg_confidence,
    ROUND(
        (COUNT(*) FILTER (WHERE t.confidence < 0.8)::numeric
         / NULLIF(COUNT(t.transaction_id), 0)),
        4
    )                                               AS low_confidence_ratio,
    COUNT(DISTINCT t.detail)::INTEGER               AS distinct_merchants
FROM analysis_snapshots s
LEFT JOIN analysis_transactions t ON t.snapshot_id = s.snapshot_id
GROUP BY s.snapshot_id, s.user_id, s.bank_account_id,
         s.created_at, s.period_start, s.period_end;

CREATE UNIQUE INDEX ux_mv_quality_snapshot_snapshot_id
    ON analytics.mv_quality_snapshot (snapshot_id);
CREATE INDEX ix_mv_quality_snapshot_user_id
    ON analytics.mv_quality_snapshot (user_id);

-- =============================================================================
-- 7) VISTA MATERIALIZADA: FUNNEL DE ACTIVACIÓN DIARIO
-- =============================================================================
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_activation_funnel_daily CASCADE;
CREATE MATERIALIZED VIEW analytics.mv_activation_funnel_daily AS
SELECT
    DATE_TRUNC('day', registered_at)::date          AS day,
    plan,
    COUNT(*)::INTEGER                               AS registered_users,
    COUNT(*) FILTER (WHERE reached_first_upload)::INTEGER   AS users_first_upload,
    COUNT(*) FILTER (WHERE reached_first_snapshot)::INTEGER AS users_first_snapshot,
    COUNT(*) FILTER (WHERE reached_second_snapshot)::INTEGER AS users_second_snapshot,
    COUNT(*) FILTER (WHERE has_trained_system)::INTEGER     AS users_trained
FROM analytics.mv_user_lifecycle
GROUP BY DATE_TRUNC('day', registered_at)::date, plan;

CREATE UNIQUE INDEX ux_mv_activation_funnel_daily
    ON analytics.mv_activation_funnel_daily (day, plan);

-- =============================================================================
-- 8) VISTA MATERIALIZADA: MÉTRICAS POR PLAN
-- =============================================================================
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_plan_metrics CASCADE;
CREATE MATERIALIZED VIEW analytics.mv_plan_metrics AS
SELECT
    u.plan,
    COUNT(*)::INTEGER                                          AS users_total,
    COUNT(*) FILTER (WHERE l.reached_first_upload)::INTEGER   AS users_with_upload,
    COUNT(*) FILTER (WHERE l.reached_first_snapshot)::INTEGER AS users_with_snapshot,
    COUNT(*) FILTER (WHERE l.reached_second_snapshot)::INTEGER AS users_retained,
    ROUND(AVG(COALESCE(l.total_uploads, 0))::numeric, 2)      AS avg_uploads_per_user,
    ROUND(AVG(COALESCE(l.total_snapshots, 0))::numeric, 2)    AS avg_snapshots_per_user,
    ROUND(AVG(COALESCE(q.avg_confidence, 0))::numeric, 4)     AS avg_confidence
FROM users u
LEFT JOIN analytics.mv_user_lifecycle l ON l.user_id = u.user_id
LEFT JOIN (
    SELECT user_id, AVG(avg_confidence)::numeric AS avg_confidence
    FROM analytics.mv_quality_user_month
    GROUP BY user_id
) q ON q.user_id = u.user_id
GROUP BY u.plan;

CREATE UNIQUE INDEX ux_mv_plan_metrics_plan
    ON analytics.mv_plan_metrics (plan);

-- =============================================================================
-- 9) VISTA MATERIALIZADA: MERCHANTS A REVISAR
-- =============================================================================
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_merchants_to_review CASCADE;
CREATE MATERIALIZED VIEW analytics.mv_merchants_to_review AS
SELECT
    t.user_id,
    t.detail                                        AS merchant_key,
    COUNT(*)::INTEGER                               AS transactions_count,
    ROUND(AVG(t.confidence)::numeric, 4)            AS avg_confidence,
    COUNT(*) FILTER (WHERE t.confidence < 0.8)::INTEGER AS low_confidence_transactions,
    MIN(t.date)                                     AS first_seen_at,
    MAX(t.date)                                     AS last_seen_at
FROM analysis_transactions t
GROUP BY t.user_id, t.detail
HAVING COUNT(*) FILTER (WHERE t.confidence < 0.8) > 0;

CREATE INDEX ix_mv_merchants_to_review_user_id
    ON analytics.mv_merchants_to_review (user_id);
CREATE INDEX ix_mv_merchants_to_review_last_seen_at
    ON analytics.mv_merchants_to_review (last_seen_at);

-- =============================================================================
-- 10) RECREAR FUNCIÓN DE REFRESH
-- =============================================================================
CREATE OR REPLACE FUNCTION analytics.refresh_all_materialized_views()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_user_lifecycle;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quality_user_month;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quality_snapshot;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_activation_funnel_daily;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_plan_metrics;
    REFRESH MATERIALIZED VIEW analytics.mv_merchants_to_review;  -- sin CONCURRENTLY: no tiene índice único
END;
$$;

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
SELECT matviewname, ispopulated
FROM pg_matviews
WHERE schemaname = 'analytics'
ORDER BY matviewname;

-- Vista rápida de datos actuales
SELECT
    email, plan, total_uploads, total_snapshots,
    jobs_success, jobs_error, reached_first_snapshot, has_trained_system
FROM analytics.mv_user_lifecycle
ORDER BY registered_at;
