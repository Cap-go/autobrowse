import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';

export interface VoiceHandlers {
  onPartial: (text: string) => void;
  onLevel?: (level: number) => void;
  onEnd: (finalText: string) => void;
  onError: (message: string) => void;
}

/** Stop after this much silence once something was said. */
const SILENCE_MS = 1_500;
/** Hard cap for one dictation. */
const MAX_MS = 45_000;

/**
 * Tap-to-talk dictation with live partial results.
 *
 * ChatGPT plan tokens cannot call OpenAI transcription (not supported by Sign
 * in with ChatGPT), so this uses the platform recognizer (Apple Speech /
 * Android SpeechRecognizer). iOS never stops on its own, so silence is
 * detected here.
 */
export class VoiceInput {
  private handles: PluginListenerHandle[] = [];
  private latest = '';
  private active = false;
  private silenceTimer: ReturnType<typeof setTimeout> | undefined;
  private maxTimer: ReturnType<typeof setTimeout> | undefined;
  private handlers: VoiceHandlers | null = null;

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
      throw new Error('Allow microphone and speech recognition for Auto Browse in Settings to use voice.');
    }

    // A previous session may still be alive (e.g. after an error): clear it.
    await SpeechRecognition.forceStop().catch(() => undefined);

    this.latest = '';
    this.active = true;
    this.handlers = handlers;
    this.handles.push(
      await SpeechRecognition.addListener('partialResults', (event) => {
        const text = event.accumulated ?? event.matches?.[0] ?? '';
        if (!text) return;
        this.latest = text;
        handlers.onPartial(text);
        this.armSilenceTimer();
      }),
      await SpeechRecognition.addListener('audioLevel', (event) => handlers.onLevel?.(event.level)),
      await SpeechRecognition.addListener('listeningState', (event) => {
        if (event.state === 'stopped') void this.finish();
      }),
      await SpeechRecognition.addListener('error', (event) => {
        if (!this.latest) handlers.onError(event.message || 'Voice input failed');
        void this.finish();
      }),
    );
    this.maxTimer = setTimeout(() => void this.stop(), MAX_MS);

    try {
      const language = navigator.language || 'en-US';
      // Keep audio on the phone when the recognizer supports this language
      // offline; otherwise the platform service is used (see Privacy Policy).
      const onDevice = await SpeechRecognition.isOnDeviceRecognitionAvailable?.({ language, preferLegacyRecognizer: true })
        .then((r) => r.available)
        .catch(() => false);
      const result = await SpeechRecognition.start({
        language,
        partialResults: true,
        popup: false,
        addPunctuation: true,
        ...(onDevice ? { useOnDeviceRecognition: true, preferLegacyRecognizer: true } : {}),
      });
      // Android resolves start() without a payload when partialResults is on.
      const final = result?.matches?.[0];
      if (final) this.latest = final;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!this.latest) handlers.onError(message);
      await this.finish();
    }
  }

  /** Stop listening and deliver what was heard. */
  async stop(): Promise<void> {
    if (!this.active) return;
    await SpeechRecognition.stop().catch(() => undefined);
    // Some platforms do not emit "stopped" after a manual stop.
    setTimeout(() => void this.finish(), 400);
  }

  private armSilenceTimer(): void {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => void this.stop(), SILENCE_MS);
  }

  private async finish(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.silenceTimer);
    clearTimeout(this.maxTimer);
    const handles = this.handles;
    this.handles = [];
    await Promise.all(handles.map((h) => h.remove()));
    await SpeechRecognition.forceStop().catch(() => undefined);
    const handlers = this.handlers;
    this.handlers = null;
    handlers?.onEnd(this.latest.trim());
  }
}
