import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configPath, dataDir, validateConfig } from './config.mjs';
import { servicePaths } from './service-config.mjs';

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/** Read only the loopback operator surface. Never probe a guessed public URL. */
export async function checkTunnel({ tunnelId, healthFile, fetchImpl = fetch, timeoutMs = 5000 }) {
  let address;
  try { address = readFileSync(healthFile, 'utf8').trim(); }
  catch { throw new Error('CloudGPT läuft noch nicht. Öffne Start.command und danach Connect ChatGPT.command.'); }
  const match = /^http:\/\/127\.0\.0\.1:(\d{1,5})$/.exec(address);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) throw new Error('Ungültige lokale Statusadresse. Öffne Diagnose.command.');
  try {
    const options = () => ({ redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    const ready = await fetchImpl(`${address}/readyz`, options());
    if (!ready.ok) throw new Error();
    const response = await fetchImpl(`${address}/api/status`, options());
    if (!response.ok) throw new Error();
    const status = await response.json();
    if (status.control_plane_tunnel_id !== tunnelId) throw new Error('TUNNEL_MISMATCH');
  } catch (error) {
    if (error.message === 'TUNNEL_MISMATCH') throw new Error('Der laufende Tunnel passt nicht zu deinen Einstellungen. Öffne Restart.command und versuche es erneut.');
    throw new Error('Der Tunnel ist nicht bereit. Öffne Start.command; bei weiteren Fehlern Diagnose.command.');
  }
}

export function connectionHtml({ tunnelId, version, mode, checkedAt, archiveName }) {
  const id = escape(tunnelId);
  return `<!doctype html>
<html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>CloudGPT mit ChatGPT verbinden</title>
<style>
:root{color-scheme:light dark;font:17px/1.55 system-ui,sans-serif;background:#f4f5f7;color:#182434}body{max-width:760px;margin:52px auto;padding:0 24px 48px}h1{font-size:36px;line-height:1.15;letter-spacing:-1px;margin:12px 0 24px}h2{font-size:23px;margin:32px 0 12px}p{margin:12px 0}.meta{font-size:14px;color:#566375}.status{background:#e5f3e8;border-left:4px solid #278044;padding:16px 20px;border-radius:8px}.status p{margin:4px 0}.pending{font-size:15px;color:#465568}a{color:#1454ba}li{padding-left:6px;margin:0 0 22px}ol{padding-left:24px}button,.link{display:inline-block;font:inherit;font-weight:650;border:0;border-radius:7px;background:#174d9a;color:white;padding:10px 16px;cursor:pointer;text-decoration:none}input{box-sizing:border-box;width:100%;font:14px ui-monospace,monospace;border:1px solid #adb6c2;border-radius:6px;padding:12px;background:#fff;color:#182434;margin:10px 0}.hint{border-left:3px solid #d49426;padding-left:15px}.small{font-size:14px}details{border-top:1px solid #cbd2da;margin-top:25px;padding-top:18px}summary{cursor:pointer;font-weight:650}code{font-size:.9em;overflow-wrap:anywhere}.choice{display:inline-flex;gap:18px;background:#e9edf4;padding:8px 14px;border-radius:8px}.choice span{color:#6b7688}.choice strong{color:#174d9a}footer{margin-top:36px;font-size:13px;color:#566375}@media(prefers-color-scheme:dark){:root{background:#151b24;color:#e5eaf2}.meta,.pending,footer{color:#acb8ca}.status{background:#1b3228}.choice{background:#242f41}.choice strong,a{color:#9bc1ff}.choice span{color:#acb8ca}input{background:#202938;color:#e5eaf2;border-color:#516074}details{border-color:#516074}}
</style>
<p class="meta">CloudGPT ${escape(version)} · Zugriffsmodus: ${escape(mode)}</p>
<h1>CloudGPT mit ChatGPT verbinden</h1>
<div class="status"><strong>Der Mac-Dienst und dein Tunnel sind bereit.</strong><p class="meta">Geprüft: ${escape(checkedAt)}</p><p class="pending">Die Verbindung in deinem ChatGPT-Konto ist noch nicht geprüft.</p></div>
<h2>CloudGPT funktioniert bereits in ChatGPT?</h2>
<p>Öffne dein bestehendes CloudGPT-Plugin, aktualisiere die Verbindung mit »Refresh« bzw. »Aktualisieren« und beginne einen neuen Chat. Behalte die bestehende Verbindung bei Updates. Erscheint »Konnektor nicht gefunden« oder hast du die Verbindung gelöscht, lege sie unten neu an.</p>
<h2>Verbindung neu anlegen</h2>
<ol>
<li><a class="link" href="https://chatgpt.com/plugins" target="_blank" rel="noopener noreferrer">ChatGPT Plugins öffnen</a><p>Wähle das Plus und »Benutzerdefinierten MCP-Server hinzufügen«. Name: <strong>CloudGPT</strong>.</p></li>
<li><p>Unter »Verbindung« klicke ausdrücklich auf <strong>»Tunnel«</strong>.</p><div class="choice"><span>○ Server-URL</span><strong>◉ Tunnel</strong></div><p class="hint"><strong>Kontrolle: Das Eingabefeld muss jetzt »Tunnel-ID« heißen.</strong> Steht dort weiterhin »Server-URL«, ist der falsche Verbindungstyp aktiv. Aktiviere »Tunnel«, bevor du die ID einfügst.</p><label for="tunnel">Deine Tunnel-ID</label><input id="tunnel" readonly value="${id}"><button id="copy" type="button">Tunnel-ID kopieren</button> <span id="copied" role="status" class="small"></span><p>Füge die ID ein und wähle den gefundenen Tunnel. Warte, bis ChatGPT dessen Namen erkennt.</p></li>
<li><p>Wähle »Keine Authentifizierung«. Über »Plugin-Archiv hochladen« kannst du das <a href="${escape(archiveName)}" download>mitgelieferte CloudGPT-Archiv</a> für Logo und Anweisungen hinzufügen. Es enthält keine fremde Kontoverbindung.</p><p>Prüfe den Hinweis, bestätige deine eigene Verbindung und wähle »Als Plugin erstellen«. Installiere anschließend das erstellte Plugin für dein Konto.</p></li>
<li>Beginne einen neuen Chat, wähle CloudGPT über <strong>@</strong> und frage: <strong>»Liste meine Kalender auf.«</strong> Erst eine erfolgreiche Antwort bestätigt die Installation in ChatGPT. Stelle Schreibwerkzeuge auf Bestätigung.</li>
</ol>
<details><summary>Das Feld bleibt rot oder der Tunnel wird nicht gefunden</summary><p>Prüfe zuerst, ob das Feld wirklich »Tunnel-ID« heißt. Ein rotes URL-Feld mit <code>tunnel_…</code> zeigt, dass weiterhin »Server-URL« aktiv ist.</p><p>Wird der Tunnel auch im richtigen Feld nicht gefunden, prüfe dein ChatGPT-Konto und den gewählten Workspace. In den <a href="https://platform.openai.com/settings/organization/tunnels" target="_blank" rel="noopener noreferrer">OpenAI-Tunnel-Einstellungen</a> muss dieser Tunnel dem passenden Konto/Workspace zugeordnet sein. Dein Benutzer benötigt »Tunnels Read + Use«. Der lokale Bereitschaftstest kann diese ChatGPT-Berechtigung nicht bestätigen.</p><p>Die Tunnel-ID bleibt dieselbe. Eine selbst zusammengesetzte Tunnel-URL behebt diesen Fehler nicht. Ein Plugin-Archiv allein stellt ebenfalls keine Verbindung her.</p></details>
<details><summary>Was dieser Assistent prüft</summary><p>Er prüft die lokale Tunnel-Bereitschaft, vergleicht die laufende Tunnel-ID mit deiner Konfiguration und prüft die SHA-256-Summe des mitgelieferten Plugin-Archivs. Er liest keine Passwörter, ändert keine Berechtigungen und übernimmt keine alte App-ID. Die Einrichtung und der Test in ChatGPT bleiben ein eigener Schritt.</p><p>Diese Seite ist ein Prüfstand zum angegebenen Zeitpunkt. Für eine neue Prüfung öffne »Connect ChatGPT.command«. Dein Mac muss wach und online bleiben.</p></details>
<footer>Lokale Einrichtungsseite · <a href="https://developers.openai.com/plugins/deploy/connect-chatgpt" target="_blank" rel="noopener noreferrer">OpenAI-Anleitung</a></footer>
<script>
document.getElementById('copy').addEventListener('click', async () => {
  const input=document.getElementById('tunnel'), status=document.getElementById('copied');
  input.focus(); input.select();
  try { await navigator.clipboard.writeText(input.value); status.textContent='Kopiert.'; }
  catch { status.textContent='ID markiert. Bitte mit ⌘C kopieren.'; }
});
</script></html>`;
}

/** Generate a private, offline handoff. Readiness is not ChatGPT installation. */
export async function prepareConnection({ source, installedRuntime = servicePaths().runtime, configFile = configPath, healthFile = join(dataDir, 'health.url'), output = join(servicePaths().base, 'connection'), fetchImpl = fetch, now = new Date() }) {
  const cfg = validateConfig(JSON.parse(readFileSync(configFile, 'utf8')));
  const { version } = JSON.parse(readFileSync(join(source, 'plugin.json'), 'utf8'));
  let installedVersion;
  try { installedVersion = JSON.parse(readFileSync(join(installedRuntime, 'plugin.json'), 'utf8')).version; }
  catch { throw new Error('Der installierte CloudGPT-Dienst fehlt. Öffne Install CloudGPT.command.'); }
  if (version !== installedVersion) throw new Error('Das Paket passt nicht zum installierten CloudGPT-Dienst. Öffne zuerst Install CloudGPT.command aus diesem Paket.');
  const archive = readFileSync(join(source, 'chatgpt-plugin.zip'));
  const expected = readFileSync(join(source, 'chatgpt-plugin.zip.sha256'), 'utf8').trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(expected) || createHash('sha256').update(archive).digest('hex') !== expected) throw new Error('Das Plugin-Archiv ist beschädigt. Lade das vollständige CloudGPT-Release neu herunter.');
  await checkTunnel({ tunnelId: cfg.tunnelId, healthFile, fetchImpl });
  mkdirSync(output, { recursive: true, mode: 0o700 }); chmodSync(output, 0o700);
  const archiveName = 'CloudGPT Plugin.zip';
  const page = join(output, 'Connect CloudGPT.html');
  writeFileSync(join(output, archiveName), archive, { mode: 0o600 }); chmodSync(join(output, archiveName), 0o600);
  writeFileSync(page, connectionHtml({ tunnelId: cfg.tunnelId, version, mode: cfg.mode, checkedAt: now.toLocaleString('de-DE', { timeZone: cfg.timezone }), archiveName }), { mode: 0o600 }); chmodSync(page, 0o600);
  return { page, tunnelId: cfg.tunnelId };
}
