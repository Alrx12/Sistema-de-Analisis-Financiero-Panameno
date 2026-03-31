-- =============================================================================
-- SAFPRO · Analytics Layer Setup
-- Ejecutar como: psql -U apineda -d safpro -f analytics_setup.sql
-- Autor: Alexis Pineda (admin@safpro.us)
-- Creado: 2026-03-30
-- =============================================================================

-- =============================================================================
-- 0) COLUMNA PLAN EN USERS (necesaria para monetización — v2 pre-setup)
-- =============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'friends_and_family'
    CHECK (plan IN ('friends_and_family', 'free', 'pro'));

-- Asegurar que el admin esté marcado como friends_and_family
UPDATE users SET plan = 'friends_and_family' WHERE email = 'alexis12pineda@gmail.com';

COMMENT ON COLUMN users.plan IS 'Plan del usuario: friends_and_family | free | pro';

-- =============================================================================
-- 1) ESQUEMA ANALÍTICO
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS analytics;
COMMENT ON SCHEMA analytics IS 'Capa analítica para Power BI y reporting de producto de SAFPRO';

-- =============================================================================
-- 2) TABLA DE EVENTOS DE PRODUCTO
-- Fuente para adopción, funnel, entrenamiento y auditoría
-- =============================================================================
CREATE TABLE IF NOT EXISTS analytics.product_events (
    event_id        BIGSERIAL PRIMARY KEY,
    event_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_name      TEXT        NOT NULL,
    user_id         UUID        NULL,
    session_id      UUID        NULL,
    request_id      UUID        NULL,
    source          TEXT        NOT NULL DEFAULT 'backend',
    event_version   SMALLINT    NOT NULL DEFAULT 1,

    -- contexto de negocio
    plan            TEXT        NULL,
    bank_account_id UUID        NULL,
    snapshot_id     UUID        NULL,
    transaction_id  UUID        NULL,
    job_id          UUID        NULL,

    -- clasificación
    event_category  TEXT        NOT NULL DEFAULT 'product',
    success         BOOLEAN     NOT NULL DEFAULT TRUE,

    -- trazabilidad
    ip_address      INET        NULL,
    user_agent      TEXT        NULL,

    -- payload extensible
    properties      JSONB       NOT NULL DEFAULT '{}'::jsonb,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_product_events_event_name
        CHECK (length(trim(event_name)) > 0),
    CONSTRAINT ck_product_events_event_category
        CHECK (length(trim(event_category)) > 0),
    CONSTRAINT ck_product_events_plan
        CHECK (plan IS NULL OR plan IN ('friends_and_family', 'free', 'pro'))
);

CREATE INDEX IF NOT EXISTS ix_product_events_event_at
    ON analytics.product_events (event_at);
CREATE INDEX IF NOT EXISTS ix_product_events_event_name
    ON analytics.product_events (event_name);
CREATE INDEX IF NOT EXISTS ix_product_events_user_id_event_at
    ON analytics.product_events (user_id, event_at);
CREATE INDEX IF NOT EXISTS ix_product_events_plan_event_at
    ON analytics.product_events (plan, event_at);
CREATE INDEX IF NOT EXISTS ix_product_events_job_id
    ON analytics.product_events (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_product_events_snapshot_id
    ON analytics.product_events (snapshot_id) WHERE snapshot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_product_events_properties_gin
    ON analytics.product_events USING GIN (properties);

COMMENT ON TABLE analytics.product_events IS
    'Eventos de producto y auditoría para funnel, adopción, errores y entrenamiento';

-- =============================================================================
-- 3) TABLA DE ESTADÍSTICAS DE KB POR USUARIO
-- Resuelve que el KB personal vive en JSON — no consultable desde Power BI
-- =============================================================================
CREATE TABLE IF NOT EXISTS analytics.kb_user_stats (
    user_id                    UUID        PRIMARY KEY,
    measured_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    personal_exact_matches     INTEGER     NOT NULL DEFAULT 0,
    personal_patterns          INTEGER     NOT NULL DEFAULT 0,
    personal_total_entries     INTEGER     NOT NULL DEFAULT 0,
    global_contributions_count INTEGER     NOT NULL DEFAULT 0,
    learn_events_count         INTEGER     NOT NULL DEFAULT 0,
    first_learn_at             TIMESTAMPTZ NULL,
    last_learn_at              TIMESTAMPTZ NULL,
    source                     TEXT        NOT NULL DEFAULT 'job',
    notes                      TEXT        NULL,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_kb_user_stats_nonnegative CHECK (
        personal_exact_matches >= 0 AND
        personal_patterns >= 0 AND
        personal_total_entries >= 0 AND
        global_contributions_count >= 0 AND
        learn_events_count >= 0
    )
);

CREATE INDEX IF NOT EXISTS ix_kb_user_stats_measured_at
    ON analytics.kb_user_stats (measured_at);
