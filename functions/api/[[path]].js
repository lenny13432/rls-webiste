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
  await ensureSchema(env.DB);
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
  try { await ensureSchema(db); await act(db, null, 'bewerbung', 'application', id, `Neue Bewerbung von ${q(d.discord_name)} als ${d.position}`).run(); } catch {}

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
      .bind(id, me.id, `Status geändert: ${LABEL[app.status]} → ${LABEL[next]}` + (msg ? `\nNachricht an Bewerber: ${msg}` : ''), now()),
    act(db, me, 'bewerbung', 'application', id, `hat die Bewerbung von ${q(app.discord_name)} auf „${LABEL[next]}“ gesetzt`)
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
  await env.DB.batch([
    env.DB.prepare("INSERT INTO notes (application_id, admin_id, body, kind, created_at) VALUES (?, ?, ?, 'note', ?)").bind(Number(params.id), me.id, body, now()),
    act(env.DB, me, 'bewerbung', 'application', Number(params.id), `hat eine Notiz zu Bewerbung #${params.id} geschrieben`)
  ]);
  return json({ ok: true });
}

async function deleteApplication({ request, env, params }) {
  const me = await requireAdmin(request, env, true);
  const id = Number(params.id), db = env.DB;
  await db.batch([db.prepare('DELETE FROM notes WHERE application_id = ?').bind(id), db.prepare('DELETE FROM applications WHERE id = ?').bind(id), act(db, me, 'bewerbung', 'application', id, `hat Bewerbung #${id} gelöscht`)]);
  return json({ ok: true });
}

async function getTeam({ request, env }) {
  await requireAdmin(request, env);
  const rows = (await env.DB.prepare('SELECT id, name, role, active, created_at, last_login FROM admins ORDER BY role DESC, name').all()).results;
  return json({ team: rows });
}

