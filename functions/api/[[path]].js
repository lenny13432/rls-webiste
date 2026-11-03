// =====================================================================
//  Real Life Southland – API für Team-Bewerbungen
//  Läuft als Cloudflare Pages Function, Daten liegen in D1 (Binding "DB").
//
//  Umgebungsvariablen (Cloudflare → Pages-Projekt → Einstellungen → Variablen):
//    SETUP_KEY          Geheimes Wort für die Ersteinrichtung (Pflicht)
//    DISCORD_WEBHOOK    Webhook-URL für Benachrichtigungen im Team-Kanal (optional)
//    SITE_URL           z. B. https://southland-rp.de (optional, für Links in Discord)
//    COOLDOWN_DAYS      Wartezeit nach Ablehnung in Tagen (Standard 7)
//    DELETE_AFTER_DAYS  Entschiedene Bewerbungen nach X Tagen löschen (Standard 90, 0 = nie)
//    MIN_AGE            Mindestalter (Standard 16)
// =====================================================================

const SESSION_COOKIE = 'rls_session';
const SESSION_HOURS = 12;
const STATUSES = ['offen', 'pruefung', 'angenommen', 'abgelehnt'];
const LABEL = { offen: 'Offen', pruefung: 'In Prüfung', angenommen: 'Angenommen', abgelehnt: 'Abgelehnt' };
const HOURS = ['unter 5 Stunden', '5–10 Stunden', '10–20 Stunden', 'über 20 Stunden'];

// ---------------------------------------------------------------- Helfer
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const fail = (message, status = 400) => json({ error: message }, status);
class HttpError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

const now = () => new Date().toISOString();
const isoAgo = (ms) => new Date(Date.now() - ms).toISOString();
const len = (s) => [...String(s ?? '')].length;
const str = (v, max = 10000) => String(v ?? '').trim().slice(0, max);
const intEnv = (env, k, d) => { const n = parseInt(env[k], 10); return Number.isFinite(n) ? n : d; };

