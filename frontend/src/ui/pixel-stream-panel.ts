import {
  Config,
  Flags,
  OptionParameters,
  PixelStreaming,
  TextParameters,
} from '@epicgames-ps/lib-pixelstreamingfrontend-ue5.7';

export class PixelStreamPanel {
  private readonly toggleButton: HTMLButtonElement | null;
  private readonly layer: HTMLElement | null;
  private readonly host: HTMLElement | null;
  private readonly label: HTMLElement | null;
  private readonly status: HTMLElement | null;
  private readonly playButton: HTMLButtonElement | null;
  private readonly preferredStreamerId: string | undefined;
  private pixelStreaming: PixelStreaming | null = null;
  private visible = false;

  constructor() {
    this.toggleButton = document.getElementById('toggle-pixel-stream') as HTMLButtonElement | null;
    this.layer = document.getElementById('pixel-stream-layer');
    this.host = document.getElementById('pixel-stream-host');
    this.label = document.getElementById('pixel-stream-label');
    this.status = document.getElementById('pixel-stream-status');
    this.playButton = document.getElementById('pixel-stream-play') as HTMLButtonElement | null;
    this.preferredStreamerId = import.meta.env.VITE_PIXEL_STREAMING_STREAMER_ID?.trim();

    this.bindEvents();
  }

  isVisible(): boolean {
    return this.visible;
  }

  hide(): void {
    this.setVisible(false);
  }

  private bindEvents(): void {
    this.toggleButton?.addEventListener('click', () => this.toggle());

    this.playButton?.addEventListener('click', () => {
      this.playButton?.classList.add('hidden');
      this.pixelStreaming?.play();
    });
  }

  private getPixelStreamingUrl(): string {
    const configuredUrl = import.meta.env.VITE_PIXEL_STREAMING_SIGNALING_URL;
    if (configuredUrl && configuredUrl.trim().length > 0) {
      return configuredUrl;
    }

    return 'ws://cloud.dtcc.chalmers.se:14984';
  }

  private setStatus(label: string, state: string): void {
    if (!this.status) {
      return;
    }

    this.status.textContent = label;
    this.status.setAttribute('data-state', state);
  }

  private setVisible(visible: boolean): void {
    if (!this.toggleButton || !this.layer) {
      return;
    }

    this.visible = visible;

    if (visible) {
      this.layer.classList.remove('hidden');
      this.layer.classList.add('flex');
      this.toggleButton.setAttribute('data-state', 'active');
      this.toggleButton.setAttribute('data-tooltip', 'Switch to map view');
      if (this.label) this.label.textContent = 'Map View';
      return;
    }

    this.layer.classList.add('hidden');
    this.layer.classList.remove('flex');
    this.toggleButton.setAttribute('data-state', 'idle');
    this.toggleButton.setAttribute('data-tooltip', 'Switch to stream view');
    if (this.label) this.label.textContent = 'Pixel Streaming';
    this.setStatus('Disconnected', 'idle');
  }

  private ensurePixelStreaming(): void {
    if (this.pixelStreaming || !this.host) {
      return;
    }

    const config = new Config({
      initialSettings: {
        [TextParameters.SignallingServerUrl]: this.getPixelStreamingUrl(),
        [Flags.AutoConnect]: false,
        [Flags.AutoPlayVideo]: true,
        [Flags.StartVideoMuted]: true,
        ...(this.preferredStreamerId
          ? { [OptionParameters.StreamerId]: this.preferredStreamerId }
          : {}),
      },
    });

    this.pixelStreaming = new PixelStreaming(config, { videoElementParent: this.host });
    this.setStatus('Connecting...', 'connecting');

    this.pixelStreaming.addEventListener('webRtcConnecting', () => {
      this.setStatus('Connecting...', 'connecting');
    });

    this.pixelStreaming.addEventListener('webRtcConnected', () => {
      this.setStatus('Connected', 'connected');
    });

    this.pixelStreaming.addEventListener('webRtcFailed', () => {
      this.setStatus('Connection failed', 'error');
    });

    this.pixelStreaming.addEventListener('webRtcDisconnected', (event: Event) => {
      const data = (event as { data?: { eventString?: string } }).data;
      const message = data?.eventString || 'Disconnected';
      this.setStatus(message, 'error');
    });

    this.pixelStreaming.addEventListener('streamerListMessage', (event: Event) => {
      const data = (event as { data?: { messageStreamerList?: { ids: string[] } } }).data;
      const ids = data?.messageStreamerList?.ids ?? [];
      if (ids.length === 0) {
        this.setStatus('Waiting for streamer...', 'warning');
        return;
      }

      const currentSelection =
        this.pixelStreaming?.config.getSettingOption(OptionParameters.StreamerId).selected ?? '';
      if (currentSelection) {
        return;
      }

      const chosen =
        (this.preferredStreamerId &&
          ids.includes(this.preferredStreamerId) &&
          this.preferredStreamerId) ||
        ids.find((id) => id.toLowerCase() !== 'sfu') ||
        ids[0];
      if (chosen) {
        this.pixelStreaming?.config.setOptionSettingValue(OptionParameters.StreamerId, chosen);
      }
    });

    this.pixelStreaming.addEventListener('playStreamRejected', () => {
      this.playButton?.classList.remove('hidden');
    });
  }

  private toggle(): void {
    if (!this.layer || !this.host) {
      console.warn('Pixel streaming elements not found.');
      return;
    }

    if (this.visible) {
      this.setVisible(false);
      return;
    }

    this.setVisible(true);
    this.ensurePixelStreaming();
    this.playButton?.classList.add('hidden');
    this.pixelStreaming?.connect();
  }
}
