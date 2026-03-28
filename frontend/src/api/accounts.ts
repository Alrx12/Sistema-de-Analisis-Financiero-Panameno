import apiClient from "@/api/client"
import type { BankAccount } from "@/types"

/** PATCH /accounts/{id} — actualiza campos editables de una cuenta bancaria */
export async function updateAccount(
  accountId: string,
  payload: {
    nickname?: string
    account_type?: string
    account_number_last4?: string | null
    is_active?: boolean
    available_balance?: number | null
  }
): Promise<BankAccount> {
  const { data } = await apiClient.patch<BankAccount>(`/accounts/${accountId}`, payload)
  return data
}