CREATE INDEX IF NOT EXISTS ix_kb_user_stats_last_learn_at
    ON analytics.kb_user_stats (last_learn_at);

COMMENT ON TABLE analytics.kb_user_stats IS
    'Resumen persistido del KB personal por usuario — evita leer JSON desde Power BI';

-- =============================================================================
-- 4) VISTA MATERIALIZADA: CICLO DE VIDA DEL USUARIO
-- =============================================================================
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_user_lifecycle CASCADE;
CREATE MATERIALIZED VIEW analytics.mv_user_lifecycle AS
WITH uploads AS (
    SELECT uf.user_id,
           COUNT(*)::INTEGER          AS total_uploads,
           MIN(uf.created_at)         AS first_upload_at,
           MAX(uf.created_at)         AS last_upload_at
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
           COUNT(*)::INTEGER                                          AS total_jobs,
           COUNT(*) FILTER (WHERE j.status = 'success')::INTEGER     AS jobs_success,
           COUNT(*) FILTER (WHERE j.status = 'error')::INTEGER       AS jobs_error,
           COUNT(*) FILTER (WHERE j.status IN ('queued','processing'))::INTEGER AS jobs_open,
           MIN(j.created_at)                                          AS first_job_at,
           MAX(j.created_at)                                          AS last_job_at
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
    u.created_at                                   AS registered_at,
    u.plan,
    COALESCE(p.onboarding_completed, FALSE)        AS onboarding_completed,
    p.expected_monthly_income,

    COALESCE(up.total_uploads, 0)                  AS total_uploads,
    up.first_upload_at,
    up.last_upload_at,

    COALESCE(sn.total_snapshots, 0)                AS total_snapshots,
    sn.first_snapshot_at,
    sn.last_snapshot_at,
    sn.first_period_start,
    sn.last_period_end,

    COALESCE(j.total_jobs, 0)                      AS total_jobs,
    COALESCE(j.jobs_success, 0)                    AS jobs_success,
    COALESCE(j.jobs_error, 0)                      AS jobs_error,
    COALESCE(j.jobs_open, 0)                       AS jobs_open,
    j.first_job_at,
    j.last_job_at,

    COALESCE(k.personal_exact_matches, 0)          AS personal_exact_matches,
    COALESCE(k.personal_patterns, 0)               AS personal_patterns,
    COALESCE(k.personal_total_entries, 0)          AS personal_total_entries,
    COALESCE(k.learn_events_count, 0)              AS learn_events_count,
    k.first_learn_at,
    k.last_learn_at,

    (up.first_upload_at IS NOT NULL)               AS reached_first_upload,
    (sn.first_snapshot_at IS NOT NULL)             AS reached_first_snapshot,
    (COALESCE(sn.total_snapshots, 0) >= 2)         AS reached_second_snapshot,
    (COALESCE(k.learn_events_count, 0) > 0)        AS has_trained_system

FROM users u
LEFT JOIN uploads  up ON up.user_id = u.user_id
LEFT JOIN snapshots sn ON sn.user_id = u.user_id
LEFT JOIN jobs      j  ON j.user_id  = u.user_id
LEFT JOIN profiles  p  ON p.user_id  = u.user_id
LEFT JOIN kb        k  ON k.user_id  = u.user_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_user_lifecycle_user_id
    ON analytics.mv_user_lifecycle (user_id);
CREATE INDEX IF NOT EXISTS ix_mv_user_lifecycle_plan
    ON analytics.mv_user_lifecycle (plan);
CREATE INDEX IF NOT EXISTS ix_mv_user_lifecycle_registered_at
    ON analytics.mv_user_lifecycle (registered_at);

-- =============================================================================
-- 5) VISTA MATERIALIZADA: CALIDAD POR USUARIO Y MES
-- =============================================================================
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_quality_user_month CASCADE;
CREATE MATERIALIZED VIEW analytics.mv_quality_user_month AS
SELECT
    t.user_id,
    DATE_TRUNC('month', t.transaction_date)::date      AS month_start,
    COUNT(*)::INTEGER                                   AS total_transactions,
    COUNT(*) FILTER (WHERE t.confidence < 0.8)::INTEGER AS low_confidence_transactions,
    COUNT(*) FILTER (WHERE t.confidence >= 0.8)::INTEGER AS high_confidence_transactions,
    ROUND(AVG(t.confidence)::numeric, 4)                AS avg_confidence,
    ROUND(
        (COUNT(*) FILTER (WHERE t.confidence < 0.8)::numeric
         / NULLIF(COUNT(*), 0)),
        4
    )                                                   AS low_confidence_ratio,
    COUNT(DISTINCT t.snapshot_id)::INTEGER              AS snapshots_covered
