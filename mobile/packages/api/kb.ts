import { getApiClient } from "./client"
import type { KBListResponse, KBGlobalListResponse } from "@safpro/types"

export async function listKB(): Promise<KBListResponse> {
  const res = await getApiClient().get("/kb")
  return res.data
}

export async function listGlobalKB(): Promise<KBGlobalListResponse> {
  const res = await getApiClient().get("/kb/global")
  return res.data
}

export async function deleteKBEntry(key: string): Promise<void> {
  await getApiClient().delete(`/kb/${encodeURIComponent(key)}`)
}
