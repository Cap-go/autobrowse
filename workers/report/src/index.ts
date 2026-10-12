interface Env {
  EMAIL: SendEmail;
  LIMITER: RateLimit;
}

const TO = 'tori@capgo.app';
const FROM = { email: 'autobrowse-reports@capgo.app', name: 'Auto Browse reports' };
const REASONS = ['offensive', 'harmful', 'wrong', 'other'] as const;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/report') return json({ error: 'not_found' }, 404);

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.LIMITER.limit({ key: ip });
    if (!success) return json({ error: 'rate_limited' }, 429);

    const raw = await request.text();
    if (raw.length > 40_000) return json({ error: 'too_large' }, 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    const reason = REASONS.find((r) => r === body.reason) ?? 'other';
    const report = {
      reason,
      note: clip(body.note, 1_000),
      answer: clip(body.answer, 12_000),
      prompt: clip(body.prompt, 4_000),
      pageUrl: clip(body.pageUrl, 500),
      appVersion: clip(body.appVersion, 40),
      platform: clip(body.platform, 20),
    };
    if (!report.answer) return json({ error: 'missing_answer' }, 400);

    const text = [
      `Reason: ${report.reason}`,
      `Note: ${report.note || '-'}`,
      `Platform: ${report.platform || '-'} · App ${report.appVersion || '-'}`,
      `Page: ${report.pageUrl || '-'}`,
      '',
      'User request:',
      report.prompt || '-',
      '',
      'Reported AI answer:',
      report.answer,
    ].join('\n');

    try {
      await env.EMAIL.send({
        to: TO,
        from: FROM,
        subject: `[Auto Browse] AI answer reported: ${report.reason}`,
        text,
      });
    } catch (error) {
      console.error('report email failed', (error as { code?: string }).code, (error as Error).message);
      return json({ error: 'send_failed' }, 502);
    }
    return json({ ok: true });
  },
};
