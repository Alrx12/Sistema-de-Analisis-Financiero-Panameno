
CREATE EXTENSION IF NOT EXISTS pgcrypto;


CREATE TABLE IF NOT EXISTS users (
    user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        TEXT NOT NULL UNIQUE,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    full_name       TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS bank_accounts (
    account_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    bank_name                TEXT NOT NULL,
    account_type             TEXT NOT NULL,
    nickname                 TEXT NOT NULL,
    account_number_last4     TEXT,
    detected_account_number  TEXT,
    account_fingerprint      TEXT NOT NULL,
    detection_source         TEXT NOT NULL CHECK (detection_source IN ('file','manual','inferred')),
    confidence_score         NUMERIC(5,2),
    is_active                BOOLEAN NOT NULL DEFAULT TRUE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, account_fingerprint)
);

CREATE TABLE IF NOT EXISTS uploaded_files (
    file_id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                   UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    account_id                UUID REFERENCES bank_accounts(account_id) ON DELETE SET NULL,
    original_filename         TEXT NOT NULL,
    storage_path              TEXT NOT NULL,
    mime_type                 TEXT,
    file_size_bytes           BIGINT,
    checksum                  TEXT NOT NULL,
    detected_bank_name        TEXT,
    detected_account_type     TEXT,
    detected_account_last4    TEXT,
    detected_fingerprint      TEXT,
    detection_confidence      NUMERIC(5,2),
    status                    TEXT NOT NULL CHECK (status IN (
                                'uploaded',
                                'pending_review',
                                'queued',
                                'processing',
                                'processed',
                                'failed'
                              )),
    uploaded_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at              TIMESTAMPTZ,
    UNIQUE (user_id, checksum)
);

CREATE TABLE IF NOT EXISTS processing_jobs (
    job_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id         UUID NOT NULL REFERENCES uploaded_files(file_id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    status          TEXT NOT NULL CHECK (status IN ('queued','running','success','error')),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    account_id          UUID NOT NULL REFERENCES bank_accounts(account_id) ON DELETE CASCADE,
    file_id             UUID REFERENCES uploaded_files(file_id) ON DELETE SET NULL,
    transaction_date    TIMESTAMPTZ NOT NULL,
    description         TEXT NOT NULL,
    normalized_description TEXT,
    amount              NUMERIC(14,2) NOT NULL,
    currency_code       TEXT NOT NULL DEFAULT 'USD',
    transaction_type    TEXT NOT NULL,
    category            TEXT,
    payment_method      TEXT,
    bank_reference      TEXT,
    raw_data            JSONB,
    hash_signature      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date
    ON transactions (user_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_account_date
    ON transactions (account_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_category
    ON transactions (user_id, category);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_file_signature
    ON transactions (file_id, hash_signature)
    WHERE hash_signature IS NOT NULL;

CREATE TABLE IF NOT EXISTS category_overrides (
    override_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    match_text       TEXT NOT NULL,
    category         TEXT NOT NULL,
    priority         INT NOT NULL DEFAULT 100,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, match_text)
);

CREATE TABLE IF NOT EXISTS analysis_snapshots (
    snapshot_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    summary              JSONB NOT NULL,
    category_analysis    JSONB,
    recommendations      JSONB,
    period_start         DATE,
    period_end           DATE
);

CREATE TABLE IF NOT EXISTS account_detection_reviews (
    review_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id                UUID NOT NULL REFERENCES uploaded_files(file_id) ON DELETE CASCADE,
    user_id                UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    proposed_bank_name     TEXT,
    proposed_account_type  TEXT,
    proposed_last4         TEXT,
    proposed_fingerprint   TEXT,
    confidence_score       NUMERIC(5,2),
    resolution_status      TEXT NOT NULL CHECK (resolution_status IN ('pending','accepted','rejected')),
    resolved_account_id    UUID REFERENCES bank_accounts(account_id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at            TIMESTAMPTZ
);

