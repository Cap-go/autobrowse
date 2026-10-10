import { describe, expect, test } from 'bun:test';
import { base64UrlEncode, createPkcePair, createOAuthState, sha256Base64Url } from '../src/auth/pkce';

describe('pkce', () => {
  test('createPkcePair produces verifier and S256 challenge', async () => {
    const { verifier, challenge } = await createPkcePair();
    expect(verifier.length).toBeGreaterThan(40);
    const expected = await sha256Base64Url(verifier);
    expect(challenge).toBe(expected);
    expect(challenge).not.toContain('=');
    expect(challenge).not.toContain('+');
  });

  test('state is random', () => {
    expect(createOAuthState()).not.toBe(createOAuthState());
  });

  test('base64url encoding strips padding', () => {
    const encoded = base64UrlEncode(new Uint8Array([0, 1, 2]));
    expect(encoded.endsWith('=')).toBe(false);
  });
});
