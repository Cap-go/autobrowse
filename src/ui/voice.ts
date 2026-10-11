import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';

export interface VoiceHandlers {
  onPartial: (text: string) => void;
  onEnd: (finalText: string) => void;
  onError: (message: string) => void;
}

/** Push-to-talk dictation with live partial results (on-device when available). */
export class VoiceInput {
  private handles: PluginListenerHandle[] = [];
  private latest = '';
  private active = false;

  get listening(): boolean {
    return this.active;
  }

  static supported(): boolean {
    return Capacitor.isNativePlatform();
  }

  async start(handlers: VoiceHandlers): Promise<void> {
    if (this.active) return;
    const { available } = await SpeechRecognition.available();
    if (!available) throw new Error('Speech recognition is not available on this device.');
    let status = await SpeechRecognition.checkPermissions();
    if (status.speechRecognition !== 'granted') {
      status = await SpeechRecognition.requestPermissions();
    }
    if (status.speechRecognition !== 'granted') {
      throw new Error('Allow microphone and speech recognition in Settings to use voice.');
    }

    this.latest = '';
    this.active = true;
    this.handles.push(
      await SpeechRecognition.addListener('partialResults', (event) => {
        this.latest = event.accumulated ?? event.matches?.[0] ?? this.latest;
        handlers.onPartial(this.latest);
      }),
      await SpeechRecognition.addListener('listeningState', (event) => {
        if (event.state === 'stopped') void this.finish(handlers);
      }),
      await SpeechRecognition.addListener('error', (event) => {
        handlers.onError(event.message || 'Voice input failed');
        void this.finish(handlers);
      }),
    );

    try {
      const result = await SpeechRecognition.start({
        language: navigator.language || 'en-US',
        partialResults: true,
        popup: false,
        addPunctuation: true,
      });
      const final = result.matches?.[0];
      if (final) this.latest = final;
    } catch (error) {
      handlers.onError(error instanceof Error ? error.message : String(error));
      await this.finish(handlers);
    }
  }

  async stop(): Promise<void> {
    if (!this.active) return;
    await SpeechRecognition.stop().catch(() => undefined);
  }

  private async finish(handlers: VoiceHandlers): Promise<void> {
    if (!this.active) return;
    this.active = false;
    const handles = this.handles;
    this.handles = [];
    await Promise.all(handles.map((h) => h.remove()));
    handlers.onEnd(this.latest.trim());
  }
}
