import { getApiClient } from "./client"
import type { UploadResponse, ProcessingJob } from "@safpro/types"

export interface UploadStatusResponse {
  upload_count: number
  upload_limit: number
  is_free: boolean
  remaining: number
}

/**
 * Sube un archivo Excel al backend.
 *
 * En web: recibe un File del input/drop zone.
 * En mobile: recibe un objeto con uri/name/type de expo-document-picker.
 *
 * El FormData funciona igual en ambas plataformas gracias a react-native/polyfills.
 */
export async function uploadFile(
  file: { uri: string; name: string; type: string } | File
): Promise<UploadResponse> {
  const formData = new FormData()

  if (file instanceof File) {
    // Web: File object nativo
    formData.append("file", file)
  } else {
    // Mobile: objeto de expo-document-picker
    formData.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as unknown as Blob)
  }

  const res = await getApiClient().post<UploadResponse>("/files/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return res.data
}

export async function getUploadStatus(): Promise<UploadStatusResponse> {
  const res = await getApiClient().get<UploadStatusResponse>("/files/uploads/status")
  return res.data
}

export async function getJob(jobId: string): Promise<ProcessingJob> {
  const res = await getApiClient().get<ProcessingJob>(`/jobs/${jobId}`)
  return res.data
}

export async function listJobs(): Promise<ProcessingJob[]> {
  const res = await getApiClient().get<ProcessingJob[]>("/jobs/")
  return res.data
}
