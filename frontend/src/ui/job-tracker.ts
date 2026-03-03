/**
 * JobTracker - Sidebar panel for tracking dataset download jobs
 */

import { Job, JobStatus, jobService, JobEvent } from '../services/job-service';
import { notificationService } from '../services/notification-service';
import { Icons } from './icons';

type DownloadCallback = (jobId: string, filename: string | null) => void;
type JobSyncSource = 'initial' | 'sse' | 'poll' | 'local';

/**
 * JobTracker UI component for displaying and managing download jobs
 */
export class JobTracker {
  private panel: HTMLElement;
  private listContainer: HTMLElement;
  private emptyState: HTMLElement;
  private closeButton: HTMLElement;
  private clearCompletedBtn: HTMLElement;
  private jobCountSpan: HTMLElement;
  private jobs: Map<string, Job> = new Map();
  private downloadCallback: DownloadCallback | null = null;
  private unsubscribe: (() => void) | null = null;
  private retryTimers: Map<string, number> = new Map();
  private hiddenTerminalJobs: Set<string> = new Set();
  private completedNotifiedJobs: Set<string> = new Set();
  private failedNotifiedJobs: Set<string> = new Set();
  private pollIntervalId: number | null = null;
  private pollIntervalMs: number | null = null;
  private pollInFlight = false;
  private static readonly RETRY_COOLDOWN_MS = 10000;
  private static readonly ACTIVE_POLL_INTERVAL_MS = 3000;
  private static readonly DISCONNECTED_IDLE_POLL_INTERVAL_MS = 15000;

  constructor() {
    // Get DOM elements
    this.panel = document.getElementById('job-tracker-panel') as HTMLElement;
    this.listContainer = document.getElementById('job-list') as HTMLElement;
    this.emptyState = this.panel.querySelector('.job-empty-state') as HTMLElement;
    this.closeButton = this.panel.querySelector('.close-button') as HTMLElement;
    this.clearCompletedBtn = document.getElementById('clear-completed-jobs') as HTMLElement;
    this.jobCountSpan = document.getElementById('job-count') as HTMLElement;

    if (!this.panel || !this.listContainer || !this.emptyState || !this.closeButton) {
      throw new Error('Job tracker panel elements not found');
    }

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Close button
    this.closeButton.addEventListener('click', () => {
      this.hide();
    });

    // Clear completed jobs button
    this.clearCompletedBtn?.addEventListener('click', () => {
      this.clearCompletedJobs();
    });
  }

  /**
   * Initialize the job tracker and connect to SSE
   */
  async initialize(): Promise<void> {
    // Connect to SSE
    jobService.connectSSE();

    // Subscribe to job events
    this.unsubscribe = jobService.onJobEvent((event) => {
      this.handleJobEvent(event);
    });

    // Load existing jobs from server
    try {
      const jobs = await jobService.listJobs();
      console.log('Loaded jobs from server:', jobs);
      const didChange = this.applyJobBatch(jobs, 'initial', false);
      if (!didChange) {
        this.render();
        this.updateJobCount();
      }
    } catch (error) {
      console.error('Failed to load existing jobs:', error);
      this.render();
      this.updateJobCount();
    }

    this.updatePollingMode();
  }

  /**
   * Handle incoming job events from SSE
   */
  private handleJobEvent(event: JobEvent): void {
    const payload = event.data as Partial<Job>;
    if (!payload?.id) {
      return;
    }

    const jobFromEvent: Job = {
      ...(payload as Job),
      download_url: payload.download_url || null,
    };

    this.applyJobBatch([jobFromEvent], 'sse', true);
    this.updatePollingMode();
  }

  /**
   * Add a new job to the tracker
   */
  addJob(job: Job): void {
    // Ensure user-submitted jobs are not filtered out by local dismiss state.
    this.hiddenTerminalJobs.delete(job.id);
    this.completedNotifiedJobs.delete(job.id);
    this.failedNotifiedJobs.delete(job.id);

    this.applyJobBatch([job], 'local', false);
    this.updatePollingMode();

    // Request notification permission on first job
    if (this.jobs.size === 1) {
      notificationService.requestPermission();
    }
  }