async function createTeam({ request, env }) {
  const me = await requireAdmin(request, env, true);
  const b = await readBody(request);
  const name = str(b.name, 40), role = b.role === 'owner' ? 'owner' : 'admin';
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(name)) throw new HttpError('Benutzername: 3–40 Zeichen, nur Buchstaben, Zahlen, Punkt, Strich und Unterstrich.');
  if (await env.DB.prepare('SELECT 1 AS x FROM admins WHERE name = ? COLLATE NOCASE').bind(name).first()) throw new HttpError('Diesen Benutzernamen gibt es schon.', 409);
  const pass = newPassword();
  await env.DB.prepare('INSERT INTO admins (name, pass_hash, role, active, created_at) VALUES (?, ?, ?, 1, ?)').bind(name, await hashPassword(pass), role, now()).run();
  await act(env.DB, me, 'team', 'admin', null, `hat das Team-Konto ${q(name)} angelegt (${role === 'owner' ? 'Owner' : 'Admin'})`).run();
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
    await db.batch([db.prepare('UPDATE admins SET active = 1 - active WHERE id = ?').bind(id), db.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id), act(db, me, 'team', 'admin', id, `hat ${q(t.name)} ${t.active ? 'gesperrt' : 'entsperrt'}`)]);
    return json({ ok: true });
  }
  if (b.action === 'reset') {
    const pass = newPassword();
    await db.batch([db.prepare('UPDATE admins SET pass_hash = ? WHERE id = ?').bind(await hashPassword(pass), id), db.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id), act(db, me, 'team', 'admin', id, `hat für ${q(t.name)} ein neues Passwort erstellt`)]);
    return json({ ok: true, name: t.name, password: pass });
  }
  if (b.action === 'role') {
    await db.batch([db.prepare('UPDATE admins SET role = ? WHERE id = ?').bind(b.role === 'owner' ? 'owner' : 'admin', id), act(db, me, 'team', 'admin', id, `hat ${q(t.name)} zum ${b.role === 'owner' ? 'Owner' : 'Admin'} gemacht`)]);
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
  const me = await requireAdmin(request, env, true);
  const b = await readBody(request);
  const states = ['offen', 'wenige', 'voll', 'geschlossen'];
  const positions = (Array.isArray(b.positions) ? b.positions : [])
    .map((p) => ({ name: str(p.name, 40), state: states.includes(p.state) ? p.state : 'offen' }))
    .filter((p) => p.name).slice(0, 20);
  if (!positions.length) throw new HttpError('Es muss mindestens einen Bereich geben.');
  if (new Set(positions.map((p) => p.name.toLowerCase())).size !== positions.length) throw new HttpError('Jeder Bereich darf nur einmal vorkommen.');
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('applications_open', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(b.open ? 'true' : 'false'),
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('positions', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(positions)),
    act(env.DB, me, 'team', 'settings', null, `hat die Bewerbungs-Einstellungen geändert (${b.open ? 'geöffnet' : 'pausiert'})`)
  ]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- Panel-Erweiterungen: Tabellen
// Alle Tabellen werden automatisch angelegt (CREATE TABLE IF NOT EXISTS), du musst nichts von Hand ausführen.
const PANEL_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, kind TEXT NOT NULL, ref_type TEXT, ref_id INTEGER, text TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS presence (admin_id INTEGER PRIMARY KEY, last_seen TEXT NOT NULL, view TEXT)`,
  `CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, pinned INTEGER NOT NULL DEFAULT 0, admin_id INTEGER, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS players (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, discord TEXT, license TEXT, notes TEXT, watch INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sanctions (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INTEGER NOT NULL, type TEXT NOT NULL, reason TEXT NOT NULL, duration TEXT, expires_at TEXT, active INTEGER NOT NULL DEFAULT 1, admin_id INTEGER, created_at TEXT NOT NULL, lifted_by INTEGER, lifted_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS news (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, tag TEXT NOT NULL DEFAULT 'Ankündigung', published INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, admin_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS dev_milestones (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, target TEXT, status TEXT NOT NULL DEFAULT 'geplant', sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS dev_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, status TEXT NOT NULL DEFAULT 'todo', priority TEXT NOT NULL DEFAULT 'normal', category TEXT NOT NULL DEFAULT 'Sonstiges', assignee_id INTEGER, milestone_id INTEGER, due TEXT, created_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS dev_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, admin_id INTEGER, body TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS dev_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS dev_resources (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, version TEXT, kind TEXT, status TEXT NOT NULL DEFAULT 'aktiv', source TEXT, notes TEXT, admin_id INTEGER, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS dev_docs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, category TEXT, admin_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_dev_tasks_status ON dev_tasks(status)`,
  `CREATE INDEX IF NOT EXISTS idx_sanctions_player ON sanctions(player_id)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_task ON dev_comments(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_checks_task ON dev_checks(task_id)`
];
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(PANEL_SCHEMA.map((s) => db.prepare(s)));
  schemaReady = true;
}

// Protokoll: jede Änderung wird festgehalten. Darüber läuft auch die Live-Aktualisierung.
const act = (db, me, kind, refType, refId, text) =>
  db.prepare('INSERT INTO activity (admin_id, kind, ref_type, ref_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(me ? me.id : null, kind, refType, refId ?? null, String(text).slice(0, 300), now());
const q = (s) => `„${String(s).slice(0, 80)}“`;

const pick = (v, list, d) => (list.includes(v) ? v : d);
const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const idOrNull = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };
const has = (b, k) => Object.prototype.hasOwnProperty.call(b, k);
const all = async (stmt) => (await stmt.all()).results || [];

// ---------------------------------------------------------------- Live: Puls, Online-Liste, Suche
async function getPulse({ request, env, url }) {
  const me = await requireAdmin(request, env);
  const db = env.DB;
  const since = parseInt(url.searchParams.get('since'), 10) || 0;
  if (url.searchParams.get('touch')) {
    await db.prepare('INSERT INTO presence (admin_id, last_seen, view) VALUES (?, ?, ?) ON CONFLICT(admin_id) DO UPDATE SET last_seen = excluded.last_seen, view = excluded.view')
      .bind(me.id, now(), str(url.searchParams.get('view'), 30)).run();
  }
  const [rev, events, online] = await Promise.all([
    db.prepare('SELECT COALESCE(MAX(id), 0) AS r FROM activity').first(),
    since ? all(db.prepare('SELECT v.id, v.admin_id, v.kind, v.ref_type, v.ref_id, v.text, v.created_at, a.name AS admin_name FROM activity v LEFT JOIN admins a ON a.id = v.admin_id WHERE v.id > ? ORDER BY v.id DESC LIMIT 15').bind(since)) : [],
    all(db.prepare('SELECT a.id, a.name, p.view, p.last_seen FROM presence p JOIN admins a ON a.id = p.admin_id WHERE p.last_seen > ? AND a.active = 1 ORDER BY a.name').bind(isoAgo(75e3)))
  ]);
  const badges = await db.prepare("SELECT (SELECT COUNT(*) FROM applications WHERE status IN ('offen','pruefung')) AS apps, (SELECT COUNT(*) FROM dev_tasks WHERE category = 'Bug' AND status <> 'fertig') AS bugs").first();
  return json({ rev: rev.r, events, online, badges });
}

async function getSearch({ request, env, url }) {
  await requireAdmin(request, env);
  const db = env.DB, term = str(url.searchParams.get('q'), 60).toLowerCase();
  if (term.length < 2) return json({ results: [] });
  const like = `%${term}%`;
  const [apps, players, tasks, docs, res] = await Promise.all([
    all(db.prepare('SELECT id, discord_name AS title, position AS sub FROM applications WHERE LOWER(discord_name) LIKE ? OR LOWER(code) LIKE ? ORDER BY id DESC LIMIT 5').bind(like, like)),
    all(db.prepare('SELECT id, name AS title, discord AS sub FROM players WHERE LOWER(name) LIKE ? OR LOWER(COALESCE(discord,\'\')) LIKE ? OR LOWER(COALESCE(license,\'\')) LIKE ? ORDER BY updated_at DESC LIMIT 5').bind(like, like, like)),
    all(db.prepare('SELECT id, title, status AS sub FROM dev_tasks WHERE LOWER(title) LIKE ? OR LOWER(COALESCE(body,\'\')) LIKE ? ORDER BY updated_at DESC LIMIT 6').bind(like, like)),
    all(db.prepare('SELECT id, title, category AS sub FROM dev_docs WHERE LOWER(title) LIKE ? OR LOWER(COALESCE(body,\'\')) LIKE ? ORDER BY updated_at DESC LIMIT 5').bind(like, like)),
    all(db.prepare('SELECT id, name AS title, status AS sub FROM dev_resources WHERE LOWER(name) LIKE ? OR LOWER(COALESCE(notes,\'\')) LIKE ? ORDER BY name LIMIT 5').bind(like, like))
  ]);
  const tag = (type, rows) => rows.map((r) => ({ type, ...r }));
  return json({ results: [...tag('bewerbung', apps), ...tag('spieler', players), ...tag('aufgabe', tasks), ...tag('wiki', docs), ...tag('script', res)] });
}

// ---------------------------------------------------------------- Übersicht & Pinnwand
async function getDashboard({ request, env }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, n = now();
  const one = (sql, ...a) => db.prepare(sql).bind(...a).first();
  const [apps, myTasks, bugs, bans, players, prog, ann, feed, mine, news] = await Promise.all([
    one("SELECT SUM(status = 'offen') AS offen, SUM(status = 'pruefung') AS pruefung FROM applications"),
    one("SELECT COUNT(*) AS n FROM dev_tasks WHERE assignee_id = ? AND status <> 'fertig'", me.id),
    one("SELECT COUNT(*) AS n FROM dev_tasks WHERE category = 'Bug' AND status <> 'fertig'"),
    one("SELECT COUNT(DISTINCT player_id) AS n FROM sanctions WHERE type IN ('ban','permaban') AND active = 1 AND (expires_at IS NULL OR expires_at > ?)", n),
    one('SELECT COUNT(*) AS n FROM players'),
    one("SELECT COUNT(*) AS total, SUM(status = 'fertig') AS done FROM dev_tasks"),
    all(db.prepare('SELECT x.*, a.name AS admin_name FROM announcements x LEFT JOIN admins a ON a.id = x.admin_id ORDER BY x.pinned DESC, x.id DESC LIMIT 12')),
    all(db.prepare('SELECT v.*, a.name AS admin_name FROM activity v LEFT JOIN admins a ON a.id = v.admin_id ORDER BY v.id DESC LIMIT 14')),
    all(db.prepare("SELECT id, title, status, priority, due, category FROM dev_tasks WHERE assignee_id = ? AND status <> 'fertig' ORDER BY CASE priority WHEN 'kritisch' THEN 0 WHEN 'hoch' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, due IS NULL, due LIMIT 8").bind(me.id)),
    one('SELECT COUNT(*) AS n FROM news WHERE published = 1')
  ]);
  const today = n.slice(0, 10);
  const [upcoming, away, openPolls] = await Promise.all([
    all(db.prepare(`SELECT e.id, e.title, e.kind, e.starts_at, e.location, (SELECT status FROM event_rsvp r WHERE r.event_id = e.id AND r.admin_id = ?) AS mine,
        (SELECT COUNT(*) FROM event_rsvp r WHERE r.event_id = e.id AND r.status = 'ja') AS yes FROM events e WHERE e.starts_at > ? ORDER BY e.starts_at LIMIT 4`).bind(me.id, isoAgo(2 * 3600e3))),
    all(db.prepare('SELECT x.id, x.to_date, x.reason, a.name FROM absences x JOIN admins a ON a.id = x.admin_id WHERE x.from_date <= ? AND x.to_date >= ? ORDER BY x.to_date').bind(today, today)),
    all(db.prepare('SELECT p.id, p.question, p.closes_at FROM polls p WHERE p.closed = 0 AND (p.closes_at IS NULL OR p.closes_at > ?) AND NOT EXISTS (SELECT 1 FROM poll_votes v WHERE v.poll_id = p.id AND v.admin_id = ?) ORDER BY p.id DESC LIMIT 4').bind(n, me.id))
  ]);
  return json({
    team: { upcoming, away, openPolls },
    stats: { appsOpen: apps.offen || 0, appsReview: apps.pruefung || 0, myTasks: myTasks.n, bugs: bugs.n, bans: bans.n, players: players.n, tasksTotal: prog.total || 0, tasksDone: prog.done || 0, news: news.n },
    announcements: ann, feed, mine
  });
}

async function createAnnouncement({ request, env }) {
  const me = await requireAdmin(request, env);
  const b = await readBody(request);
  const title = str(b.title, 120), body = str(b.body, 2000);
  if (len(title) < 2) throw new HttpError('Gib der Nachricht einen Titel.');
  const db = env.DB;
  const r = await db.prepare('INSERT INTO announcements (title, body, pinned, admin_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(title, body, b.pinned ? 1 : 0, me.id, now()).run();
  await act(db, me, 'pinnwand', 'announcement', r.meta.last_row_id, `hat an die Pinnwand geschrieben: ${q(title)}`).run();
  return json({ ok: true }, 201);
}
async function updateAnnouncement({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id), b = await readBody(request);
  const x = await db.prepare('SELECT * FROM announcements WHERE id = ?').bind(id).first();
  if (!x) throw new HttpError('Diese Nachricht gibt es nicht mehr.', 404);
  await db.batch([
    db.prepare('UPDATE announcements SET pinned = ? WHERE id = ?').bind(b.pinned ? 1 : 0, id),
    act(db, me, 'pinnwand', 'announcement', id, `hat ${q(x.title)} ${b.pinned ? 'angeheftet' : 'gelöst'}`)
  ]);
  return json({ ok: true });
}
async function deleteAnnouncement({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const x = await db.prepare('SELECT * FROM announcements WHERE id = ?').bind(id).first();
  if (!x) return json({ ok: true });
  if (x.admin_id !== me.id && me.role !== 'owner') throw new HttpError('Nur der Verfasser oder der Owner darf das löschen.', 403);
  await db.batch([db.prepare('DELETE FROM announcements WHERE id = ?').bind(id), act(db, me, 'pinnwand', 'announcement', id, `hat ${q(x.title)} von der Pinnwand genommen`)]);
  return json({ ok: true });
}

async function getActivity({ request, env, url }) {
  await requireAdmin(request, env);
  const before = parseInt(url.searchParams.get('before'), 10) || 0;
  const who = parseInt(url.searchParams.get('who'), 10) || 0;
  const kind = str(url.searchParams.get('kind'), 20);
  const where = [], args = [];
  if (before) { where.push('v.id < ?'); args.push(before); }
  if (who) { where.push('v.admin_id = ?'); args.push(who); }
  if (kind) { where.push('v.kind = ?'); args.push(kind); }
  const rows = await all(env.DB.prepare(`SELECT v.*, a.name AS admin_name FROM activity v LEFT JOIN admins a ON a.id = v.admin_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY v.id DESC LIMIT 80`).bind(...args));
  const team = await all(env.DB.prepare('SELECT id, name FROM admins ORDER BY name'));
  return json({ rows, team });
}

// ---------------------------------------------------------------- Spielerakten & Sanktionen
const SANCTIONS = ['hinweis', 'verwarnung', 'kick', 'ban', 'permaban'];
const SANCTION_LABEL = { hinweis: 'Hinweis', verwarnung: 'Verwarnung', kick: 'Kick', ban: 'Ban', permaban: 'Permanenter Ban' };

async function listPlayers({ request, env, url }) {
  await requireAdmin(request, env);
  const db = env.DB, n = now();
  const term = str(url.searchParams.get('q'), 60).toLowerCase(), filter = url.searchParams.get('filter') || '';
  const where = [], args = [n];
  if (term) { where.push("(LOWER(p.name) LIKE ? OR LOWER(COALESCE(p.discord,'')) LIKE ? OR LOWER(COALESCE(p.license,'')) LIKE ?)"); args.push(`%${term}%`, `%${term}%`, `%${term}%`); }
  if (filter === 'beobachten') where.push('p.watch = 1');
  const rows = await all(db.prepare(`SELECT p.id, p.name, p.discord, p.license, p.watch, p.updated_at,
      (SELECT COUNT(*) FROM sanctions s WHERE s.player_id = p.id AND s.type = 'verwarnung' AND s.active = 1) AS warns,
      (SELECT COUNT(*) FROM sanctions s WHERE s.player_id = p.id) AS total,
      (SELECT COALESCE(s.expires_at, '') || '|' || s.type FROM sanctions s WHERE s.player_id = p.id AND s.type IN ('ban','permaban') AND s.active = 1 AND (s.expires_at IS NULL OR s.expires_at > ?) ORDER BY s.expires_at IS NULL DESC, s.expires_at DESC LIMIT 1) AS ban
    FROM players p ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.updated_at DESC LIMIT 300`).bind(...args));
  const out = rows.map((r) => ({ ...r, ban: r.ban ? { until: r.ban.split('|')[0] || null, type: r.ban.split('|')[1] } : null }));
  return json({ rows: filter === 'gebannt' ? out.filter((r) => r.ban) : filter === 'verwarnt' ? out.filter((r) => r.warns > 0) : out });
}

function playerFields(b, old = {}) {
  const p = {
    name: has(b, 'name') ? str(b.name, 60) : old.name,
    discord: has(b, 'discord') ? str(b.discord, 60) : old.discord ?? '',
    license: has(b, 'license') ? str(b.license, 120) : old.license ?? '',
    notes: has(b, 'notes') ? str(b.notes, 6000) : old.notes ?? '',
    watch: has(b, 'watch') ? (b.watch ? 1 : 0) : old.watch ?? 0
  };
  if (len(p.name) < 2) throw new HttpError('Gib den Namen des Spielers an (Ingame- oder FiveM-Name).');
  return p;
}
async function createPlayer({ request, env }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, p = playerFields(await readBody(request));
  const r = await db.prepare('INSERT INTO players (name, discord, license, notes, watch, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(p.name, p.discord, p.license, p.notes, p.watch, me.id, now(), now()).run();
  const id = r.meta.last_row_id;
  await act(db, me, 'spieler', 'player', id, `hat eine Spielerakte für ${q(p.name)} angelegt`).run();
  return json({ ok: true, id }, 201);
}
async function getPlayer({ request, env, params }) {
  await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const p = await db.prepare('SELECT p.*, c.name AS created_by_name FROM players p LEFT JOIN admins c ON c.id = p.created_by WHERE p.id = ?').bind(id).first();
  if (!p) throw new HttpError('Diese Spielerakte gibt es nicht.', 404);
  const s = await all(db.prepare('SELECT s.*, a.name AS admin_name, l.name AS lifted_by_name FROM sanctions s LEFT JOIN admins a ON a.id = s.admin_id LEFT JOIN admins l ON l.id = s.lifted_by WHERE s.player_id = ? ORDER BY s.id DESC').bind(id));
  return json({ player: p, sanctions: s, now: now() });
}
async function updatePlayer({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const old = await db.prepare('SELECT * FROM players WHERE id = ?').bind(id).first();
  if (!old) throw new HttpError('Diese Spielerakte gibt es nicht.', 404);
  const b = await readBody(request), p = playerFields(b, old);
  const text = has(b, 'watch') && Object.keys(b).length === 1 ? `${p.watch ? 'beobachtet jetzt' : 'beobachtet nicht mehr'} ${q(p.name)}`
    : has(b, 'notes') && Object.keys(b).length === 1 ? `hat die Notizen zu ${q(p.name)} ergänzt` : `hat die Akte von ${q(p.name)} bearbeitet`;
  await db.batch([
    db.prepare('UPDATE players SET name = ?, discord = ?, license = ?, notes = ?, watch = ?, updated_at = ? WHERE id = ?').bind(p.name, p.discord, p.license, p.notes, p.watch, now(), id),
    act(db, me, 'spieler', 'player', id, text)
  ]);
  return json({ ok: true });
}
async function deletePlayer({ request, env, params }) {
  const me = await requireAdmin(request, env, true);
  const db = env.DB, id = Number(params.id);
  const p = await db.prepare('SELECT name FROM players WHERE id = ?').bind(id).first();
  if (!p) return json({ ok: true });
  await db.batch([db.prepare('DELETE FROM sanctions WHERE player_id = ?').bind(id), db.prepare('DELETE FROM players WHERE id = ?').bind(id), act(db, me, 'spieler', 'player', id, `hat die Spielerakte ${q(p.name)} gelöscht`)]);
  return json({ ok: true });
}
async function addSanction({ request, env, params, ctx }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const p = await db.prepare('SELECT id, name FROM players WHERE id = ?').bind(id).first();
  if (!p) throw new HttpError('Diese Spielerakte gibt es nicht.', 404);
  const b = await readBody(request);
  const type = pick(b.type, SANCTIONS, ''), reason = str(b.reason, 1000);
  if (!type) throw new HttpError('Wähl die Art der Sanktion.');
  if (len(reason) < 3) throw new HttpError('Gib einen Grund an, z. B. „RDM am Würfelpark“.');
  let expires = null, duration = null;
  if (type === 'ban') {
    const hours = Number(b.hours);
    if (!(hours > 0 && hours <= 24 * 365)) throw new HttpError('Wähl eine Ban-Dauer.');
    expires = new Date(Date.now() + hours * 3600e3).toISOString();
    duration = hours < 24 ? `${hours} Std.` : `${Math.round(hours / 24)} Tag${hours === 24 ? '' : 'e'}`;
  }
  if (type === 'permaban') duration = 'permanent';
  await db.batch([
    db.prepare('INSERT INTO sanctions (player_id, type, reason, duration, expires_at, active, admin_id, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').bind(id, type, reason, duration, expires, me.id, now()),
    db.prepare('UPDATE players SET updated_at = ? WHERE id = ?').bind(now(), id),
    act(db, me, 'spieler', 'player', id, `hat ${q(p.name)} sanktioniert: ${SANCTION_LABEL[type]}${duration && type === 'ban' ? ' (' + duration + ')' : ''}`)
  ]);
  if (type === 'ban' || type === 'permaban') {
    await discordNotify(env, ctx, { title: `🔨 ${SANCTION_LABEL[type]}: ${p.name}`, color: 0xff5a6e, description: `**Grund:** ${reason}\n**Dauer:** ${duration}\n**Von:** ${me.name}` });
  }
  return json({ ok: true }, 201);
}
async function liftSanction({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const s = await db.prepare('SELECT s.*, p.name FROM sanctions s JOIN players p ON p.id = s.player_id WHERE s.id = ?').bind(id).first();
  if (!s) throw new HttpError('Diese Sanktion gibt es nicht.', 404);
  await db.batch([
    db.prepare('UPDATE sanctions SET active = 0, lifted_by = ?, lifted_at = ? WHERE id = ?').bind(me.id, now(), id),
    db.prepare('UPDATE players SET updated_at = ? WHERE id = ?').bind(now(), s.player_id),
    act(db, me, 'spieler', 'player', s.player_id, `hat bei ${q(s.name)} eine Sanktion aufgehoben (${SANCTION_LABEL[s.type]})`)
  ]);
  return json({ ok: true });
}
async function deleteSanction({ request, env, params }) {
  const me = await requireAdmin(request, env, true);
  const db = env.DB, id = Number(params.id);
  const s = await db.prepare('SELECT s.*, p.name FROM sanctions s JOIN players p ON p.id = s.player_id WHERE s.id = ?').bind(id).first();
  if (!s) return json({ ok: true });
  await db.batch([db.prepare('DELETE FROM sanctions WHERE id = ?').bind(id), act(db, me, 'spieler', 'player', s.player_id, `hat bei ${q(s.name)} einen Eintrag gelöscht (${SANCTION_LABEL[s.type]})`)]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- News für die Startseite
const NEWS_TAGS = ['Ankündigung', 'Update', 'Event', 'Team', 'Changelog', 'Release'];
async function getPublicNews({ env }) {
  await ensureSchema(env.DB);
  const rows = await all(env.DB.prepare('SELECT id, title, body, tag, pinned, created_at FROM news WHERE published = 1 ORDER BY pinned DESC, id DESC LIMIT 4'));
  return new Response(JSON.stringify({ rows }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30' } });
}
async function listNews({ request, env }) {
  await requireAdmin(request, env);
  return json({ rows: await all(env.DB.prepare('SELECT n.*, a.name AS admin_name FROM news n LEFT JOIN admins a ON a.id = n.admin_id ORDER BY n.pinned DESC, n.id DESC')), tags: NEWS_TAGS });
}
function newsFields(b, old = {}) {
  const n = {
    title: has(b, 'title') ? str(b.title, 120) : old.title,
    body: has(b, 'body') ? str(b.body, 4000) : old.body ?? '',
    tag: has(b, 'tag') ? pick(b.tag, NEWS_TAGS, 'Ankündigung') : old.tag ?? 'Ankündigung',
    published: has(b, 'published') ? (b.published ? 1 : 0) : old.published ?? 0,
    pinned: has(b, 'pinned') ? (b.pinned ? 1 : 0) : old.pinned ?? 0
  };
  if (len(n.title) < 3) throw new HttpError('Gib der News eine Überschrift.');
  return n;
}
async function createNews({ request, env }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, n = newsFields(await readBody(request));
  const r = await db.prepare('INSERT INTO news (title, body, tag, published, pinned, admin_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(n.title, n.body, n.tag, n.published, n.pinned, me.id, now(), now()).run();
  await act(db, me, 'news', 'news', r.meta.last_row_id, `hat die News ${q(n.title)} ${n.published ? 'veröffentlicht' : 'als Entwurf angelegt'}`).run();
  return json({ ok: true }, 201);
}
async function updateNews({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const old = await db.prepare('SELECT * FROM news WHERE id = ?').bind(id).first();
  if (!old) throw new HttpError('Diese News gibt es nicht mehr.', 404);
  const n = newsFields(await readBody(request), old);
  const verb = n.published !== old.published ? (n.published ? 'veröffentlicht' : 'offline genommen') : 'bearbeitet';
  await db.batch([
    db.prepare('UPDATE news SET title = ?, body = ?, tag = ?, published = ?, pinned = ?, updated_at = ? WHERE id = ?').bind(n.title, n.body, n.tag, n.published, n.pinned, now(), id),
    act(db, me, 'news', 'news', id, `hat die News ${q(n.title)} ${verb}`)
  ]);
  return json({ ok: true });
}
async function deleteNews({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const old = await db.prepare('SELECT title FROM news WHERE id = ?').bind(id).first();
  if (!old) return json({ ok: true });
  await db.batch([db.prepare('DELETE FROM news WHERE id = ?').bind(id), act(db, me, 'news', 'news', id, `hat die News ${q(old.title)} gelöscht`)]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- Dev: Aufgaben, Roadmap, Checklisten, Kommentare
const TASK_STATUS = ['idee', 'todo', 'arbeit', 'test', 'fertig'];
const TASK_STATUS_LABEL = { idee: 'Ideen', todo: 'To-do', arbeit: 'In Arbeit', test: 'Testen', fertig: 'Fertig' };
const TASK_PRIO = ['niedrig', 'normal', 'hoch', 'kritisch'];
const TASK_CAT = ['Script', 'Mapping', 'Fahrzeuge', 'Kleidung', 'Fraktionen', 'Server', 'Website', 'Launcher', 'Discord', 'Bug', 'Sonstiges'];
const MS_STATUS = ['geplant', 'arbeit', 'fertig'];

async function getDev({ request, env }) {
  await requireAdmin(request, env);
  const db = env.DB;
  const [tasks, milestones, team] = await Promise.all([
    all(db.prepare(`SELECT t.*, a.name AS assignee_name, c.name AS created_by_name,
        (SELECT COUNT(*) FROM dev_comments k WHERE k.task_id = t.id) AS comments,
        (SELECT COUNT(*) FROM dev_checks h WHERE h.task_id = t.id) AS checks,
        (SELECT COUNT(*) FROM dev_checks h WHERE h.task_id = t.id AND h.done = 1) AS checks_done
      FROM dev_tasks t LEFT JOIN admins a ON a.id = t.assignee_id LEFT JOIN admins c ON c.id = t.created_by ORDER BY t.updated_at DESC`)),
    all(db.prepare('SELECT * FROM dev_milestones ORDER BY sort, target IS NULL, target, id')),
    all(db.prepare('SELECT id, name FROM admins WHERE active = 1 ORDER BY name'))
  ]);
  return json({ tasks, milestones, team, statuses: TASK_STATUS, priorities: TASK_PRIO, categories: TASK_CAT });
}

function taskFields(b, old = {}) {
  const t = {
    title: has(b, 'title') ? str(b.title, 120) : old.title,
    body: has(b, 'body') ? str(b.body, 4000) : old.body ?? '',
    status: has(b, 'status') ? pick(b.status, TASK_STATUS, 'todo') : old.status ?? 'todo',
    priority: has(b, 'priority') ? pick(b.priority, TASK_PRIO, 'normal') : old.priority ?? 'normal',
    category: has(b, 'category') ? pick(b.category, TASK_CAT, 'Sonstiges') : old.category ?? 'Sonstiges',
    assignee_id: has(b, 'assignee_id') ? idOrNull(b.assignee_id) : old.assignee_id ?? null,
    milestone_id: has(b, 'milestone_id') ? idOrNull(b.milestone_id) : old.milestone_id ?? null,
    due: has(b, 'due') ? dateOrNull(b.due) : old.due ?? null
  };
  if (!t.title || len(t.title) < 2) throw new HttpError('Gib der Aufgabe einen Titel.');
  return t;
}
async function getTask({ request, env, params }) {
  await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const t = await db.prepare('SELECT t.*, a.name AS assignee_name, c.name AS created_by_name FROM dev_tasks t LEFT JOIN admins a ON a.id = t.assignee_id LEFT JOIN admins c ON c.id = t.created_by WHERE t.id = ?').bind(id).first();
  if (!t) throw new HttpError('Diese Aufgabe gibt es nicht mehr.', 404);
  const [comments, checks] = await Promise.all([
    all(db.prepare('SELECT k.*, a.name AS admin_name FROM dev_comments k LEFT JOIN admins a ON a.id = k.admin_id WHERE k.task_id = ? ORDER BY k.id').bind(id)),
    all(db.prepare('SELECT * FROM dev_checks WHERE task_id = ? ORDER BY sort, id').bind(id))
  ]);
  return json({ task: t, comments, checks });
}
async function createTask({ request, env }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, t = taskFields(await readBody(request));
  const r = await db.prepare(`INSERT INTO dev_tasks (title, body, status, priority, category, assignee_id, milestone_id, due, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(t.title, t.body, t.status, t.priority, t.category, t.assignee_id, t.milestone_id, t.due, me.id, now(), now()).run();
  const id = r.meta.last_row_id;
  await act(db, me, 'dev', 'task', id, t.category === 'Bug' ? `hat einen Bug gemeldet: ${q(t.title)}` : `hat die Aufgabe ${q(t.title)} angelegt`).run();
  return json({ ok: true, id }, 201);
}
async function updateTask({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB;
  const old = await db.prepare('SELECT * FROM dev_tasks WHERE id = ?').bind(Number(params.id)).first();
  if (!old) throw new HttpError('Diese Aufgabe gibt es nicht mehr.', 404);
  const t = taskFields(await readBody(request), old);
  const text = t.status !== old.status ? `hat ${q(t.title)} nach ${TASK_STATUS_LABEL[t.status]} verschoben`
    : t.assignee_id !== old.assignee_id ? `hat die Zuständigkeit für ${q(t.title)} geändert` : `hat die Aufgabe ${q(t.title)} bearbeitet`;
  await db.batch([
    db.prepare(`UPDATE dev_tasks SET title = ?, body = ?, status = ?, priority = ?, category = ?, assignee_id = ?, milestone_id = ?, due = ?, updated_at = ? WHERE id = ?`)
      .bind(t.title, t.body, t.status, t.priority, t.category, t.assignee_id, t.milestone_id, t.due, now(), old.id),
    act(db, me, 'dev', 'task', old.id, text)
  ]);
  return json({ ok: true });
}
async function deleteTask({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const old = await db.prepare('SELECT title FROM dev_tasks WHERE id = ?').bind(id).first();
  if (!old) return json({ ok: true });
  await db.batch([
    db.prepare('DELETE FROM dev_comments WHERE task_id = ?').bind(id), db.prepare('DELETE FROM dev_checks WHERE task_id = ?').bind(id),
    db.prepare('DELETE FROM dev_tasks WHERE id = ?').bind(id), act(db, me, 'dev', 'task', id, `hat die Aufgabe ${q(old.title)} gelöscht`)
  ]);
  return json({ ok: true });
}
async function addComment({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id), body = str((await readBody(request)).body, 3000);
  if (!body) throw new HttpError('Der Kommentar ist leer.');
  const t = await db.prepare('SELECT title FROM dev_tasks WHERE id = ?').bind(id).first();
  if (!t) throw new HttpError('Diese Aufgabe gibt es nicht mehr.', 404);
  await db.batch([
    db.prepare('INSERT INTO dev_comments (task_id, admin_id, body, created_at) VALUES (?, ?, ?, ?)').bind(id, me.id, body, now()),
    db.prepare('UPDATE dev_tasks SET updated_at = ? WHERE id = ?').bind(now(), id),
    act(db, me, 'dev', 'task', id, `hat ${q(t.title)} kommentiert`)
  ]);
  return json({ ok: true }, 201);
}
async function addCheck({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id), text = str((await readBody(request)).text, 200);
  if (!text) throw new HttpError('Der Punkt ist leer.');
  const t = await db.prepare('SELECT title FROM dev_tasks WHERE id = ?').bind(id).first();
  if (!t) throw new HttpError('Diese Aufgabe gibt es nicht mehr.', 404);
  const max = await db.prepare('SELECT COALESCE(MAX(sort), 0) AS s FROM dev_checks WHERE task_id = ?').bind(id).first();
  await db.batch([
    db.prepare('INSERT INTO dev_checks (task_id, text, done, sort) VALUES (?, ?, 0, ?)').bind(id, text, max.s + 1),
    act(db, me, 'dev', 'task', id, `hat bei ${q(t.title)} einen Checklisten-Punkt ergänzt`)
  ]);
  return json({ ok: true }, 201);
}
async function updateCheck({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id), b = await readBody(request);
  const c = await db.prepare('SELECT h.*, t.title FROM dev_checks h JOIN dev_tasks t ON t.id = h.task_id WHERE h.id = ?').bind(id).first();
  if (!c) throw new HttpError('Diesen Punkt gibt es nicht mehr.', 404);
  const done = has(b, 'done') ? (b.done ? 1 : 0) : c.done;
  await db.batch([
    db.prepare('UPDATE dev_checks SET done = ? WHERE id = ?').bind(done, id),
    db.prepare('UPDATE dev_tasks SET updated_at = ? WHERE id = ?').bind(now(), c.task_id),
    act(db, me, 'dev', 'task', c.task_id, `hat bei ${q(c.title)} ${q(c.text)} ${done ? 'abgehakt' : 'wieder geöffnet'}`)
  ]);
  return json({ ok: true });
}
async function deleteCheck({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const c = await db.prepare('SELECT h.*, t.title FROM dev_checks h JOIN dev_tasks t ON t.id = h.task_id WHERE h.id = ?').bind(id).first();
  if (!c) return json({ ok: true });
  await db.batch([db.prepare('DELETE FROM dev_checks WHERE id = ?').bind(id), act(db, me, 'dev', 'task', c.task_id, `hat bei ${q(c.title)} einen Checklisten-Punkt entfernt`)]);
  return json({ ok: true });
}

function msFields(b, old = {}) {
  const m = {
    title: has(b, 'title') ? str(b.title, 80) : old.title,
    body: has(b, 'body') ? str(b.body, 2000) : old.body ?? '',
    target: has(b, 'target') ? str(b.target, 40) : old.target ?? '',
    status: has(b, 'status') ? pick(b.status, MS_STATUS, 'geplant') : old.status ?? 'geplant',
    sort: has(b, 'sort') ? (parseInt(b.sort, 10) || 0) : old.sort ?? 0
  };
  if (!m.title || len(m.title) < 2) throw new HttpError('Gib dem Meilenstein einen Namen.');
  return m;
}
async function createMilestone({ request, env }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, m = msFields(await readBody(request));
  if (!m.sort) m.sort = ((await db.prepare('SELECT MAX(sort) AS s FROM dev_milestones').first())?.s || 0) + 1;
  const r = await db.prepare('INSERT INTO dev_milestones (title, body, target, status, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(m.title, m.body, m.target || null, m.status, m.sort, now()).run();
  await act(db, me, 'dev', 'milestone', r.meta.last_row_id, `hat den Meilenstein ${q(m.title)} angelegt`).run();
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}
async function updateMilestone({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB;
  const old = await db.prepare('SELECT * FROM dev_milestones WHERE id = ?').bind(Number(params.id)).first();
  if (!old) throw new HttpError('Diesen Meilenstein gibt es nicht mehr.', 404);
  const m = msFields(await readBody(request), old);
  await db.batch([
    db.prepare('UPDATE dev_milestones SET title = ?, body = ?, target = ?, status = ?, sort = ? WHERE id = ?').bind(m.title, m.body, m.target || null, m.status, m.sort, old.id),
    act(db, me, 'dev', 'milestone', old.id, m.status !== old.status && m.status === 'fertig' ? `hat den Meilenstein ${q(m.title)} abgeschlossen 🎉` : `hat den Meilenstein ${q(m.title)} bearbeitet`)
  ]);
  return json({ ok: true });
}
async function deleteMilestone({ request, env, params }) {
  const me = await requireAdmin(request, env, true);
  const db = env.DB, id = Number(params.id);
  const old = await db.prepare('SELECT title FROM dev_milestones WHERE id = ?').bind(id).first();
  if (!old) return json({ ok: true });
  await db.batch([db.prepare('UPDATE dev_tasks SET milestone_id = NULL WHERE milestone_id = ?').bind(id), db.prepare('DELETE FROM dev_milestones WHERE id = ?').bind(id), act(db, me, 'dev', 'milestone', id, `hat den Meilenstein ${q(old.title)} gelöscht`)]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- Dev: Scripts / Ressourcen
const RES_STATUS = ['aktiv', 'test', 'geplant', 'aus'];
const RES_KIND = ['ESX', 'Standalone', 'Eigenes Script', 'Map / MLO', 'Fahrzeug', 'Kleidung', 'UI', 'Sonstiges'];
async function listResources({ request, env }) {
  await requireAdmin(request, env);
  return json({ rows: await all(env.DB.prepare('SELECT r.*, a.name AS admin_name FROM dev_resources r LEFT JOIN admins a ON a.id = r.admin_id ORDER BY LOWER(r.name)')), statuses: RES_STATUS, kinds: RES_KIND });
}
function resFields(b, old = {}) {
  const r = {
    name: has(b, 'name') ? str(b.name, 80) : old.name,
    version: has(b, 'version') ? str(b.version, 30) : old.version ?? '',
    kind: has(b, 'kind') ? pick(b.kind, RES_KIND, 'Sonstiges') : old.kind ?? 'Sonstiges',
    status: has(b, 'status') ? pick(b.status, RES_STATUS, 'aktiv') : old.status ?? 'aktiv',
    source: has(b, 'source') ? str(b.source, 300) : old.source ?? '',
    notes: has(b, 'notes') ? str(b.notes, 3000) : old.notes ?? ''
  };
  if (len(r.name) < 2) throw new HttpError('Gib den Ressourcen-Namen an, z. B. esx_garage.');
  return r;
}
async function createResource({ request, env }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, r = resFields(await readBody(request));
  const res = await db.prepare('INSERT INTO dev_resources (name, version, kind, status, source, notes, admin_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(r.name, r.version, r.kind, r.status, r.source, r.notes, me.id, now()).run();
  await act(db, me, 'dev', 'resource', res.meta.last_row_id, `hat das Script ${q(r.name)} eingetragen`).run();
  return json({ ok: true }, 201);
}
async function updateResource({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const old = await db.prepare('SELECT * FROM dev_resources WHERE id = ?').bind(id).first();
  if (!old) throw new HttpError('Dieses Script gibt es nicht mehr.', 404);
  const r = resFields(await readBody(request), old);
  await db.batch([
    db.prepare('UPDATE dev_resources SET name = ?, version = ?, kind = ?, status = ?, source = ?, notes = ?, admin_id = ?, updated_at = ? WHERE id = ?').bind(r.name, r.version, r.kind, r.status, r.source, r.notes, me.id, now(), id),
    act(db, me, 'dev', 'resource', id, r.status !== old.status ? `hat ${q(r.name)} auf „${r.status}“ gesetzt` : `hat das Script ${q(r.name)} bearbeitet`)
  ]);
  return json({ ok: true });
}
async function deleteResource({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const old = await db.prepare('SELECT name FROM dev_resources WHERE id = ?').bind(id).first();
  if (!old) return json({ ok: true });
  await db.batch([db.prepare('DELETE FROM dev_resources WHERE id = ?').bind(id), act(db, me, 'dev', 'resource', id, `hat das Script ${q(old.name)} entfernt`)]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- Dev: Wiki
async function listDocs({ request, env }) {
  await requireAdmin(request, env);
  return json({ rows: await all(env.DB.prepare('SELECT d.*, a.name AS admin_name FROM dev_docs d LEFT JOIN admins a ON a.id = d.admin_id ORDER BY LOWER(COALESCE(d.category, \'\')), LOWER(d.title)')) });
}
function docFields(b, old = {}) {
  const d = {
    title: has(b, 'title') ? str(b.title, 100) : old.title,
    category: has(b, 'category') ? str(b.category, 40) : old.category ?? '',
    body: has(b, 'body') ? str(b.body, 30000) : old.body ?? ''
  };
  if (len(d.title) < 2) throw new HttpError('Gib der Seite einen Titel.');
  return d;
}
async function createDoc({ request, env }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, d = docFields(await readBody(request));
  const r = await db.prepare('INSERT INTO dev_docs (title, category, body, admin_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(d.title, d.category, d.body, me.id, now(), now()).run();
  await act(db, me, 'dev', 'doc', r.meta.last_row_id, `hat die Wiki-Seite ${q(d.title)} angelegt`).run();
  return json({ ok: true, id: r.meta.last_row_id }, 201);
}
async function updateDoc({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const old = await db.prepare('SELECT * FROM dev_docs WHERE id = ?').bind(id).first();
  if (!old) throw new HttpError('Diese Wiki-Seite gibt es nicht mehr.', 404);
  const d = docFields(await readBody(request), old);
  await db.batch([
    db.prepare('UPDATE dev_docs SET title = ?, category = ?, body = ?, admin_id = ?, updated_at = ? WHERE id = ?').bind(d.title, d.category, d.body, me.id, now(), id),
    act(db, me, 'dev', 'doc', id, `hat die Wiki-Seite ${q(d.title)} bearbeitet`)
  ]);
  return json({ ok: true });
}
async function deleteDoc({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const old = await db.prepare('SELECT title FROM dev_docs WHERE id = ?').bind(id).first();
  if (!old) return json({ ok: true });
  await db.batch([db.prepare('DELETE FROM dev_docs WHERE id = ?').bind(id), act(db, me, 'dev', 'doc', id, `hat die Wiki-Seite ${q(old.title)} gelöscht`)]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- Launcher-Steuerung
// Der Launcher lädt GET /api/launcher und überschreibt damit seine eingebauten Werte.
// Nur Felder, die hier gesetzt sind, werden überschrieben.
const NEWS_COLORS = { 'Ankündigung': '#ff4fb3', 'Update': '#7aa8ff', 'Event': '#ffc04f', 'Team': '#b47cff', 'Changelog': '#4fe0a0', 'Release': '#ff7a45', 'Launcher': '#4fe0a0', 'Wartung': '#ff5a6e' };
const NOTICE_STYLES = ['info', 'warn', 'bad', 'ok'];
const LAUNCHER_IMAGES = ['', 'gallery/01-late-night-ride.jpg', 'gallery/02-sunset.jpg', 'gallery/03-low-and-slow.jpg', 'gallery/04-neon-glow.jpg', 'gallery/05-street-livery.jpg'];
const LAUNCHER_DEFAULT = {
  locked: true, releaseDate: null, serverCode: 'qqabgvz', connect: '', discord: 'https://discord.gg/q9kBzXP9va', website: '',
  notice: { text: '', style: 'info', link: '' }, newsSource: 'launcher', news: [],
  download: { url: 'https://www.dropbox.com/scl/fi/jlrknch6vuxjc01t0plbf/Real-Life-Southland-Setup-1.6.0.exe?rlkey=1azaxh4ahkkrcyo0ovikppefw&st=sejctbcj&dl=1', version: '1.6.0', size: '', sha256: '' }, updated_at: null, updated_by: null
};
async function getLauncherSettings(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'launcher'").first();
  let s = {}; try { s = row ? JSON.parse(row.value) : {}; } catch {}
  return { ...LAUNCHER_DEFAULT, ...s, notice: { ...LAUNCHER_DEFAULT.notice, ...(s.notice || {}) }, download: { ...LAUNCHER_DEFAULT.download, ...(s.download || {}) } };
}
const deDate = (iso) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };

async function getPublicLauncher({ env, url }) {
  const db = env.DB; await ensureSchema(db);
  const s = await getLauncherSettings(db);
  const out = { locked: !!s.locked, releaseDate: s.releaseDate || null, serverCode: s.serverCode, connect: s.connect || null, discord: s.discord };
  if (s.website) out.website = s.website;
  else out.website = url.origin + '/';
  out.download = { url: s.download.url || null, version: s.download.version || null, size: s.download.size || null, sha256: s.download.sha256 || null };
  out.notice = s.notice.text ? { text: s.notice.text, style: s.notice.style, link: s.notice.link || null } : null;
  if (s.newsSource === 'website') {
    const rows = await all(db.prepare('SELECT title, body, tag, created_at FROM news WHERE published = 1 ORDER BY pinned DESC, id DESC LIMIT 6'));
    if (rows.length) out.news = rows.map((n, i) => ({
      tag: n.tag, color: NEWS_COLORS[n.tag] || '#ff4fb3', date: deDate(n.created_at), title: n.title,
      text: String(n.body || '').split('\n').map((l) => l.replace(/^\s*[-*]\s+/, '• ').trim()).filter(Boolean).join('  '),
      ...(i === 0 ? { image: 'gallery/01-late-night-ride.jpg' } : {})
    }));
  } else if (s.news.length) out.news = s.news;
  return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' } });
}

async function getLauncherAdmin({ request, env }) {
  await requireAdmin(request, env);
  const s = await getLauncherSettings(env.DB);
  let by = null;
  if (s.updated_by) by = (await env.DB.prepare('SELECT name FROM admins WHERE id = ?').bind(s.updated_by).first())?.name || null;
  return json({ settings: s, updated_by_name: by, images: LAUNCHER_IMAGES, tags: Object.keys(NEWS_COLORS), colors: NEWS_COLORS });
}

async function saveLauncher({ request, env }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, b = await readBody(request), old = await getLauncherSettings(db);
  const urlOk = (v) => { v = str(v, 300); if (v && !/^https:\/\/\S+$/.test(v)) throw new HttpError('Links müssen mit https:// anfangen.'); return v; };
  let releaseDate = null;
  if (b.releaseDate) { const d = new Date(b.releaseDate); if (isNaN(d)) throw new HttpError('Das Release-Datum ist ungültig.'); releaseDate = d.toISOString(); }
  const news = (Array.isArray(b.news) ? b.news : []).slice(0, 12).map((n) => {
    const tag = str(n.tag, 30) || 'Ankündigung';
    const item = { tag, color: /^#[0-9a-f]{6}$/i.test(n.color || '') ? n.color : (NEWS_COLORS[tag] || '#ff4fb3'), date: str(n.date, 30), title: str(n.title, 120), text: str(n.text, 1500) };
    if (LAUNCHER_IMAGES.includes(n.image) && n.image) item.image = n.image;
    return item;
  }).filter((n) => n.title);
  const s = {
    locked: !!b.locked, releaseDate,
    serverCode: str(b.serverCode, 20).replace(/[^a-z0-9]/gi, '') || old.serverCode,
    connect: str(b.connect, 80), discord: urlOk(b.discord), website: urlOk(b.website),
    notice: { text: str(b.notice?.text, 200), style: pick(b.notice?.style, NOTICE_STYLES, 'info'), link: urlOk(b.notice?.link) },
    newsSource: b.newsSource === 'website' ? 'website' : 'launcher', news,
    download: {
      url: urlOk(b.download?.url).replace(/([?&])dl=0(&|$)/, '$1dl=1$2'),
      version: str(b.download?.version, 20), size: str(b.download?.size, 20),
      sha256: (() => { const h = str(b.download?.sha256, 80).toLowerCase(); if (h && !/^[0-9a-f]{64}$/.test(h)) throw new HttpError('Die SHA-256-Prüfsumme muss 64 Zeichen lang sein (0–9, a–f).'); return h; })()
    },
    updated_at: now(), updated_by: me.id
  };
  const changes = [];
  if (s.locked !== old.locked) changes.push(s.locked ? 'Spielen gesperrt' : 'Spielen freigegeben');
  if (s.releaseDate !== old.releaseDate) changes.push(s.releaseDate ? 'Release-Datum gesetzt' : 'Release-Datum entfernt');
  if (s.notice.text !== old.notice.text) changes.push(s.notice.text ? 'Hinweis geändert' : 'Hinweis entfernt');
  if (JSON.stringify(s.news) !== JSON.stringify(old.news) || s.newsSource !== old.newsSource) changes.push('News geändert');
  if (s.download.url !== old.download.url || s.download.version !== old.download.version) changes.push(`Download auf Version ${s.download.version || '?'} gesetzt`);
  await db.batch([
    db.prepare("INSERT INTO settings (key, value) VALUES ('launcher', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(s)),
    act(db, me, 'team', 'launcher', null, `hat den Launcher geändert${changes.length ? ': ' + changes.join(', ') : ''}`)
  ]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- Team-Management
// Teamakten, Kalender & Besprechungen, Abwesenheiten, Abstimmungen, Textbausteine, Statistik
const TEAM_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS team_profiles (admin_id INTEGER PRIMARY KEY, rank TEXT, area TEXT, discord TEXT, joined TEXT, probation_until TEXT, bio TEXT, onboarding TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS team_records (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, by_id INTEGER, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'meeting', starts_at TEXT NOT NULL, ends_at TEXT, location TEXT, body TEXT, protocol TEXT, created_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS event_rsvp (event_id INTEGER NOT NULL, admin_id INTEGER NOT NULL, status TEXT NOT NULL, PRIMARY KEY (event_id, admin_id))`,
  `CREATE TABLE IF NOT EXISTS absences (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL, from_date TEXT NOT NULL, to_date TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT NOT NULL, body TEXT, options TEXT NOT NULL, anonymous INTEGER NOT NULL DEFAULT 0, closes_at TEXT, closed INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS poll_votes (poll_id INTEGER NOT NULL, admin_id INTEGER NOT NULL, option INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (poll_id, admin_id))`,
  `CREATE TABLE IF NOT EXISTS snippets (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, title TEXT NOT NULL, body TEXT NOT NULL, uses INTEGER NOT NULL DEFAULT 0, admin_id INTEGER, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_events_start ON events(starts_at)`,
  `CREATE INDEX IF NOT EXISTS idx_absences_to ON absences(to_date)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_admin ON activity(admin_id, created_at)`
];
PANEL_SCHEMA.push(...TEAM_SCHEMA);

const RANKS = ['Projektinhaber', 'Projektleitung', 'Stv. Projektleitung', 'Head-Admin', 'Admin', 'Moderator', 'Supporter', 'Test-Supporter', 'Developer', 'Mapper', 'Eventmanager', 'Social Media'];
const AREAS = ['Leitung', 'Support', 'Moderation', 'Entwicklung', 'Mapping', 'Events', 'Fraktionsbetreuung', 'Social Media'];
const ONBOARDING = ['Regelwerk gelesen und verstanden', 'Discord-Rollen erhalten', 'txAdmin-Zugang eingerichtet', 'Panel-Einweisung bekommen', 'Erstes Ticket begleitet', 'Sanktions-Richtlinien besprochen', 'Probezeit-Gespräch geführt'];
const RECORD_KINDS = ['lob', 'hinweis', 'verwarnung'];
const RECORD_LABEL = { lob: 'Lob', hinweis: 'Hinweis', verwarnung: 'Team-Verwarnung' };
const EVENT_KINDS = ['meeting', 'event', 'schulung', 'wartung', 'release', 'sonstiges'];
const EVENT_LABEL = { meeting: 'Teammeeting', event: 'Server-Event', schulung: 'Schulung', wartung: 'Wartung', release: 'Release', sonstiges: 'Sonstiges' };
const RSVP = ['ja', 'vielleicht', 'nein'];
const isoOrNull = (v) => { if (!v) return null; const d = new Date(v); if (isNaN(d)) throw new HttpError('Ungültiges Datum.'); return d.toISOString(); };
const canManage = (me, ownerId) => me.role === 'owner' || me.id === ownerId;

// ---------- Teamliste & Teamakten
async function getTeamList({ request, env }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, today = now().slice(0, 10), since = isoAgo(30 * 864e5);
  const rows = await all(db.prepare(`SELECT a.id, a.name, a.role, a.active, a.last_login, a.created_at, p.rank, p.area, p.discord, p.joined, p.probation_until, p.bio, p.onboarding,
      (SELECT COUNT(*) FROM activity v WHERE v.admin_id = a.id AND v.created_at > ?) AS actions30,
      (SELECT MAX(v.created_at) FROM activity v WHERE v.admin_id = a.id) AS last_action,
      (SELECT x.to_date || '|' || COALESCE(x.reason, '') FROM absences x WHERE x.admin_id = a.id AND x.from_date <= ? AND x.to_date >= ? ORDER BY x.to_date DESC LIMIT 1) AS away,
      (SELECT COUNT(*) FROM team_records r WHERE r.admin_id = a.id AND r.kind = 'verwarnung') AS warns,
      (SELECT COUNT(*) FROM team_records r WHERE r.admin_id = a.id AND r.kind = 'lob') AS praise
    FROM admins a LEFT JOIN team_profiles p ON p.admin_id = a.id ORDER BY a.active DESC, a.name`).bind(since, today, today));
  const out = rows.map((r) => {
    let ob = {}; try { ob = JSON.parse(r.onboarding || '{}'); } catch {}
    const o = { ...r, onboarding: ob, away: r.away ? { until: r.away.split('|')[0], reason: r.away.split('|').slice(1).join('|') } : null };
    if (me.role !== 'owner' && me.id !== r.id) { delete o.warns; delete o.praise; }
    return o;
  });
  return json({ rows: out, ranks: RANKS, areas: AREAS, onboardingItems: ONBOARDING });
}

async function getTeamMember({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const a = await db.prepare('SELECT a.id, a.name, a.role, a.active, a.last_login, a.created_at, p.* FROM admins a LEFT JOIN team_profiles p ON p.admin_id = a.id WHERE a.id = ?').bind(id).first();
  if (!a) throw new HttpError('Dieses Teammitglied gibt es nicht.', 404);
  a.id = id; let ob = {}; try { ob = JSON.parse(a.onboarding || '{}'); } catch {} a.onboarding = ob;
  const mayRecords = me.role === 'owner' || me.id === id;
  const [records, recent, absences, kinds] = await Promise.all([
    mayRecords ? all(db.prepare('SELECT r.*, b.name AS by_name FROM team_records r LEFT JOIN admins b ON b.id = r.by_id WHERE r.admin_id = ? ORDER BY r.id DESC').bind(id)) : [],
    all(db.prepare('SELECT * FROM activity WHERE admin_id = ? ORDER BY id DESC LIMIT 15').bind(id)),
    all(db.prepare('SELECT * FROM absences WHERE admin_id = ? AND to_date >= ? ORDER BY from_date').bind(id, now().slice(0, 10))),
    all(db.prepare('SELECT kind, COUNT(*) AS n FROM activity WHERE admin_id = ? AND created_at > ? GROUP BY kind').bind(id, isoAgo(30 * 864e5)))
  ]);
  return json({ member: a, records, recent, absences, kinds, mayRecords, ranks: RANKS, areas: AREAS, onboardingItems: ONBOARDING });
}

async function saveTeamProfile({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id), b = await readBody(request);
  const t = await db.prepare('SELECT name FROM admins WHERE id = ?').bind(id).first();
  if (!t) throw new HttpError('Dieses Teammitglied gibt es nicht.', 404);
  const old = (await db.prepare('SELECT * FROM team_profiles WHERE admin_id = ?').bind(id).first()) || {};
  const owner = me.role === 'owner';
  if (!owner && me.id !== id) throw new HttpError('Fremde Profile ändert nur die Projektleitung.', 403);
  const p = {
    discord: has(b, 'discord') ? str(b.discord, 60) : old.discord ?? '',
    bio: has(b, 'bio') ? str(b.bio, 1000) : old.bio ?? '',
    rank: old.rank ?? '', area: old.area ?? '', joined: old.joined ?? null, probation_until: old.probation_until ?? null, onboarding: old.onboarding ?? '{}'
  };
  const restricted = ['rank', 'area', 'joined', 'probation_until', 'onboarding'].filter((k) => has(b, k));
  if (restricted.length && !owner) throw new HttpError('Rang, Bereich, Probezeit und Einarbeitung ändert nur die Projektleitung.', 403);
  if (has(b, 'rank')) p.rank = str(b.rank, 40);
  if (has(b, 'area')) p.area = str(b.area, 40);
  if (has(b, 'joined')) p.joined = dateOrNull(b.joined);
  if (has(b, 'probation_until')) p.probation_until = dateOrNull(b.probation_until);
  if (has(b, 'onboarding')) { const o = {}; for (const k of ONBOARDING) if (b.onboarding && b.onboarding[k]) o[k] = true; p.onboarding = JSON.stringify(o); }
  const text = has(b, 'onboarding') && Object.keys(b).length === 1 ? `hat die Einarbeitung von ${q(t.name)} aktualisiert`
    : has(b, 'rank') && p.rank !== old.rank ? `hat ${q(t.name)} den Rang „${p.rank || '–'}“ gegeben` : me.id === id ? 'hat sein Team-Profil bearbeitet' : `hat das Profil von ${q(t.name)} bearbeitet`;
  await db.batch([
    db.prepare(`INSERT INTO team_profiles (admin_id, rank, area, discord, joined, probation_until, bio, onboarding, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(admin_id) DO UPDATE SET rank = excluded.rank, area = excluded.area, discord = excluded.discord, joined = excluded.joined, probation_until = excluded.probation_until, bio = excluded.bio, onboarding = excluded.onboarding, updated_at = excluded.updated_at`)
      .bind(id, p.rank, p.area, p.discord, p.joined, p.probation_until, p.bio, p.onboarding, now()),
    act(db, me, 'team', 'profile', id, text)
  ]);
  return json({ ok: true });
}

async function addTeamRecord({ request, env, params, ctx }) {
  const me = await requireAdmin(request, env, true);
  const db = env.DB, id = Number(params.id), b = await readBody(request);
  const t = await db.prepare('SELECT name FROM admins WHERE id = ?').bind(id).first();
  if (!t) throw new HttpError('Dieses Teammitglied gibt es nicht.', 404);
  const kind = pick(b.kind, RECORD_KINDS, ''), text = str(b.text, 1500);
  if (!kind) throw new HttpError('Wähl die Art des Eintrags.');
  if (len(text) < 3) throw new HttpError('Schreib kurz, worum es geht.');
  await db.batch([
    db.prepare('INSERT INTO team_records (admin_id, kind, text, by_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, kind, text, me.id, now()),
    act(db, me, 'team', 'profile', id, kind === 'lob' ? `hat ${q(t.name)} gelobt 🌟` : `hat in der Teamakte von ${q(t.name)} etwas vermerkt`)
  ]);
  return json({ ok: true }, 201);
}
async function deleteTeamRecord({ request, env, params }) {
  const me = await requireAdmin(request, env, true);
  const db = env.DB, id = Number(params.id);
  const r = await db.prepare('SELECT r.admin_id, a.name FROM team_records r JOIN admins a ON a.id = r.admin_id WHERE r.id = ?').bind(id).first();
  if (!r) return json({ ok: true });
  await db.batch([db.prepare('DELETE FROM team_records WHERE id = ?').bind(id), act(db, me, 'team', 'profile', r.admin_id, `hat einen Eintrag aus der Teamakte von ${q(r.name)} entfernt`)]);
  return json({ ok: true });
}

// ---------- Kalender & Besprechungen
async function listEvents({ request, env, url }) {
  const me = await requireAdmin(request, env);
  const db = env.DB;
  const from = isoOrNull(url.searchParams.get('from')) || isoAgo(40 * 864e5);
  const to = isoOrNull(url.searchParams.get('to')) || new Date(Date.now() + 120 * 864e5).toISOString();
  const [events, rsvps, absences, team] = await Promise.all([
    all(db.prepare('SELECT e.*, c.name AS created_by_name FROM events e LEFT JOIN admins c ON c.id = e.created_by WHERE e.starts_at >= ? AND e.starts_at <= ? ORDER BY e.starts_at').bind(from, to)),
    all(db.prepare('SELECT r.event_id, r.admin_id, r.status, a.name FROM event_rsvp r JOIN admins a ON a.id = r.admin_id WHERE r.event_id IN (SELECT id FROM events WHERE starts_at >= ? AND starts_at <= ?)').bind(from, to)),
    all(db.prepare('SELECT x.*, a.name FROM absences x JOIN admins a ON a.id = x.admin_id WHERE x.to_date >= ? AND x.from_date <= ? ORDER BY x.from_date').bind(from.slice(0, 10), to.slice(0, 10))),
    all(db.prepare('SELECT id, name FROM admins WHERE active = 1 ORDER BY name'))
  ]);
  for (const e of events) { e.rsvp = rsvps.filter((r) => r.event_id === e.id).map(({ admin_id, status, name }) => ({ admin_id, status, name })); e.mine = e.rsvp.find((r) => r.admin_id === me.id)?.status || null; }
  return json({ events, absences, team, kinds: EVENT_LABEL });
}
function eventFields(b, old = {}) {
  const e = {
    title: has(b, 'title') ? str(b.title, 120) : old.title,
    kind: has(b, 'kind') ? pick(b.kind, EVENT_KINDS, 'meeting') : old.kind ?? 'meeting',
    starts_at: has(b, 'starts_at') ? isoOrNull(b.starts_at) : old.starts_at,
    ends_at: has(b, 'ends_at') ? isoOrNull(b.ends_at) : old.ends_at ?? null,
    location: has(b, 'location') ? str(b.location, 120) : old.location ?? '',
    body: has(b, 'body') ? str(b.body, 6000) : old.body ?? '',
    protocol: has(b, 'protocol') ? str(b.protocol, 20000) : old.protocol ?? ''
  };
  if (len(e.title) < 2) throw new HttpError('Gib dem Termin einen Titel.');
  if (!e.starts_at) throw new HttpError('Wann ist der Termin?');
  if (e.ends_at && e.ends_at < e.starts_at) throw new HttpError('Das Ende liegt vor dem Beginn.');
  return e;
}
async function createEvent({ request, env, ctx }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, e = eventFields(await readBody(request));
  const r = await db.prepare('INSERT INTO events (title, kind, starts_at, ends_at, location, body, protocol, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(e.title, e.kind, e.starts_at, e.ends_at, e.location, e.body, e.protocol, me.id, now(), now()).run();
  const id = r.meta.last_row_id;
  await db.batch([
    db.prepare("INSERT INTO event_rsvp (event_id, admin_id, status) VALUES (?, ?, 'ja')").bind(id, me.id),
    act(db, me, 'team', 'event', id, `hat den Termin ${q(e.title)} angelegt (${EVENT_LABEL[e.kind]})`)
  ]);
  const when = new Date(e.starts_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'full', timeStyle: 'short' });
  await discordNotify(env, ctx, { title: `📅 ${EVENT_LABEL[e.kind]}: ${e.title}`, color: 0x7aa8ff, url: siteLink(env, '/admin/#kalender'), description: `**Wann:** ${when}${e.location ? `\n**Wo:** ${e.location}` : ''}\nZu- oder absagen im Team-Panel.` });
  return json({ ok: true, id }, 201);
}
async function updateEvent({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const old = await db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
  if (!old) throw new HttpError('Diesen Termin gibt es nicht mehr.', 404);
  const b = await readBody(request), e = eventFields(b, old);
  const onlyProtocol = Object.keys(b).length === 1 && has(b, 'protocol');
  await db.batch([
    db.prepare('UPDATE events SET title = ?, kind = ?, starts_at = ?, ends_at = ?, location = ?, body = ?, protocol = ?, updated_at = ? WHERE id = ?').bind(e.title, e.kind, e.starts_at, e.ends_at, e.location, e.body, e.protocol, now(), id),
    act(db, me, 'team', 'event', id, onlyProtocol ? `hat das Protokoll zu ${q(e.title)} geschrieben` : `hat den Termin ${q(e.title)} bearbeitet`)
  ]);
  return json({ ok: true });
}
async function deleteEvent({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const old = await db.prepare('SELECT title, created_by FROM events WHERE id = ?').bind(id).first();
  if (!old) return json({ ok: true });
  if (!canManage(me, old.created_by)) throw new HttpError('Nur wer den Termin angelegt hat oder der Owner darf ihn löschen.', 403);
  await db.batch([db.prepare('DELETE FROM event_rsvp WHERE event_id = ?').bind(id), db.prepare('DELETE FROM events WHERE id = ?').bind(id), act(db, me, 'team', 'event', id, `hat den Termin ${q(old.title)} abgesagt`)]);
  return json({ ok: true });
}
async function rsvpEvent({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id), status = pick((await readBody(request)).status, RSVP, '');
  if (!status) throw new HttpError('Zusage, Vielleicht oder Absage?');
  const e = await db.prepare('SELECT title FROM events WHERE id = ?').bind(id).first();
  if (!e) throw new HttpError('Diesen Termin gibt es nicht mehr.', 404);
  await db.batch([
    db.prepare('INSERT INTO event_rsvp (event_id, admin_id, status) VALUES (?, ?, ?) ON CONFLICT(event_id, admin_id) DO UPDATE SET status = excluded.status').bind(id, me.id, status),
    act(db, me, 'team', 'event', id, `hat für ${q(e.title)} ${status === 'ja' ? 'zugesagt ✅' : status === 'nein' ? 'abgesagt' : 'mit „vielleicht“ geantwortet'}`)
  ]);
  return json({ ok: true });
}

// ---------- Abwesenheiten
async function createAbsence({ request, env }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, b = await readBody(request);
  const from = dateOrNull(b.from_date), to = dateOrNull(b.to_date), reason = str(b.reason, 200);
  let who = me.id;
  if (b.admin_id && Number(b.admin_id) !== me.id) { if (me.role !== 'owner') throw new HttpError('Für andere trägt nur der Owner Abwesenheiten ein.', 403); who = Number(b.admin_id); }
  if (!from || !to) throw new HttpError('Von wann bis wann bist du weg?');
  if (to < from) throw new HttpError('„Bis“ liegt vor „Von“.');
  const name = (await db.prepare('SELECT name FROM admins WHERE id = ?').bind(who).first())?.name || '?';
  const r = await db.prepare('INSERT INTO absences (admin_id, from_date, to_date, reason, created_at) VALUES (?, ?, ?, ?, ?)').bind(who, from, to, reason, now()).run();
  const fmtD = (d) => d.split('-').reverse().join('.');
  await act(db, me, 'team', 'absence', r.meta.last_row_id, `${who === me.id ? 'ist abwesend' : `hat ${q(name)} als abwesend eingetragen:`} ${fmtD(from)} – ${fmtD(to)}${reason ? ' (' + reason + ')' : ''}`).run();
  return json({ ok: true }, 201);
}
async function deleteAbsence({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const x = await db.prepare('SELECT * FROM absences WHERE id = ?').bind(id).first();
  if (!x) return json({ ok: true });
  if (!canManage(me, x.admin_id)) throw new HttpError('Das darf nur die Person selbst oder der Owner.', 403);
  await db.batch([db.prepare('DELETE FROM absences WHERE id = ?').bind(id), act(db, me, 'team', 'absence', id, 'hat eine Abwesenheit gelöscht')]);
  return json({ ok: true });
}

// ---------- Abstimmungen
async function listPolls({ request, env }) {
  const me = await requireAdmin(request, env);
  const db = env.DB;
  const [polls, votes, team] = await Promise.all([
    all(db.prepare('SELECT p.*, c.name AS created_by_name FROM polls p LEFT JOIN admins c ON c.id = p.created_by ORDER BY (p.closed = 0 AND (p.closes_at IS NULL OR p.closes_at > ?)) DESC, p.id DESC LIMIT 60').bind(now())),
    all(db.prepare('SELECT v.poll_id, v.admin_id, v.option, a.name FROM poll_votes v JOIN admins a ON a.id = v.admin_id')),
    db.prepare('SELECT COUNT(*) AS n FROM admins WHERE active = 1').first()
  ]);
  const n = now();
  const rows = polls.map((p) => {
    let options = []; try { options = JSON.parse(p.options); } catch {}
    const vs = votes.filter((v) => v.poll_id === p.id);
    const open = !p.closed && (!p.closes_at || p.closes_at > n);
    return {
      ...p, options, open, total: vs.length, teamSize: team.n,
      counts: options.map((_, i) => vs.filter((v) => v.option === i).length),
      voters: p.anonymous ? null : options.map((_, i) => vs.filter((v) => v.option === i).map((v) => v.name)),
      mine: vs.find((v) => v.admin_id === me.id)?.option ?? null
    };
  });
  return json({ rows });
}
async function createPoll({ request, env, ctx }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, b = await readBody(request);
  const question = str(b.question, 200), body = str(b.body, 2000);
  const options = (Array.isArray(b.options) ? b.options : []).map((o) => str(o, 100)).filter(Boolean).slice(0, 10);
  if (len(question) < 3) throw new HttpError('Wie lautet die Frage?');
  if (options.length < 2) throw new HttpError('Eine Abstimmung braucht mindestens zwei Antworten.');
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new HttpError('Jede Antwort darf nur einmal vorkommen.');
  const closes = isoOrNull(b.closes_at);
  const r = await db.prepare('INSERT INTO polls (question, body, options, anonymous, closes_at, closed, created_by, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
    .bind(question, body, JSON.stringify(options), b.anonymous ? 1 : 0, closes, me.id, now()).run();
  await act(db, me, 'team', 'poll', r.meta.last_row_id, `hat eine Abstimmung gestartet: ${q(question)}`).run();
  await discordNotify(env, ctx, { title: `🗳️ Neue Abstimmung: ${question}`, color: 0xb47cff, url: siteLink(env, '/admin/#abstimmungen'), description: options.map((o) => '• ' + o).join('\n') + '\n\nAbstimmen im Team-Panel.' });
  return json({ ok: true }, 201);
}
async function votePoll({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id), b = await readBody(request);
  const p = await db.prepare('SELECT * FROM polls WHERE id = ?').bind(id).first();
  if (!p) throw new HttpError('Diese Abstimmung gibt es nicht mehr.', 404);
  if (p.closed || (p.closes_at && p.closes_at <= now())) throw new HttpError('Diese Abstimmung ist schon beendet.');
  const n = JSON.parse(p.options).length, opt = parseInt(b.option, 10);
  if (!(opt >= 0 && opt < n)) throw new HttpError('Ungültige Antwort.');
  await db.batch([
    db.prepare('INSERT INTO poll_votes (poll_id, admin_id, option, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(poll_id, admin_id) DO UPDATE SET option = excluded.option, created_at = excluded.created_at').bind(id, me.id, opt, now()),
    act(db, me, 'team', 'poll', id, `hat bei ${q(p.question)} abgestimmt`)
  ]);
  return json({ ok: true });
}
async function closePoll({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const p = await db.prepare('SELECT question, created_by FROM polls WHERE id = ?').bind(id).first();
  if (!p) throw new HttpError('Diese Abstimmung gibt es nicht mehr.', 404);
  if (!canManage(me, p.created_by)) throw new HttpError('Beenden darf nur, wer sie gestartet hat, oder der Owner.', 403);
  await db.batch([db.prepare('UPDATE polls SET closed = 1 WHERE id = ?').bind(id), act(db, me, 'team', 'poll', id, `hat die Abstimmung ${q(p.question)} beendet`)]);
  return json({ ok: true });
}
async function deletePoll({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const p = await db.prepare('SELECT question, created_by FROM polls WHERE id = ?').bind(id).first();
  if (!p) return json({ ok: true });
  if (!canManage(me, p.created_by)) throw new HttpError('Löschen darf nur, wer sie gestartet hat, oder der Owner.', 403);
  await db.batch([db.prepare('DELETE FROM poll_votes WHERE poll_id = ?').bind(id), db.prepare('DELETE FROM polls WHERE id = ?').bind(id), act(db, me, 'team', 'poll', id, `hat die Abstimmung ${q(p.question)} gelöscht`)]);
  return json({ ok: true });
}

// ---------- Textbausteine
async function listSnippets({ request, env }) {
  await requireAdmin(request, env);
  return json({ rows: await all(env.DB.prepare('SELECT s.*, a.name AS admin_name FROM snippets s LEFT JOIN admins a ON a.id = s.admin_id ORDER BY LOWER(COALESCE(s.category, \'\')), s.uses DESC, LOWER(s.title)')) });
}
function snippetFields(b, old = {}) {
  const s = { category: has(b, 'category') ? str(b.category, 40) : old.category ?? '', title: has(b, 'title') ? str(b.title, 100) : old.title, body: has(b, 'body') ? str(b.body, 4000) : old.body };
  if (len(s.title) < 2) throw new HttpError('Gib dem Textbaustein einen Namen.');
  if (len(s.body) < 2) throw new HttpError('Der Text ist leer.');
  return s;
}
async function createSnippet({ request, env }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, s = snippetFields(await readBody(request));
  const r = await db.prepare('INSERT INTO snippets (category, title, body, uses, admin_id, updated_at) VALUES (?, ?, ?, 0, ?, ?)').bind(s.category, s.title, s.body, me.id, now()).run();
  await act(db, me, 'team', 'snippet', r.meta.last_row_id, `hat den Textbaustein ${q(s.title)} angelegt`).run();
  return json({ ok: true }, 201);
}
async function updateSnippet({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const old = await db.prepare('SELECT * FROM snippets WHERE id = ?').bind(id).first();
  if (!old) throw new HttpError('Diesen Textbaustein gibt es nicht mehr.', 404);
  const s = snippetFields(await readBody(request), old);
  await db.batch([db.prepare('UPDATE snippets SET category = ?, title = ?, body = ?, admin_id = ?, updated_at = ? WHERE id = ?').bind(s.category, s.title, s.body, me.id, now(), id), act(db, me, 'team', 'snippet', id, `hat den Textbaustein ${q(s.title)} bearbeitet`)]);
  return json({ ok: true });
}
async function useSnippet({ request, env, params }) {
  await requireAdmin(request, env);
  await env.DB.prepare('UPDATE snippets SET uses = uses + 1 WHERE id = ?').bind(Number(params.id)).run();
  return json({ ok: true });
}
async function deleteSnippet({ request, env, params }) {
  const me = await requireAdmin(request, env);
  const db = env.DB, id = Number(params.id);
  const old = await db.prepare('SELECT title FROM snippets WHERE id = ?').bind(id).first();
  if (!old) return json({ ok: true });
  await db.batch([db.prepare('DELETE FROM snippets WHERE id = ?').bind(id), act(db, me, 'team', 'snippet', id, `hat den Textbaustein ${q(old.title)} gelöscht`)]);
  return json({ ok: true });
}

// ---------- Statistik
async function getStats({ request, env, url }) {
  await requireAdmin(request, env);
  const db = env.DB, days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
  const since = isoAgo(days * 864e5);
  const [people, byKind, daily, decided, sanctions, tasksDone, totals] = await Promise.all([
    all(db.prepare('SELECT a.id, a.name, p.rank FROM admins a LEFT JOIN team_profiles p ON p.admin_id = a.id WHERE a.active = 1 ORDER BY a.name')),
    all(db.prepare('SELECT admin_id, kind, COUNT(*) AS n FROM activity WHERE created_at > ? AND admin_id IS NOT NULL GROUP BY admin_id, kind').bind(since)),
    all(db.prepare('SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM activity WHERE created_at > ? GROUP BY d ORDER BY d').bind(since)),
    all(db.prepare("SELECT decided_by AS id, COUNT(*) AS n FROM applications WHERE decided_at > ? AND status IN ('angenommen','abgelehnt') GROUP BY decided_by").bind(since)),
    all(db.prepare('SELECT admin_id AS id, COUNT(*) AS n FROM sanctions WHERE created_at > ? GROUP BY admin_id').bind(since)),
    all(db.prepare("SELECT assignee_id AS id, COUNT(*) AS n FROM dev_tasks WHERE status = 'fertig' AND updated_at > ? AND assignee_id IS NOT NULL GROUP BY assignee_id").bind(since)),
    db.prepare(`SELECT (SELECT COUNT(*) FROM activity WHERE created_at > ?1) AS actions,
      (SELECT COUNT(*) FROM applications WHERE created_at > ?1) AS apps,
      (SELECT COUNT(*) FROM sanctions WHERE created_at > ?1) AS sanctions,
      (SELECT COUNT(*) FROM dev_tasks WHERE status = 'fertig' AND updated_at > ?1) AS tasks,
      (SELECT COUNT(*) FROM events WHERE starts_at > ?1 AND starts_at <= ?2) AS events`).bind(since, now()).first()
  ]);
  const get = (arr, id) => arr.find((x) => x.id === id)?.n || 0;
  const rows = people.map((p) => {
    const kinds = Object.fromEntries(byKind.filter((k) => k.admin_id === p.id).map((k) => [k.kind, k.n]));
    return { ...p, actions: Object.values(kinds).reduce((a, b) => a + b, 0), kinds, decided: get(decided, p.id), sanctions: get(sanctions, p.id), tasks: get(tasksDone, p.id) };
  }).sort((a, b) => b.actions - a.actions);
  return json({ days, rows, daily, totals });
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
  ['GET', 'news', getPublicNews],
  ['GET', 'admin/teamlist', getTeamList],
  ['GET', 'admin/teamlist/:id', getTeamMember],
  ['PUT', 'admin/teamlist/:id', saveTeamProfile],
  ['POST', 'admin/teamlist/:id/records', addTeamRecord],
  ['DELETE', 'admin/teamrecords/:id', deleteTeamRecord],
  ['GET', 'admin/events', listEvents],
  ['POST', 'admin/events', createEvent],
  ['PUT', 'admin/events/:id', updateEvent],
  ['DELETE', 'admin/events/:id', deleteEvent],
  ['POST', 'admin/events/:id/rsvp', rsvpEvent],
  ['POST', 'admin/absences', createAbsence],
  ['DELETE', 'admin/absences/:id', deleteAbsence],
  ['GET', 'admin/polls', listPolls],
  ['POST', 'admin/polls', createPoll],
  ['POST', 'admin/polls/:id/vote', votePoll],
  ['POST', 'admin/polls/:id/close', closePoll],
  ['DELETE', 'admin/polls/:id', deletePoll],
  ['GET', 'admin/snippets', listSnippets],
  ['POST', 'admin/snippets', createSnippet],
  ['PUT', 'admin/snippets/:id', updateSnippet],
  ['POST', 'admin/snippets/:id/use', useSnippet],
  ['DELETE', 'admin/snippets/:id', deleteSnippet],
  ['GET', 'admin/stats', getStats],
  ['GET', 'launcher', getPublicLauncher],
  ['GET', 'admin/launcher', getLauncherAdmin],
  ['PUT', 'admin/launcher', saveLauncher],
  ['GET', 'admin/pulse', getPulse],
  ['GET', 'admin/search', getSearch],
  ['GET', 'admin/dashboard', getDashboard],
  ['GET', 'admin/activity', getActivity],
  ['POST', 'admin/announcements', createAnnouncement],
  ['PUT', 'admin/announcements/:id', updateAnnouncement],
  ['DELETE', 'admin/announcements/:id', deleteAnnouncement],
  ['GET', 'admin/players', listPlayers],
  ['POST', 'admin/players', createPlayer],
  ['GET', 'admin/players/:id', getPlayer],
  ['PUT', 'admin/players/:id', updatePlayer],
  ['DELETE', 'admin/players/:id', deletePlayer],
  ['POST', 'admin/players/:id/sanctions', addSanction],
  ['POST', 'admin/sanctions/:id/lift', liftSanction],
  ['DELETE', 'admin/sanctions/:id', deleteSanction],
  ['GET', 'admin/news', listNews],
  ['POST', 'admin/news', createNews],
  ['PUT', 'admin/news/:id', updateNews],
  ['DELETE', 'admin/news/:id', deleteNews],
  ['GET', 'admin/dev', getDev],
  ['POST', 'admin/dev/tasks', createTask],
  ['GET', 'admin/dev/tasks/:id', getTask],
  ['PUT', 'admin/dev/tasks/:id', updateTask],
  ['DELETE', 'admin/dev/tasks/:id', deleteTask],
  ['POST', 'admin/dev/tasks/:id/comments', addComment],
  ['POST', 'admin/dev/tasks/:id/checks', addCheck],
  ['PUT', 'admin/dev/checks/:id', updateCheck],
  ['DELETE', 'admin/dev/checks/:id', deleteCheck],
  ['POST', 'admin/dev/milestones', createMilestone],
  ['PUT', 'admin/dev/milestones/:id', updateMilestone],
  ['DELETE', 'admin/dev/milestones/:id', deleteMilestone],
  ['GET', 'admin/dev/resources', listResources],
  ['POST', 'admin/dev/resources', createResource],
  ['PUT', 'admin/dev/resources/:id', updateResource],
  ['DELETE', 'admin/dev/resources/:id', deleteResource],
  ['GET', 'admin/dev/docs', listDocs],
  ['POST', 'admin/dev/docs', createDoc],
  ['PUT', 'admin/dev/docs/:id', updateDoc],
  ['DELETE', 'admin/dev/docs/:id', deleteDoc]
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
