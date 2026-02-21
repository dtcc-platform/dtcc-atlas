/**
 * Browser notification service for job completion alerts
 */

export type NotificationPermission = 'default' | 'granted' | 'denied';

class NotificationService {
  private permissionStatus: NotificationPermission = 'default';

  constructor() {
    if ('Notification' in window) {
      this.permissionStatus = Notification.permission as NotificationPermission;
    }
  }

  /**
   * Check if notifications are supported
   */
  isSupported(): boolean {
    return 'Notification' in window;
  }

  /**
   * Get current permission status
   */
  getPermission(): NotificationPermission {
    return this.permissionStatus;
  }

  /**
   * Request notification permission
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      console.warn('Notifications not supported in this browser');
      return 'denied';
    }

    try {
      const result = await Notification.requestPermission();
      this.permissionStatus = result as NotificationPermission;
      return this.permissionStatus;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return 'denied';
    }
  }

  /**
   * Show a notification
   */
  async show(
    title: string,
    options?: {
      body?: string;
      icon?: string;
      tag?: string;
      onClick?: () => void;
    }
  ): Promise<Notification | null> {
    if (!this.isSupported()) {
      return null;
    }

    // Request permission if not granted
    if (this.permissionStatus === 'default') {
      await this.requestPermission();
    }

    if (this.permissionStatus !== 'granted') {
      return null;
    }

    // Don't show notification if window is focused
    if (document.hasFocus()) {
      return null;
    }

    try {
      const notification = new Notification(title, {
        body: options?.body,
        icon: options?.icon || '/favicon.ico',
        tag: options?.tag,
      });

      if (options?.onClick) {
        notification.onclick = () => {
          window.focus();
          options.onClick!();
          notification.close();
        };
      }

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      return notification;
    } catch (error) {
      console.error('Failed to show notification:', error);
      return null;
    }
  }

  /**
   * Show job completion notification
   */
  async showJobComplete(
    jobId: string,
    dataset: string,
    onClickCallback?: () => void
  ): Promise<Notification | null> {
    return this.show(`Download Ready: ${dataset}`, {
      body: 'Click to view and download your dataset.',
      tag: `job-${jobId}`,
      onClick: onClickCallback,
    });
  }

  /**
   * Show job failure notification
   */
  async showJobFailed(
    jobId: string,
    dataset: string,
    error?: string
  ): Promise<Notification | null> {
    return this.show(`Download Failed: ${dataset}`, {
      body: error || 'An error occurred while processing your request.',
      tag: `job-${jobId}`,
    });
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
