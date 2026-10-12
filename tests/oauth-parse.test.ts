import { describe, expect, test } from 'bun:test';
import { isOAuthRedirect, parseRedirectUri, validateCallback } from '../src/auth/oauth';

describe('oauth callback parsing', () => {
  test('blocked redirects must match the exact callback origin and path', () => {
    const redirect = 'http://127.0.0.1:1455/auth/callback';
    expect(isOAuthRedirect(`${redirect}?code=abc&state=s1`, redirect)).toBe(true);
    for (const url of [
      `${redirect}/evil?code=abc`,
      'http://127.0.0.1:1456/auth/callback?code=abc',
      'https://127.0.0.1:1455/auth/callback?code=abc',
      'http://127.0.0.1.evil.com:1455/auth/callback?code=abc',
      'invalid',
    ]) expect(isOAuthRedirect(url, redirect)).toBe(false);
  });
  test('parseRedirectUri reads query params', () => {
    const params = parseRedirectUri(
      'http://127.0.0.1:1455/auth/callback?code=abc&state=s1&client_id=oaiapp_test',
    );
    expect(params.code).toBe('abc');
    expect(params.state).toBe('s1');
    expect(params.clientId).toBe('oaiapp_test');
  });

  test('validateCallback enforces state and issued client id on registration', () => {
    const attempt = {
      state: 's1',
      nonce: 'n1',
      codeVerifier: 'v',
      redirectUri: 'http://127.0.0.1:1455/auth/callback',
      clientId: 'dynamic_agent_client',
      extAgentHostId: 'urn:uuid:1',
      isRegistration: true,
    };
    const result = validateCallback(attempt, {
      code: 'code123',
      state: 's1',
      clientId: 'oaiapp_abc',
    });
    expect(result.issuedClientId).toBe('oaiapp_abc');
  });
});