const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Passwörter: PBKDF2-SHA256, 100.000 Runden (Maximum in Cloudflare Workers)
async function hashPassword(pw, salt = crypto.getRandomValues(new Uint8Array(16)), iter = 100000) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return `pbkdf2$${iter}$${b64(salt)}$${b64(bits)}`;
}
async function verifyPassword(pw, stored) {
  const [kind, iter, salt, hash] = String(stored).split('$');
  if (kind !== 'pbkdf2') return false;
  const again = await hashPassword(pw, unb64(salt), parseInt(iter, 10));
  return safeEqual(again.split('$')[3], hash);
}
function randomString(len, alphabet) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}
const newCode = () => { const r = randomString(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'); return r.slice(0, 4) + '-' + r.slice(4); };
const newPassword = () => randomString(14, 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789');

const clientIp = (req) => req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || '0.0.0.0';
const ipHash = (req, env) => sha256(clientIp(req) + '|' + (env.SETUP_KEY || 'rls'));

async function readBody(req) {
  const text = await req.text();
  if (text.length > 60000) throw new HttpError('Die Anfrage ist zu groß.', 413);
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError('Ungültige Anfrage.'); }
}

function cookie(req, name) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function sessionCookie(req, value, maxAge) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

async function getSettings(db) {
  const rows = (await db.prepare('SELECT key, value FROM settings').all()).results || [];
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  let positions = [];
  try { positions = JSON.parse(s.positions || '[]'); } catch {}
  return { open: s.applications_open !== 'false', positions };
}

async function discordNotify(env, ctx, embed) {
  if (!env.DISCORD_WEBHOOK) return;
  const body = JSON.stringify({ username: 'Southland Team-Bewerbungen', embeds: [{ timestamp: now(), footer: { text: 'Real Life Southland' }, ...embed }] });
  const p = fetch(env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p); else await p;
}
const siteLink = (env, path) => (env.SITE_URL ? env.SITE_URL.replace(/\/$/, '') + path : undefined);

// ---------------------------------------------------------------- Anmeldung
async function currentAdmin(req, env) {
  const token = cookie(req, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT a.id, a.name, a.role FROM sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND a.active = 1`
  ).bind(await sha256(token), now()).first();
  return row || null;
}
async function requireAdmin(req, env, ownerOnly = false) {
  const me = await currentAdmin(req, env);
  if (!me) throw new HttpError('Bitte melde dich an.', 401);
  if (ownerOnly && me.role !== 'owner') throw new HttpError('Das darf nur der Projektinhaber.', 403);
  return me;
}

// ---------------------------------------------------------------- Öffentliche Endpunkte
async function getConfig({ env }) {
  const s = await getSettings(env.DB);
  return json({ open: s.open, positions: s.positions, minAge: intEnv(env, 'MIN_AGE', 16), cooldownDays: intEnv(env, 'COOLDOWN_DAYS', 7), deleteAfterDays: intEnv(env, 'DELETE_AFTER_DAYS', 90) });
}

async function postApply({ request, env, ctx }) {
  const db = env.DB;
  const b = await readBody(request);
  const settings = await getSettings(db);
  const minAge = intEnv(env, 'MIN_AGE', 16);
  if (!settings.open) throw new HttpError('Die Bewerbungsphase ist gerade pausiert.', 403);

  const d = {
    discord_name: str(b.discord_name, 40), discord_id: str(b.discord_id, 30).replace(/\D/g, ''),
    age: parseInt(b.age, 10), position: str(b.position, 40), hours: str(b.hours, 40), times: str(b.times, 200),
    experience: str(b.experience, 3000), motivation: str(b.motivation, 3000), scenario1: str(b.scenario1, 2000), scenario2: str(b.scenario2, 2000)
  };
  const errors = [];
  const pos = settings.positions.find((p) => p.name === d.position);
  if (!/^[\p{L}\p{N}_.]{2,32}$/u.test(d.discord_name)) errors.push('Bitte gib deinen Discord-Benutzernamen an (2–32 Zeichen, ohne Leerzeichen).');
  if (d.discord_id && !/^\d{17,20}$/.test(d.discord_id)) errors.push('Die Discord-ID besteht aus 17–20 Ziffern. Lass das Feld leer, wenn du sie nicht findest.');
  if (!(d.age >= minAge && d.age <= 99)) errors.push(`Fürs Team musst du mindestens ${minAge} Jahre alt sein.`);
  if (!pos) errors.push('Bitte wähl aus, in welchem Bereich du helfen möchtest.');
  else if (pos.state === 'voll' || pos.state === 'geschlossen') errors.push(`Im Bereich ${pos.name} suchen wir gerade niemanden.`);
  if (!HOURS.includes(d.hours)) errors.push('Bitte gib an, wie viel Zeit du pro Woche hast.');
  if (len(d.times) < 3) errors.push('Bitte sag uns, wann du meistens da bist.');
  if (len(d.experience) < 30) errors.push('Erzähl uns etwas mehr über deine Team-Erfahrung (mindestens 30 Zeichen).');
  if (len(d.motivation) < 150) errors.push('Erzähl uns etwas mehr, warum wir dich nehmen sollten (mindestens 150 Zeichen).');
  if (len(d.scenario1) < 80 || len(d.scenario2) < 80) errors.push('Beantworte bitte beide Praxisfragen ausführlicher (je mindestens 80 Zeichen).');
  if (!b.rules) errors.push('Bitte bestätige, dass du das Regelwerk kennst.');
  if (!b.volunteer) errors.push('Bitte bestätige, dass dir klar ist, dass die Teamarbeit freiwillig ist.');
  if (!b.privacy) errors.push('Bitte stimme der Speicherung deiner Angaben zu.');
  if (errors.length) return json({ errors }, 422);

  // Spam-Schutz: verstecktes Feld ausgefüllt oder Formular in unter 8 Sekunden abgeschickt.
  // Bots bekommen eine Scheinbestätigung, gespeichert wird nichts.
  const tooFast = !b.started || Date.now() - Number(b.started) < 8000;
  if (str(b.website) !== '' || tooFast) return json({ ok: true, code: 'XXXX-XXXX' });

  const ip = await ipHash(request, env);
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM applications WHERE ip_hash = ? AND created_at > ?').bind(ip, isoAgo(864e5)).first();
  if (recent.n >= 3) return json({ errors: ['Von deinem Anschluss kamen heute schon mehrere Bewerbungen. Versuch es morgen wieder.'] }, 429);

  const prev = await db.prepare('SELECT status, decided_at FROM applications WHERE discord_name = ? COLLATE NOCASE ORDER BY id DESC LIMIT 1').bind(d.discord_name).first();
  const cooldown = intEnv(env, 'COOLDOWN_DAYS', 7);
  if (prev) {
    if (prev.status === 'offen' || prev.status === 'pruefung') return json({ errors: ['Für diesen Discord-Namen läuft schon eine Bewerbung. Den Stand siehst du unter „Status prüfen“.'] }, 409);
    if (prev.status === 'angenommen') return json({ errors: ['Für diesen Discord-Namen wurde schon eine Bewerbung angenommen. Du bist schon im Team!'] }, 409);
    if (prev.decided_at && prev.decided_at > isoAgo(cooldown * 864e5)) return json({ errors: [`Nach einer Ablehnung kannst du dich erst nach ${cooldown} Tagen neu bewerben.`] }, 409);
  }

  let code, tries = 0;
  do { code = newCode(); tries++; } while (tries < 5 && (await db.prepare('SELECT 1 AS x FROM applications WHERE code = ?').bind(code).first()));

  const res = await db.prepare(
    `INSERT INTO applications (code, discord_name, discord_id, age, position, hours, times, experience, motivation, scenario1, scenario2, status, ip_hash, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'offen', ?, ?)`
  ).bind(code, d.discord_name, d.discord_id || null, d.age, d.position, d.hours, d.times, d.experience, d.motivation, d.scenario1, d.scenario2, ip, now()).run();
  const id = res.meta?.last_row_id;

  await discordNotify(env, ctx, {
    title: `Neue Team-Bewerbung #${id}`, color: 0xff4fb3, url: siteLink(env, `/admin/#bewerbung-${id}`),
    description: `**${d.discord_name}** möchte als **${d.position}** ins Team.`,
    fields: [
      { name: 'Discord', value: d.discord_name + (d.discord_id ? ` (<@${d.discord_id}>)` : ''), inline: true },
      { name: 'Alter', value: String(d.age), inline: true },
      { name: 'Zeit / Woche', value: d.hours, inline: true }
    ]
  });
  return json({ ok: true, code }, 201);
}

async function getStatus({ url, env }) {
  let code = (url.searchParams.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8) return fail('Bitte gib deinen 8-stelligen Code ein.');
  code = code.slice(0, 4) + '-' + code.slice(4);
  const a = await env.DB.prepare('SELECT position, status, public_note, created_at, decided_at FROM applications WHERE code = ?').bind(code).first();
  if (!a) return fail('Zu diesem Code haben wir keine Bewerbung gefunden. Prüf, ob du ihn richtig eingegeben hast.', 404);
  return json({ code, ...a, cooldownDays: intEnv(env, 'COOLDOWN_DAYS', 7) });
}

async function getSetup({ env }) {
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first();
  return json({ needed: n.n === 0, keySet: !!env.SETUP_KEY });
}

async function postSetup({ request, env }) {
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first();
  if (n.n > 0) throw new HttpError('Die Einrichtung ist bereits abgeschlossen.', 403);
  if (!env.SETUP_KEY) throw new HttpError('SETUP_KEY ist in Cloudflare nicht gesetzt. Siehe Anleitung.', 500);
  const b = await readBody(request);
  if (!safeEqual(str(b.key), env.SETUP_KEY)) throw new HttpError('Der Einrichtungsschlüssel ist falsch.', 403);
  const name = str(b.name, 40), pass = String(b.pass || '');
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(name)) throw new HttpError('Benutzername: 3–40 Zeichen, nur Buchstaben, Zahlen, Punkt, Strich und Unterstrich.');
  if (pass.length < 10) throw new HttpError('Das Passwort muss mindestens 10 Zeichen lang sein.');
  await env.DB.prepare("INSERT INTO admins (name, pass_hash, role, active, created_at) VALUES (?, ?, 'owner', 1, ?)").bind(name, await hashPassword(pass), now()).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- Login
async function postLogin({ request, env }) {
  const db = env.DB;
  const ip = await ipHash(request, env);
  await db.prepare('DELETE FROM login_attempts WHERE created_at < ?').bind(isoAgo(15 * 60e3)).run();
  const tries = await db.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ?').bind(ip).first();
  if (tries.n >= 5) throw new HttpError('Zu viele Fehlversuche. Warte 15 Minuten und versuch es dann nochmal.', 429);

  const b = await readBody(request);
  const a = await db.prepare('SELECT id, name, role, pass_hash, active FROM admins WHERE name = ? COLLATE NOCASE').bind(str(b.name, 40)).first();
  if (!a || !a.active || !(await verifyPassword(String(b.pass || ''), a.pass_hash))) {
    await db.prepare('INSERT INTO login_attempts (ip_hash, created_at) VALUES (?, ?)').bind(ip, now()).run();
    throw new HttpError('Benutzername oder Passwort ist falsch.', 401);
  }
  const token = randomString(48, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()),
    db.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), a.id, new Date(Date.now() + SESSION_HOURS * 3600e3).toISOString()),
    db.prepare('UPDATE admins SET last_login = ? WHERE id = ?').bind(now(), a.id),
    db.prepare('DELETE FROM login_attempts WHERE ip_hash = ?').bind(ip)
  ]);
  return json({ ok: true, me: { id: a.id, name: a.name, role: a.role } }, 200, { 'Set-Cookie': sessionCookie(request, token, SESSION_HOURS * 3600) });
}

