import { EventEmitter } from 'node:events';
import { expect, it } from 'vitest';
import { readSecret } from '../chatgpt/secret-input.mjs';

function terminal() {
  const input = new EventEmitter();
  Object.assign(input, { isTTY: true, isRaw: false, setEncoding() {}, resume() {}, pause() {}, setRawMode(v) { this.isRaw = v; } });
  let displayed = '';
  const promise = readSecret('Secret: ', { input, output: { write(s) { displayed += s; } } });
  return { input, promise, displayed: () => displayed };
}

it('accepts ordinary paste without exposing it', async () => {
  const t = terminal();
  t.input.emit('data', 'synthetic-test-key');
  expect(t.displayed()).toContain('input present');
  expect(t.displayed()).not.toContain('synthetic-test-key');
  t.input.emit('data', '\r');
  expect(await t.promise).toBe('synthetic-test-key');
  expect(t.input.isRaw).toBe(false);
  expect(t.input.listenerCount('data')).toBe(0);
});
it('handles bracketed paste markers split across data chunks', async () => {
  const t = terminal();
  for (const chunk of ['\u001b[2', '00~fake-', 'key\n\u001b[20', '1~']) t.input.emit('data', chunk);
  expect(t.input.isRaw).toBe(true); // A pasted trailing newline must not submit.
  t.input.emit('data', '\r');
  expect(await t.promise).toBe('fake-key');
  expect(t.displayed()).not.toContain('fake-key');
});
it('supports backspace and empty input for retaining an existing secret', async () => {
  const t = terminal();
  t.input.emit('data', 'x\u007f\r');
  expect(await t.promise).toBe('');
});
it('restores the terminal after cancellation', async () => {
  const t = terminal();
  const rejected = expect(t.promise).rejects.toThrow('Cancelled');
  t.input.emit('data', '\u0003');
  await rejected;
  expect(t.input.isRaw).toBe(false);
  expect(t.displayed()).toContain('\u001b[?2004l');
});
it('rejects multiple pasted lines without revealing them', async () => {
  const t = terminal();
  const rejected = expect(t.promise).rejects.toThrow('only one');
  t.input.emit('data', '\u001b[200~one\ntwo\u001b[201~\r');
  await rejected;
  expect(t.displayed()).not.toContain('one');
});
it('rejects unsupported escape sequences instead of corrupting the secret', async () => {
  const t = terminal();
  const rejected = expect(t.promise).rejects.toThrow('key sequence');
  t.input.emit('data', '\u001b[A');
  await rejected;
  expect(t.input.isRaw).toBe(false);
});
