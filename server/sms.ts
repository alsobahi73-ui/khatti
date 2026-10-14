import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
export interface SmsSender { mode: 'test' | 'live'; send(input: { challengeId: string; phone: string; code: string }): Promise<void> }
export function testSms(directory: string): SmsSender {
 return { mode: 'test', async send({ challengeId, code }) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // Test-only private inbox, never served by HTTP and never logs phone numbers or codes.
  await writeFile(path.join(directory, challengeId + '.json'), JSON.stringify({ code, notice: 'LOCAL TEST ONLY — NO SMS SENT' }), { mode: 0o600 });
 } };
}