async function postLogout({ request, env }) {
  const token = cookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });
}

// ---------------------------------------------------------------- Team-Panel
async function getMe({ request, env }) {
  return json({ me: await requireAdmin(request, env) });
}

async function listApplications({ request, env, url }) {
  await requireAdmin(request, env);
  const db = env.DB;
  const keep = intEnv(env, 'DELETE_AFTER_DAYS', 90);
  if (keep > 0) { // Datenschutz: alte, entschiedene Bewerbungen löschen
    const cut = isoAgo(keep * 864e5);
    await db.batch([
      db.prepare("DELETE FROM notes WHERE application_id IN (SELECT id FROM applications WHERE status IN ('angenommen','abgelehnt') AND decided_at < ?)").bind(cut),
      db.prepare("DELETE FROM applications WHERE status IN ('angenommen','abgelehnt') AND decided_at < ?").bind(cut)
    ]);
  }
  const counts = { offen: 0, pruefung: 0, angenommen: 0, abgelehnt: 0 };
  for (const r of (await db.prepare('SELECT status, COUNT(*) AS n FROM applications GROUP BY status').all()).results) counts[r.status] = r.n;

  const status = url.searchParams.get('status') || 'aktiv';
  const position = url.searchParams.get('position') || '';
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const where = [], args = [];
  if (status === 'aktiv') where.push("a.status IN ('offen','pruefung')");
  else if (STATUSES.includes(status)) { where.push('a.status = ?'); args.push(status); }
  if (position) { where.push('a.position = ?'); args.push(position); }
  if (q) { where.push('(LOWER(a.discord_name) LIKE ? OR LOWER(a.position) LIKE ? OR LOWER(a.code) LIKE ? OR a.discord_id LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  const sql = `SELECT a.id, a.discord_name, a.position, a.age, a.hours, a.status, a.created_at, d.name AS decided_by_name
    FROM applications a LEFT JOIN admins d ON d.id = a.decided_by ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.id ${status === 'aktiv' ? 'ASC' : 'DESC'} LIMIT 300`;
  const rows = (await db.prepare(sql).bind(...args).all()).results;
  return json({ counts, rows });
}

async function getApplication({ request, env, params }) {
  await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const app = await db.prepare('SELECT a.*, d.name AS decided_by_name FROM applications a LEFT JOIN admins d ON d.id = a.decided_by WHERE a.id = ?').bind(id).first();
  if (!app) throw new HttpError('Diese Bewerbung gibt es nicht (mehr).', 404);
  delete app.ip_hash;
  const notes = (await db.prepare('SELECT n.id, n.body, n.kind, n.created_at, a.name AS admin_name FROM notes n LEFT JOIN admins a ON a.id = n.admin_id WHERE n.application_id = ? ORDER BY n.id DESC').bind(id).all()).results;
  const previous = (await db.prepare('SELECT id, status, created_at FROM applications WHERE discord_name = ? COLLATE NOCASE AND id <> ? ORDER BY id DESC').bind(app.discord_name, id).all()).results;
  return json({ app, notes, previous });
}

async function setStatus({ request, env, params, ctx }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const b = await readBody(request);
  const next = String(b.status || ''), msg = str(b.public_note, 2000);
  if (!STATUSES.includes(next)) throw new HttpError('Unbekannter Status.');
  const app = await db.prepare('SELECT id, status, discord_name, discord_id, position, public_note FROM applications WHERE id = ?').bind(id).first();
  if (!app) throw new HttpError('Diese Bewerbung gibt es nicht (mehr).', 404);
  if (app.status === next) return json({ ok: true });
  const final = next === 'angenommen' || next === 'abgelehnt';
  await db.batch([
    db.prepare('UPDATE applications SET status = ?, public_note = ?, decided_by = ?, decided_at = ? WHERE id = ?')
      .bind(next, msg || (final ? null : app.public_note), me.id, final ? now() : null, id),
    db.prepare("INSERT INTO notes (application_id, admin_id, body, kind, created_at) VALUES (?, ?, ?, 'system', ?)")
      .bind(id, me.id, `Status geändert: ${LABEL[app.status]} → ${LABEL[next]}` + (msg ? `\nNachricht an Bewerber: ${msg}` : ''), now())
  ]);
  if (final) {
    await discordNotify(env, ctx, {
      title: `${next === 'angenommen' ? '✅ Angenommen' : '❌ Abgelehnt'}: ${app.discord_name}`, color: next === 'angenommen' ? 0x4fe0a0 : 0xff5a6e,
      description: `Team-Bewerbung #${id} als **${app.position}**${app.discord_id ? ` von <@${app.discord_id}>` : ''} wurde von ${me.name} ${next === 'angenommen' ? 'angenommen' : 'abgelehnt'}.`
    });
  }
  return json({ ok: true });
}

