/**
 * API client para endpoints exclusivos del panel admin mobile.
 * Todos los endpoints requieren is_admin=true en el JWT.
 */
import { getApiClient } from "./client"

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface AdminUserItem {
  user_id: string
  email: string
  full_name: string | null
  plan: string
  is_admin: boolean
  is_suspended: boolean
  is_verified: boolean
  upload_count: number
  created_at: string
}

export interface AdminUsersResponse {
  total: number
  page: number
  page_size: number
  items: AdminUserItem[]
}

export interface AdminFailedJob {
  job_id: string
  user_id: string
  user_email: string
  original_filename: string | null
  status: string
  error_message: string | null
  failed_file_exists: boolean
  created_at: string | null
  updated_at: string | null
}

export interface AdminJobsResponse {
  status_filter: string
  count: number
  jobs: AdminFailedJob[]
}

export interface RetryJobResponse {
  message: string
  original_job_id: string
  new_job_id: string
  user_email: string
}

// ── Usuarios ──────────────────────────────────────────────────────────────────

/** Lista usuarios paginada. */
export async function getAdminUsers(
  page = 1,
  pageSize = 30,
): Promise<AdminUsersResponse> {
  const res = await getApiClient().get<AdminUsersResponse>("/admin/users", {
    params: { page, page_size: pageSize },
  })
  return res.data
}

/** Suspende un usuario (bloquea acceso). */
export async function suspendUser(userId: string): Promise<{ message: string; user_id: string }> {
  const res = await getApiClient().post(`/admin/users/${userId}/suspend`)
  return res.data
}

/** Reactiva un usuario suspendido. */
export async function unsuspendUser(userId: string): Promise<{ message: string; user_id: string }> {
  const res = await getApiClient().post(`/admin/users/${userId}/unsuspend`)
  return res.data
}

/** Cambia el plan de un usuario. */
export async function patchUserPlan(
  userId: string,
  plan: string,
): Promise<{ message: string; user_id: string; plan: string }> {
  const res = await getApiClient().patch(`/admin/users/${userId}/plan`, { plan })
  return res.data
}

/** Elimina un usuario y todos sus datos. IRREVERSIBLE. */
export async function deleteAdminUser(userId: string): Promise<{ message: string }> {
  const res = await getApiClient().delete(`/admin/users/${userId}`)
  return res.data
}

// ── Jobs fallidos ─────────────────────────────────────────────────────────────

/** Lista jobs filtrados por status (default: 'error'). */
export async function getAdminJobs(
  jobStatus = "error",
  limit = 50,
): Promise<AdminJobsResponse> {
  const res = await getApiClient().get<AdminJobsResponse>("/admin/jobs", {
    params: { status: jobStatus, limit },
  })
  return res.data
}

/**
 * Re-encola un job fallido para re-procesamiento.
 * Mueve el archivo de storage/failed/ → storage/temp/ y crea un nuevo job.
 */
export async function retryFailedJob(jobId: string): Promise<RetryJobResponse> {
  const res = await getApiClient().post<RetryJobResponse>(`/admin/jobs/${jobId}/retry`)
  return res.data
}

/**
 * Descarta el archivo fallido sin re-procesar.
 * El job queda en el historial como 'error'.
 */
export async function discardFailedFile(
  jobId: string,
): Promise<{ message: string; job_id: string }> {
  const res = await getApiClient().delete(`/admin/jobs/${jobId}/failed-file`)
  return res.data
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  total_users: number
  activated_users: number
  activation_rate: number
  total_uploads: number
  total_analyses: number
  failed_jobs: number
  suspended_users: number
  admin_users: number
  users_by_plan: Record<string, number>
  verified_users: number
  onboarding_completed: number
}

export interface AnalyticsRetention {
  users_with_1_analysis: number
  users_with_2plus_analyses: number
  retention_rate: number
  avg_analyses_per_user: number
  avg_uploads_per_user: number
}

export interface AnalyticsQuality {
  avg_confidence: number
  total_transactions: number
  low_confidence_count: number
  low_confidence_ratio: number
  transactions_by_method: Record<string, number>
}

export interface AnalyticsTrends {
  users_by_month: { month: string; count: number }[]
  uploads_by_month: { month: string; count: number }[]
}

export interface AdminAnalyticsResponse {
  overview: AnalyticsOverview
  retention: AnalyticsRetention
  quality: AnalyticsQuality
  trends: AnalyticsTrends
  top_banks: { bank: string; count: number }[]
  failed_jobs_recent: { job_id: string; user_id: string; created_at: string | null; error_message: string | null }[]
}

/** Dashboard completo de métricas de negocio y calidad del sistema. */
export async function getAdminAnalytics(): Promise<AdminAnalyticsResponse> {
  const res = await getApiClient().get<AdminAnalyticsResponse>("/admin/analytics")
  return res.data
}

// ── Email broadcast ───────────────────────────────────────────────────────────

export type EmailSegment =
  | "all"
  | "unverified"
  | "no_onboarding"
  | "active"
  | "free"
  | "pro"
  | "friends_and_family"
  | "specific"

export const EMAIL_SEGMENT_LABELS: Record<EmailSegment, string> = {
  all:                "Todos los usuarios activos",
  unverified:         "Sin verificar",
  no_onboarding:      "Sin onboarding",
  active:             "Verificados con onboarding",
  free:               "Plan Free",
  pro:                "Plan Pro",
  friends_and_family: "Friends & Family",
  specific:           "Email específico",
}

export interface EmailBroadcastRequest {
  subject: string
  body_html: string
  segment: EmailSegment
  specific_email?: string
}

export interface EmailBroadcastResponse {
  sent: number
  failed: number
  segment: string
}

/** Envía un email broadcast a un segmento de usuarios. */
export async function sendEmailBroadcast(
  data: EmailBroadcastRequest,
): Promise<EmailBroadcastResponse> {
  const res = await getApiClient().post<EmailBroadcastResponse>("/admin/email/send", data)
  return res.data
}
