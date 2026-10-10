export interface OAuthLoopbackStartOptions {
  /** Callback path, for example `/auth/callback`. */
  path: string;
  /** Optional fixed port. When omitted the native layer picks a free port. */
  port?: number;
}

export interface OAuthLoopbackStartResult {
  sessionId: string;
  redirectUri: string;
  port: number;
}

export interface OAuthLoopbackWaitOptions {
  sessionId: string;
  timeoutMs: number;
}

export interface OAuthLoopbackCallbackResult {
  code?: string;
  state?: string;
  clientId?: string;
  error?: string;
  errorDescription?: string;
}

export interface OAuthLoopbackStopOptions {
  sessionId: string;
}

export interface OAuthLoopbackPlugin {
  start(options: OAuthLoopbackStartOptions): Promise<OAuthLoopbackStartResult>;
  waitForCallback(options: OAuthLoopbackWaitOptions): Promise<OAuthLoopbackCallbackResult>;
  stop(options: OAuthLoopbackStopOptions): Promise<void>;
}