async function addNote({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const b = await readBody(request);
  const body = str(b.body, 4000);
  if (!body) throw new HttpError('Die Notiz ist leer.');
  const exists = await env.DB.prepare('SELECT 1 AS x FROM applications WHERE id = ?').bind(Number(params.id)).first();
  if (!exists) throw new HttpError('Diese Bewerbung gibt es nicht (mehr).', 404);
  await env.DB.prepare("INSERT INTO notes (application_id, admin_id, body, kind, created_at) VALUES (?, ?, ?, 'note', ?)").bind(Number(params.id), me.id, body, now()).run();
  return json({ ok: true });
}

async function deleteApplication({ request, env, params }) {
  await requireAdmin(request, env, true);
  const id = Number(params.id), db = env.DB;
  await db.batch([db.prepare('DELETE FROM notes WHERE application_id = ?').bind(id), db.prepare('DELETE FROM applications WHERE id = ?').bind(id)]);
  return json({ ok: true });
}

async function getTeam({ request, env }) {
  await requireAdmin(request, env);
  const rows = (await env.DB.prepare('SELECT id, name, role, active, created_at, last_login FROM admins ORDER BY role DESC, name').all()).results;
  return json({ team: rows });
}

async function createTeam({ request, env }) {
  await requireAdmin(request, env, true);
  const b = await readBody(request);
  const name = str(b.name, 40), role = b.role === 'owner' ? 'owner' : 'admin';
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(name)) throw new HttpError('Benutzername: 3–40 Zeichen, nur Buchstaben, Zahlen, Punkt, Strich und Unterstrich.');
  if (await env.DB.prepare('SELECT 1 AS x FROM admins WHERE name = ? COLLATE NOCASE').bind(name).first()) throw new HttpError('Diesen Benutzernamen gibt es schon.', 409);
  const pass = newPassword();
  await env.DB.prepare('INSERT INTO admins (name, pass_hash, role, active, created_at) VALUES (?, ?, ?, 1, ?)').bind(name, await hashPassword(pass), role, now()).run();
  return json({ ok: true, name, password: pass }, 201);
}