FROM analysis_transactions t
GROUP BY t.user_id, DATE_TRUNC('month', t.transaction_date)::date;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_quality_user_month
    ON analytics.mv_quality_user_month (user_id, month_start);
CREATE INDEX IF NOT EXISTS ix_mv_quality_user_month_month_start
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
    s.created_at                                       AS snapshot_created_at,
    s.period_start,
    s.period_end,
    COUNT(t.transaction_id)::INTEGER                   AS total_transactions,
    COUNT(*) FILTER (WHERE t.confidence < 0.8)::INTEGER AS low_confidence_transactions,
    ROUND(AVG(t.confidence)::numeric, 4)               AS avg_confidence,
    ROUND(
        (COUNT(*) FILTER (WHERE t.confidence < 0.8)::numeric
         / NULLIF(COUNT(t.transaction_id), 0)),
        4
    )                                                  AS low_confidence_ratio,
    COUNT(DISTINCT t.canonical_detail)::INTEGER        AS distinct_merchants
FROM analysis_snapshots s
LEFT JOIN analysis_transactions t ON t.snapshot_id = s.snapshot_id
GROUP BY s.snapshot_id, s.user_id, s.bank_account_id,
         s.created_at, s.period_start, s.period_end;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_quality_snapshot_snapshot_id
    ON analytics.mv_quality_snapshot (snapshot_id);
CREATE INDEX IF NOT EXISTS ix_mv_quality_snapshot_user_id
    ON analytics.mv_quality_snapshot (user_id);

-- =============================================================================
-- 7) VISTA MATERIALIZADA: FUNNEL DE ACTIVACIÓN DIARIO
-- =============================================================================
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_activation_funnel_daily CASCADE;
CREATE MATERIALIZED VIEW analytics.mv_activation_funnel_daily AS
SELECT
    DATE_TRUNC('day', registered_at)::date             AS day,
    plan,
    COUNT(*)::INTEGER                                  AS registered_users,
    COUNT(*) FILTER (WHERE reached_first_upload)::INTEGER  AS users_first_upload,
    COUNT(*) FILTER (WHERE reached_first_snapshot)::INTEGER AS users_first_snapshot,
    COUNT(*) FILTER (WHERE reached_second_snapshot)::INTEGER AS users_second_snapshot,
    COUNT(*) FILTER (WHERE has_trained_system)::INTEGER    AS users_trained
FROM analytics.mv_user_lifecycle
GROUP BY DATE_TRUNC('day', registered_at)::date, plan;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_activation_funnel_daily
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_plan_metrics_plan
    ON analytics.mv_plan_metrics (plan);

-- =============================================================================
-- 9) VISTA MATERIALIZADA: MERCHANTS A REVISAR
-- =============================================================================
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_merchants_to_review CASCADE;
CREATE MATERIALIZED VIEW analytics.mv_merchants_to_review AS
SELECT
    t.user_id,
    COALESCE(NULLIF(t.canonical_detail, ''), t.detail)  AS merchant_key,
    COUNT(*)::INTEGER                                    AS transactions_count,
    ROUND(AVG(t.confidence)::numeric, 4)                 AS avg_confidence,
    COUNT(*) FILTER (WHERE t.confidence < 0.8)::INTEGER  AS low_confidence_transactions,
    MIN(t.transaction_date)                              AS first_seen_at,
    MAX(t.transaction_date)                              AS last_seen_at
FROM analysis_transactions t
GROUP BY t.user_id,
         COALESCE(NULLIF(t.canonical_detail, ''), t.detail)
HAVING COUNT(*) FILTER (WHERE t.confidence < 0.8) > 0;

CREATE INDEX IF NOT EXISTS ix_mv_merchants_to_review_user_id
    ON analytics.mv_merchants_to_review (user_id);
CREATE INDEX IF NOT EXISTS ix_mv_merchants_to_review_last_seen_at
    ON analytics.mv_merchants_to_review (last_seen_at);

-- =============================================================================
-- 10) FUNCIÓN DE REFRESH (llamar desde cron o manualmente)
-- =============================================================================
CREATE OR REPLACE FUNCTION analytics.refresh_all_materialized_views()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_user_lifecycle;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quality_user_month;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quality_snapshot;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_activation_funnel_daily;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_plan_metrics;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_merchants_to_review;
END;
$$;

COMMENT ON FUNCTION analytics.refresh_all_materialized_views() IS
    'Refresca todas las materialized views analíticas de SAFPRO para Power BI';

-- =============================================================================
-- 11) VERIFICACIÓN FINAL
-- =============================================================================
SELECT
    schemaname,
    matviewname,
    ispopulated
FROM pg_matviews
WHERE schemaname = 'analytics'
ORDER BY matviewname;

SELECT tablename
FROM pg_tables
WHERE schemaname = 'analytics'
ORDER BY tablename;
