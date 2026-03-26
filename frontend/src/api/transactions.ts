import api from "./client"
import type { ReviewGroup, ApplyGroupRequest, ApplyGroupResponse } from "@/types"

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
