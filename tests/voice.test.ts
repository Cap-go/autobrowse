import { expect, mock, test } from 'bun:test';

const listeners = new Map<string, (event: unknown) => void>();
const recognition = {
  available: async () => ({ available: true }),
  checkPermissions: async () => ({ speechRecognition: 'granted' }),
  forceStop: async () => {},
  start: async () => undefined,
  stop: async () => {},
  addListener: async (name: string, listener: (event: unknown) => void) => {
    listeners.set(name, listener);
    return { remove: async () => { listeners.delete(name); } };
  },
};
mock.module('@capgo/capacitor-speech-recognition', () => ({ SpeechRecognition: recognition }));
const { VoiceInput } = await import('../src/ui/voice');

test('Android payload-free start keeps dictation alive for partial results', async () => {
  const voice = new VoiceInput();
  const partial = mock(() => {});
  const end = mock(() => {});
  const error = mock(() => {});
  await voice.start({ onPartial: partial, onEnd: end, onError: error });
  const listeningAfterStart = voice.listening;
  listeners.get('partialResults')?.({ matches: ['Hello Android'] });
  listeners.get('listeningState')?.({ state: 'stopped' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(listeningAfterStart).toBe(true);
  expect(partial).toHaveBeenCalledWith('Hello Android');
  expect(end).toHaveBeenCalledWith('Hello Android');
  expect(error).not.toHaveBeenCalled();
  expect(voice.listening).toBe(false);
  expect(listeners.size).toBe(0);
});
