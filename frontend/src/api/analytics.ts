import apiClient from "./client"

export interface AnalyticsOverview {
  total_users: number
  activated_users: number
  activation_rate: number
  total_uploads: number
  total_analyses: number
  failed_jobs: number
  suspended_users: number
  admin_users: number
  users_by_plan: Record<string, number>
}

export interface AnalyticsRetention {
  users_with_1_analysis: number
  users_with_2plus_analyses: number
  retention_rate: number
  avg_analyses_per_user: number
  avg_uploads_per_user: number
}

export interface AnalyticsQuality {
  avg_confidence: number
  total_transactions: number
  low_confidence_count: number
  low_confidence_ratio: number
  transactions_by_method: Record<string, number>
}

export interface AnalyticsTrends {
  users_by_month: { month: string; count: number }[]
  uploads_by_month: { month: string; count: number }[]
}

export interface AnalyticsData {
  overview: AnalyticsOverview
  retention: AnalyticsRetention
  quality: AnalyticsQuality
  trends: AnalyticsTrends
  top_banks: { bank: string; count: number }[]
  failed_jobs_recent: {
    job_id: string
    user_id: string
    created_at: string | null
    error_message: string | null
  }[]
}

export async function getAnalytics(): Promise<AnalyticsData> {
  const res = await apiClient.get<AnalyticsData>("/admin/analytics")
  return res.data
}
