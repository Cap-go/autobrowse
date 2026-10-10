import { Capacitor, CapacitorHttp } from '@capacitor/core';

export interface AuthHttpResponse {
  status: number;
  ok: boolean;
  text: string;
}

/**
 * Auth endpoints (token, JWKS) are not reliably reachable from the WebView:
 * CORS and Cloudflare challenges reject `capacitor://localhost`. On native
 * the request goes through the OS HTTP stack instead.
 */
export async function authRequest(
  url: string,
  init: { method?: 'GET' | 'POST'; form?: URLSearchParams } = {},
): Promise<AuthHttpResponse> {
  const method = init.method ?? (init.form ? 'POST' : 'GET');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      url,
      method,
      headers,
      data: init.form ? Object.fromEntries(init.form) : undefined,
      responseType: 'text',
    });
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
    return { status: res.status, ok: res.status >= 200 && res.status < 300, text };
  }

  const res = await fetch(url, { method, headers, body: init.form });
  return { status: res.status, ok: res.ok, text: await res.text() };
}
