import { OAUTH_ISSUER, OAUTH_JWKS_URL } from '../config';
import { base64UrlToBytes, decodeJwtPart } from './jwt-encoding';

interface JwkRsa {
  kty: 'RSA';
  kid?: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
}

interface JwksResponse {
  keys: JwkRsa[];
}

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

interface IdTokenClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nonce?: string;
  email?: string;
}

const JWKS_TTL_MS = 60 * 60 * 1000;
let cachedJwks: { fetchedAtMs: number; keys: JwkRsa[] } | null = null;

async function fetchJwks(force = false): Promise<JwkRsa[]> {
  const now = Date.now();
  if (!force && cachedJwks && now - cachedJwks.fetchedAtMs < JWKS_TTL_MS) {
    return cachedJwks.keys;
  }
  const res = await fetch(OAUTH_JWKS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS (${res.status})`);
  }
  const body = (await res.json()) as JwksResponse;
  const keys = body.keys ?? [];
  cachedJwks = { fetchedAtMs: now, keys };
  return keys;
}

async function importRsaKey(jwk: JwkRsa): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'RSA',
      n: jwk.n,
      e: jwk.e,
      alg: 'RS256',
      ext: true,
    },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

async function resolveVerificationKey(header: JwtHeader): Promise<CryptoKey> {
  if (header.alg !== 'RS256') {
    throw new Error(`Unsupported ID token alg: ${header.alg}`);
  }
  let keys = await fetchJwks();
  let jwk = keys.find((k) => k.kid && k.kid === header.kid);
  if (!jwk && header.kid) {
    keys = await fetchJwks(true);
    jwk = keys.find((k) => k.kid && k.kid === header.kid);
  }
  if (!jwk) {
    jwk = keys.find((k) => k.kty === 'RSA' && (k.use === 'sig' || !k.use));
  }
  if (!jwk) {
    throw new Error('No matching JWKS key for ID token');
  }
  return importRsaKey(jwk);
}

function audienceMatches(aud: string | string[] | undefined, clientId: string): boolean {
  if (!aud) {
    return false;
  }
  if (Array.isArray(aud)) {
    return aud.includes(clientId);
  }
  return aud === clientId;
}

export interface VerifyIdTokenOptions {
  clientId: string;
  nonce?: string;
  issuer?: string;
  jwksFetcher?: () => Promise<JwkRsa[]>;
  verificationKeyResolver?: (header: JwtHeader) => Promise<CryptoKey>;
}

export async function verifyIdToken(
  idToken: string,
  options: VerifyIdTokenOptions,
): Promise<IdTokenClaims> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid id_token format');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart<JwtHeader>(encodedHeader);
  const payload = decodeJwtPart<IdTokenClaims>(encodedPayload);

  const key = options.verificationKeyResolver
    ? await options.verificationKeyResolver(header)
    : await resolveVerificationKey(header);

  const signedData = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signatureBytes = base64UrlToBytes(encodedSignature);
  const signature = new Uint8Array(signatureBytes);
  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    signature,
    signedData,
  );
  if (!valid) {
    throw new Error('ID token signature verification failed');
  }

  const issuer = options.issuer ?? OAUTH_ISSUER;
  if (payload.iss !== issuer) {
    throw new Error('ID token issuer mismatch');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error('ID token is expired');
  }

  if (!audienceMatches(payload.aud, options.clientId)) {
    throw new Error('ID token audience mismatch');
  }

  if (options.nonce && payload.nonce && payload.nonce !== options.nonce) {
    throw new Error('ID token nonce mismatch');
  }

  return payload;
}

export type { IdTokenClaims, JwkRsa };
