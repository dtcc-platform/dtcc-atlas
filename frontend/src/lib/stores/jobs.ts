import { writable, derived } from 'svelte/store'
import type { Job } from '../services/job-service'

export const jobs = writable<Job[]>([])
export const activeJobCount = derived(jobs, ($jobs) =>
  $jobs.filter(j => j.status === 'queued' || j.status === 'processing').length
)
export const completedJobs = derived(jobs, ($jobs) =>
  $jobs.filter(j => j.status === 'complete' || j.status === 'failed')
)
export const jobTrayExpanded = writable(false)
