export interface OAuthLoopbackStartOptions {
  /** Callback path, for example `/auth/callback`. */
  path: string;
  /** Optional fixed port. When omitted the native layer picks a free port. */
  port?: number;
  /**
   * After a valid callback the loopback server answers with a 302 to this URI
   * (an app scheme), so the system auth session closes on its own.
   */
  completionUri?: string;
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