  /**
   * Merge jobs into local state through a single update path (SSE + polling).
   */
  private applyJobBatch(
    jobs: Job[],
    _source: JobSyncSource,
    notifyTransitions: boolean,
  ): boolean {
    let didChange = false;

    jobs.forEach((job) => {
      if (this.shouldSkipTerminalJob(job)) {
        return;
      }

      const previous = this.jobs.get(job.id);
      const merged = this.normalizeJob(job, previous);

      if (previous && this.jobsAreEqual(previous, merged)) {
        return;
      }

      this.jobs.set(job.id, merged);
      if (notifyTransitions) {
        this.maybeNotifyStatusTransition(previous, merged);
      }
      didChange = true;
    });

    if (didChange) {
      this.render();
      this.updateJobCount();
    }

    return didChange;
  }

  /**
   * Poll server state to recover from SSE drops and keep completion status fresh.
   */
  private async pollJobs(): Promise<void> {
    if (this.pollInFlight) {
      return;
    }

    this.pollInFlight = true;
    try {
      const jobs = await jobService.listJobs();
      this.applyJobBatch(jobs, 'poll', true);
    } catch (error) {
      console.warn('Failed to refresh jobs via polling fallback:', error);
    } finally {
      this.pollInFlight = false;
      this.updatePollingMode();
    }
  }

  /**
   * Reconfigure polling cadence based on activity and SSE connection state.
   */
  private updatePollingMode(): void {
    const intervalMs = this.getPollingIntervalMs();
    const fallbackActive = !jobService.isConnected() && intervalMs !== null;

    if (intervalMs === null) {
      if (this.pollIntervalId !== null) {
        clearInterval(this.pollIntervalId);
        this.pollIntervalId = null;
        this.pollIntervalMs = null;
      }
      jobService.setFallbackPollingState(false);
      return;
    }

    const intervalChanged = this.pollIntervalId === null || this.pollIntervalMs !== intervalMs;
    if (intervalChanged) {
      if (this.pollIntervalId !== null) {
        clearInterval(this.pollIntervalId);
      }
      this.pollIntervalMs = intervalMs;
      this.pollIntervalId = window.setInterval(() => {
        void this.pollJobs();
      }, intervalMs);
    }

    jobService.setFallbackPollingState(fallbackActive, fallbackActive ? intervalMs : undefined);

    if (fallbackActive && intervalChanged) {
      void this.pollJobs();
    }
  }

  private getPollingIntervalMs(): number | null {
    if (this.hasActiveJobs()) {
      return JobTracker.ACTIVE_POLL_INTERVAL_MS;
    }

    if (!jobService.isConnected()) {
      return JobTracker.DISCONNECTED_IDLE_POLL_INTERVAL_MS;
    }

    return null;
  }

  private hasActiveJobs(): boolean {
    return Array.from(this.jobs.values()).some(
      (job) => job.status === 'queued' || job.status === 'processing'
    );
  }

  private shouldSkipTerminalJob(job: Job): boolean {
    const isTerminal = job.status === 'complete' || job.status === 'failed';
    return isTerminal && this.hiddenTerminalJobs.has(job.id);
  }

  private normalizeJob(job: Job, previous?: Job): Job {
    const downloadUrl = job.status === 'complete'
      ? (job.download_url || previous?.download_url || `/api/v1/jobs/${job.id}/download`)
      : (job.download_url ?? null);

    return {
      ...previous,
      ...job,
      filename: job.filename !== undefined ? job.filename : (previous?.filename ?? null),
      error: job.error !== undefined ? job.error : (previous?.error ?? null),
      progress: job.progress !== undefined ? job.progress : (previous?.progress ?? null),
      completed_at: job.completed_at !== undefined ? job.completed_at : (previous?.completed_at ?? null),
      download_url: downloadUrl,
    };
  }

  private jobsAreEqual(a: Job, b: Job): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private maybeNotifyStatusTransition(previous: Job | undefined, current: Job): void {
    if (!previous) {
      return;
    }

    const previousStatus = previous.status;

    if (current.status === 'complete' && previousStatus !== 'complete') {
      if (this.completedNotifiedJobs.has(current.id)) {
        return;
      }

      this.completedNotifiedJobs.add(current.id);
      notificationService.showJobComplete(current.id, current.dataset, () => {
        this.show();
        this.highlightJob(current.id);
      });
      return;
    }

    if (current.status === 'failed' && previousStatus !== 'failed') {
      if (this.failedNotifiedJobs.has(current.id)) {
        return;
      }

      this.failedNotifiedJobs.add(current.id);
      notificationService.showJobFailed(current.id, current.dataset, current.error || undefined);
    }
  }

