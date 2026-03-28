import api from "./client"
import type { ManualWallet, WalletCreate, WalletUpdate } from "@/types"

export async function listWallets(): Promise<ManualWallet[]> {
  const res = await api.get<ManualWallet[]>("/wallets")
  return res.data
}

export async function createWallet(data: WalletCreate): Promise<ManualWallet> {
  const res = await api.post<ManualWallet>("/wallets", data)
  return res.data
}

export async function updateWallet(walletId: string, data: WalletUpdate): Promise<ManualWallet> {
  const res = await api.patch<ManualWallet>(`/wallets/${walletId}`, data)
  return res.data
}

export async function deleteWallet(walletId: string): Promise<void> {
  await api.delete(`/wallets/${walletId}`)
}
