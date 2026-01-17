/**
 * JobTracker - Sidebar panel for tracking dataset download jobs
 */

import { Job, JobStatus, jobService, JobEvent } from '../services/job-service';
import { notificationService } from '../services/notification-service';
import { Icons } from './icons';

type DownloadCallback = (jobId: string, filename: string | null) => void;

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

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.panel.classList.contains('hidden')) {
        this.hide();
      }
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
      jobs.forEach((job) => {
        this.jobs.set(job.id, job);
      });
      this.render();
      this.updateJobCount();
    } catch (error) {
      console.error('Failed to load existing jobs:', error);
    }
  }

  /**
   * Handle incoming job events from SSE
   */
  private handleJobEvent(event: JobEvent): void {
    const job = event.data as Job;

    switch (event.type) {
      case 'job_update':
        this.jobs.set(job.id, job);
        this.render();
        break;

      case 'job_complete':
        this.jobs.set(job.id, { ...job, download_url: event.data.download_url || null });
        this.render();
        // Show browser notification
        notificationService.showJobComplete(job.id, job.dataset, () => {
          this.show();
          this.highlightJob(job.id);
        });
        break;

      case 'job_failed':
        this.jobs.set(job.id, job);
        this.render();
        // Show browser notification
        notificationService.showJobFailed(job.id, job.dataset, job.error || undefined);
        break;
    }

    this.updateJobCount();
  }

  /**
   * Add a new job to the tracker
   */
  addJob(job: Job): void {
    this.jobs.set(job.id, job);
    this.render();
    this.updateJobCount();

    // Request notification permission on first job
    if (this.jobs.size === 1) {
      notificationService.requestPermission();
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
  private getStatusText(status: JobStatus): string {
    switch (status) {
      case 'queued':
        return 'Waiting in queue...';
      case 'processing':
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
  private getProgressBar(): string {
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
    const statusText = this.getStatusText(job.status);
    const relativeTime = this.getRelativeTime(job.created_at);

    let actionsHtml = '';
    if (job.status === 'complete') {
      actionsHtml = `
        <button class="job-download px-3 py-1.5 bg-dtcc-blue text-white text-xs font-medium rounded hover:bg-dtcc-blue-dark transition-colors">
          Download
        </button>
      `;
    } else if (job.status === 'failed') {
      actionsHtml = `
        <button class="job-dismiss p-1.5 hover:bg-dtcc-gray-lighter rounded transition-colors" title="Dismiss">
          <span class="w-4 h-4 block text-dtcc-gray-dark">${Icons.close}</span>
        </button>
      `;
    }

    const progressBar = job.status === 'processing' ? this.getProgressBar() : '';

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
    this.jobs.delete(jobId);
    this.render();
    this.updateJobCount();
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
    toRemove.forEach((id) => this.jobs.delete(id));
    this.render();
    this.updateJobCount();
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
    jobService.disconnectSSE();
  }
}
