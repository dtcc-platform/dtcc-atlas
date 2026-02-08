/**
 * Job service for managing async dataset downloads via SSE
 */

import { API_BASE_URL } from '../config';

export type JobStatus = 'queued' | 'processing' | 'complete' | 'failed';

export interface JobProgress {
  percent: number;
  message: string;
  phase: string | null;
  eta_formatted: string | null;
  phases?: Record<string, unknown> | null;
}

export interface Job {
  id: string;
  dataset: string;
  status: JobStatus;
  filename: string | null;
  error: string | null;
  progress?: JobProgress | null;
  created_at: string;
  completed_at: string | null;
  download_url: string | null;
  // Original request params for retry
  params?: Record<string, unknown>;
}

export interface JobSubmitRequest {
  dataset: string;
  bounds: number[];
  parameters: Record<string, unknown>;
  filename?: string;
}

export interface JobSubmitResponse {
  job_id: string;
  status: string;
}

export type JobEventType = 'job_update' | 'job_complete' | 'job_failed' | 'connected';

export interface JobEvent {
  type: JobEventType;
  data: Job & { download_url?: string; message?: string };
}

type JobEventCallback = (event: JobEvent) => void;

/**
 * Service for managing job submissions and real-time updates via SSE
 */
class JobService {
  private eventSource: EventSource | null = null;
  private globalCallbacks: Set<JobEventCallback> = new Set();
  private jobCallbacks: Map<string, Set<JobEventCallback>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private fallbackPollingActive = false;
  private fallbackPollingIntervalMs: number | null = null;

  /**
   * Submit a new job for processing
   */
  async submitJob(request: JobSubmitRequest): Promise<JobSubmitResponse> {
    const response = await fetch(`${API_BASE_URL}/jobs/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail || errorData.message || `Job submission failed: ${response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Cancel a running or queued job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/cancel`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to cancel job');
    }

    return true;
  }

  /**
   * Get status of a specific job (fallback for non-SSE)
   */
  async getJobStatus(jobId: string): Promise<Job> {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/status`);

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * List recent jobs
   */
  async listJobs(limit = 50): Promise<Job[]> {
    const response = await fetch(`${API_BASE_URL}/jobs/list?limit=${limit}`);

    if (!response.ok) {
      throw new Error(`Failed to list jobs: ${response.statusText}`);
    }

    const data = await response.json();
    return data.jobs;
  }

  /**
   * Connect to SSE endpoint for real-time updates
   */
  connectSSE(): void {
    if (this.eventSource || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      this.eventSource = new EventSource(`${API_BASE_URL}/jobs/events`);

      this.eventSource.onopen = () => {
        console.info('SSE connection established; live job updates resumed.');
        this.reconnectAttempts = 0;
        this.isConnecting = false;
      };

      this.eventSource.onerror = (error) => {
        console.warn('SSE connection error; switching to fallback polling until reconnect.', {
          readyState: this.eventSource?.readyState,
          error,
        });
        this.isConnecting = false;
        this.handleReconnect();
      };

      // Handle connection event
      this.eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse((event as MessageEvent).data);
        console.log('SSE connected:', data.message);
      });

      // Handle job update events
      this.eventSource.addEventListener('job_update', (event) => {
        this.handleEvent('job_update', (event as MessageEvent).data);
      });

      // Handle job complete events
      this.eventSource.addEventListener('job_complete', (event) => {
        this.handleEvent('job_complete', (event as MessageEvent).data);
      });

      // Handle job failed events
      this.eventSource.addEventListener('job_failed', (event) => {
        this.handleEvent('job_failed', (event as MessageEvent).data);
      });
    } catch (error) {
      console.error('Failed to create EventSource:', error);
      this.isConnecting = false;
      this.handleReconnect();
    }
  }

  /**
   * Handle incoming SSE event
   */
  private handleEvent(type: JobEventType, dataStr: string): void {
    try {
      const data = JSON.parse(dataStr);
      const event: JobEvent = { type, data };

      // Notify global callbacks
      this.globalCallbacks.forEach((callback) => {
        try {
          callback(event);
        } catch (e) {
          console.error('Error in global job callback:', e);
        }
      });

      // Notify job-specific callbacks
      const jobId = data.id;
      const jobCallbacks = this.jobCallbacks.get(jobId);
      if (jobCallbacks) {
        jobCallbacks.forEach((callback) => {
          try {
            callback(event);
          } catch (e) {
            console.error('Error in job callback:', e);
          }
        });
      }
    } catch (e) {
      console.error('Failed to parse SSE event:', e);
    }
  }

  /**
   * Handle reconnection after connection loss
   */
  private handleReconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.info(`Reconnecting SSE in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        this.connectSSE();
      }, delay);
    } else {
      console.error('Max SSE reconnection attempts reached');
    }
  }

  /**
   * Disconnect from SSE endpoint
   */
  disconnectSSE(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
  }

  /**
   * Register callback for all job events
   */
  onJobEvent(callback: JobEventCallback): () => void {
    this.globalCallbacks.add(callback);
    return () => {
      this.globalCallbacks.delete(callback);
    };
  }

  /**
   * Register callback for specific job updates
   */
  onJobUpdate(jobId: string, callback: JobEventCallback): () => void {
    if (!this.jobCallbacks.has(jobId)) {
      this.jobCallbacks.set(jobId, new Set());
    }
    this.jobCallbacks.get(jobId)!.add(callback);

    return () => {
      const callbacks = this.jobCallbacks.get(jobId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.jobCallbacks.delete(jobId);
        }
      }
    };
  }

  /**
   * Trigger file download for a completed job
   */
  downloadResult(jobId: string, filename?: string): void {
    const url = `${API_BASE_URL}/jobs/${jobId}/download`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Check if SSE is connected
   */
  isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }

  /**
   * Report polling fallback state for concise diagnostics.
   */
  setFallbackPollingState(active: boolean, intervalMs?: number): void {
    const normalizedInterval = active ? (intervalMs ?? null) : null;
    const didChange =
      this.fallbackPollingActive !== active
      || this.fallbackPollingIntervalMs !== normalizedInterval;

    if (!didChange) {
      return;
    }

    this.fallbackPollingActive = active;
    this.fallbackPollingIntervalMs = normalizedInterval;

    if (active) {
      const suffix = normalizedInterval ? ` (${normalizedInterval}ms)` : '';
      console.info(`Job updates fallback polling enabled${suffix}.`);
      return;
    }

    console.info('Job updates fallback polling disabled.');
  }
}

// Export singleton instance
export const jobService = new JobService();
