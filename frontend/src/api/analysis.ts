import apiClient from "./client"
import type { AnalysisSnapshot, Transaction, ConfidenceStats, ReclassifyRequest, AggregatedSummary } from "@/types"

export async function listAnalysis(): Promise<AnalysisSnapshot[]> {
  const res = await apiClient.get<AnalysisSnapshot[]>("/analysis/")
  return res.data
}

export async function getAnalysis(id: string): Promise<AnalysisSnapshot> {
  const res = await apiClient.get<AnalysisSnapshot>(`/analysis/${id}`)
  return res.data
}

export async function getTransactions(
  snapshotId: string,
  params?: { requires_review?: boolean; max_confidence?: number }
): Promise<Transaction[]> {
  const res = await apiClient.get<Transaction[]>(`/analysis/${snapshotId}/transactions`, {
    params,
  })
  return res.data
}

export async function getConfidenceStats(snapshotId: string): Promise<ConfidenceStats> {
  const res = await apiClient.get<ConfidenceStats>(`/analysis/${snapshotId}/confidence-stats`)
  return res.data
}

export async function getAggregatedSummary(params: {
  year?: number
  month?: number
  bank_account_id?: string
}): Promise<AggregatedSummary> {
  const res = await apiClient.get<AggregatedSummary>("/analysis/aggregated", { params })
  return res.data
}

export async function reclassifyTransaction(
  transactionId: string,
  data: ReclassifyRequest
): Promise<Transaction> {
  const res = await apiClient.post<Transaction>(
    `/transactions/${transactionId}/reclassify`,
    data
  )
  return res.data
}
