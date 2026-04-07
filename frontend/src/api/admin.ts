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
