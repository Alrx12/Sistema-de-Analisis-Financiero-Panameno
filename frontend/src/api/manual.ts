import api from "./client"
import type { Transaction } from "@/types"

export interface ManualTransactionCreate {
  date: string            // YYYY-MM-DD
  detail: string          // texto libre
  amount: number
  movement_type: "debito" | "credito"
  budget_category: string // del catálogo
  budget_role?: string
  economic_type?: string
}

export async function createManualTransaction(data: ManualTransactionCreate): Promise<Transaction> {
  const res = await api.post<Transaction>("/manual-transactions", data)
  return res.data
}

export async function listManualTransactions(): Promise<Transaction[]> {
  const res = await api.get<Transaction[]>("/manual-transactions")
  return res.data
}

export async function deleteManualTransaction(transactionId: string): Promise<void> {
  await api.delete(`/manual-transactions/${transactionId}`)
}
