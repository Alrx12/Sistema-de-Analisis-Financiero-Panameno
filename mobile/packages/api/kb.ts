import { getApiClient } from "./client"
import type { KBEntry } from "@safpro/types"

export async function listKB(): Promise<KBEntry[]> {
  const res = await getApiClient().get("/kb")
  // Backend returns KBListResponse { entries: [...], ... }, not a flat array
  return res.data?.entries ?? []
}

export async function listGlobalKB(): Promise<KBEntry[]> {
  const res = await getApiClient().get("/kb/global")
  // Backend returns KBGlobalListResponse { entries: [...], ... }, not a flat array
  return res.data?.entries ?? []
}

export async function deleteKBEntry(key: string): Promise<void> {
  await getApiClient().delete(`/kb/${encodeURIComponent(key)}`)
}
