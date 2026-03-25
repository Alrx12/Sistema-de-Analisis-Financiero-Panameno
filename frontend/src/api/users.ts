import apiClient from "./client"
import type { User } from "@/types"

export async function getMe(): Promise<User> {
  const res = await apiClient.get<User>("/users/me")
  return res.data
}
