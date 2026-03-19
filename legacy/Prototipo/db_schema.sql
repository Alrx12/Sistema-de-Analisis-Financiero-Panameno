-- Database schema for the financial analysis app
--
-- This script defines a set of PostgreSQL tables that support
-- multi‑user financial data processing.  It assumes the
-- availability of the `pgcrypto` extension for UUID generation via
-- `gen_random_uuid()` (PostgreSQL 13+).  If your database
-- installation does not include `pgcrypto`, you should enable it
-- with `CREATE EXTENSION IF NOT EXISTS pgcrypto;` or adapt the
-- UUID generation strategy accordingly.

-- Enable the pgcrypto extension to use gen_random_uuid() for
-- primary key defaults.  Comment this out if your database
-- already has pgcrypto enabled or you prefer to manage UUIDs
-- elsewhere.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

--
-- 1) User accounts
--
-- Core table storing application users.  `user_id` is a UUID
-- surrogate key to avoid leaking sequential information.  In a
-- production deployment you should store password hashes using
-- a robust algorithm such as Argon2 or bcrypt; the length here
-- is intentionally generous to accommodate long hashes.  You
-- could also include fields like ``is_active`` or ``last_login``.

CREATE TABLE IF NOT EXISTS users (
    user_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username       TEXT        NOT NULL UNIQUE,
    email          TEXT        NOT NULL UNIQUE,
    password_hash  TEXT        NOT NULL,
    full_name      TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

--
-- 2) Bank accounts
--
-- Each user may configure multiple bank accounts.  Accounts are
-- linked to users via ``user_id``.  ``account_number_last4`` stores
-- only the last four digits of the account number to minimise
-- exposure of sensitive data; avoid storing full account numbers.

CREATE TABLE IF NOT EXISTS bank_accounts (
    account_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    bank_name             TEXT NOT NULL,
    account_type          TEXT NOT NULL,
    account_number_last4  TEXT,
    nickname              TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, bank_name, account_type, account_number_last4)
);

--
-- 3) Uploaded files
--
-- Records for each file uploaded by a user.  Files are stored
-- externally (e.g. in object storage), and the `storage_path`
-- column stores a pointer or URL to the file.  ``status`` tracks
-- the processing lifecycle: values could be ``pending``,
-- ``processing``, ``completed`` or ``failed``.  A ``checksum`` may
-- be computed client‑side to detect duplicate uploads.

CREATE TABLE IF NOT EXISTS uploaded_files (
    file_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    account_id   UUID REFERENCES bank_accounts(account_id) ON DELETE SET NULL,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    checksum     TEXT,
    status       TEXT NOT NULL CHECK (status IN ('pending','processing','completed','failed')),
    uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    UNIQUE (user_id, original_filename, checksum)
);

--
-- 4) Processing jobs
--
-- Jobs represent asynchronous tasks that convert uploaded files into
-- transactions.  They are decoupled from the file record so you
-- can reprocess a given file multiple times if new parsing logic
-- becomes available.  When a job completes successfully, the
-- resulting transactions should reference the file via
-- ``file_id``.

CREATE TABLE IF NOT EXISTS processing_jobs (
    job_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id       UUID NOT NULL REFERENCES uploaded_files(file_id) ON DELETE CASCADE,
    status        TEXT NOT NULL CHECK (status IN ('queued','running','success','error')),
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    error_message TEXT
);

--
-- 5) Transactions
--
-- Normalised representation of each bank transaction.  Each record
-- belongs to a user and is associated with the bank account from
-- which it originated.  ``raw_data`` stores a JSON document with
-- the original row for audit and traceability.  ``transaction_type``
-- and ``category`` are stored as plain text rather than enums
-- because business logic may evolve.  Add indexes on ``user_id``
-- and ``date`` to facilitate queries.

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    account_id      UUID NOT NULL REFERENCES bank_accounts(account_id) ON DELETE CASCADE,
    file_id         UUID REFERENCES uploaded_files(file_id) ON DELETE SET NULL,
    date            DATE NOT NULL,
    description     TEXT NOT NULL,
    amount          NUMERIC(14,2) NOT NULL,
    transaction_type TEXT NOT NULL,
    category        TEXT,
    method          TEXT,
    raw_data        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions (user_id, date);

--
-- 6) Category overrides
--
-- Users may override the automatic category assigned to a transaction
-- based on matching text (e.g. merchant name).  This table
-- stores per‑user rules that your application can apply during
-- parsing.  ``match_text`` should be stored in a consistent case
-- (e.g. lower case) to ease lookups.

CREATE TABLE IF NOT EXISTS category_overrides (
    override_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    match_text   TEXT NOT NULL,
    category     TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, match_text)
);

--
-- 7) Analysis snapshots
--
-- When a user requests an analysis, you can persist the summary and
-- breakdowns in this table.  Downstream dashboards or mobile
-- clients can fetch the most recent snapshot instead of
-- recalculating the entire dataset on each request.  The structure
-- of ``summary``, ``category_analysis`` and ``recommendations``
-- matches the JSON schema described in your README.

CREATE TABLE IF NOT EXISTS analysis_snapshots (
    snapshot_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    summary          JSONB,
    category_analysis JSONB,
    recommendations  JSONB
);

--
-- 8) Recommendations (optional)
--
-- If you prefer to normalise recommendations instead of storing
-- them inline in ``analysis_snapshots``, use this table.  The
-- ``ON DELETE CASCADE`` ensures recommendations are removed when
-- their parent snapshot is deleted.

CREATE TABLE IF NOT EXISTS recommendations (
    recommendation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id       UUID NOT NULL REFERENCES analysis_snapshots(snapshot_id) ON DELETE CASCADE,
    category          TEXT,
    level             TEXT,
    message           TEXT,
    action            TEXT
);