  /**
   * Update job count badge
   */
  private updateJobCount(): void {
    const activeCount = Array.from(this.jobs.values()).filter(
      (j) => j.status === 'queued' || j.status === 'processing'
    ).length;

    if (this.jobCountSpan) {
      this.jobCountSpan.textContent = activeCount.toString();
      this.jobCountSpan.classList.toggle('hidden', activeCount === 0);
    }
  }

  /**
   * Get status indicator HTML
   */
  private getStatusIndicator(status: JobStatus): string {
    switch (status) {
      case 'queued':
        return '<span class="w-2 h-2 rounded-full bg-dtcc-gray"></span>';
      case 'processing':
        return '<span class="w-2 h-2 rounded-full bg-dtcc-blue animate-pulse"></span>';
      case 'complete':
        return '<span class="w-2 h-2 rounded-full bg-dtcc-green"></span>';
      case 'failed':
        return '<span class="w-2 h-2 rounded-full bg-dtcc-red"></span>';
      default:
        return '<span class="w-2 h-2 rounded-full bg-dtcc-gray"></span>';
    }
  }

  /**
   * Get status text
   */
  private getStatusText(status: JobStatus, job?: Job): string {
    switch (status) {
      case 'queued':
        return 'Waiting in queue...';
      case 'processing':
        if (job?.progress && typeof job.progress.percent === 'number' && Number.isFinite(job.progress.percent)) {
          const percent = Math.max(0, Math.min(100, job.progress.percent));
          return `Processing ${percent.toFixed(1)}%`;
        }
        return 'Processing...';
      case 'complete':
        return 'Ready';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get relative time display
   */
  private getRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  }

  /**
   * Get progress bar HTML for processing jobs
   */
  private getProgressBar(job: Job): string {
    if (
      job.progress &&
      typeof job.progress.percent === 'number' &&
      Number.isFinite(job.progress.percent)
    ) {
      const percent = Math.max(0, Math.min(100, job.progress.percent));
      const phase = this.escapeHtml(job.progress.phase || 'Processing');
      const message = this.escapeHtml(job.progress.message || '');
      const eta = this.escapeHtml(job.progress.eta_formatted || '');
      const detail = [message, eta ? `ETA ${eta}` : ''].filter(Boolean).join(' • ');

      return `
        <div class="mt-2">
          <div class="flex items-center justify-between text-[11px] text-dtcc-gray-dark mb-1">
            <span class="truncate">${phase}</span>
            <span class="font-mono">${percent.toFixed(1)}%</span>
          </div>
          <div class="h-1.5 bg-dtcc-gray-lighter rounded-full overflow-hidden">
            <div class="h-full bg-dtcc-blue rounded-full transition-all duration-300" style="width: ${percent.toFixed(1)}%"></div>
          </div>
          ${detail ? `<div class="mt-1 text-[11px] text-dtcc-gray-dark truncate">${detail}</div>` : ''}
        </div>
      `;
    }

    return `
      <div class="mt-2 h-1.5 bg-dtcc-gray-lighter rounded-full overflow-hidden">
        <div class="h-full bg-dtcc-blue rounded-full animate-progress-indeterminate"></div>
      </div>
    `;
  }

  /**
   * Render a single job item
   */
  private renderJobItem(job: Job): HTMLElement {
    const item = document.createElement('div');
    item.className = 'border-b border-dtcc-border-light last:border-b-0 px-4 py-3 transition-colors group';
    item.dataset.jobId = job.id;
    item.id = `job-item-${job.id}`;

    const statusIndicator = this.getStatusIndicator(job.status);
    const statusText = this.getStatusText(job.status, job);
    const relativeTime = this.getRelativeTime(job.created_at);

    let actionsHtml = '';
    if (job.status === 'complete') {
      actionsHtml = `
        <button class="job-download px-3 py-1.5 bg-dtcc-blue text-white text-xs font-medium rounded hover:bg-dtcc-blue-dark transition-colors">
          Download
        </button>
      `;
    } else if (job.status === 'failed') {
      let retryBtn = '';
      if (job.params) {
        const completedAt = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
        const elapsed = Date.now() - completedAt;
        const remaining = Math.max(0, JobTracker.RETRY_COOLDOWN_MS - elapsed);
        const remainingSeconds = Math.ceil(remaining / 1000);

        if (remainingSeconds > 0) {
          retryBtn = `
            <button class="job-retry px-3 py-1.5 bg-dtcc-gray text-white text-xs font-medium rounded cursor-not-allowed opacity-75" disabled data-cooldown="${remainingSeconds}">
              Retry in ${remainingSeconds}s
            </button>
          `;
        } else {
          retryBtn = `
            <button class="job-retry px-3 py-1.5 bg-dtcc-blue text-white text-xs font-medium rounded hover:bg-dtcc-blue-dark transition-colors">
              Try Again
            </button>
          `;
        }
      }
      actionsHtml = `
        ${retryBtn}
        <button class="job-dismiss p-1.5 hover:bg-dtcc-gray-lighter rounded transition-colors" title="Dismiss">
          <span class="w-4 h-4 block text-dtcc-gray-dark">${Icons.close}</span>
        </button>
      `;
    } else if (job.status === 'queued' || job.status === 'processing') {
      actionsHtml = `
        <button class="job-cancel px-3 py-1.5 bg-dtcc-gray text-white text-xs font-medium rounded hover:bg-dtcc-gray-dark transition-colors">
          Cancel
        </button>
      `;
    }

    const progressBar = job.status === 'processing' ? this.getProgressBar(job) : '';

    // Error display with background highlight for failed jobs
    let errorHtml = '';
    if (job.error) {
      errorHtml = `
        <div class="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-dtcc-red">
          ${this.escapeHtml(job.error)}
        </div>
      `;
    }

    item.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            ${statusIndicator}
            <span class="text-sm font-medium text-dtcc-navy truncate">${this.escapeHtml(job.dataset)}</span>
            ${job.params?.__ue_artifact ? '<span class="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">UE</span>' : ''}
          </div>
          <div class="flex items-center gap-2 mt-1 text-xs text-dtcc-gray-dark">
            <span class="font-medium ${job.status === 'failed' ? 'text-dtcc-red' : ''}">${statusText}</span>
            <span>•</span>
            <span>${relativeTime}</span>
          </div>
          ${progressBar}
          ${errorHtml}
          ${job.filename && job.status === 'complete' ? `<div class="mt-1 text-xs text-dtcc-gray font-mono truncate">${this.escapeHtml(job.filename)}</div>` : ''}
        </div>
        <div class="flex items-center gap-1">
          ${actionsHtml}
        </div>
      </div>
    `;

    // Download button
    const downloadBtn = item.querySelector('.job-download') as HTMLButtonElement;
    downloadBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.downloadCallback) {
        this.downloadCallback(job.id, job.filename);
      } else {
        jobService.downloadResult(job.id, job.filename || undefined);
      }
    });

    // Dismiss button
    const dismissBtn = item.querySelector('.job-dismiss') as HTMLButtonElement;
    dismissBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeJob(job.id);
    });

    // Retry button
    const retryBtn = item.querySelector('.job-retry') as HTMLButtonElement;
    retryBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!job.params) return;

      retryBtn.disabled = true;
      retryBtn.textContent = 'Retrying...';

      try {
        // Extract bounds from params
        const { bounds, ...parameters } = job.params as { bounds: number[]; [key: string]: unknown };

        // Submit new job with same parameters
        const response = await jobService.submitJob({
          dataset: job.dataset,
          bounds: bounds,
          parameters: parameters,
          filename: job.filename?.replace(/\.[^.]+$/, '') || job.dataset,
        });

        // Remove the failed job from the list
        this.removeJob(job.id);

        console.log('Retry job submitted:', response.job_id);
      } catch (error) {
        console.error('Failed to retry job:', error);
        retryBtn.disabled = false;
        retryBtn.textContent = 'Try Again';
      }
    });

    // Cancel button
    const cancelBtn = item.querySelector('.job-cancel') as HTMLButtonElement;
    cancelBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Cancelling...';
      try {
        await jobService.cancelJob(job.id);
      } catch (error) {
        console.error('Failed to cancel job:', error);
        cancelBtn.disabled = false;
        cancelBtn.textContent = 'Cancel';
      }
    });

    // Set up cooldown timer for retry button if needed
    if (retryBtn?.dataset.cooldown) {
      const startCooldown = parseInt(retryBtn.dataset.cooldown, 10);
      if (startCooldown > 0) {
        // Clear any existing timer for this job
        const existingTimer = this.retryTimers.get(job.id);
        if (existingTimer) {
          clearInterval(existingTimer);
        }

        const timerId = window.setInterval(() => {
          const currentText = retryBtn.textContent || '';
          const match = currentText.match(/Retry in (\d+)s/);
          if (match) {
            const current = parseInt(match[1], 10);
            if (current > 1) {
              retryBtn.textContent = `Retry in ${current - 1}s`;
            } else {
              // Cooldown complete - enable the button
              clearInterval(timerId);
              this.retryTimers.delete(job.id);
              retryBtn.disabled = false;
              retryBtn.textContent = 'Try Again';
              retryBtn.classList.remove('bg-dtcc-gray', 'cursor-not-allowed', 'opacity-75');
              retryBtn.classList.add('bg-dtcc-blue', 'hover:bg-dtcc-blue-dark');
            }
          }
        }, 1000);

        this.retryTimers.set(job.id, timerId);
      }
    }

    return item;
  }

  /**
   * Render the job list
   */
  render(): void {
    this.listContainer.innerHTML = '';

    const jobsArray = Array.from(this.jobs.values());
    // Sort by created_at descending (newest first)
    jobsArray.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (jobsArray.length === 0) {
      this.emptyState.classList.remove('hidden');
      this.listContainer.classList.add('hidden');
      this.clearCompletedBtn?.classList.add('hidden');
    } else {
      this.emptyState.classList.add('hidden');
      this.listContainer.classList.remove('hidden');

      jobsArray.forEach((job) => {
        const item = this.renderJobItem(job);
        this.listContainer.appendChild(item);
      });

      // Show/hide clear completed button
      const hasCompleted = jobsArray.some((j) => j.status === 'complete' || j.status === 'failed');
      this.clearCompletedBtn?.classList.toggle('hidden', !hasCompleted);
    }
  }

  /**
   * Highlight a specific job (e.g., after clicking notification)
   */
  highlightJob(jobId: string): void {
    const item = document.getElementById(`job-item-${jobId}`);
    if (item) {
      item.classList.add('bg-dtcc-blue/10');
      setTimeout(() => {
        item.classList.remove('bg-dtcc-blue/10');
      }, 2000);
    }
  }

  /**
   * Remove a job from the tracker
   */
  removeJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job && (job.status === 'complete' || job.status === 'failed')) {
      this.hiddenTerminalJobs.add(jobId);
    }

    // Clear any retry timer for this job
    const timer = this.retryTimers.get(jobId);
    if (timer) {
      clearInterval(timer);
      this.retryTimers.delete(jobId);
    }

    this.jobs.delete(jobId);
    this.render();
    this.updateJobCount();
    this.updatePollingMode();
  }

  /**
   * Clear all completed and failed jobs
   */
  clearCompletedJobs(): void {
    const toRemove: string[] = [];
    this.jobs.forEach((job, id) => {
      if (job.status === 'complete' || job.status === 'failed') {
        toRemove.push(id);
      }
    });
    toRemove.forEach((id) => {
      // Clear any retry timer for this job
      const timer = this.retryTimers.get(id);
      if (timer) {
        clearInterval(timer);
        this.retryTimers.delete(id);
      }
      this.hiddenTerminalJobs.add(id);
      this.jobs.delete(id);
    });
    this.render();
    this.updateJobCount();
    this.updatePollingMode();
  }

  /**
   * Show the panel
   */
  show(): void {
    this.panel.classList.remove('hidden');
  }

  /**
   * Hide the panel
   */
  hide(): void {
    this.panel.classList.add('hidden');
  }

  /**
   * Toggle panel visibility
   */
  toggle(): void {
    this.panel.classList.toggle('hidden');
  }

  /**
   * Check if panel is visible
   */
  isVisible(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  /**
   * Register callback for download action
   */
  onDownload(callback: DownloadCallback): void {
    this.downloadCallback = callback;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    if (this.pollIntervalId !== null) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
      this.pollIntervalMs = null;
    }

    // Clear all retry timers
    this.retryTimers.forEach((timer) => clearInterval(timer));
    this.retryTimers.clear();
    jobService.setFallbackPollingState(false);
    jobService.disconnectSSE();
  }
}
