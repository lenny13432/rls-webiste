// =====================================================================
//  Real Life Southland – Team-Panel (Admin + Dev)
//  Alles wird in Cloudflare D1 gespeichert. Änderungen anderer Teammitglieder
//  kommen über /api/admin/pulse alle paar Sekunden automatisch rein.
// =====================================================================
const $ = (id) => document.getElementById(id);
const app = $('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl = (s) => esc(s).replace(/\n/g, '<br>');
const fmt = (iso) => { if (!iso) return '–'; const d = new Date(iso); return d.toLocaleDateString('de-DE') + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); };
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('de-DE') : '–';
function ago(iso) {
  if (!iso) return '–';
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 45) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  if (s < 7 * 86400) return `vor ${Math.round(s / 86400)} Tag${Math.round(s / 86400) === 1 ? '' : 'en'}`;
  return fmtDate(iso);
}
const initials = (n) => String(n || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?';
const ava = (name, cls = '') => `<span class="ava ${cls}" title="${esc(name || 'Niemand')}">${esc(name ? initials(name) : '?')}</span>`;
const LABEL = { offen: 'Offen', pruefung: 'In Prüfung', angenommen: 'Angenommen', abgelehnt: 'Abgelehnt' };
const pill = (s) => `<span class="pill st-${s}">${LABEL[s] || esc(s)}</span>`;
const alertBox = (type, msg) => `<div class="alert ${type}"><p>${esc(msg)}</p></div>`;
const errBox = (e) => { if (e.message !== 'login') app.innerHTML = `<div class="wrap admin-main">${alertBox('bad', e.message)}</div>`; };

function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast2 ' + kind; t.textContent = msg;
  $('toasts').appendChild(t);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3800);
}

let me = null;
let positions = [];
const list = { status: 'aktiv', position: '', q: '' };

async function api(path, opts = {}) {
  const r = await fetch('/api/' + path, {
    method: opts.method || 'GET', credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = {}; try { data = await r.json(); } catch {}
  if (r.status === 401 && path !== 'admin/login') { me = null; showLogin(); throw new Error('login'); }
  if (!r.ok) throw new Error(data.error || (data.errors || []).join(' ') || 'Da ist etwas schiefgelaufen.');
  return data;
}

// ============================================================ Seitenleiste & Navigation
const TITLES = { start: 'Übersicht', liste: 'Bewerbungen', spieler: 'Spielerakten', news: 'Website-News', regelwerk: 'Regelwerk', launcher: 'Launcher', team: 'Konten & Rechte', teamliste: 'Teamliste', kalender: 'Kalender', abstimmungen: 'Abstimmungen', vorlagen: 'Textbausteine', statistik: 'Statistik', protokoll: 'Protokoll', einstellungen: 'Einstellungen', konto: 'Mein Konto', dev: 'To-do-Board', roadmap: 'Roadmap', bugs: 'Bugs', scripts: 'Scripts', wiki: 'Wiki' };
function setNav(view) {
  const logged = !!me;
  $('sb').hidden = !logged; $('mtop').hidden = !logged;
  document.body.classList.toggle('logged', logged);
  if (logged) {
    $('whoami').textContent = me.name; $('meAva').textContent = initials(me.name);
    $('navSettings').hidden = me.role !== 'owner';
  }
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === view));
  $('mTitle').textContent = TITLES[view] || 'Team-Panel';
  document.title = (TITLES[view] ? TITLES[view] + ' · ' : '') + 'Team-Panel – Real Life Southland';
  if (LIVE.view !== view) LIVE.ticks = 0;
  LIVE.view = view;
  document.body.classList.remove('sb-open');
}
$('sbOpen').onclick = () => document.body.classList.add('sb-open');
$('sbScrim').onclick = () => document.body.classList.remove('sb-open');

// ============================================================ Live-Aktualisierung
const LIVE = { rev: 0, view: '', ticks: 0, online: [], pending: false, busy: false };
function isBusy() {
  if (document.querySelector('dialog[open]')) return true;
  if (window.EDITING) return true;
  const a = document.activeElement;
  return !!(a && app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'search' && a.value);
}
async function rerender() {
  const y = scrollY;
  LIVE.pending = false; $('liveBar').hidden = true;
  await route(true);
  scrollTo(0, y);
}
$('liveBtn').onclick = rerender;
const REF_LINK = { application: (id) => '#bewerbung-' + id, player: (id) => '#spieler-' + id, task: (id) => '#aufgabe-' + id, doc: (id) => '#wiki-' + id, news: () => '#news', resource: () => '#scripts', milestone: () => '#roadmap', announcement: () => '#start', admin: () => '#team', settings: () => '#einstellungen', launcher: () => '#launcher', rules: () => '#regelwerk', profile: (id) => '#teamliste-' + id, event: (id) => '#termin-' + id, absence: () => '#kalender', poll: () => '#abstimmungen', snippet: () => '#vorlagen' };
const refLink = (e) => (REF_LINK[e.ref_type] && e.ref_id !== undefined ? REF_LINK[e.ref_type](e.ref_id) : '#protokoll');

async function pulse() {
  if (!me || document.hidden) return;
  LIVE.ticks++;
  const touch = LIVE.ticks % 6 === 1;
  let r;
  try { r = await api(`admin/pulse?since=${LIVE.rev}&view=${encodeURIComponent(LIVE.view)}${touch ? '&touch=1' : ''}`); } catch { return; }
  LIVE.online = r.online; renderOnline();
  const b = r.badges || {};
  $('bApps').hidden = !b.apps; $('bApps').textContent = b.apps;
  $('bBugs').hidden = !b.bugs; $('bBugs').textContent = b.bugs;
  if (LIVE.rev && r.rev > LIVE.rev) {
    const others = r.events.filter((e) => e.admin_id !== me.id);
    if (others.length) {
      others.slice(0, 3).reverse().forEach((e) => toast(`${e.admin_name || 'Website'} ${e.text}`, 'live'));
      if (isBusy()) { LIVE.pending = true; $('liveText').textContent = `${others[0].admin_name || 'Jemand'} hat etwas geändert.`; $('liveBar').hidden = false; }
      else rerender();
    }
  }
  LIVE.rev = r.rev;
}
function renderOnline() {
  $('onlineList').innerHTML = LIVE.online.length
    ? LIVE.online.map((o) => `<div class="on-row">${ava(o.name)}<span>${esc(o.name)}${o.id === me?.id ? ' <small>(du)</small>' : ''}<small>${esc(TITLES[o.view] || '')}</small></span></div>`).join('')
    : '<small class="muted">Niemand außer dir</small>';
  const dash = $('dashOnline'); if (dash) dash.innerHTML = $('onlineList').innerHTML;
}
setInterval(pulse, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { LIVE.ticks = 0; pulse(); } });

// ============================================================ Start: Einrichtung oder Login
async function boot() {
  try {
    const setup = await api('setup');
    if (setup.needed) return showSetup(setup.keySet);
  } catch (e) { app.innerHTML = `<div class="wrap narrow">${alertBox('bad', e.message)}</div>`; return; }
  try { me = (await api('admin/me')).me; afterLogin(); } catch (e) { if (e.message !== 'login') app.innerHTML = `<div class="wrap narrow">${alertBox('bad', e.message)}</div>`; }
}
function afterLogin() { LIVE.rev = 0; LIVE.ticks = 0; pulse(); route(); }

function showSetup(keySet) {
  setNav('');
  app.innerHTML = `<div class="wrap narrow"><section class="card pad">
    <h1 class="h"><span class="script">Einmalig</span>Einrichtung</h1>
    ${keySet ? '' : alertBox('bad', 'In Cloudflare ist noch kein SETUP_KEY gesetzt. Leg ihn zuerst an (siehe Anleitung) und lade die Seite neu.')}
    <p class="muted">Leg jetzt dein eigenes Konto an. Es bekommt die Rolle <b>Owner</b> und darf weitere Team-Konten anlegen.</p>
    <div id="setupMsg"></div>
    <form class="form" id="setupForm">
      <label class="field"><span>Einrichtungsschlüssel</span><input id="su_key" type="password" required autocomplete="off"></label>
      <label class="field"><span>Benutzername</span><input id="su_name" required minlength="3" maxlength="40" autocomplete="username"></label>
      <label class="field"><span>Passwort <small>(mindestens 10 Zeichen)</small></span><input id="su_pass" type="password" required minlength="10" autocomplete="new-password"></label>
      <label class="field"><span>Passwort wiederholen</span><input id="su_pass2" type="password" required minlength="10" autocomplete="new-password"></label>
      <button class="btn btn-pink" type="submit" style="justify-self:start">Konto anlegen</button>
    </form></section></div>`;
  $('setupForm').onsubmit = async (e) => {
    e.preventDefault();
    if ($('su_pass').value !== $('su_pass2').value) { $('setupMsg').innerHTML = alertBox('bad', 'Die Passwörter stimmen nicht überein.'); return; }
    try {
      await api('setup', { method: 'POST', body: { key: $('su_key').value, name: $('su_name').value.trim(), pass: $('su_pass').value } });
      toast('Konto angelegt. Melde dich jetzt an.'); showLogin($('su_name').value.trim());
    } catch (err) { $('setupMsg').innerHTML = alertBox('bad', err.message); }
  };
}