async function updateTeam({ request, env, params }) {
  const me = await requireAdmin(request, env, true);
  const id = Number(params.id), db = env.DB;
  if (id === me.id) throw new HttpError('Dein eigenes Konto änderst du unter „Mein Konto“.');
  const t = await db.prepare('SELECT id, name, active FROM admins WHERE id = ?').bind(id).first();
  if (!t) throw new HttpError('Dieses Konto gibt es nicht.', 404);
  const b = await readBody(request);
  if (b.action === 'toggle') {
    await db.batch([db.prepare('UPDATE admins SET active = 1 - active WHERE id = ?').bind(id), db.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id)]);
    return json({ ok: true });
  }
  if (b.action === 'reset') {
    const pass = newPassword();
    await db.batch([db.prepare('UPDATE admins SET pass_hash = ? WHERE id = ?').bind(await hashPassword(pass), id), db.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id)]);
    return json({ ok: true, name: t.name, password: pass });
  }
  if (b.action === 'role') {
    await db.prepare('UPDATE admins SET role = ? WHERE id = ?').bind(b.role === 'owner' ? 'owner' : 'admin', id).run();
    return json({ ok: true });
  }
  throw new HttpError('Unbekannte Aktion.');
}

async function changePassword({ request, env }) {
  const me = await requireAdmin(request, env);
  const b = await readBody(request);
  const row = await env.DB.prepare('SELECT pass_hash FROM admins WHERE id = ?').bind(me.id).first();
  if (!(await verifyPassword(String(b.old || ''), row.pass_hash))) throw new HttpError('Dein aktuelles Passwort stimmt nicht.', 403);
  if (String(b.new || '').length < 10) throw new HttpError('Das neue Passwort muss mindestens 10 Zeichen lang sein.');
  const token = cookie(request, SESSION_COOKIE);
  await env.DB.batch([
    env.DB.prepare('UPDATE admins SET pass_hash = ? WHERE id = ?').bind(await hashPassword(String(b.new)), me.id),
    env.DB.prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash <> ?').bind(me.id, await sha256(token || ''))
  ]);
  return json({ ok: true });
}

