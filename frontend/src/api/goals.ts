import api from "./client"
import type { SavingsGoal, GoalCreate, GoalUpdate } from "@/types"

export async function listGoals(): Promise<SavingsGoal[]> {
  const res = await api.get<SavingsGoal[]>("/goals")
  return res.data
}

export async function createGoal(data: GoalCreate): Promise<SavingsGoal> {
  const res = await api.post<SavingsGoal>("/goals", data)
  return res.data
}

export async function updateGoal(goalId: string, data: GoalUpdate): Promise<SavingsGoal> {
  const res = await api.patch<SavingsGoal>(`/goals/${goalId}`, data)
  return res.data
}

export async function depositToGoal(goalId: string, amount: number): Promise<SavingsGoal> {
  const res = await api.post<SavingsGoal>(`/goals/${goalId}/deposit`, { amount })
  return res.data
}

export async function deleteGoal(goalId: string): Promise<void> {
  await api.delete(`/goals/${goalId}`)
}
