import apiClient from "./client"
import type { UploadResponse } from "@/types"

export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append("file", file)

  const res = await apiClient.post<UploadResponse>("/files/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return res.data
}