async function saveSettings({ request, env }) {
  await requireAdmin(request, env, true);
  const b = await readBody(request);
  const states = ['offen', 'wenige', 'voll', 'geschlossen'];
  const positions = (Array.isArray(b.positions) ? b.positions : [])
    .map((p) => ({ name: str(p.name, 40), state: states.includes(p.state) ? p.state : 'offen' }))
    .filter((p) => p.name).slice(0, 20);
  if (!positions.length) throw new HttpError('Es muss mindestens einen Bereich geben.');
  if (new Set(positions.map((p) => p.name.toLowerCase())).size !== positions.length) throw new HttpError('Jeder Bereich darf nur einmal vorkommen.');
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('applications_open', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(b.open ? 'true' : 'false'),
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('positions', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(positions))
  ]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- Dev-Panel: Roadmap & To-dos
const TASK_STATUS = ['idee', 'todo', 'arbeit', 'test', 'fertig'];
const TASK_PRIO = ['niedrig', 'normal', 'hoch', 'kritisch'];
const TASK_CAT = ['Script', 'Mapping', 'Fahrzeuge', 'Kleidung', 'Fraktionen', 'Server', 'Website', 'Launcher', 'Discord', 'Bug', 'Sonstiges'];
const MS_STATUS = ['geplant', 'arbeit', 'fertig'];
const DEV_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS dev_milestones (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, target TEXT, status TEXT NOT NULL DEFAULT 'geplant', sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS dev_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, status TEXT NOT NULL DEFAULT 'todo', priority TEXT NOT NULL DEFAULT 'normal', category TEXT NOT NULL DEFAULT 'Sonstiges', assignee_id INTEGER, milestone_id INTEGER, due TEXT, created_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_dev_tasks_status ON dev_tasks(status)`
];
let devReady = false;
async function ensureDev(db) {
  if (devReady) return;
  await db.batch(DEV_SCHEMA.map((s) => db.prepare(s)));
  devReady = true;
}
const pick = (v, list, d) => (list.includes(v) ? v : d);
const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const idOrNull = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };

async function getDev({ request, env }) {
  await requireAdmin(request, env);
  const db = env.DB; await ensureDev(db);
  const [tasks, milestones, team] = await Promise.all([
    db.prepare(`SELECT t.*, a.name AS assignee_name, c.name AS created_by_name FROM dev_tasks t
      LEFT JOIN admins a ON a.id = t.assignee_id LEFT JOIN admins c ON c.id = t.created_by ORDER BY t.updated_at DESC`).all(),
    db.prepare('SELECT * FROM dev_milestones ORDER BY sort, target IS NULL, target, id').all(),
    db.prepare('SELECT id, name FROM admins WHERE active = 1 ORDER BY name').all()
  ]);
  return json({ tasks: tasks.results, milestones: milestones.results, team: team.results, statuses: TASK_STATUS, priorities: TASK_PRIO, categories: TASK_CAT });
}

function taskFields(b, old = {}) {
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const t = {
    title: has('title') ? str(b.title, 120) : old.title,
    body: has('body') ? str(b.body, 4000) : old.body ?? '',
    status: has('status') ? pick(b.status, TASK_STATUS, 'todo') : old.status ?? 'todo',
    priority: has('priority') ? pick(b.priority, TASK_PRIO, 'normal') : old.priority ?? 'normal',
    category: has('category') ? pick(b.category, TASK_CAT, 'Sonstiges') : old.category ?? 'Sonstiges',
    assignee_id: has('assignee_id') ? idOrNull(b.assignee_id) : old.assignee_id ?? null,
    milestone_id: has('milestone_id') ? idOrNull(b.milestone_id) : old.milestone_id ?? null,
    due: has('due') ? dateOrNull(b.due) : old.due ?? null
  };
  if (!t.title || len(t.title) < 2) throw new HttpError('Gib der Aufgabe einen Titel.');
  return t;
}

async function createTask({ request, env }) {
  const me = await requireAdmin(request, env);
  const db = env.DB; await ensureDev(db);
  const t = taskFields(await readBody(request));
  const r = await db.prepare(`INSERT INTO dev_tasks (title, body, status, priority, category, assignee_id, milestone_id, due, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(t.title, t.body, t.status, t.priority, t.category, t.assignee_id, t.milestone_id, t.due, me.id, now(), now()).run();
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

async function updateTask({ request, env, params }) {
  await requireAdmin(request, env);
  const db = env.DB; await ensureDev(db);
  const old = await db.prepare('SELECT * FROM dev_tasks WHERE id = ?').bind(Number(params.id)).first();
  if (!old) throw new HttpError('Diese Aufgabe gibt es nicht mehr.', 404);
  const t = taskFields(await readBody(request), old);
  await db.prepare(`UPDATE dev_tasks SET title = ?, body = ?, status = ?, priority = ?, category = ?, assignee_id = ?, milestone_id = ?, due = ?, updated_at = ? WHERE id = ?`)
    .bind(t.title, t.body, t.status, t.priority, t.category, t.assignee_id, t.milestone_id, t.due, now(), old.id).run();
  return json({ ok: true });
}

async function deleteTask({ request, env, params }) {
  await requireAdmin(request, env);
  const db = env.DB; await ensureDev(db);
  await db.prepare('DELETE FROM dev_tasks WHERE id = ?').bind(Number(params.id)).run();
  return json({ ok: true });
}

function msFields(b, old = {}) {
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const m = {
    title: has('title') ? str(b.title, 80) : old.title,
    body: has('body') ? str(b.body, 2000) : old.body ?? '',
    target: has('target') ? str(b.target, 40) : old.target ?? '',
    status: has('status') ? pick(b.status, MS_STATUS, 'geplant') : old.status ?? 'geplant',
    sort: has('sort') ? (parseInt(b.sort, 10) || 0) : old.sort ?? 0
  };
  if (!m.title || len(m.title) < 2) throw new HttpError('Gib dem Meilenstein einen Namen.');
  return m;
}

async function createMilestone({ request, env }) {
  await requireAdmin(request, env);
  const db = env.DB; await ensureDev(db);
  const m = msFields(await readBody(request));
  if (!m.sort) m.sort = ((await db.prepare('SELECT MAX(sort) AS s FROM dev_milestones').first())?.s || 0) + 1;
  const r = await db.prepare('INSERT INTO dev_milestones (title, body, target, status, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(m.title, m.body, m.target || null, m.status, m.sort, now()).run();
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

async function updateMilestone({ request, env, params }) {
  await requireAdmin(request, env);
  const db = env.DB; await ensureDev(db);
  const old = await db.prepare('SELECT * FROM dev_milestones WHERE id = ?').bind(Number(params.id)).first();
  if (!old) throw new HttpError('Diesen Meilenstein gibt es nicht mehr.', 404);
  const m = msFields(await readBody(request), old);
  await db.prepare('UPDATE dev_milestones SET title = ?, body = ?, target = ?, status = ?, sort = ? WHERE id = ?')
    .bind(m.title, m.body, m.target || null, m.status, m.sort, old.id).run();
  return json({ ok: true });
}

async function deleteMilestone({ request, env, params }) {
  await requireAdmin(request, env, true);
  const db = env.DB; await ensureDev(db);
  const id = Number(params.id);
  await db.batch([db.prepare('UPDATE dev_tasks SET milestone_id = NULL WHERE milestone_id = ?').bind(id), db.prepare('DELETE FROM dev_milestones WHERE id = ?').bind(id)]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- Router
const ROUTES = [
  ['GET', 'config', getConfig],
  ['POST', 'apply', postApply],
  ['GET', 'status', getStatus],
  ['GET', 'setup', getSetup],
  ['POST', 'setup', postSetup],
  ['POST', 'admin/login', postLogin],
  ['POST', 'admin/logout', postLogout],
  ['GET', 'admin/me', getMe],
  ['GET', 'admin/applications', listApplications],
  ['GET', 'admin/applications/:id', getApplication],
  ['POST', 'admin/applications/:id/status', setStatus],
  ['POST', 'admin/applications/:id/notes', addNote],
  ['DELETE', 'admin/applications/:id', deleteApplication],
  ['GET', 'admin/team', getTeam],
  ['POST', 'admin/team', createTeam],
  ['POST', 'admin/team/:id', updateTeam],
  ['POST', 'admin/password', changePassword],
  ['PUT', 'admin/settings', saveSettings],
  ['GET', 'admin/dev', getDev],
  ['POST', 'admin/dev/tasks', createTask],
  ['PUT', 'admin/dev/tasks/:id', updateTask],
  ['DELETE', 'admin/dev/tasks/:id', deleteTask],
  ['POST', 'admin/dev/milestones', createMilestone],
  ['PUT', 'admin/dev/milestones/:id', updateMilestone],
  ['DELETE', 'admin/dev/milestones/:id', deleteMilestone]
];

function match(pattern, path) {
  const p = pattern.split('/'), s = path.split('/');
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) { if (!/^\d+$/.test(s[i])) return null; params[p[i].slice(1)] = s[i]; }
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');

  if (!env.DB) return fail('Die Datenbank ist nicht verbunden. Prüfe das D1-Binding „DB“ (siehe Anleitung).', 500);

  // Schutz vor fremden Seiten, die im Namen eines Admins Anfragen schicken
  if (request.method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).host !== url.host) return fail('Anfrage von fremder Seite abgelehnt.', 403);
    if (!(request.headers.get('Content-Type') || '').includes('application/json') && request.method !== 'DELETE') return fail('Ungültige Anfrage.', 415);
  }

  for (const [method, pattern, handler] of ROUTES) {
    const params = match(pattern, path);
    if (!params) continue;
    if (request.method !== method) continue;
    try {
      return await handler({ request, env, url, params, ctx: context });
    } catch (e) {
      if (e instanceof HttpError) return fail(e.message, e.status);
      console.error(e);
      return fail('Da ist etwas schiefgelaufen. Versuch es gleich nochmal.', 500);
    }
  }
  return fail('Nicht gefunden.', 404);
}
