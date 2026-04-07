// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  user_id: string
  username: string
  email: string
  full_name: string | null
  is_active: boolean
  is_admin: boolean
  is_suspended: boolean
  is_verified: boolean
  totp_enabled: boolean
  plan: string   // 'friends_and_family' | 'free' | 'pro'
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
  by_budget_role: TypeStat[]
  monthly_trend: MonthTrendStat[]
}

export interface BankAccountSummary {
  account_id: string
  bank_name: string
  account_last4: string | null
  nickname: string
  available_balance: number | null
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
  available_balance: number | null
  created_at: string
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export type IndustryType =
  | "tecnologia"
  | "salud"
  | "educacion"
  | "finanzas"
  | "comercio"
  | "construccion"
  | "gobierno"
  | "transporte"
  | "servicios"
  | "otro"

export type GoalType =
  | "fondo_emergencia"
  | "ahorro_general"
  | "eliminar_deuda"
  | "invertir"
  | "meta_especifica"

export type ExpenseFrequency = "weekly" | "monthly" | "annual"
export type ExpenseOrigin = "efectivo" | "otro_banco" | "tarjeta_externa" | "prestamo" | "otro"

export interface ManualExpense {
  id: string
  description: string
  amount: number
  frequency: ExpenseFrequency
  monthly_amount: number        // normalizado a mensual
  category: string
  origins: ExpenseOrigin[]
}

export type HousingType = "rent" | "mortgage" | "own" | "family" | "other"
export type EmploymentType =
  | "employed_fixed"
  | "employed_variable"
  | "self_employed"
  | "business_owner"
  | "unemployed"
  | "retired"

export interface UserProfile {
  profile_id: string
  user_id: string
  industry: IndustryType | null
  expected_monthly_income: number | null
  financial_goals: GoalType[]
  onboarding_completed: boolean
  manual_expenses: ManualExpense[] | null  // null = nunca configurado
  // Perfil extendido para presupuesto personalizado
  dependents_count: number
  housing_type: HousingType | null
  employment_type: EmploymentType | null
  monthly_debt_payments: number | null
  has_pets: boolean
  created_at: string
  updated_at: string
}

export interface UserProfileUpdate {
  industry?: IndustryType | null
  expected_monthly_income?: number | null
  financial_goals?: GoalType[]
  onboarding_completed?: boolean
  manual_expenses?: ManualExpense[] | null
  // Perfil extendido
  dependents_count?: number | null
  housing_type?: HousingType | null
  employment_type?: EmploymentType | null
  monthly_debt_payments?: number | null
  has_pets?: boolean | null
}

// ─── Review Groups ────────────────────────────────────────────────────────────

export interface ReviewGroup {
  canonical_key: string
  sample_detail: string
  count: number
  total_amount: number
  transaction_ids: string[]
  current_category: string | null
  current_budget_role: string | null
}

export interface ApplyGroupRequest {
  canonical_key: string
  transaction_ids: string[]
  sample_detail: string
  economic_type: string
  economic_type_detail: string | null
  subtype_economic: string | null
  budget_category: string
  budget_role: string
  also_learn: boolean
  force_personal: boolean
  weight: number
}

export interface ApplyGroupResponse {
  updated_count: number
  canonical_key: string
  detail_learned: string | null
  kb_target: string | null
}

// ─── Manual Wallets ───────────────────────────────────────────────────────────

export type WalletType = "card" | "cash" | "savings" | "other"

export interface ManualWallet {
  wallet_id: string
  user_id: string
  name: string
  wallet_type: WalletType
  icon: string        // nombre del ícono lucide-react
  color: string       // hex color
  current_balance: number
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface WalletCreate {
  name: string
  wallet_type?: WalletType
  icon?: string
  color?: string
  current_balance?: number
  is_default?: boolean
}

export interface WalletUpdate {
  name?: string
  wallet_type?: WalletType
  icon?: string
  color?: string
  current_balance?: number
  is_default?: boolean
}

// ─── Savings Goals ────────────────────────────────────────────────────────────

export interface SavingsGoal {
  goal_id: string
  user_id: string
  name: string
  icon: string
  color: string
  target_amount: number
  current_amount: number
  progress_pct: number   // 0–100
  deadline: string | null
  created_at: string
  updated_at: string
}

export interface GoalCreate {
  name: string
  icon?: string
  color?: string
  target_amount: number
  current_amount?: number
  deadline?: string | null
}

export interface GoalUpdate {
  name?: string
  icon?: string
  color?: string
  target_amount?: number
  deadline?: string | null
}

// ─── API Error ────────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string | { error: string; message?: string; [key: string]: unknown }
}
