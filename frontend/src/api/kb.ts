import apiClient from "./client"
import type { KBListResponse, KBGlobalListResponse, KBDeleteResponse, KBPreviewResponse } from "@/types"

export async function listKB(): Promise<KBListResponse> {
  const res = await apiClient.get<KBListResponse>("/kb/")
  return res.data
}

export async function deleteKBEntry(key: string): Promise<KBDeleteResponse> {
  const res = await apiClient.delete<KBDeleteResponse>(`/kb/${encodeURIComponent(key)}`)
  return res.data
}

export async function listGlobalKB(): Promise<KBGlobalListResponse> {
  const res = await apiClient.get<KBGlobalListResponse>("/kb/global")
  return res.data
}

export async function previewCanonical(detail: string): Promise<KBPreviewResponse> {
  const res = await apiClient.get<KBPreviewResponse>("/kb/preview", {
    params: { detail },
  })
  return res.data
}
