// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  user_id: string
  username: string
  email: string
  full_name: string | null
  is_active: boolean
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

export type JobStatus = "queued" | "processing" | "success" | "error"

export interface ProcessingJob {
  job_id: string           // backend field name
  status: JobStatus
  original_filename: string | null
  file_type: string | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  created_at: string
}

export interface UploadResponse {
  status: "queued"
  job_id: string
  message: string
}

// ─── Analysis ────────────────────────────────────────────────────────────────

export interface MerchantStat {
  name: string
  amount: number
  count: number
  category: string | null
}

export interface TypeStat {
  type: string
  amount: number
  count: number
}

export interface MonthTrendStat {
  month: string   // "2025-09"
  label: string   // "Sep 25"
  income: number
  expenses: number
  transactions: number
}

export interface AggregatedSummary {
  total_income: number
  total_expenses: number
  balance: number
  total_transactions: number
  categories: Record<string, number>
  top_merchants: MerchantStat[]
  by_economic_type: TypeStat[]
  monthly_trend: MonthTrendStat[]
}

export interface BankAccountSummary {
  account_id: string
  bank_name: string
  account_last4: string | null
  nickname: string
}

export interface AnalysisSnapshot {
  snapshot_id: string
  created_at: string
  period_start: string | null
  period_end: string | null
  total_income: number
  total_expenses: number
  balance: number
  categories: Record<string, number>
  recommendations: Recommendation[]
  total_transactions: number
  bank_account: BankAccountSummary | null
}

export interface Recommendation {
  type: "critical" | "warning" | "info" | "success"
  code: string
  message: string
  data?: Record<string, unknown>
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface Transaction {
  transaction_id: string
  snapshot_id: string
  date: string
  detail: string
  amount: number
  movement_type: string
  economic_type: string | null
  economic_type_detail: string | null
  subtype_economic: string | null
  budget_category: string | null
  budget_role: string | null
  confidence: number
  method: string
  requires_review: boolean
}

export interface ReclassifyRequest {
  economic_type: string
  economic_type_detail: string
  subtype_economic: string
  budget_category: string
  budget_role: string
  also_learn?: boolean
}

export interface LearnRequest {
  detail: string
  economic_type: string
  subtype_economic: string
  transaction_type: string
  budget_category: string
  budget_role: string
  weight?: number
  force_personal?: boolean
}

// ─── Confidence Stats ─────────────────────────────────────────────────────────

export interface ConfidenceStats {
  total: number
  high_confidence: number   // >= 0.8
  medium_confidence: number // 0.5 – 0.8
  low_confidence: number    // < 0.5
  requires_review: number
  avg_confidence: number
}

// ─── Knowledge Base ───────────────────────────────────────────────────────────

export interface KBEntry {
  key: string
  economic_type: string | null
  economic_type_detail: string | null
  subtype_economic: string | null
  budget_category: string | null
  budget_role: string | null
}

export interface KBListResponse {
  entries: KBEntry[]
  patterns_count: number
  corrections_count: number
  global_exact_matches_count: number
  global_patterns_count: number
}

export interface KBGlobalListResponse {
  entries: KBEntry[]
  patterns_count: number
  corrections_count: number
}

export interface KBDeleteResponse {
  key: string
  patterns_removed: number
}

export interface KBPreviewResponse {
  original: string
  canonical_key: string
  is_ambiguous: boolean
}

// ─── Bank Accounts ────────────────────────────────────────────────────────────

export interface BankAccount {
  account_id: string
  bank_name: string
  account_type: string
  account_number_last4: string | null
  nickname: string | null
  is_active: boolean
  detection_source: string
  confidence_score: number
  created_at: string
}

// ─── API Error ────────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string | { error: string; message?: string; [key: string]: unknown }
}
