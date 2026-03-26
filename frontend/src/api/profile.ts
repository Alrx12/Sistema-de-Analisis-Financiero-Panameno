import api from "./client"
import type { UserProfile, UserProfileUpdate } from "@/types"

export async function getProfile(): Promise<UserProfile> {
  const res = await api.get<UserProfile>("/users/profile")
  return res.data
}

export async function updateProfile(data: UserProfileUpdate): Promise<UserProfile> {
  const res = await api.put<UserProfile>("/users/profile", data)
  return res.data
}
