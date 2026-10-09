// Private terminal input with bracketed-paste support. Never echo the value.
export function readSecret(prompt, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY) throw new Error('Start in an interactive terminal.');
  return new Promise((resolve, reject) => {
    let value = '', pending = '', pasting = false;
    const wasRaw = Boolean(input.isRaw);
    const render = () => output.write(`\r\u001b[2K${prompt}${value ? '•••• (input present)' : ''}`);
    function done(error) {
      input.removeListener('data', onData);
      input.removeListener('end', onEnd);
      input.setRawMode(wasRaw);
      input.pause();
      output.write('\u001b[?2004l\n');
      const secret = value.trim();
      if (error) reject(error);
      else if (/[\r\n]/.test(secret)) reject(new Error('Paste only one password or API key.'));
      else resolve(secret);
    }
    function onEnd() { done(new Error('Input ended. Restart setup.')); }
    function onData(chunk) {
      pending += chunk;
      while (pending) {
        if (pending.startsWith('\u001b')) {
          const markers = ['\u001b[200~', '\u001b[201~'];
          if (markers.some(marker => marker.startsWith(pending))) break;
          const marker = markers.find(marker => pending.startsWith(marker));
          if (!marker) { done(new Error('Unsupported key sequence. Restart and paste with Command-V.')); return; }
          pasting = marker === markers[0];
          pending = pending.slice(marker.length);
          continue;
        }
        const c = String.fromCodePoint(pending.codePointAt(0));
        pending = pending.slice(c.length);
        if (c === '\u0003') { done(new Error('Cancelled.')); return; }
        if (!pasting && (c === '\r' || c === '\n')) { done(); return; }
        if (!pasting && (c === '\u007f' || c === '\b')) value = [...value].slice(0, -1).join('');
        else if (c >= ' ' || (pasting && (c === '\r' || c === '\n'))) value += c;
        if (value.length > 8192) { done(new Error('Input too long.')); return; }
      }
      render();
    }
    input.setEncoding('utf8');
    input.on('data', onData);
    input.on('end', onEnd);
    input.setRawMode(true);
    output.write('\u001b[?2004h');
    render();
    input.resume();
  });
}
