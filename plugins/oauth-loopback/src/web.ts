import { WebPlugin } from '@capacitor/core';
import type {
  OAuthLoopbackCallbackResult,
  OAuthLoopbackPlugin,
  OAuthLoopbackStartOptions,
  OAuthLoopbackStartResult,
  OAuthLoopbackStopOptions,
  OAuthLoopbackWaitOptions,
} from './definitions';

type Session = {
  channelName: string;
  redirectUri: string;
  port: number;
};

const sessions = new Map<string, Session>();

function parseRedirect(redirectedUri: string): OAuthLoopbackCallbackResult {
  const url = new URL(redirectedUri);
  const q = url.searchParams;
  return {
    code: q.get('code') ?? undefined,
    state: q.get('state') ?? undefined,
    clientId: q.get('client_id') ?? undefined,
    error: q.get('error') ?? undefined,
    errorDescription: q.get('error_description') ?? undefined,
  };
}

export class OAuthLoopbackWeb extends WebPlugin implements OAuthLoopbackPlugin {
  async start(options: OAuthLoopbackStartOptions): Promise<OAuthLoopbackStartResult> {
    const sessionId = crypto.randomUUID();
    const port = options.port ?? 1455;
    const path = options.path.startsWith('/') ? options.path : `/${options.path}`;
    const redirectUri = `http://127.0.0.1:${port}${path}`;
    const channelName = `capgo-oauth-${sessionId}`;
    sessions.set(sessionId, { channelName, redirectUri, port });
    return { sessionId, redirectUri, port };
  }

  async waitForCallback(options: OAuthLoopbackWaitOptions): Promise<OAuthLoopbackCallbackResult> {
    const session = sessions.get(options.sessionId);
    if (!session) {
      throw new Error('Unknown OAuth loopback session');
    }

    return new Promise((resolve, reject) => {
      const channel = new BroadcastChannel(session.channelName);
      const timer = window.setTimeout(() => {
        channel.close();
        reject(new Error('OAuth loopback timed out'));
      }, options.timeoutMs);

      channel.onmessage = (event: MessageEvent) => {
        const data = event.data as { redirectedUri?: string };
        if (!data?.redirectedUri) {
          return;
        }
        window.clearTimeout(timer);
        channel.close();
        resolve(parseRedirect(data.redirectedUri));
      };
    });
  }

  async stop(options: OAuthLoopbackStopOptions): Promise<void> {
    sessions.delete(options.sessionId);
  }
}

export default new OAuthLoopbackWeb();
