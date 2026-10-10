import {
  AGENT_NAME_HINT,
  OAUTH_AUTHORIZE_URL,
  OAUTH_CALLBACK_PATH,
  OAUTH_COMPLETION_URI,
  OAUTH_DYNAMIC_CLIENT_ID,
  OAUTH_RESOURCE,
  OAUTH_SCOPES,
  OAUTH_TOKEN_URL,
} from '../config';
import { OAuthLoopback } from '@capgo/oauth-loopback';
import { InAppBrowser } from '@capgo/capacitor-inappbrowser';
import { Capacitor } from '@capacitor/core';
import { createOAuthNonce, createOAuthState, createPkcePair } from './pkce';
import type {
  OAuthCallbackParams,
  OAuthCredentialRecord,
  PendingOAuthAttempt,
  TokenResponse,
} from './types';
import { getOrCreateExtAgentHostId } from './host-id';
import { verifyIdToken } from './id-token';
import { decodeJwtPart } from './jwt-encoding';
import { saveCredentials, setActiveClientId } from './token-store';

export function buildAuthorizeUrl(
  attempt: PendingOAuthAttemptInternal,
  options?: { idTokenHint?: string; loginHint?: string },
): string {
  const params = new URLSearchParams();
  params.set('client_id', attempt.clientId);
  params.set('response_type', 'code');
  params.set('redirect_uri', attempt.redirectUri);
  params.set('scope', OAUTH_SCOPES);
  params.set('resource', OAUTH_RESOURCE);
  params.set('state', attempt.state);
  params.set('nonce', attempt.nonce);
  params.set('code_challenge_method', 'S256');
  params.set('code_challenge', attempt.codeChallenge);
  params.set('ext_agent_host_id', attempt.extAgentHostId);

  if (attempt.isRegistration) {
    params.set('agent_name_hint', AGENT_NAME_HINT);
  }
  if (options?.idTokenHint) {
    params.set('id_token_hint', options.idTokenHint);
  }
  if (options?.loginHint) {
    params.set('login_hint', options.loginHint);
  }

  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export type PendingOAuthAttemptInternal = PendingOAuthAttempt & {
  codeChallenge: string;
  loopbackSessionId: string;
};

export async function beginOAuthAttempt(
  savedClientId?: string | null,
): Promise<PendingOAuthAttemptInternal> {
  const extAgentHostId = await getOrCreateExtAgentHostId();
  const { verifier, challenge } = await createPkcePair();
  const isRegistration = !savedClientId;
  const clientId = savedClientId ?? OAUTH_DYNAMIC_CLIENT_ID;

  const loopback = await OAuthLoopback.start({
    path: OAUTH_CALLBACK_PATH,
    completionUri: Capacitor.isNativePlatform() ? OAUTH_COMPLETION_URI : undefined,
  });
  const redirectUri = loopback.redirectUri;

  return {
    state: createOAuthState(),
    nonce: createOAuthNonce(),
    codeVerifier: verifier,
    codeChallenge: challenge,
    redirectUri,
    clientId,
    extAgentHostId,
    isRegistration,
    loopbackSessionId: loopback.sessionId,
  };
}

export async function runAuthorizationInBrowser(
  attempt: PendingOAuthAttemptInternal,
  authorizeUrl: string,
): Promise<OAuthCallbackParams> {
  if (Capacitor.getPlatform() === 'web') {
    return runWebLoopbackAuth(attempt, authorizeUrl);
  }

  let sessionError: unknown;
  try {
    // OpenAI redirects to the http loopback; our server captures the code and
    // 302s to OAUTH_COMPLETION_URI, which closes the auth session.
    await InAppBrowser.openSecureWindow({
      authEndpoint: authorizeUrl,
      redirectUri: OAUTH_COMPLETION_URI,
      prefersEphemeralWebBrowserSession: false,
    });
  } catch (error) {
    sessionError = error;
  }

  // The code always arrives through the loopback server, even if the user
  // closed the sheet by hand after the redirect.
  try {
    const callback = await OAuthLoopback.waitForCallback({
      sessionId: attempt.loopbackSessionId,
      timeoutMs: sessionError ? 1_500 : 10_000,
    });
    if (callback.code || callback.error) {
      return callback;
    }
  } catch {
    /* timed out: no callback received */
  }
  await OAuthLoopback.stop({ sessionId: attempt.loopbackSessionId }).catch(() => undefined);
  throw new Error('Sign in was cancelled');
}

async function runWebLoopbackAuth(
  attempt: PendingOAuthAttemptInternal,
  authorizeUrl: string,
): Promise<OAuthCallbackParams> {
  const callback = await OAuthLoopback.waitForCallback({
    sessionId: attempt.loopbackSessionId,
    timeoutMs: 300_000,
  });

  if (callback.code || callback.error) {
    return callback;
  }

  window.open(authorizeUrl, '_blank', 'noopener,noreferrer');
  return OAuthLoopback.waitForCallback({
    sessionId: attempt.loopbackSessionId,
    timeoutMs: 300_000,
  });
}

export function parseRedirectUri(redirectedUri: string): OAuthCallbackParams {
  const url = new URL(redirectedUri);
  const query = url.searchParams;
  return {
    code: query.get('code') ?? undefined,
    state: query.get('state') ?? undefined,
    clientId: query.get('client_id') ?? undefined,
    error: query.get('error') ?? undefined,
    errorDescription: query.get('error_description') ?? undefined,
  };
}

export function validateCallback(
  attempt: PendingOAuthAttempt,
  params: OAuthCallbackParams,
): { code: string; issuedClientId: string } {
  if (params.error) {
    throw new Error(params.errorDescription ?? params.error);
  }
  if (!params.state || params.state !== attempt.state) {
    throw new Error('OAuth state mismatch');
  }
  if (!params.code) {
    throw new Error('OAuth callback missing code');
  }

  let issuedClientId = attempt.clientId;
  if (attempt.isRegistration) {
    if (!params.clientId || params.clientId === OAUTH_DYNAMIC_CLIENT_ID) {
      throw new Error('Registration did not return an issued client_id');
    }
    issuedClientId = params.clientId;
  } else if (params.clientId && params.clientId !== attempt.clientId) {
    throw new Error('Unexpected client_id in callback');
  }

  return { code: params.code, issuedClientId };
}

export async function exchangeAuthorizationCode(
  attempt: PendingOAuthAttempt,
  code: string,
  clientId: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', clientId);
  body.set('code', code);
  body.set('code_verifier', attempt.codeVerifier);
  body.set('redirect_uri', attempt.redirectUri);
  body.set('resource', OAUTH_RESOURCE);

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return (await res.json()) as TokenResponse;
}

export async function credentialFromTokenResponse(
  token: TokenResponse,
  meta: {
    clientId: string;
    extAgentHostId: string;
    nonce: string;
  },
): Promise<OAuthCredentialRecord> {
  const scopes = (token.scope ?? '').split(/\s+/).filter(Boolean);
  if (!scopes.includes('chatgpt.tokens.use.direct')) {
    throw new Error('ChatGPT plan usage scope was not granted');
  }

  const payload = await verifyIdToken(token.id_token, {
    clientId: meta.clientId,
    nonce: meta.nonce || undefined,
  });

  const now = Date.now();
  return {
    email: typeof payload.email === 'string' ? payload.email : '',
    issuer: typeof payload.iss === 'string' ? payload.iss : '',
    subject: typeof payload.sub === 'string' ? payload.sub : '',
    clientId: meta.clientId,
    extAgentHostId: meta.extAgentHostId,
    idToken: token.id_token,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? '',
    tokenType: token.token_type,
    expiresAtMs: now + token.expires_in * 1000,
    scopes,
    savedAtMs: now,
  };
}

export function parseJwtPayload(idToken: string): Record<string, unknown> {
  const parts = idToken.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid id_token');
  }
  return decodeJwtPart<Record<string, unknown>>(parts[1]);
}

