import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { REPORT_URL } from '../config';

export interface AnswerReport {
  reason: string;
  note: string;
  answer: string;
  prompt: string;
  pageUrl: string;
}

/** Send a report about an AI answer to the team (workers/report emails it). */
export async function sendReport(report: AnswerReport): Promise<void> {
  const body = {
    ...report,
    answer: report.answer.slice(0, 12_000),
    prompt: report.prompt.slice(0, 4_000),
    platform: Capacitor.getPlatform(),
    appVersion: __APP_VERSION__,
  };
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.post({ url: REPORT_URL, headers: { 'Content-Type': 'application/json' }, data: body });
    if (res.status < 200 || res.status >= 300) throw new Error(`report failed (${res.status})`);
    return;
  }
  const res = await fetch(REPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`report failed (${res.status})`);
}
