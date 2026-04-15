import apiClient from "./client"
import type { User } from "@/types"

export async function getMe(): Promise<User> {
  const res = await apiClient.get<User>("/users/me")
  return res.data
}

export async function updateMyName(full_name: string): Promise<User> {
  const res = await apiClient.patch<User>("/users/me", { full_name })
  return res.data
}

export async function deleteMyAccount(): Promise<{ message: string }> {
  const res = await apiClient.delete<{ message: string }>("/users/me")
  return res.data
}

export async function getUploadStatus(): Promise<{
  count: number
  limit: number
  remaining: number
  plan: string
  is_free: boolean
}> {
  const res = await apiClient.get("/files/uploads/status")
  return res.data
}

export async function deleteMyUploads(): Promise<{
  message: string
  records_deleted: number
  files_deleted: number
}> {
  const res = await apiClient.delete("/files/uploads")
  return res.data
}

export async function deleteAllAnalysis(): Promise<{
  message: string
  snapshots_deleted: number
  transactions_deleted: number
  files_deleted: number
}> {
  const res = await apiClient.delete("/analysis/all")
  return res.data
}