export async function refreshAccessToken(
  record: OAuthCredentialRecord,
): Promise<OAuthCredentialRecord> {
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('client_id', record.clientId);
  body.set('refresh_token', record.refreshToken);
  body.set('resource', OAUTH_RESOURCE);

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const token = (await res.json()) as TokenResponse;
  const updated = await credentialFromTokenResponse(token, {
    clientId: record.clientId,
    extAgentHostId: record.extAgentHostId,
    nonce: '',
  });
  updated.email = record.email;
  updated.subject = record.subject;
  await saveCredentials(updated);
  await setActiveClientId(updated.clientId);
  return updated;
}

export async function completeSignIn(savedClientId?: string | null): Promise<OAuthCredentialRecord> {
  const attempt = await beginOAuthAttempt(savedClientId);
  try {
    const authorizeUrl = buildAuthorizeUrl(attempt);
    const callback = await runAuthorizationInBrowser(attempt, authorizeUrl);
    const { code, issuedClientId } = validateCallback(attempt, callback);
    const token = await exchangeAuthorizationCode(attempt, code, issuedClientId);
    const record = await credentialFromTokenResponse(token, {
      clientId: issuedClientId,
      extAgentHostId: attempt.extAgentHostId,
      nonce: attempt.nonce,
    });
    await saveCredentials(record);
    await setActiveClientId(record.clientId);
    return record;
  } finally {
    await OAuthLoopback.stop({ sessionId: attempt.loopbackSessionId }).catch(() => undefined);
  }
}
