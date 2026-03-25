import apiClient from "./client"
import type { ProcessingJob } from "@/types"

export async function getJob(jobId: string): Promise<ProcessingJob> {
  const res = await apiClient.get<ProcessingJob>(`/jobs/${jobId}`)
  return res.data
}

export async function listJobs(): Promise<ProcessingJob[]> {
  const res = await apiClient.get<ProcessingJob[]>("/jobs/")
  return res.data
}
