import apiClient from "./client"
import type { User } from "@/types"

export async function getMe(): Promise<User> {
  const res = await apiClient.get<User>("/users/me")
  return res.data
}

export async function deleteMyAccount(): Promise<{ message: string }> {
  const res = await apiClient.delete<{ message: string }>("/users/me")
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