function showLogin(prefill = '') {
  setNav('');
  app.innerHTML = `<div class="login"><form class="card form" id="loginForm">
    <img class="logo" src="../logo.png" alt=""><h1>Team-Panel</h1><div id="loginMsg"></div>
    <label class="field"><span>Benutzername</span><input id="l_name" required autocomplete="username" value="${esc(prefill)}"></label>
    <label class="field"><span>Passwort</span><input id="l_pass" type="password" required autocomplete="current-password"></label>
    <button class="btn btn-pink" type="submit">Anmelden</button>
    <a class="muted" href="../" style="text-align:center;font-size:14px">← Zur Website</a></form></div>`;
  (prefill ? $('l_pass') : $('l_name')).focus();
  $('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      me = (await api('admin/login', { method: 'POST', body: { name: $('l_name').value.trim(), pass: $('l_pass').value } })).me;
      if (!location.hash) location.hash = '#start';
      afterLogin();
    } catch (err) { $('loginMsg').innerHTML = alertBox('bad', err.message); }
  };
}
$('logout').onclick = async () => { try { await api('admin/logout', { method: 'POST', body: {} }); } catch {} me = null; location.hash = ''; showLogin(); };

// ============================================================ Navigation per #hash
function route(live) {
  if (!me) return showLogin();
  const h = location.hash.replace('#', '') || 'start';
  let m;
  if ((m = h.match(/^bewerbung-(\d+)$/))) return showDetail(+m[1]);
  if ((m = h.match(/^spieler-(\d+)$/))) return showPlayer(+m[1]);
  if ((m = h.match(/^wiki-(\d+)$/))) return showWiki(+m[1]);
  if ((m = h.match(/^aufgabe-(\d+)$/))) return showDev('board', live ? null : +m[1]);
  if ((m = h.match(/^teamliste-(\d+)$/))) return showMember(+m[1]);
  if ((m = h.match(/^termin-(\d+)$/))) return showCalendar().then(() => { history.replaceState(null, '', '#kalender'); if (!live) eventDetail(+m[1]); });
  switch (h) {
    case 'liste': return showList();
    case 'spieler': return showPlayers();
    case 'news': return showNews();
    case 'regelwerk': return showRules();
    case 'launcher': return showLauncher();
    case 'team': return showTeam();
    case 'teamliste': return showTeamList();
    case 'kalender': return showCalendar();
    case 'abstimmungen': return showPolls();
    case 'vorlagen': return showSnippets();
    case 'statistik': return showStats();
    case 'protokoll': return showLog();
    case 'einstellungen': return me.role === 'owner' ? showSettings() : showStart();
    case 'konto': return showAccount();
    case 'dev': return showDev('board');
    case 'roadmap': return showDev('roadmap');
    case 'bugs': return showBugs();
    case 'scripts': return showScripts();
    case 'wiki': return showWiki();
    default: return showStart();
  }
}
addEventListener('hashchange', () => { window.EDITING = false; LIVE.pending = false; $('liveBar').hidden = true; route(); });

