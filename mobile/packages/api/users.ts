import { getApiClient } from "./client"
import type { User, UserProfile, UserProfileUpdate } from "@safpro/types"

export async function getMe(): Promise<User> {
  const res = await getApiClient().get<User>("/users/me")
  return res.data
}

export async function getProfile(): Promise<UserProfile> {
  const res = await getApiClient().get<UserProfile>("/users/profile")
  return res.data
}

export async function updateProfile(data: UserProfileUpdate): Promise<UserProfile> {
  const res = await getApiClient().put<UserProfile>("/users/profile", data)
  return res.data
}

export async function deleteAccount(): Promise<void> {
  await getApiClient().delete("/users/me")
}

export async function deleteAllAnalysis(): Promise<{
  message: string
  snapshots_deleted: number
  transactions_deleted: number
  files_deleted: number
}> {
  const res = await getApiClient().delete("/analysis/all")
  return res.data
}
