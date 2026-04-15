/**
 * API client para endpoints exclusivos del panel admin de SAFPRO.
 * Todos los endpoints requieren is_admin=true en el JWT.
 */
import apiClient from "./client"

// ── Tipos ────────────────────────────────────────────────────────────────────

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

// ── Funciones ─────────────────────────────────────────────────────────────────

/** Lista jobs filtrados por status (default: 'error'). */
export async function getAdminJobs(
  jobStatus: string = "error",
  limit: number = 100,
): Promise<AdminJobsResponse> {
  const { data } = await apiClient.get("/admin/jobs", {
    params: { status: jobStatus, limit },
  })
  return data
}

/**
 * Re-encola un job fallido para re-procesamiento.
 * Mueve el archivo de storage/failed/ → storage/temp/ y crea un nuevo job Celery.
 */
export async function retryFailedJob(jobId: string): Promise<RetryJobResponse> {
  const { data } = await apiClient.post(`/admin/jobs/${jobId}/retry`)
  return data
}

/**
 * Descarta el archivo fallido de storage/failed/ sin re-procesar.
 * El job queda en el historial como 'error'.
 */
export async function discardFailedFile(jobId: string): Promise<{ message: string; job_id: string }> {
  const { data } = await apiClient.delete(`/admin/jobs/${jobId}/failed-file`)
  return data
}

/**
 * Retorna la URL directa para descargar el archivo fallido.
 * Se usa como href en un <a> o window.open — el servidor devuelve FileResponse.
 */
export function getFailedFileDownloadUrl(jobId: string): string {
  return `/api/v1/admin/jobs/${jobId}/download`
}

// ── User management ───────────────────────────────────────────────────────────

/** Lista usuarios paginada. */
export async function getAdminUsers(
  page: number = 1,
  pageSize: number = 50,
): Promise<AdminUsersResponse> {
  const { data } = await apiClient.get("/admin/users", {
    params: { page, page_size: pageSize },
  })
  return data
}

/** Suspende un usuario (bloquea acceso). */
export async function suspendUser(userId: string): Promise<{ message: string; user_id: string }> {
  const { data } = await apiClient.post(`/admin/users/${userId}/suspend`)
  return data
}

/** Reactiva un usuario suspendido. */
export async function unsuspendUser(userId: string): Promise<{ message: string; user_id: string }> {
  const { data } = await apiClient.post(`/admin/users/${userId}/unsuspend`)
  return data
}

/** Cambia el plan de un usuario. */
export async function patchUserPlan(
  userId: string,
  plan: string,
): Promise<{ message: string; user_id: string; plan: string }> {
  const { data } = await apiClient.patch(`/admin/users/${userId}/plan`, { plan })
  return data
}

/** Elimina un usuario y todos sus datos. IRREVERSIBLE. */
export async function deleteAdminUser(userId: string): Promise<{ message: string }> {
  const { data } = await apiClient.delete(`/admin/users/${userId}`)
  return data
}

// ── Email broadcast ───────────────────────────────────────────────────────────

export interface EmailSegmentInfo {
  label: string
  count: number | null
}

export interface EmailSegmentsResponse {
  [segment: string]: EmailSegmentInfo
}

export interface EmailBroadcastPayload {
  subject: string
  body_html: string
  segment: string
  specific_email?: string
}

export interface EmailBroadcastResult {
  sent: number
  failed: number
  total: number
  segment: string
  errors: string[] | null
}

/** Devuelve conteo de usuarios por segmento de envío. */
export async function getEmailSegments(): Promise<EmailSegmentsResponse> {
  const { data } = await apiClient.get("/admin/email/segments")
  return data
}

/** Envía un email broadcast al segmento elegido. */
export async function sendEmailBroadcast(
  payload: EmailBroadcastPayload,
): Promise<EmailBroadcastResult> {
  const { data } = await apiClient.post("/admin/email/send", payload)
  return data
}
