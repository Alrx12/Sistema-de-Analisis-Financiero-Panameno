import { getApiClient } from "./client"
import type {
  ReviewGroup,
  ApplyGroupRequest,
  ApplyGroupResponse,
  TransactionSearchParams,
  TransactionSearchResponse,
} from "@safpro/types"

export async function getReviewGroups(): Promise<ReviewGroup[]> {
  const res = await getApiClient().get<ReviewGroup[]>("/transactions/review-groups")
  return res.data
}

export async function applyReviewGroup(
  data: ApplyGroupRequest
): Promise<ApplyGroupResponse> {
  const res = await getApiClient().post<ApplyGroupResponse>(
    "/transactions/review-groups/apply",
    data
  )
  return res.data
}

export async function searchTransactions(
  params: TransactionSearchParams = {}
): Promise<TransactionSearchResponse> {
  const res = await getApiClient().get<TransactionSearchResponse>(
    "/transactions/search",
    { params }
  )
  return res.data
}
