export interface OAuthCredentialRecord {
  email: string;
  issuer: string;
  subject: string;
  clientId: string;
  extAgentHostId: string;
  idToken: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAtMs: number;
  scopes: string[];
  savedAtMs: number;
}

export interface PendingOAuthAttempt {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  extAgentHostId: string;
  isRegistration: boolean;
}

export interface OAuthCallbackParams {
  code?: string;
  state?: string;
  clientId?: string;
  error?: string;
  errorDescription?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}
