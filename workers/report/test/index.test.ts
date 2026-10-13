import { expect, mock, test } from 'bun:test';
import worker from '../src/index';

function bindings(allowed = true) {
  return {
    EMAIL: { send: mock(async () => ({ messageId: 'test-message' })) },
    LIMITER: { limit: mock(async () => ({ success: allowed })) },
  };
}

function request(body: string) {
  return new Request('https://autobrowse-report.digitalshift-ee.workers.dev/report', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  });
}

test('invalid JSON shapes return 400 without sending email', async () => {
  for (const body of ['null', '[]', 'true', '42', '"answer"', '{']) {
    const env = bindings();
    const response = await worker.fetch(request(body), env);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_json' });
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  }
});

test('report submission waits for email acceptance', async () => {
  const env = bindings();
  const response = await worker.fetch(request(JSON.stringify({ reason: 'offensive', answer: 'Test answer' })), env);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(env.EMAIL.send).toHaveBeenCalledWith(expect.objectContaining({
    to: 'tori@capgo.app', subject: '[Auto Browse] AI answer reported: offensive',
    text: expect.stringContaining('Test answer'),
  }));
});

test('failed email and rate limiting never report success', async () => {
  const env = bindings();
  env.EMAIL.send.mockRejectedValueOnce(new Error('Delivery unavailable'));
  const response = await worker.fetch(request('{"answer":"Test answer"}'), env);
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: 'send_failed' });
  const limited = bindings(false);
  expect((await worker.fetch(request('{"answer":"Test answer"}'), limited)).status).toBe(429);
  expect(limited.EMAIL.send).not.toHaveBeenCalled();
});
