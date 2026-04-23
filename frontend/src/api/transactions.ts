import api from "./client"
import type {
  ReviewGroup,
  ApplyGroupRequest,
  ApplyGroupResponse,
  TransactionSearchParams,
  TransactionSearchResponse,
} from "@/types"

export async function getReviewGroups(): Promise<ReviewGroup[]> {
  const res = await api.get<ReviewGroup[]>("/transactions/review-groups")
  return res.data
}

export async function applyReviewGroup(
  data: ApplyGroupRequest
): Promise<ApplyGroupResponse> {
  const res = await api.post<ApplyGroupResponse>("/transactions/review-groups/apply", data)
  return res.data
}

export async function searchTransactions(
  params: TransactionSearchParams = {}
): Promise<TransactionSearchResponse> {
  const res = await api.get<TransactionSearchResponse>("/transactions/search", { params })
  return res.data
}
