import { getApiClient } from "./client"
import type { KBEntry } from "@safpro/types"

export async function listKB(): Promise<KBEntry[]> {
  const res = await getApiClient().get<KBEntry[]>("/kb")
  return res.data
}

export async function listGlobalKB(): Promise<KBEntry[]> {
  const res = await getApiClient().get<KBEntry[]>("/kb/global")
  return res.data
}

export async function deleteKBEntry(key: string): Promise<void> {
  await getApiClient().delete(`/kb/${encodeURIComponent(key)}`)
}
