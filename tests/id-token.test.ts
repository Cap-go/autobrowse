import { describe, expect, test } from 'bun:test';
import { OAUTH_ISSUER } from '../src/config';
import { JwksUnavailableError, verifyIdToken } from '../src/auth/id-token';
import { base64UrlEncode } from '../src/auth/pkce';

function encodePart(value: unknown): string {
  const json = JSON.stringify(value);
  return base64UrlEncode(new TextEncoder().encode(json));
}

async function createSignedIdToken(
  claims: Record<string, unknown>,
  privateKey: CryptoKey,
  header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT', kid: 'test-key' },
): Promise<string> {
  const encodedHeader = encodePart(header);
  const encodedPayload = encodePart(claims);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  return `${signingInput}.${encodedSignature}`;
}

describe('verifyIdToken', () => {
  test('accepts a valid RS256 token', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );

    const clientId = 'oaiapp_test_client';
    const token = await createSignedIdToken(
      {
        iss: OAUTH_ISSUER,
        sub: 'user-123',
        aud: clientId,
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce: 'nonce-abc',
        email: 'user@example.com',
      },
      keyPair.privateKey,
    );

    const claims = await verifyIdToken(token, {
      clientId,
      nonce: 'nonce-abc',
      verificationKeyResolver: async () => keyPair.publicKey,
    });

    expect(claims.sub).toBe('user-123');
    expect(claims.email).toBe('user@example.com');
  });

  test('rejects invalid signatures', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );

    const otherPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );

    const token = await createSignedIdToken(
      {
        iss: OAUTH_ISSUER,
        sub: 'user-123',
        aud: 'oaiapp_test_client',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      keyPair.privateKey,
    );

    await expect(
      verifyIdToken(token, {
        clientId: 'oaiapp_test_client',
        verificationKeyResolver: async () => otherPair.publicKey,
      }),
    ).rejects.toThrow('signature');
  });
});

describe('verifyIdToken JWKS fallback', () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const token = [
    encodePart({ alg: 'RS256', kid: 'k1' }),
    encodePart({ iss: 'https://auth.openai.com', aud: 'client', exp: nowSec + 60, sub: 'u' }),
    'c2ln',
  ].join('.');
  const unavailable = async (): Promise<CryptoKey> => {
    throw new JwksUnavailableError('down');
  };

  test('skips signature only when allowed and JWKS is unavailable', async () => {
    const claims = await verifyIdToken(token, {
      clientId: 'client',
      verificationKeyResolver: unavailable,
      allowUnverifiedIfJwksUnavailable: true,
    });
    expect(claims.sub).toBe('u');
  });

  test('still fails when fallback is not allowed', async () => {
    expect(verifyIdToken(token, { clientId: 'client', verificationKeyResolver: unavailable })).rejects.toThrow();
  });
});