// ============================================================ Dialog-Helfer
function openDialog(html, onSubmit, onDelete, opts = {}) {
  const dlg = document.createElement('dialog'); dlg.className = 'dlg' + (opts.wide ? ' wide' : '');
  dlg.innerHTML = html; document.body.appendChild(dlg); dlg.showModal();
  dlg.addEventListener('close', () => { dlg.remove(); if (opts.onClose) opts.onClose(); if (LIVE.pending) rerender(); });
  dlg.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => dlg.close()));
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) dlg.close(); });
  const form = dlg.querySelector('form.main'), msg = dlg.querySelector('.dlg-msg');
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try { await onSubmit(new FormData(form), form); dlg.close(); } catch (err) { if (msg) msg.innerHTML = alertBox('bad', err.message); btn.disabled = false; }
  };
  const del = dlg.querySelector('[data-del]');
  if (del) del.onclick = async () => {
    if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Wirklich löschen?'; return; }
    try { await onDelete(); dlg.close(); } catch (err) { if (msg) msg.innerHTML = alertBox('bad', err.message); }
  };
  if (!opts.noFocus) dlg.querySelector('input:not([type=checkbox]),textarea')?.focus();
  return dlg;
}
const opts = (obj, sel) => Object.entries(obj).map(([v, l]) => `<option value="${esc(v)}"${String(sel ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('');
const dlgHead = (title) => `<div class="dlg-head"><h2>${title}</h2><button type="button" class="x-btn" data-close aria-label="Schließen">×</button></div><div class="dlg-msg"></div>`;

// ============================================================ Übersicht
async function showStart() {
  setNav('start');
  let d; try { d = await api('admin/dashboard'); } catch (e) { return errBox(e); }
  const s = d.stats, pct = s.tasksTotal ? Math.round(s.tasksDone / s.tasksTotal * 100) : 0;
  const hour = new Date().getHours();
  const hi = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hey' : 'Guten Abend';
  const tile = (href, n, label, cls = '', extra = '') => `<a class="kpi ${cls}" href="${href}" ${extra}><b>${n}</b><span>${label}</span></a>`;
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">${hi} ${esc(me.name)}</span>Übersicht</h1><span class="live-tag"><span class="live-dot"></span>Live</span></div>
    <div class="kpis">
      ${tile('#liste', s.appsOpen + s.appsReview, 'Offene Bewerbungen', s.appsOpen ? 'hot' : '')}
      ${tile('#dev', s.myTasks, 'Meine Aufgaben', '', 'data-mine')}
      ${tile('#bugs', s.bugs, 'Offene Bugs', s.bugs ? 'bad' : '')}
      ${tile('#spieler', s.bans, 'Aktive Bans', '', 'data-banned')}
      <a class="kpi prog" href="#roadmap"><b>${pct}%</b><span>Dev-Fortschritt · ${s.tasksDone}/${s.tasksTotal}</span><i style="--p:${pct}%"></i></a>
    </div>
    ${d.team ? `<div class="tstrip">
      <section class="card dpanel"><div class="dp-head"><h2>📅 Nächste Termine</h2><a class="muted" href="#kalender">Kalender →</a></div>
        <div class="upc">${d.team.upcoming.map((e) => `<a class="upc-i" href="#termin-${e.id}"><span class="upc-d"><b>${new Date(e.starts_at).getDate()}</b>${new Date(e.starts_at).toLocaleDateString('de-DE', { month: 'short' })}</span><span class="upc-t"><b>${esc(e.title)}</b><small>${new Date(e.starts_at).toLocaleDateString('de-DE', { weekday: 'short' })}, ${new Date(e.starts_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · ${e.yes} Zusagen</small>${e.mine ? '' : '<small><em class="rs-open">Du hast noch nicht geantwortet</em></small>'}</span></a>`).join('') || '<p class="muted" style="margin:0">Keine Termine geplant.</p>'}</div></section>
      <section class="card dpanel"><div class="dp-head"><h2>🌴 Heute abwesend</h2><a class="muted" href="#kalender">Eintragen →</a></div>
        <div class="absl">${d.team.away.map((x) => `<div class="abs-i">${ava(x.name)}<span><b>${esc(x.name)}</b><small>bis ${x.to_date.split('-').reverse().join('.')}${x.reason ? ' · ' + esc(x.reason) : ''}</small></span></div>`).join('') || '<p class="muted" style="margin:0">Alle da. 💪</p>'}</div></section>
      <section class="card dpanel"><div class="dp-head"><h2>🗳️ Abstimmen</h2><a class="muted" href="#abstimmungen">Alle →</a></div>
        <div class="upc">${d.team.openPolls.map((p) => `<a class="upc-i" href="#abstimmungen"><span class="upc-t"><b>${esc(p.question)}</b><small><em class="rs-open">Deine Stimme fehlt noch</em></small></span></a>`).join('') || '<p class="muted" style="margin:0">Du hast überall abgestimmt.</p>'}</div></section>
    </div>` : ''}
    <div class="dash">
      <section class="card dpanel">
        <div class="dp-head"><h2>Pinnwand</h2><small class="muted">Nur fürs Team</small></div>
        <form class="pin-form" id="pinForm">
          <input id="pinTitle" maxlength="120" placeholder="Was muss das Team wissen? z. B. „Meeting Sonntag 20 Uhr“">
          <textarea id="pinBody" maxlength="2000" placeholder="Details (optional)"></textarea>
          <div class="row"><label class="chk"><input type="checkbox" id="pinPin"> Oben anheften</label><button class="btn btn-pink sm" type="submit">Posten</button></div>
        </form>
        <div class="pins">${d.announcements.map((a) => `<article class="pin${a.pinned ? ' pinned' : ''}">
          <header>${ava(a.admin_name)}<div><b>${esc(a.title)}</b><small>${esc(a.admin_name || '–')} · ${ago(a.created_at)}</small></div>
            <div class="pin-act"><button class="mini" data-pin="${a.id}" data-v="${a.pinned ? 0 : 1}" title="${a.pinned ? 'Lösen' : 'Anheften'}">${a.pinned ? '📌' : '📍'}</button>${a.admin_name === me.name || me.role === 'owner' ? `<button class="mini" data-unpin="${a.id}" title="Löschen">×</button>` : ''}</div></header>
          ${a.body ? `<p>${nl(a.body)}</p>` : ''}</article>`).join('') || '<p class="muted empty-s">Noch nichts an der Pinnwand.</p>'}</div>
      </section>
      <div class="dash-side">
        <section class="card dpanel">
          <div class="dp-head"><h2>Live-Aktivität</h2><a class="muted" href="#protokoll">Alles ansehen →</a></div>
          <ul class="feed">${d.feed.map(feedItem).join('') || '<li class="muted">Noch keine Aktivität.</li>'}</ul>
        </section>
        <section class="card dpanel">
          <div class="dp-head"><h2>Meine Aufgaben</h2><a class="muted" href="#dev" data-mine>Board →</a></div>
          <ul class="mylist">${d.mine.map((t) => `<li><a href="#aufgabe-${t.id}"><span class="sdot s-${t.status}"></span>${esc(t.title)}<small>${t.due ? (t.due < today() ? '<em>überfällig</em> ' : '') + dShort(t.due) : esc(t.category)}</small></a></li>`).join('') || '<li class="muted">Dir ist gerade nichts zugewiesen.</li>'}</ul>
        </section>
        <section class="card dpanel"><div class="dp-head"><h2>Team online</h2></div><div id="dashOnline" class="dash-online"></div></section>
      </div>
    </div></div>`;
  renderOnline();
  app.querySelectorAll('[data-mine]').forEach((a) => a.addEventListener('click', () => { DEV.f.who = 'me'; }));
  app.querySelector('[data-banned]').addEventListener('click', () => { PL.filter = 'gebannt'; });
  $('pinForm').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('admin/announcements', { method: 'POST', body: { title: $('pinTitle').value.trim(), body: $('pinBody').value.trim(), pinned: $('pinPin').checked } }); toast('An die Pinnwand gepostet.'); showStart(); }
    catch (err) { toast(err.message, 'bad'); }
  };
  app.querySelectorAll('[data-pin]').forEach((b) => (b.onclick = async () => { await api('admin/announcements/' + b.dataset.pin, { method: 'PUT', body: { pinned: b.dataset.v === '1' } }); showStart(); }));
  app.querySelectorAll('[data-unpin]').forEach((b) => (b.onclick = async () => { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Löschen?'; b.classList.add('arm'); return; } await api('admin/announcements/' + b.dataset.unpin, { method: 'DELETE' }); showStart(); }));
}
const KIND_ICON = { bewerbung: '📝', spieler: '🛡️', news: '📰', dev: '🛠️', pinnwand: '📌', team: '👥' };
const feedItem = (e) => `<li><a href="${refLink(e)}"><span class="fi">${KIND_ICON[e.kind] || '•'}</span><span><b>${esc(e.admin_name || 'Website')}</b> ${esc(e.text)}<small>${ago(e.created_at)}</small></span></a></li>`;

// ============================================================ Bewerbungen
async function showList() {
  setNav('liste');
  if (!positions.length) { try { positions = (await api('config')).positions; } catch {} }
  const qs = new URLSearchParams({ status: list.status, position: list.position, q: list.q });
  let data; try { data = await api('admin/applications?' + qs); } catch (e) { return errBox(e); }
  const c = data.counts;
  if (!document.querySelector('#v-list')) {
    app.innerHTML = `<div class="wrap admin-main" id="v-list">
      <div class="admin-head"><h1><span class="script">Wer will ins Team?</span>Bewerbungen</h1></div>
      <div class="stats" id="stats"></div>
      <div class="toolbar">
        <input id="search" type="search" placeholder="Suchen nach Discord, Bereich, Code oder ID" value="${esc(list.q)}">
        <select id="posFilter" class="pos-filter"><option value="">Alle Bereiche</option>${positions.map((p) => `<option${p.name === list.position ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <button class="btn btn-ghost sm" data-f="aktiv">Zu bearbeiten</button><button class="btn btn-ghost sm" data-f="alle">Alle</button>
      </div>
      <div class="table-wrap" id="tableWrap"></div></div>`;
    let deb; $('search').oninput = () => { clearTimeout(deb); deb = setTimeout(() => { list.q = $('search').value.trim(); showList(); }, 250); };
    $('posFilter').onchange = () => { list.position = $('posFilter').value; showList(); };
    app.querySelector('.toolbar').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { list.status = b.dataset.f; showList(); } });
  }
  $('stats').innerHTML = ['offen', 'pruefung', 'angenommen', 'abgelehnt'].map((k) =>
    `<button class="stat${list.status === k ? ' on' : ''}" data-s="${k}"><b>${c[k]}</b><span class="st-${k}" style="background:none">${LABEL[k]}</span></button>`).join('');
  $('stats').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { list.status = b.dataset.s; showList(); } };
  app.querySelectorAll('[data-f]').forEach((b) => (b.style.borderColor = b.dataset.f === list.status ? 'var(--pink)' : ''));
  const rows = data.rows;
  $('tableWrap').innerHTML = !rows.length
    ? `<div class="empty">${list.status === 'aktiv' && !list.q && !list.position ? 'Alles erledigt. Gerade wartet keine Bewerbung auf euch.' : 'Keine Bewerbungen gefunden.'}</div>`
    : `<table><thead><tr><th>#</th><th>Discord</th><th>Bereich</th><th>Alter</th><th>Zeit / Woche</th><th>Status</th><th>Eingegangen</th><th>Bearbeitet von</th></tr></thead><tbody>
      ${rows.map((a) => `<tr data-id="${a.id}"><td class="num">${a.id}</td><td><a href="#bewerbung-${a.id}">${esc(a.discord_name)}</a></td><td>${esc(a.position)}</td><td class="num">${a.age}</td><td class="num">${esc(a.hours)}</td><td>${pill(a.status)}</td><td class="num">${fmt(a.created_at)}</td><td class="num">${esc(a.decided_by_name || '–')}</td></tr>`).join('')}</tbody></table>`;
  $('tableWrap').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = '#bewerbung-' + tr.dataset.id; };
}

async function showDetail(id, flash) {
  setNav('liste');
  let d; try { d = await api('admin/applications/' + id); } catch (e) { if (e.message !== 'login') app.innerHTML = `<div class="wrap admin-main"><a class="back" href="#liste">← Zurück zur Übersicht</a>${alertBox('bad', e.message)}</div>`; return; }
  const a = d.app;
  const btn = (s, cls, label) => `<button class="btn ${cls}" data-set="${s}" ${a.status === s ? 'disabled' : ''}>${label}</button>`;
  app.innerHTML = `<div class="wrap admin-main">
    <a class="back" href="#liste">← Zurück zur Übersicht</a>
    <div class="admin-head"><h1><span class="script">Bewerbung #${a.id} · ${esc(a.position)}</span>${esc(a.discord_name)}</h1>${pill(a.status)}</div>
    ${flash ? alertBox('ok', flash) : ''}<div id="dMsg"></div>
    <div class="detail"><section>
      <div class="facts">
        <div><span>Discord</span><b>${esc(a.discord_name)}</b></div><div><span>Discord-ID</span><b>${esc(a.discord_id || '–')}</b></div><div><span>Alter</span><b>${a.age} Jahre</b></div>
        <div><span>Bereich</span><b>${esc(a.position)}</b></div><div><span>Zeit pro Woche</span><b>${esc(a.hours)}</b></div><div><span>Eingegangen</span><b>${fmt(a.created_at)}</b></div>
      </div>
      ${d.previous.length ? `<div class="alert info"><p><b>Frühere Bewerbungen dieses Discord-Namens:</b> ${d.previous.map((p) => `<a style="color:var(--pink)" href="#bewerbung-${p.id}">#${p.id}</a> (${LABEL[p.status]})`).join(', ')}</p></div>` : ''}
      <div class="answer"><h3>Wann meistens da</h3><div>${nl(a.times)}</div></div>
      <div class="answer"><h3>Team-Erfahrung</h3><div>${nl(a.experience)}</div></div>
      <div class="answer"><h3>Warum wir ihn/sie nehmen sollten <small>· ${[...a.motivation].length} Zeichen</small></h3><div>${nl(a.motivation)}</div></div>
      <div class="answer"><h3>Praxisfrage: RDM-Meldung im Support</h3><div>${nl(a.scenario1)}</div></div>
      <div class="answer"><h3>Praxisfrage: Teammitglied ist respektlos</h3><div>${nl(a.scenario2)}</div></div>
      <div class="answer"><h3>Verlauf &amp; Team-Notizen <small>· nur für das Team sichtbar</small></h3></div>
      <form class="form" id="noteForm" style="gap:10px;margin-bottom:14px">
        <label class="field"><textarea id="noteBody" placeholder="Interne Notiz, z. B. „Starke Praxisantworten, im Gespräch nach Erfahrung mit txAdmin fragen“" style="min-height:90px"></textarea></label>
        <button class="btn btn-ghost sm" type="submit" style="justify-self:start">Notiz speichern</button>
      </form>
      <div class="timeline">${d.notes.length ? d.notes.map((n) => `<div class="note${n.kind === 'system' ? ' sys' : ''}"><header><b>${esc(n.admin_name || 'Gelöschtes Konto')}</b><span>${fmt(n.created_at)}</span></header>${nl(n.body)}</div>`).join('') : '<p class="muted" style="margin:0">Noch keine Notizen.</p>'}</div>
    </section>
    <aside class="card decide">
      <h3>Entscheidung</h3>
      ${a.decided_at ? `<p class="muted" style="margin:0;font-size:14px">${LABEL[a.status]} von <b style="color:var(--fg)">${esc(a.decided_by_name || '–')}</b> am ${fmt(a.decided_at)}</p>` : ''}
      <label class="field"><span>Nachricht an den Bewerber <small>(optional, sieht er auf der Statusseite)</small></span>
        <textarea id="pubNote" style="min-height:110px" placeholder="z. B. „Wir melden uns im Discord für dein Gespräch.“">${esc(a.public_note || '')}</textarea></label>
      <div class="row">${btn('angenommen', 'btn-ok', 'Annehmen')}${btn('abgelehnt', 'btn-bad', 'Ablehnen')}</div>
      ${a.status === 'offen' ? '<button class="btn btn-warn" data-set="pruefung">Als „In Prüfung“ markieren</button>' : a.status !== 'pruefung' ? '<button class="btn btn-ghost sm" data-set="pruefung">Wieder öffnen</button>' : ''}
      <p class="muted" style="margin:0;font-size:13px">Bewerbungscode: <code>${esc(a.code)}</code></p>
      ${me.role === 'owner' ? `<details style="border-top:1px solid var(--line);padding-top:12px"><summary style="cursor:pointer;color:var(--muted);font-size:14px">Bewerbung löschen</summary>
        <div class="form" style="gap:10px;margin-top:10px"><label class="field"><span style="font-size:13px">Zum Bestätigen <b>LÖSCHEN</b> eingeben</span><input id="delConfirm" autocomplete="off"></label>
        <button class="btn btn-bad sm" id="delBtn">Endgültig löschen</button></div></details>` : ''}
    </aside></div></div>`;
  $('noteForm').onsubmit = async (e) => {
    e.preventDefault(); const body = $('noteBody').value.trim(); if (!body) return;
    try { await api(`admin/applications/${id}/notes`, { method: 'POST', body: { body } }); showDetail(id, 'Notiz gespeichert.'); } catch (err) { $('dMsg').innerHTML = alertBox('bad', err.message); }
  };
  app.querySelectorAll('[data-set]').forEach((b) => (b.onclick = async () => {
    const s = b.dataset.set;
    try { await api(`admin/applications/${id}/status`, { method: 'POST', body: { status: s, public_note: $('pubNote').value.trim() } }); showDetail(id, `Status auf „${LABEL[s]}“ gesetzt.`); }
    catch (err) { $('dMsg').innerHTML = alertBox('bad', err.message); }
  }));
  if ($('delBtn')) $('delBtn').onclick = async () => {
    if ($('delConfirm').value !== 'LÖSCHEN') { $('dMsg').innerHTML = alertBox('bad', 'Zum Löschen bitte LÖSCHEN in das Feld schreiben.'); return; }
    try { await api('admin/applications/' + id, { method: 'DELETE' }); toast(`Bewerbung #${id} wurde gelöscht.`); location.hash = '#liste'; } catch (err) { $('dMsg').innerHTML = alertBox('bad', err.message); }
  };
}

// ============================================================ Spielerakten
const PL = { q: '', filter: '' };
const S_LABEL = { hinweis: 'Hinweis', verwarnung: 'Verwarnung', kick: 'Kick', ban: 'Ban', permaban: 'Permanenter Ban' };
const banPill = (ban) => !ban ? '<span class="pill st-angenommen">Sauber</span>'
  : `<span class="pill st-abgelehnt">${ban.type === 'permaban' || !ban.until ? 'Permanent gebannt' : 'Gebannt bis ' + fmt(ban.until)}</span>`;

async function showPlayers() {
  setNav('spieler');
  let d; try { d = await api(`admin/players?q=${encodeURIComponent(PL.q)}&filter=${PL.filter}`); } catch (e) { return errBox(e); }
  const chips = [['', 'Alle'], ['gebannt', 'Gebannt'], ['verwarnt', 'Mit Verwarnung'], ['beobachten', 'Beobachten']];
  const keepFocus = document.activeElement?.id === 'plq';
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Wer hat was gemacht?</span>Spielerakten</h1><button class="btn btn-pink sm" id="addPlayer">+ Spieler anlegen</button></div>
    <div class="toolbar"><input id="plq" type="search" placeholder="Name, Discord oder License suchen" value="${esc(PL.q)}">
      ${chips.map(([v, l]) => `<button class="btn btn-ghost sm chip${PL.filter === v ? ' on' : ''}" data-pf="${v}">${l}</button>`).join('')}</div>
    <div class="table-wrap">${d.rows.length ? `<table><thead><tr><th>Spieler</th><th>Discord</th><th>Verwarnungen</th><th>Status</th><th>Einträge</th><th>Zuletzt</th></tr></thead><tbody>
      ${d.rows.map((p) => `<tr data-pid="${p.id}"><td><b>${esc(p.name)}</b>${p.watch ? ' <span class="eye" title="Wird beobachtet">👁</span>' : ''}</td><td>${esc(p.discord || '–')}</td>
        <td class="num">${p.warns ? `<span class="warnc">${p.warns}</span>` : '0'}</td><td>${banPill(p.ban)}</td><td class="num">${p.total}</td><td class="num">${ago(p.updated_at)}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${PL.q || PL.filter ? 'Keine passenden Spieler gefunden.' : 'Noch keine Spielerakten. Leg eine an, sobald jemand auffällt, verwarnt oder gebannt wird.'}</div>`}</div></div>`;
  if (keepFocus) { $('plq').focus(); $('plq').setSelectionRange(9e3, 9e3); }
  let deb; $('plq').oninput = () => { clearTimeout(deb); deb = setTimeout(() => { PL.q = $('plq').value.trim(); showPlayers(); }, 250); };
  app.querySelectorAll('[data-pf]').forEach((b) => (b.onclick = () => { PL.filter = b.dataset.pf; showPlayers(); }));
  app.querySelector('tbody')?.addEventListener('click', (e) => { const tr = e.target.closest('[data-pid]'); if (tr) location.hash = '#spieler-' + tr.dataset.pid; });
  $('addPlayer').onclick = () => playerDialog();
}

function playerDialog(p) {
  const edit = !!p; p = p || {};
  openDialog(`<form class="form main" style="gap:14px">${dlgHead(edit ? 'Akte bearbeiten' : 'Neue Spielerakte')}
    <label class="field"><span>Name <small>(Ingame- oder FiveM-Name)</small></span><input name="name" maxlength="60" required value="${esc(p.name || '')}" placeholder="z. B. Max_Mustermann"></label>
    <div class="grid2"><label class="field"><span>Discord <small>(optional)</small></span><input name="discord" maxlength="60" value="${esc(p.discord || '')}"></label>
    <label class="field"><span>License / Identifier <small>(optional)</small></span><input name="license" maxlength="120" value="${esc(p.license || '')}" placeholder="license:…"></label></div>
    ${edit ? '' : '<label class="field"><span>Notiz <small>(optional)</small></span><textarea name="notes" maxlength="6000" style="min-height:90px"></textarea></label>'}
    <div class="dlg-foot">${edit && me.role === 'owner' ? '<button type="button" class="btn btn-ghost sm" data-del>Akte löschen</button>' : '<span></span>'}<button class="btn btn-pink" type="submit">${edit ? 'Speichern' : 'Akte anlegen'}</button></div></form>`,
  async (fd) => {
    const body = Object.fromEntries(fd);
    if (edit) { await api('admin/players/' + p.id, { method: 'PUT', body }); toast('Akte gespeichert.'); showPlayer(p.id); }
    else { const r = await api('admin/players', { method: 'POST', body }); toast('Akte angelegt.'); location.hash = '#spieler-' + r.id; }
  }, async () => { await api('admin/players/' + p.id, { method: 'DELETE' }); toast('Akte gelöscht.'); location.hash = '#spieler'; });
}

async function showPlayer(id) {
  setNav('spieler');
  let d; try { d = await api('admin/players/' + id); } catch (e) { if (e.message !== 'login') app.innerHTML = `<div class="wrap admin-main"><a class="back" href="#spieler">← Alle Spielerakten</a>${alertBox('bad', e.message)}</div>`; return; }
  const p = d.player, S = d.sanctions, nowIso = d.now;
  const live = (s) => s.active && !(s.expires_at && s.expires_at <= nowIso);
  const ban = S.find((s) => (s.type === 'ban' || s.type === 'permaban') && live(s));
  const warns = S.filter((s) => s.type === 'verwarnung' && s.active).length;
  const status = (s) => !s.active ? `<span class="s-tag off">Aufgehoben${s.lifted_by_name ? ' von ' + esc(s.lifted_by_name) : ''}</span>` : s.expires_at && s.expires_at <= nowIso ? '<span class="s-tag off">Abgelaufen</span>' : '<span class="s-tag on">Aktiv</span>';
  app.innerHTML = `<div class="wrap admin-main">
    <a class="back" href="#spieler">← Alle Spielerakten</a>
    <div class="admin-head"><h1><span class="script">Spielerakte #${p.id}</span>${esc(p.name)}</h1>
      <div class="row">${banPill(ban ? { type: ban.type, until: ban.expires_at } : null)}<button class="btn btn-ghost sm" id="watchBtn">${p.watch ? '👁 Beobachtung beenden' : '👁 Beobachten'}</button><button class="btn btn-ghost sm" id="editPl">Bearbeiten</button></div></div>
    <div class="facts">
      <div><span>Discord</span><b>${esc(p.discord || '–')}</b></div><div><span>License / Identifier</span><b class="mono">${esc(p.license || '–')}</b></div>
      <div><span>Aktive Verwarnungen</span><b${warns >= 3 ? ' style="color:var(--bad)"' : ''}>${warns}</b></div><div><span>Einträge gesamt</span><b>${S.length}</b></div>
      <div><span>Angelegt</span><b>${fmtDate(p.created_at)}${p.created_by_name ? ' · ' + esc(p.created_by_name) : ''}</b></div><div><span>Zuletzt geändert</span><b>${ago(p.updated_at)}</b></div>
    </div>
    ${warns >= 3 && !ban ? alertBox('bad', `${p.name} hat ${warns} aktive Verwarnungen. Prüft, ob ein Ban fällig ist.`) : ''}
    <div class="pl-grid">
      <section>
        <section class="card pad sm-pad"><h3 class="sub">Eintrag hinzufügen</h3><div id="sMsg"></div>
          <form class="form" id="sForm" style="gap:12px">
            <div class="grid2"><label class="field"><span>Art</span><select id="s_type">${opts(S_LABEL, 'verwarnung')}</select></label>
              <label class="field" id="durWrap" hidden><span>Dauer</span><select id="s_hours">${opts({ 1: '1 Stunde', 6: '6 Stunden', 12: '12 Stunden', 24: '1 Tag', 72: '3 Tage', 168: '7 Tage', 336: '14 Tage', 720: '30 Tage', 2160: '90 Tage' }, 72)}</select></label></div>
            <label class="field"><span>Grund</span><textarea id="s_reason" maxlength="1000" style="min-height:80px" placeholder="z. B. RDM am Würfelpark, Clip im Ticket #123"></textarea></label>
            <button class="btn btn-pink sm" type="submit" style="justify-self:start">Eintragen</button>
          </form></section>
        <h3 class="sub" style="margin-top:24px">Verlauf</h3>
        <div class="s-list">${S.map((s) => `<article class="s-item s-${s.type}${live(s) ? '' : ' dim'}">
          <header><span class="s-type">${S_LABEL[s.type]}</span>${s.duration && s.type === 'ban' ? `<span class="s-dur">${esc(s.duration)}${s.expires_at ? ' · bis ' + fmt(s.expires_at) : ''}</span>` : ''}${status(s)}</header>
          <p>${nl(s.reason)}</p>
          <footer><span>${esc(s.admin_name || '–')} · ${fmt(s.created_at)}</span><span class="row">
            ${live(s) && s.type !== 'hinweis' && s.type !== 'kick' ? `<button class="mini" data-lift="${s.id}">Aufheben</button>` : ''}
            ${me.role === 'owner' ? `<button class="mini" data-sdel="${s.id}">Löschen</button>` : ''}</span></footer></article>`).join('') || '<p class="muted">Noch keine Einträge. Sauberer Spieler.</p>'}</div>
      </section>
      <aside class="card pad sm-pad pl-notes"><h3 class="sub">Notizen</h3>
        <textarea id="plNotes" maxlength="6000" placeholder="Alles, was das Team über den Spieler wissen sollte: Verhalten, frühere Accounts, Absprachen…">${esc(p.notes || '')}</textarea>
        <button class="btn btn-ghost sm" id="saveNotes">Notizen speichern</button></aside>
    </div></div>`;
  const syncDur = () => { $('durWrap').hidden = $('s_type').value !== 'ban'; };
  $('s_type').onchange = syncDur; syncDur();
  $('sForm').onsubmit = async (e) => {
    e.preventDefault();
    try { await api(`admin/players/${id}/sanctions`, { method: 'POST', body: { type: $('s_type').value, reason: $('s_reason').value.trim(), hours: $('s_hours').value } }); toast('Eintrag gespeichert.'); showPlayer(id); }
    catch (err) { $('sMsg').innerHTML = alertBox('bad', err.message); }
  };
  $('watchBtn').onclick = async () => { await api('admin/players/' + id, { method: 'PUT', body: { watch: !p.watch } }); showPlayer(id); };
  $('editPl').onclick = () => playerDialog(p);
  $('saveNotes').onclick = async () => { await api('admin/players/' + id, { method: 'PUT', body: { notes: $('plNotes').value } }); toast('Notizen gespeichert.'); };
  app.querySelectorAll('[data-lift]').forEach((b) => (b.onclick = async () => { await api(`admin/sanctions/${b.dataset.lift}/lift`, { method: 'POST', body: {} }); toast('Aufgehoben.'); showPlayer(id); }));
  app.querySelectorAll('[data-sdel]').forEach((b) => (b.onclick = async () => { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Wirklich?'; b.classList.add('arm'); return; } await api('admin/sanctions/' + b.dataset.sdel, { method: 'DELETE' }); showPlayer(id); }));
}

// ============================================================ Website-News
async function showNews() {
  setNav('news');
  let d; try { d = await api('admin/news'); } catch (e) { return errBox(e); }
  const live = d.rows.filter((n) => n.published).length;
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Was gibt's Neues?</span>Website-News</h1><button class="btn btn-pink sm" id="addNews">+ News schreiben</button></div>
    <div class="alert info"><p>${live ? `<b>${live} News online.</b> Die Startseite zeigt die neuesten 4, angeheftete zuerst.` : '<b>Noch keine News veröffentlicht.</b> Bis dahin zeigt die Startseite die festen Beispiel-News. Sobald du eine News veröffentlichst, erscheinen dort deine.'}</p></div>
    <div class="news-list">${d.rows.map((n) => `<article class="card nitem" data-nid="${n.id}">
      <div class="n-top"><span class="tagc">${esc(n.tag)}</span>${n.pinned ? '<span class="n-pin">📌 Angeheftet</span>' : ''}<span class="pill ${n.published ? 'st-angenommen' : 'st-pruefung'}">${n.published ? 'Online' : 'Entwurf'}</span></div>
      <h3>${esc(n.title)}</h3><p class="muted">${esc((n.body || '').slice(0, 220))}${(n.body || '').length > 220 ? '…' : ''}</p>
      <small class="muted">${esc(n.admin_name || '–')} · ${fmt(n.created_at)}</small></article>`).join('') || '<div class="empty">Noch keine News geschrieben.</div>'}</div></div>`;
  $('addNews').onclick = () => newsDialog(null, d.tags);
  app.querySelectorAll('[data-nid]').forEach((el) => (el.onclick = () => newsDialog(d.rows.find((n) => n.id === +el.dataset.nid), d.tags)));
}
function newsDialog(n, tags) {
  const edit = !!n; n = n || { tag: 'Ankündigung', published: 1 };
  openDialog(`<form class="form main" style="gap:14px">${dlgHead(edit ? 'News bearbeiten' : 'Neue News')}
    <div class="grid2"><label class="field"><span>Überschrift</span><input name="title" maxlength="120" required value="${esc(n.title || '')}" placeholder="z. B. Server-Update 0.4 ist live"></label>
    <label class="field"><span>Kategorie</span><select name="tag">${opts(Object.fromEntries(tags.map((t) => [t, t])), n.tag)}</select></label></div>
    <label class="field"><span>Text <small>Zeilen mit „- “ werden zur Aufzählung</small></span><textarea name="body" maxlength="4000" style="min-height:170px" placeholder="Was ist neu?\n- Neue Garagen\n- Tankstellen-Script">${esc(n.body || '')}</textarea></label>
    <div class="row" style="gap:20px"><label class="chk"><input type="checkbox" name="published" ${n.published ? 'checked' : ''}> Auf der Website zeigen</label><label class="chk"><input type="checkbox" name="pinned" ${n.pinned ? 'checked' : ''}> Oben anheften</label></div>
    <div class="dlg-foot">${edit ? '<button type="button" class="btn btn-ghost sm" data-del>Löschen</button>' : '<span></span>'}<button class="btn btn-pink" type="submit">${edit ? 'Speichern' : 'News anlegen'}</button></div></form>`,
  async (fd) => {
    const body = { title: fd.get('title'), tag: fd.get('tag'), body: fd.get('body'), published: fd.has('published'), pinned: fd.has('pinned') };
    if (edit) await api('admin/news/' + n.id, { method: 'PUT', body }); else await api('admin/news', { method: 'POST', body });
    toast(body.published ? 'Gespeichert, die News ist auf der Website.' : 'Als Entwurf gespeichert.'); showNews();
  }, async () => { await api('admin/news/' + n.id, { method: 'DELETE' }); toast('News gelöscht.'); showNews(); });
}

// ============================================================ Protokoll
const LOG = { who: '', kind: '' };
async function showLog() {
  setNav('protokoll');
  let d; try { d = await api(`admin/activity?who=${LOG.who}&kind=${LOG.kind}`); } catch (e) { return errBox(e); }
  const kinds = { '': 'Alle Bereiche', bewerbung: 'Bewerbungen', spieler: 'Spielerakten', news: 'News', dev: 'Dev', pinnwand: 'Pinnwand', team: 'Team & Einstellungen' };
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Wer hat was gemacht?</span>Protokoll</h1></div>
    <div class="toolbar"><select id="lgWho" class="pos-filter"><option value="">Alle Personen</option>${opts(Object.fromEntries(d.team.map((t) => [t.id, t.name])), LOG.who)}</select>
      <select id="lgKind" class="pos-filter">${opts(kinds, LOG.kind)}</select></div>
    <ul class="feed big card" id="logList">${d.rows.map(logRow).join('') || '<li class="muted">Noch nichts protokolliert.</li>'}</ul>
    ${d.rows.length === 80 ? '<button class="btn btn-ghost sm" id="moreLog" style="margin-top:14px">Ältere laden</button>' : ''}</div>`;
  $('lgWho').onchange = () => { LOG.who = $('lgWho').value; showLog(); };
  $('lgKind').onchange = () => { LOG.kind = $('lgKind').value; showLog(); };
  let last = d.rows.at(-1)?.id;
  if ($('moreLog')) $('moreLog').onclick = async () => {
    const r = await api(`admin/activity?who=${LOG.who}&kind=${LOG.kind}&before=${last}`);
    $('logList').insertAdjacentHTML('beforeend', r.rows.map(logRow).join(''));
    last = r.rows.at(-1)?.id; if (r.rows.length < 80) $('moreLog').remove();
  };
}
const logRow = (e) => `<li><a href="${refLink(e)}"><span class="fi">${KIND_ICON[e.kind] || '•'}</span><span><b>${esc(e.admin_name || 'Website')}</b> ${esc(e.text)}<small>${fmt(e.created_at)}</small></span></a></li>`;

// ============================================================ Team
async function showTeam(newPass) {
  setNav('team');
  let team; try { team = (await api('admin/team')).team; } catch (e) { return errBox(e); }
  const owner = me.role === 'owner';
  const onl = new Set(LIVE.online.map((o) => o.id));
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Wer darf rein?</span>Team-Konten</h1></div><div id="tMsg"></div>
    ${newPass ? `<div class="alert info"><p><b>Zugangsdaten für ${esc(newPass.name)}</b>, gib sie per Privatnachricht weiter. Das Passwort wird nur jetzt angezeigt.</p><div class="code-box" style="margin:10px 0 4px"><code style="font-size:22px">${esc(newPass.password)}</code></div><p class="muted">Nach dem ersten Anmelden unter „Mein Konto“ ein eigenes Passwort setzen.</p></div>` : ''}
    <div class="table-wrap" style="margin-bottom:24px"><table><thead><tr><th>Name</th><th>Rolle</th><th>Status</th><th>Zuletzt angemeldet</th>${owner ? '<th></th>' : ''}</tr></thead><tbody>
    ${team.map((t) => `<tr style="cursor:default"><td><span class="tname">${ava(t.name)}<b>${esc(t.name)}</b>${onl.has(t.id) ? '<span class="live-dot" title="Gerade online"></span>' : ''}${t.id === me.id ? ' <span class="muted">(du)</span>' : ''}</span></td>
      <td><span class="pill ${t.role === 'owner' ? 'st-offen' : 'st-pruefung'}">${t.role === 'owner' ? 'Owner' : 'Admin'}</span></td>
      <td><span class="pill ${t.active ? 'st-angenommen' : 'st-abgelehnt'}">${t.active ? 'Aktiv' : 'Gesperrt'}</span></td>
      <td class="num">${fmt(t.last_login)}</td>
      ${owner ? `<td>${t.id === me.id ? '' : `<div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost sm" data-act="toggle" data-id="${t.id}">${t.active ? 'Sperren' : 'Entsperren'}</button>
        <button class="btn btn-ghost sm" data-act="reset" data-id="${t.id}">Neues Passwort</button>
        <button class="btn btn-ghost sm" data-act="role" data-role="${t.role === 'owner' ? 'admin' : 'owner'}" data-id="${t.id}">${t.role === 'owner' ? 'Zu Admin' : 'Zu Owner'}</button></div>`}</td>` : ''}</tr>`).join('')}
    </tbody></table></div>
    ${owner ? `<section class="card pad" style="max-width:560px"><h2 style="font-size:24px;margin-bottom:6px">Neues Team-Konto</h2>
      <p class="muted" style="margin-top:0">Ein sicheres Passwort wird automatisch erstellt. <b>Admins</b> nutzen alle Bereiche, <b>Owner</b> verwalten zusätzlich das Team, die Einstellungen und dürfen endgültig löschen.</p>
      <form class="form" id="teamForm" style="gap:14px"><div class="grid2">
        <label class="field"><span>Benutzername</span><input id="t_name" maxlength="40" placeholder="z. B. Likma"></label>
        <label class="field"><span>Rolle</span><select id="t_role"><option value="admin">Admin</option><option value="owner">Owner</option></select></label></div>
        <button class="btn btn-pink" type="submit" style="justify-self:start">Konto anlegen</button></form></section>` : '<p class="muted">Neue Konten legt der Projektinhaber an.</p>'}
  </div>`;
  if (!owner) return;
  app.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
    try { const r = await api('admin/team/' + b.dataset.id, { method: 'POST', body: { action: b.dataset.act, role: b.dataset.role } }); showTeam(r.password ? r : null); }
    catch (err) { $('tMsg').innerHTML = alertBox('bad', err.message); }
  }));
  $('teamForm').onsubmit = async (e) => {
    e.preventDefault();
    try { showTeam(await api('admin/team', { method: 'POST', body: { name: $('t_name').value.trim(), role: $('t_role').value } })); }
    catch (err) { $('tMsg').innerHTML = alertBox('bad', err.message); }
  };
}

// ============================================================ Einstellungen (nur Owner)
async function showSettings() {
  setNav('einstellungen');
  let cfg; try { cfg = await api('config'); } catch (e) { return errBox(e); }
  const states = [['offen', 'Offen'], ['wenige', 'Wenige Plätze'], ['voll', 'Voll'], ['geschlossen', 'Geschlossen']];
  const row = (p = { name: '', state: 'offen' }) => `<div class="set-row"><input class="sp-name" value="${esc(p.name)}" maxlength="40" placeholder="Bereich, z. B. Supporter">
    <select class="sp-state">${states.map(([v, l]) => `<option value="${v}"${p.state === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <button type="button" class="icon-btn" title="Entfernen" aria-label="Bereich entfernen">×</button></div>`;
  app.innerHTML = `<div class="wrap narrow"><section class="card pad">
    <h1 class="h"><span class="script">Was suchen wir?</span>Einstellungen</h1><div id="sMsg"></div>
    <form class="form" id="setForm">
      <label class="switch"><input type="checkbox" id="s_open" ${cfg.open ? 'checked' : ''}> Bewerbungen sind geöffnet</label>
      <p class="muted" style="margin:-10px 0 0;font-size:14px">Ist der Haken weg, sehen Besucher „Die Bewerbungsphase ist gerade pausiert“.</p>
      <div class="field"><span>Bereiche</span><p class="muted" style="margin:0;font-size:14px">Bei „Voll“ und „Geschlossen“ kann man den Bereich im Formular nicht auswählen.</p></div>
      <div id="rows" style="display:grid;gap:8px">${cfg.positions.map(row).join('')}</div>
      <button type="button" class="btn btn-ghost sm" id="addRow" style="justify-self:start">+ Bereich hinzufügen</button>
      <button class="btn btn-pink" type="submit" style="justify-self:start">Speichern</button>
    </form></section></div>`;
  const bindRemove = () => app.querySelectorAll('.icon-btn').forEach((b) => (b.onclick = () => b.closest('.set-row').remove()));
  bindRemove();
  $('addRow').onclick = () => { $('rows').insertAdjacentHTML('beforeend', row()); bindRemove(); $('rows').lastElementChild.querySelector('input').focus(); };
  $('setForm').onsubmit = async (e) => {
    e.preventDefault();
    const pos = [...app.querySelectorAll('.set-row')].map((r) => ({ name: r.querySelector('.sp-name').value.trim(), state: r.querySelector('.sp-state').value })).filter((p) => p.name);
    try { await api('admin/settings', { method: 'PUT', body: { open: $('s_open').checked, positions: pos } }); positions = pos; $('sMsg').innerHTML = alertBox('ok', 'Gespeichert. Das Formular zeigt die Änderung sofort.'); }
    catch (err) { $('sMsg').innerHTML = alertBox('bad', err.message); }
  };
}

// ============================================================ Mein Konto
function showAccount() {
  setNav('konto');
  app.innerHTML = `<div class="wrap narrow"><section class="card pad">
    <h1 class="h"><span class="script">${esc(me.name)}</span>Mein Konto</h1>
    <p class="muted">Rolle: <b style="color:var(--fg)">${me.role === 'owner' ? 'Owner' : 'Admin'}</b></p><div id="kMsg"></div>
    <form class="form" id="pwForm">
      <label class="field"><span>Aktuelles Passwort</span><input id="pw_old" type="password" required autocomplete="current-password"></label>
      <label class="field"><span>Neues Passwort <small>(mindestens 10 Zeichen)</small></span><input id="pw_new" type="password" required minlength="10" autocomplete="new-password"></label>
      <label class="field"><span>Neues Passwort wiederholen</span><input id="pw_new2" type="password" required minlength="10" autocomplete="new-password"></label>
      <button class="btn btn-pink" type="submit" style="justify-self:start">Passwort ändern</button>
    </form></section></div>`;
  $('pwForm').onsubmit = async (e) => {
    e.preventDefault();
    if ($('pw_new').value !== $('pw_new2').value) { $('kMsg').innerHTML = alertBox('bad', 'Die neuen Passwörter stimmen nicht überein.'); return; }
    try { await api('admin/password', { method: 'POST', body: { old: $('pw_old').value, new: $('pw_new').value } }); $('kMsg').innerHTML = alertBox('ok', 'Passwort geändert. Andere angemeldete Geräte wurden abgemeldet.'); $('pwForm').reset(); }
    catch (err) { $('kMsg').innerHTML = alertBox('bad', err.message); }
  };
}

// ============================================================ Launcher-Steuerung
const LA = { s: null, meta: null, dirty: false };
const NOTICE_LABEL = { info: 'Info', warn: 'Warnung', bad: 'Wartung', ok: 'Erfolg' };
const NOTICE_PRESETS = [
  ['🔧 Wartung', 'bad', 'Wartungsarbeiten: Der Server ist kurz offline. Infos im Discord.'],
  ['🔄 Restart', 'warn', 'Server-Restart in 10 Minuten. Bitte sicher ausloggen.'],
  ['✨ Update', 'info', 'Neues Update ist live! Alle Änderungen findest du unter News.'],
  ['🎉 Release', 'ok', 'Real Life Southland III ist offen! Klick auf Spielen und los geht’s.']
];
const isoToLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const IMG_LABEL = { '': 'Kein Bild', 'gallery/01-late-night-ride.jpg': 'Late Night Ride', 'gallery/02-sunset.jpg': 'Sunset Boulevard', 'gallery/03-low-and-slow.jpg': 'Low & Slow', 'gallery/04-neon-glow.jpg': 'Neon Glow', 'gallery/05-street-livery.jpg': 'Street Livery' };

async function showLauncher(flash) {
  setNav('launcher');
  let d; try { d = await api('admin/launcher'); } catch (e) { return errBox(e); }
  LA.s = d.settings; LA.meta = d; LA.dirty = false; window.EDITING = false;
  const s = LA.s, endpoint = location.origin + '/api/launcher';
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Was sehen die Spieler?</span>Launcher</h1>
      <small class="muted">${s.updated_at ? `Zuletzt gespeichert von ${esc(d.updated_by_name || '–')} · ${ago(s.updated_at)}` : 'Noch nie gespeichert. Der Launcher nutzt seine eingebauten Werte.'}</small></div>
    ${flash ? alertBox('ok', flash) : ''}<div id="laMsg"></div>
    <div class="la-grid"><div class="la-main">

      <section class="card la-card"><h2>Spielen-Knopf &amp; Countdown</h2>
        <div class="seg big" id="laLock">
          <button type="button" data-v="1"><b>🔒 Gesperrt</b><small>Knopf zeigt „Coming Soon“</small></button>
          <button type="button" data-v="0"><b>▶ Freigegeben</b><small>Spielen verbindet direkt</small></button></div>
        <p class="muted hint">Das Team kommt auch bei „Gesperrt“ rein: <b>Shift</b> halten und auf den Knopf klicken.</p>
        <div class="grid2"><label class="field"><span>Release-Datum &amp; Uhrzeit</span><input type="datetime-local" id="laRelease" value="${isoToLocal(s.releaseDate)}"></label>
          <div class="field"><span>&nbsp;</span><button type="button" class="btn btn-ghost sm" id="laNoDate" style="justify-self:start">Kein Datum (geheimer Countdown ??)</button></div></div>
      </section>

      <section class="card la-card"><h2>Hinweis-Balken</h2>
        <p class="muted hint" style="margin-top:0">Erscheint oben im Launcher bei allen Spielern. Leer lassen = kein Balken.</p>
        <div class="row" style="margin-bottom:12px">${NOTICE_PRESETS.map((p, i) => `<button type="button" class="btn btn-ghost sm" data-preset="${i}">${p[0]}</button>`).join('')}</div>
        <label class="field"><span>Text</span><input id="laNotice" maxlength="200" value="${esc(s.notice.text)}" placeholder="z. B. Wartung bis 18 Uhr, Infos im Discord"></label>
        <div class="grid2" style="margin-top:12px"><div class="field"><span>Farbe</span><div class="seg" id="laStyle">${Object.entries(NOTICE_LABEL).map(([k, l]) => `<button type="button" data-v="${k}" class="n-${k}">${l}</button>`).join('')}</div></div>
          <label class="field"><span>Link beim Klick <small>(optional)</small></span><input id="laNoticeLink" maxlength="300" value="${esc(s.notice.link || '')}" placeholder="https://discord.gg/…"></label></div>
        <button type="button" class="btn btn-ghost sm" id="laNoticeClear" style="margin-top:12px">Balken entfernen</button>
      </section>

      <section class="card la-card"><h2>News im Launcher</h2>
        <div class="seg" id="laSrc"><button type="button" data-v="launcher">Eigene Launcher-News</button><button type="button" data-v="website">Website-News übernehmen</button></div>
        <div id="laNewsBox"></div>
      </section>

      <section class="card la-card"><h2>Download auf der Website</h2>
        <p class="muted hint" style="margin-top:0">Neue Launcher-Version gebaut? Link hier tauschen, speichern, fertig. Die Seite <a href="../launcher.html" target="_blank" style="color:var(--pink)">Launcher</a> nutzt sofort den neuen Download. Dropbox-Links mit <code>dl=0</code> werden automatisch zu Direkt-Downloads.</p>
        <label class="field"><span>Download-Link</span><input id="laDl" maxlength="300" value="${esc(s.download.url)}" placeholder="https://www.dropbox.com/…"></label>
        <div class="grid3" style="margin-top:12px"><label class="field"><span>Version</span><input id="laDlVer" maxlength="20" value="${esc(s.download.version)}" placeholder="1.6.0"></label>
          <label class="field"><span>Größe <small>(optional)</small></span><input id="laDlSize" maxlength="20" value="${esc(s.download.size)}" placeholder="88 MB"></label>
          <label class="field"><span>SHA-256 <small>(optional)</small></span><input id="laDlSha" maxlength="80" value="${esc(s.download.sha256)}" style="font-family:var(--mono);font-size:13px"></label></div>
      </section>

      <details class="card la-card"><summary><h2>Server &amp; Links</h2></summary>
        <div class="grid2" style="margin-top:14px">
          <label class="field"><span>Server-Code <small>(cfx.re/join/…)</small></span><input id="laCode" maxlength="20" value="${esc(s.serverCode)}"></label>
          <label class="field"><span>Direkte IP <small>(optional, statt cfx.re)</small></span><input id="laConnect" maxlength="80" value="${esc(s.connect || '')}" placeholder="123.45.67.89:30120"></label>
          <label class="field"><span>Discord-Link</span><input id="laDiscord" maxlength="300" value="${esc(s.discord)}"></label>
          <label class="field"><span>Website-Link <small>(leer = diese Website)</small></span><input id="laWebsite" maxlength="300" value="${esc(s.website || '')}" placeholder="${esc(location.origin)}/"></label>
        </div></details>
    </div>

    <aside class="la-side">
      <div class="card la-prev"><p class="la-k">Vorschau</p><div class="lp" id="laPrev"></div></div>
      <div class="card la-info"><p class="la-k">Einmalig im Launcher eintragen</p>
        <p class="muted">In der <code>config.js</code> des Launchers bei <code>remoteConfig</code>:</p>
        <div class="code-line"><code id="laUrl">${esc(endpoint)}</code><button class="mini" id="laCopy">Kopieren</button></div>
        <p class="muted" style="margin:10px 0 0;font-size:13px">Danach holt sich der Launcher Änderungen von hier, spätestens nach einer Minute. <b>F5</b> im Launcher lädt sofort. <a href="${esc(endpoint)}" target="_blank" rel="noopener" style="color:var(--pink)">Daten ansehen ↗</a></p></div>
    </aside></div>
    <div class="savebar" id="laBar" hidden><span>Ungespeicherte Änderungen</span><button class="btn btn-ghost sm" id="laReset">Verwerfen</button><button class="btn btn-pink sm" id="laSave">Speichern &amp; an alle Launcher senden</button></div>
  </div>`;

  const dirty = () => { LA.dirty = true; window.EDITING = true; $('laBar').hidden = false; preview(); };
  const seg = (id, val, fn) => { const el = $(id); const set = (v) => el.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === String(v))); set(val);
    el.onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; set(b.dataset.v); fn(b.dataset.v); dirty(); }; return set; };
  seg('laLock', s.locked ? 1 : 0, (v) => { s.locked = v === '1'; });
  const setStyle = seg('laStyle', s.notice.style, (v) => { s.notice.style = v; });
  seg('laSrc', s.newsSource, (v) => { s.newsSource = v; renderLaNews(); });
  const bind = (id, fn) => { $(id).oninput = () => { fn($(id).value); dirty(); }; };
  bind('laRelease', (v) => { s.releaseDate = v ? new Date(v).toISOString() : null; });
  bind('laNotice', (v) => { s.notice.text = v; });
  bind('laNoticeLink', (v) => { s.notice.link = v.trim(); });
  bind('laCode', (v) => { s.serverCode = v.trim(); });
  bind('laConnect', (v) => { s.connect = v.trim(); });
  bind('laDiscord', (v) => { s.discord = v.trim(); });
  bind('laWebsite', (v) => { s.website = v.trim(); });
  bind('laDl', (v) => { s.download.url = v.trim(); });
  bind('laDlVer', (v) => { s.download.version = v.trim(); });
  bind('laDlSize', (v) => { s.download.size = v.trim(); });
  bind('laDlSha', (v) => { s.download.sha256 = v.trim(); });
  $('laNoDate').onclick = () => { $('laRelease').value = ''; s.releaseDate = null; dirty(); };
  $('laNoticeClear').onclick = () => { $('laNotice').value = ''; s.notice.text = ''; dirty(); };
  app.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => { const p = NOTICE_PRESETS[+b.dataset.preset]; s.notice.text = p[2]; s.notice.style = p[1]; $('laNotice').value = p[2]; setStyle(p[1]); dirty(); }));
  $('laCopy').onclick = async () => { try { await navigator.clipboard.writeText(endpoint); toast('Adresse kopiert.'); } catch { toast('Bitte von Hand kopieren.', 'bad'); } };
  $('laReset').onclick = () => showLauncher();
  $('laSave').onclick = async () => {
    $('laSave').disabled = true;
    try { await api('admin/launcher', { method: 'PUT', body: s }); window.EDITING = false; toast('Gespeichert. Die Launcher holen sich das gleich.'); showLauncher('Gespeichert. Alle Launcher übernehmen die Änderung innerhalb einer Minute.'); }
    catch (err) { $('laMsg').innerHTML = alertBox('bad', err.message); $('laSave').disabled = false; scrollTo(0, 0); }
  };

  function renderLaNews() {
    const box = $('laNewsBox');
    if (s.newsSource === 'website') { box.innerHTML = `<p class="muted hint">Der Launcher zeigt dieselben News wie die Startseite (die neuesten 6). Schreiben und veröffentlichen kannst du sie unter <a href="#news" style="color:var(--pink)">Website-News</a>.</p>`; return; }
    box.innerHTML = `<p class="muted hint">Die erste News wird groß mit Bild angezeigt. ${s.news.length ? '' : 'Solange hier keine steht, zeigt der Launcher seine eingebauten News.'}</p>
      <div class="la-news">${s.news.map((n, i) => `<div class="la-n" data-i="${i}">
        <div class="la-n-head"><b>${i === 0 ? 'Große News' : 'News ' + (i + 1)}</b><span class="row">
          <button type="button" class="mini" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">↑</button><button type="button" class="mini" data-down="${i}" ${i === s.news.length - 1 ? 'disabled' : ''} aria-label="Nach unten">↓</button><button type="button" class="mini" data-rm="${i}">Entfernen</button></span></div>
        <div class="grid3"><label class="field"><span>Kategorie</span><select data-k="tag">${opts(Object.fromEntries(LA.meta.tags.map((t) => [t, t])), n.tag)}</select></label>
          <label class="field"><span>Datum</span><input data-k="date" maxlength="30" value="${esc(n.date)}" placeholder="03.11.2026"></label>
          <label class="field"><span>Bild</span><select data-k="image">${opts(IMG_LABEL, n.image || '')}</select></label></div>
        <label class="field"><span>Überschrift</span><input data-k="title" maxlength="120" value="${esc(n.title)}"></label>
        <label class="field"><span>Text</span><textarea data-k="text" maxlength="1500" style="min-height:70px">${esc(n.text)}</textarea></label></div>`).join('')}</div>
      <button type="button" class="btn btn-ghost sm" id="laAddNews">+ News hinzufügen</button>`;
    box.querySelectorAll('[data-k]').forEach((el) => (el.oninput = () => {
      const n = s.news[+el.closest('.la-n').dataset.i]; n[el.dataset.k] = el.value;
      if (el.dataset.k === 'tag') n.color = LA.meta.colors[el.value] || '#ff4fb3';
      dirty();
    }));
    const move = (i, j) => { [s.news[i], s.news[j]] = [s.news[j], s.news[i]]; renderLaNews(); dirty(); };
    box.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => move(+b.dataset.up, +b.dataset.up - 1)));
    box.querySelectorAll('[data-down]').forEach((b) => (b.onclick = () => move(+b.dataset.down, +b.dataset.down + 1)));
    box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { s.news.splice(+b.dataset.rm, 1); renderLaNews(); dirty(); }));
    $('laAddNews').onclick = () => {
      const d = new Date();
      s.news.unshift({ tag: 'Ankündigung', color: LA.meta.colors['Ankündigung'], date: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`, title: '', text: '', image: s.news.length ? '' : 'gallery/01-late-night-ride.jpg' });
      renderLaNews(); dirty(); $('laNewsBox').querySelector('[data-k=title]').focus();
    };
  }
  function preview() {
    const rel = s.releaseDate ? new Date(s.releaseDate) : null;
    let cd = '?? : ?? : ??';
    if (rel) { const ms = rel - Date.now(); if (ms <= 0) cd = 'Release erreicht'; else { const dd = Math.floor(ms / 864e5), hh = Math.floor(ms % 864e5 / 36e5), mm = Math.floor(ms % 36e5 / 6e4); cd = `${dd} T · ${hh} Std · ${mm} Min`; } }
    $('laPrev').innerHTML = `${s.notice.text ? `<div class="lp-notice n-${s.notice.style}">${esc(s.notice.text)}${s.notice.link ? ' ↗' : ''}</div>` : ''}
      <img src="../logo.png" alt="" class="lp-logo"><div class="lp-cd"><small>${rel ? 'Release am ' + rel.toLocaleDateString('de-DE') + ', ' + rel.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'Release'}</small><b>${cd}</b></div>
      <div class="lp-play ${s.locked ? 'locked' : ''}">${s.locked ? 'Coming Soon' : '▶ Spielen'}</div>
      <small class="lp-con">connect ${esc(s.connect || 'cfx.re/join/' + s.serverCode)}</small>`;
  }
  renderLaNews(); preview();
}
addEventListener('beforeunload', (e) => { if (LA.dirty && LIVE.view === 'launcher') { e.preventDefault(); e.returnValue = ''; } });

// ============================================================ Schnellsuche (Strg + K)
const QUICK = () => [
  ['Neue Aufgabe', '🛠️', () => { location.hash = '#dev'; setTimeout(() => taskDialog(), 250); }],
  ['Bug melden', '🐞', () => { location.hash = '#bugs'; setTimeout(() => taskDialog(null, 'todo', '', 'Bug'), 250); }],
  ['Spielerakte anlegen', '🛡️', () => { location.hash = '#spieler'; setTimeout(() => playerDialog(), 250); }],
  ['Termin anlegen', '📅', () => { location.hash = '#kalender'; setTimeout(() => eventForm(), 400); }],
  ['Abwesenheit eintragen', '🌴', () => { location.hash = '#kalender'; setTimeout(() => absenceForm(), 400); }],
  ['Abstimmung starten', '🗳️', () => { location.hash = '#abstimmungen'; setTimeout(() => pollForm(), 300); }],
  ['Textbaustein kopieren', '📋', () => { location.hash = '#vorlagen'; }],
  ['News schreiben', '📰', () => { location.hash = '#news'; setTimeout(() => $('addNews')?.click(), 350); }],
  ...Object.entries(TITLES).filter(([k]) => k !== 'einstellungen' || me?.role === 'owner').map(([k, t]) => [t, '→', () => { location.hash = '#' + k; }])
];
const SR_LABEL = { bewerbung: 'Bewerbung', spieler: 'Spieler', aufgabe: 'Aufgabe', wiki: 'Wiki', script: 'Script' };
const SR_LINK = { bewerbung: (r) => '#bewerbung-' + r.id, spieler: (r) => '#spieler-' + r.id, aufgabe: (r) => '#aufgabe-' + r.id, wiki: (r) => '#wiki-' + r.id, script: () => '#scripts' };
function openCmdk() {
  if (!me || document.querySelector('dialog.cmdk')) return;
  const dlg = openDialog(`<input id="ckq" placeholder="Suchen: Spieler, Aufgaben, Bewerbungen, Wiki… oder Aktion" autocomplete="off"><ul id="ckr" class="ck-list"></ul><p class="ck-hint">↑↓ auswählen · Enter öffnen · Esc schließen</p>`, null, null, {});
  dlg.classList.add('cmdk');
  let items = [], sel = 0, deb;
  const draw = () => {
    $('ckr').innerHTML = items.map((it, i) => `<li class="${i === sel ? 'sel' : ''}" data-i="${i}"><span class="ck-ic">${it.icon}</span><span>${esc(it.title)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${it.tag ? `<em>${esc(it.tag)}</em>` : ''}</li>`).join('') || '<li class="muted">Nichts gefunden.</li>';
    $('ckr').querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  };
  const quick = (term) => QUICK().filter(([t]) => !term || t.toLowerCase().includes(term.toLowerCase())).map(([title, icon, run]) => ({ title, icon, run }));
  const go = (it) => { dlg.close(); if (it.run) it.run(); else location.hash = it.href; };
  const search = async () => {
    const term = $('ckq').value.trim();
    items = quick(term); sel = 0; draw();
    if (term.length < 2) return;
    try {
      const r = await api('admin/search?q=' + encodeURIComponent(term));
      if ($('ckq')?.value.trim() !== term) return;
      items = [...r.results.map((x) => ({ title: x.title, sub: x.sub, tag: SR_LABEL[x.type], icon: { bewerbung: '📝', spieler: '🛡️', aufgabe: '🛠️', wiki: '📖', script: '⌘' }[x.type], href: SR_LINK[x.type](x) })), ...quick(term)];
      draw();
    } catch {}
  };
  $('ckq').oninput = () => { clearTimeout(deb); deb = setTimeout(search, 160); };
  $('ckq').onkeydown = (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && items[sel]) { e.preventDefault(); go(items[sel]); }
  };
  $('ckr').onclick = (e) => { const li = e.target.closest('[data-i]'); if (li) go(items[+li.dataset.i]); };
  search();
}
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmdk(); } });
document.querySelectorAll('[data-cmdk]').forEach((b) => (b.onclick = openCmdk));

boot();
