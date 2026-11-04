// =====================================================================
//  Team-Panel – Server Live: Verbindung zum Ingame-Admin-Menü (rls_admin)
//  Live-Spieler, Ressourcen, Items, Koordinaten, Befehle ins Spiel
// =====================================================================
const SV = { tab: 'spieler', q: '', cat: '', d: null, sel: null };
const fmtUp = (s) => { s = +s || 0; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} Std. ${m} Min.` : `${m} Min.`; };
const v3 = (c) => `vector3(${(+c.x).toFixed(2)}, ${(+c.y).toFixed(2)}, ${(+c.z).toFixed(2)})`;
const v4 = (c) => `vector4(${(+c.x).toFixed(2)}, ${(+c.y).toFixed(2)}, ${(+c.z).toFixed(2)}, ${(+(c.h || 0)).toFixed(2)})`;
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('Kopiert: ' + t); } catch { toast('Kopieren nicht möglich.', 'bad'); } }

const SV_PROTECTED = ['es_extended', 'oxmysql', 'mysql-async', 'spawnmanager', 'sessionmanager', 'hardcap', 'monitor', 'txAdmin', 'rls_admin'];
const svCmd = (body) => api('admin/server/command', { method: 'POST', body });

async function showServer() {
  setNav('server');
  let d; try { d = await api('admin/server'); } catch (e) { return errBox(e); }
  SV.d = d;
  const live = d.live || {}, players = d.online ? (live.players || []) : [];
  const started = d.resources.filter((r) => r.state === 'started').length;
  const missing = d.resources.filter((r) => !r.inList).length;
  const openRep = (d.reports || []).filter((r) => r.status === 'offen').length;
  const tabs = [['spieler', `👥 Spieler ${d.online ? players.length : ''}`], ['karte', '🗺️ Live-Karte'], ['reports', `🆘 Reports${openRep ? ` <span class="sv-badge">${openRep}</span>` : ''}`], ['logs', '📜 Logs'], ['ressourcen', `⚙️ Ressourcen ${d.resources.length || ''}`], ['items', `📦 Items ${d.items.length || ''}`], ['koordinaten', `📍 Koordinaten ${d.coords.length || ''}`], ['einrichtung', '🔌 Einrichtung']];
  if (!d.keySet && SV.tab !== 'koordinaten') SV.tab = 'einrichtung';
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Was läuft gerade?</span>Server Live</h1>
      ${!d.keySet ? '<span class="pill st-pruefung">Noch nicht verbunden</span>' : d.online ? `<span class="live-tag"><span class="live-dot"></span>Online · ${players.length}/${live.maxPlayers || '?'} Spieler · seit ${fmtUp(live.uptime)}</span>` : `<span class="pill st-abgelehnt">Offline${live.at ? ' · zuletzt ' + ago(live.at) : ''}</span>`}</div>
    <div class="dev-stats four">
      <div><b>${d.online ? players.length : '–'}</b><span>Spieler online</span></div>
      <div><b>${started}/${d.resources.length || '–'}</b><span>Ressourcen gestartet</span></div>
      <div><b>${d.online ? players.filter((p) => p.staff).length : '–'}</b><span>Team online</span></div>
      <div class="${openRep ? 'late' : ''}"><b>${openRep}</b><span>offene Reports</span></div>
    </div>
    ${d.keySet ? svControlHtml(d) : ''}
    <div class="seg sv-tabs" id="svTabs">${tabs.map(([k, l]) => `<button type="button" data-v="${k}" class="${SV.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="svView"></div></div>`;
  $('svTabs').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { SV.tab = b.dataset.v; SV.q = ''; SV.cat = ''; showServer(); } };
  if (d.keySet) svControlBind(d);
  if (SV.lmap && SV.tab !== 'karte') { SV.lmap.map.remove(); SV.lmap = null; }
  ({ spieler: svPlayers, karte: svMap, reports: svReports, logs: svLogs, ressourcen: svResources, items: svItems, koordinaten: svCoords, einrichtung: svSetup })[SV.tab]();
}

function svPlayers() {
  const d = SV.d, players = d.online ? (d.live.players || []) : [];
  $('svView').innerHTML = `
    <section class="card la-card sv-ann"><h2>📢 Ankündigung ins Spiel</h2>
      <form class="inline-add" id="annForm"><input id="annText" maxlength="240" placeholder="z. B. Server-Restart in 10 Minuten, bitte sicher ausloggen" ${d.online ? '' : 'disabled'}><button class="btn btn-pink sm" ${d.online ? '' : 'disabled'}>Senden</button></form>
      <div class="chips-row">${['Server-Restart in 10 Minuten. Bitte sicher ausloggen.', 'Server-Restart in 5 Minuten!', 'Server-Restart in 1 Minute!', 'Neues Update ist live! Infos im Discord.'].map((t) => `<button type="button" class="mini" data-ann="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <p class="muted" style="font-size:13px;margin:8px 0 0">Erscheint bei allen Spielern groß auf dem Bildschirm, in wenigen Sekunden.</p></section>
    ${!d.online ? `<div class="empty">${d.keySet ? 'Der Server meldet sich gerade nicht. Läuft er und ist rls_admin gestartet?' : 'Verbinde zuerst den Server (Reiter „Einrichtung“).'}</div>`
      : `<div class="toolbar"><input id="svq" type="search" placeholder="Spieler suchen (Name, ID, Job)" value="${esc(SV.q)}"></div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Job</th><th>Gruppe</th><th>Ping</th><th>Aktionen</th></tr></thead><tbody id="svBody"></tbody></table></div>`}`;
  app.querySelectorAll('[data-ann]').forEach((b) => (b.onclick = () => { $('annText').value = b.dataset.ann; $('annText').focus(); }));
  $('annForm').onsubmit = async (e) => { e.preventDefault(); const t = $('annText').value.trim(); if (!t) return; try { await api('admin/server/command', { method: 'POST', body: { type: 'announce', text: t } }); $('annText').value = ''; toast('Ankündigung geschickt. Kommt in wenigen Sekunden ingame an.'); } catch (err) { toast(err.message, 'bad'); } };
  if (!d.online) return;
  const draw = () => {
    const q = SV.q.toLowerCase();
    const rows = players.filter((p) => !q || `${p.id} ${p.name} ${p.job}`.toLowerCase().includes(q)).sort((a, b) => a.id - b.id);
    $('svBody').innerHTML = rows.map((p) => `<tr style="cursor:default"><td class="num">${p.id}</td><td><b>${esc(p.name)}</b>${p.staff ? ' <span class="tagc">Team</span>' : ''}${p.dead ? ' <span title="tot">💀</span>' : ''}</td><td>${esc(p.job || '–')}</td>
      <td>${p.group && p.group !== 'user' ? `<span class="pill st-offen">${esc(p.group)}</span>` : '<span class="muted">user</span>'}</td><td class="num ${p.ping > 150 ? 'bad-t' : ''}">${p.ping} ms</td>
      <td><span class="row sv-acts"><button class="mini" data-akte="${esc(p.license)}" data-name="${esc(p.name)}">📁 Akte</button><button class="mini" data-msg="${p.id}" data-name="${esc(p.name)}">💬</button><button class="mini" data-cmd="heal" data-id="${p.id}" title="Heilen">❤️</button><button class="mini" data-cmd="revive" data-id="${p.id}" title="Wiederbeleben">💉</button><button class="mini" data-cmd="freeze" data-id="${p.id}" title="Einfrieren">🧊</button><button class="mini" data-cmd="unfreeze" data-id="${p.id}" title="Auftauen">🔥</button><button class="mini bad" data-kick="${p.id}" data-name="${esc(p.name)}">Kicken</button></span></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Niemand gefunden.</td></tr>';
  };
  draw();
  $('svq').oninput = () => { SV.q = $('svq').value; draw(); };
  $('svBody').onclick = async (e) => {
    const c = e.target.closest('[data-cmd]');
    if (c) { try { await svCmd({ type: c.dataset.cmd, target: c.dataset.id }); toast({ heal: 'Wird geheilt.', revive: 'Wird wiederbelebt.', freeze: 'Wird eingefroren.', unfreeze: 'Wird aufgetaut.' }[c.dataset.cmd]); } catch (err) { toast(err.message, 'bad'); } return; }
    const m = e.target.closest('[data-msg]');
    if (m) return openDialog(`<form class="form main" style="gap:14px">${dlgHead('Nachricht an ' + esc(m.dataset.name))}
      <label class="field"><span>Nachricht <small>(erscheint groß auf seinem Bildschirm)</small></span><textarea name="text" maxlength="240" required placeholder="z. B. Melde dich bitte im Support-Warteraum."></textarea></label>
      <div class="dlg-foot"><span></span><button class="btn btn-pink" type="submit">Senden</button></div></form>`,
    async (fd) => { await svCmd({ type: 'message', target: m.dataset.msg, text: fd.get('text') }); toast('Nachricht geschickt.'); });
    const k = e.target.closest('[data-kick]');
    if (k) return openDialog(`<form class="form main" style="gap:14px">${dlgHead('Kicken: ' + esc(k.dataset.name))}
      <label class="field"><span>Grund <small>(sieht der Spieler)</small></span><input name="reason" maxlength="200" required placeholder="z. B. Bitte Ticket im Discord öffnen"></label>
      <p class="muted" style="margin:0;font-size:13px">Für Verwarnungen oder Bans nimm die Spielerakte, dann ist alles festgehalten.</p>
      <div class="dlg-foot"><span></span><button class="btn btn-bad" type="submit">Kicken</button></div></form>`,
    async (fd) => { await api('admin/server/command', { method: 'POST', body: { type: 'kick', target: k.dataset.kick, reason: fd.get('reason') } }); toast('Kick geschickt.'); });
    const a = e.target.closest('[data-akte]');
    if (a) { PL.q = a.dataset.akte || a.dataset.name; PL.filter = ''; location.hash = '#spieler'; }
  };
}

// ---------------------------------------------------------------- Server-Steuerung (wie txAdmin)
function svControlHtml(d) {
  const live = d.live || {}, m = d.maintenance || {};
  const left = live.restartAt && d.online ? Math.max(0, Math.round((new Date(live.restartAt) - Date.now()) / 1000)) : null;
  const state = !d.online ? ['off', '⏻', 'Server offline', live.at ? 'Zuletzt gemeldet ' + ago(live.at) + '. Startet txAdmin ihn nicht automatisch, dort auf „Start“ drücken.' : 'Noch nie verbunden.']
    : left !== null ? ['warn', '🔄', `Neustart in ${left >= 60 ? Math.ceil(left / 60) + ' Min.' : left + ' Sek.'}`, live.restartReason ? 'Grund: ' + live.restartReason : 'Spieler werden ingame gewarnt.']
    : m.on ? ['warn', '🔧', 'Wartungsmodus aktiv', 'Nur das Team kann joinen.' + (m.reason ? ' ' + m.reason : '')]
    : ['on', '●', 'Server läuft', `${(live.players || []).length}/${live.maxPlayers || '?'} Spieler · seit ${fmtUp(live.uptime)}`];
  return `<section class="card sv-ctrl ${state[0]}"><div class="sv-state"><span class="sv-ic">${state[1]}</span><div><b>${esc(state[2])}</b><small>${esc(state[3])}</small></div></div>
    ${d.owner ? `<div class="sv-ctrl-btns">
      ${left !== null ? '<button class="btn btn-ghost sm" data-ctl="cancelRestart">✖ Neustart abbrechen</button>' : `<button class="btn btn-pink sm" data-ctl="restart" ${d.online ? '' : 'disabled'}>🔄 Server neu starten</button>`}
      <button class="btn btn-ghost sm ${m.on ? 'on' : ''}" data-ctl="maintenance">${m.on ? '✅ Wartung beenden' : '🔧 Wartungsmodus'}</button>
      <button class="btn btn-ghost sm" data-ctl="kickall" ${d.online ? '' : 'disabled'}>👢 Alle kicken</button>
      <button class="btn btn-ghost sm" data-ctl="sync" ${d.online ? '' : 'disabled'}>↻ Daten holen</button></div>` : '<small class="muted">Neustart und Wartung darf nur der Owner.</small>'}</section>`;
}
function svControlBind(d) {
  app.querySelectorAll('[data-ctl]').forEach((b) => (b.onclick = async () => {
    const t = b.dataset.ctl;
    try {
      if (t === 'restart') return openDialog(`<form class="form main" style="gap:14px">${dlgHead('Server neu starten')}
        <label class="field"><span>Wann?</span><select name="minutes"><option value="0">Sofort</option><option value="1">In 1 Minute</option><option value="5" selected>In 5 Minuten</option><option value="10">In 10 Minuten</option><option value="15">In 15 Minuten</option><option value="30">In 30 Minuten</option></select></label>
        <label class="field"><span>Grund <small>(sehen die Spieler, optional)</small></span><input name="reason" maxlength="120" placeholder="z. B. Neues Update"></label>
        <p class="muted" style="margin:0;font-size:13px">Spieler bekommen ingame einen Countdown (10, 5, 3, 2, 1 Min., 30 und 10 Sek.). Danach werden alle gekickt und der Server beendet sich. <b>txAdmin startet ihn automatisch wieder.</b></p>
        <div class="dlg-foot"><span></span><button class="btn btn-bad" type="submit">Neustart auslösen</button></div></form>`,
        async (fd) => { await svCmd({ type: 'restart', minutes: +fd.get('minutes'), reason: fd.get('reason') }); toast('Neustart geplant. Kommt in wenigen Sekunden ingame an.'); setTimeout(showServer, 6000); });
      if (t === 'kickall') return openDialog(`<form class="form main" style="gap:14px">${dlgHead('Alle Spieler kicken')}
        <label class="field"><span>Grund <small>(sehen die Spieler)</small></span><input name="reason" maxlength="200" placeholder="z. B. Kurze Wartung, gleich wieder offen"></label>
        <p class="muted" style="margin:0;font-size:13px">Team-Mitglieder bleiben drin. Tipp: Vorher den Wartungsmodus anmachen, sonst joinen alle sofort wieder.</p>
        <div class="dlg-foot"><span></span><button class="btn btn-bad" type="submit">Alle kicken</button></div></form>`,
        async (fd) => { await svCmd({ type: 'kickall', reason: fd.get('reason') }); toast('Alle werden gekickt.'); });
      if (t === 'maintenance') {
        const on = !(d.maintenance && d.maintenance.on);
        if (!on) { await svCmd({ type: 'maintenance', on: false }); toast('Wartungsmodus aus. Alle können wieder joinen.'); return showServer(); }
        return openDialog(`<form class="form main" style="gap:14px">${dlgHead('Wartungsmodus einschalten')}
          <label class="field"><span>Hinweis für Spieler <small>(optional)</small></span><input name="reason" maxlength="160" placeholder="z. B. Update wird eingespielt, ca. 20 Minuten"></label>
          <p class="muted" style="margin:0;font-size:13px">Neue Spieler werden beim Verbinden abgewiesen, nur das Team (Admin-Gruppen aus der config.lua) kommt rein. Wer schon drin ist, bleibt drin. Gilt auch nach einem Neustart weiter.</p>
          <div class="dlg-foot"><span></span><button class="btn btn-pink" type="submit">Wartung starten</button></div></form>`,
          async (fd) => { await svCmd({ type: 'maintenance', on: true, reason: fd.get('reason') }); toast('Wartungsmodus an.'); setTimeout(showServer, 300); });
      }
      if (t === 'cancelRestart') { await svCmd({ type: 'cancelRestart' }); toast('Neustart wird abgebrochen.'); setTimeout(showServer, 6000); }
      if (t === 'sync') { await svCmd({ type: 'sync' }); toast('Server schickt gleich frische Daten.'); setTimeout(showServer, 7000); }
    } catch (err) { toast(err.message, 'bad'); }
  }));
}

// ---------------------------------------------------------------- Live-Karte (echte GTA-V-Karte)
function svMap() {
  const d = SV.d, players = d.online ? (d.live.players || []) : [];
  if (!d.online) { $('svView').innerHTML = '<div class="empty">Der Server ist gerade nicht verbunden.</div>'; return; }
  if (typeof RLSMap !== 'function') { $('svView').innerHTML = '<div class="empty">Karte konnte nicht geladen werden.</div>'; return; }
  if (SV.lmap) { try { SV.lmap.map.remove(); } catch {} SV.lmap = null; }
  $('svView').innerHTML = `<div class="sv-map-wrap"><div class="sv-map"><div id="svLmap" class="lmap"></div><div id="svTip"></div></div>
    <aside class="card sv-map-side"><h3>Auf der Karte (<span id="svMapN">${players.length}</span>)</h3><div class="legend"><span><i class="lg p"></i>Spieler</span><span><i class="lg s"></i>Team</span><span><i class="lg d"></i>Tot</span></div>
      <input id="svMapQ" type="search" placeholder="Spieler suchen" style="width:100%"><div class="sv-map-list" id="svMapList"></div>
      <p class="muted" style="font-size:12.5px;margin:6px 0 0">Mausrad zum Zoomen, ziehen zum Verschieben. Oben rechts Spielkarte, Atlas oder Satellit. Positionen kommen alle 20 Sekunden.</p></aside></div>`;
  SV.lmap = RLSMap('svLmap', { dark: '/map/dark.jpg', atlas: '/map/atlas.jpg', satellite: '/map/satellite.jpg' }, { onSelect: (id) => { SV.sel = id; svMapSide(); } });
  svMapUpdate();
  $('svMapQ').oninput = svMapSide;
  $('svMapList').onclick = (e) => { const b = e.target.closest('[data-pid]'); if (b) { SV.sel = +b.dataset.pid; SV.lmap.focus(SV.sel); svMapSide(); } };
  $('svTip').onclick = async (e) => {
    const cp = e.target.closest('[data-cp]'); if (cp) return copyText(cp.dataset.cp);
    const c = e.target.closest('[data-cmd]'); if (c) { try { await svCmd({ type: c.dataset.cmd, target: c.dataset.id }); toast('Befehl geschickt.'); } catch (err) { toast(err.message, 'bad'); } }
    if (e.target.closest('[data-close]')) { SV.sel = null; SV.lmap.select(null); svMapSide(); }
  };
}
function svMapUpdate() {
  const players = SV.d.online ? (SV.d.live.players || []) : [];
  if (!SV.lmap) return;
  SV.lmap.setPlayers(players); SV.lmap.select(SV.sel);
  if ($('svMapN')) $('svMapN').textContent = players.length;
  svMapSide();
}
function svMapSide() {
  const players = SV.d.online ? (SV.d.live.players || []) : [], q = ($('svMapQ')?.value || '').toLowerCase();
  $('svMapList').innerHTML = players.filter((p) => !q || `${p.id} ${p.name}`.toLowerCase().includes(q)).sort((a, b) => a.id - b.id).map((p) => `<button class="${SV.sel === p.id ? 'on' : ''}" data-pid="${p.id}"><b>${p.id}</b><span>${esc(p.name)}</span>${p.dead ? '💀' : ''}${p.staff ? '<i class="tagc">Team</i>' : ''}</button>`).join('') || '<p class="muted">Niemand online.</p>';
  const sel = players.find((p) => p.id === SV.sel);
  $('svTip').className = sel ? 'sv-tip' : '';
  $('svTip').innerHTML = sel ? `<button class="mini" data-close style="position:absolute;right:10px;top:8px">×</button><b>${esc(sel.name)} <small class="muted">[${sel.id}]</small></b><small>${esc(sel.job || '–')} · ${Math.round(sel.x)}, ${Math.round(sel.y)}, ${Math.round(sel.z)}</small><div class="row"><button class="mini" data-cp="${esc(`vector3(${(+sel.x).toFixed(2)}, ${(+sel.y).toFixed(2)}, ${(+sel.z).toFixed(2)})`)}">📍 Position kopieren</button><button class="mini" data-cmd="heal" data-id="${sel.id}">❤️ Heilen</button><button class="mini" data-cmd="revive" data-id="${sel.id}">💉 Beleben</button><button class="mini" data-cmd="freeze" data-id="${sel.id}">🧊 Einfrieren</button><button class="mini" data-cmd="unfreeze" data-id="${sel.id}">🔥 Auftauen</button></div>` : '';
}

// ---------------------------------------------------------------- Reports
function svReports() {
  const d = SV.d, rows = d.reports || [];
  const label = { offen: 'Offen', angenommen: 'In Bearbeitung', erledigt: 'Erledigt' };
  $('svView').innerHTML = `<p class="muted" style="margin:0 0 12px;font-size:13.5px">Spieler schreiben ingame <code>/report Text</code>. Hier und im Ingame-Menü (Reports) siehst du alles live. Übernimmst du hier, bekommt der Spieler ingame Bescheid.</p>
    ${rows.length ? `<div class="sv-reps">${rows.map((r) => `<article class="card sv-rep ${r.status}"><div class="n-top"><span class="pill ${r.status === 'offen' ? 'st-abgelehnt' : r.status === 'angenommen' ? 'st-pruefung' : 'st-angenommen'}">${label[r.status]}</span><b>${esc(r.name)}</b><small class="muted">ID ${r.server_id || '–'} · ${ago(r.created_at)}${r.claimed_by ? ' · 👤 ' + esc(r.claimed_by) : ''}</small></div>
      <p>${esc(r.text)}</p>
      <div class="row">${r.status === 'offen' ? `<button class="btn btn-pink sm" data-rp="angenommen" data-id="${r.id}">Übernehmen</button>` : ''}${r.status !== 'erledigt' ? `<button class="btn btn-ghost sm" data-rp="erledigt" data-id="${r.id}">✓ Erledigt</button>` : `<button class="btn btn-ghost sm" data-rp="offen" data-id="${r.id}">Wieder öffnen</button>`}
        ${r.x !== null && r.x !== undefined ? `<button class="mini" data-cp="${esc(`vector3(${(+r.x).toFixed(2)}, ${(+r.y).toFixed(2)}, ${(+r.z).toFixed(2)})`)}">📍 Position</button>` : ''}</div></article>`).join('')}</div>` : '<div class="empty">🎉 Keine Reports in den letzten 24 Stunden.</div>'}`;
  $('svView').onclick = async (e) => {
    const cp = e.target.closest('[data-cp]'); if (cp) return copyText(cp.dataset.cp);
    const b = e.target.closest('[data-rp]'); if (!b) return;
    try { await api('admin/server/report/' + b.dataset.id, { method: 'POST', body: { status: b.dataset.rp } }); toast('Report aktualisiert.'); showServer(); } catch (err) { toast(err.message, 'bad'); }
  };
}

// ---------------------------------------------------------------- Logs
const LOG_META = { join: ['🟢', 'Joins'], leave: ['🔴', 'Leaves'], death: ['💀', 'Tode'], admin: ['🛡️', 'Team-Aktionen'], report: ['🆘', 'Reports'], resource: ['⚙️', 'Ressourcen'] };
function svLogs() {
  const d = SV.d, logs = d.logs || [];
  const draw = () => {
    const q = SV.q.toLowerCase();
    const rows = logs.filter((l) => (!SV.cat || l.kind === SV.cat) && (!q || `${l.text} ${l.player} ${l.admin}`.toLowerCase().includes(q)));
    $('svLogList').innerHTML = rows.slice(0, 300).map((l) => `<li><span class="lk ${l.kind}">${(LOG_META[l.kind] || ['•'])[0]}</span><span class="lt">${esc(l.text)}${l.x !== null && l.x !== undefined ? ` <button class="mini" data-cp="${esc(`vector3(${(+l.x).toFixed(2)}, ${(+l.y).toFixed(2)}, ${(+l.z).toFixed(2)})`)}">📍</button>` : ''}</span><small>${fmt(l.created_at)}</small></li>`).join('') || '<li class="muted" style="padding:20px">Nichts gefunden.</li>';
  };
  $('svView').innerHTML = `<div class="toolbar"><input id="svq" type="search" placeholder="Logs durchsuchen (Name, Text)" value="${esc(SV.q)}">
      ${[['', 'Alle'], ...Object.entries(LOG_META).map(([k, [i, l]]) => [k, `${i} ${l}`])].map(([v, l]) => `<button class="btn btn-ghost sm chip${SV.cat === v ? ' on' : ''}" data-lc="${v}">${l} <small class="muted">${v ? logs.filter((x) => x.kind === v).length : logs.length}</small></button>`).join('')}</div>
    <ul class="sv-logs" id="svLogList"></ul>
    <p class="muted" style="font-size:12.5px">Die letzten 300 Einträge. Logs werden 14 Tage aufbewahrt.</p>`;
  draw();
  $('svq').oninput = () => { SV.q = $('svq').value; draw(); };
  app.querySelectorAll('[data-lc]').forEach((b) => (b.onclick = () => { SV.cat = b.dataset.lc; svLogs(); }));
  $('svLogList').onclick = (e) => { const cp = e.target.closest('[data-cp]'); if (cp) copyText(cp.dataset.cp); };
}

function svResources() {
  const d = SV.d;
  if (!d.resources.length) { $('svView').innerHTML = `<div class="empty">Noch keine Daten vom Server. Sobald rls_admin läuft, erscheinen hier alle Ressourcen.</div>`; return; }
  const draw = () => {
    const q = SV.q.toLowerCase();
    const rows = d.resources.filter((r) => (!SV.cat || (SV.cat === 'fehlt' ? !r.inList : r.state === SV.cat)) && (!q || `${r.name} ${r.author} ${r.description}`.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
    $('svBody').innerHTML = rows.map((r) => `<tr style="cursor:default"><td><code>${esc(r.name)}</code>${r.description ? `<br><small class="muted">${esc(r.description)}</small>` : ''}</td>
      <td><span class="pill ${r.state === 'started' ? 'rs-aktiv' : r.state === 'stopped' ? 'rs-aus' : 'rs-test'}">${esc(r.state === 'started' ? 'läuft' : r.state === 'stopped' ? 'gestoppt' : r.state)}</span></td>
      <td class="num">${esc(r.version || '–')}</td><td>${esc(r.author || '–')}</td>
      <td>${r.inList ? '<span class="muted">✓ in Scripts-Liste</span>' : `<label class="chk"><input type="checkbox" data-imp="${esc(r.name)}"> übernehmen</label>`}</td>
      <td>${!d.owner ? '' : SV_PROTECTED.includes(r.name) ? '<span class="muted" title="Geschützt">🔒</span>' : `<span class="row sv-acts">${r.state === 'started' ? `<button class="mini" data-rs="restart" data-n="${esc(r.name)}">↻ Neustart</button><button class="mini bad" data-rs="stop" data-n="${esc(r.name)}">■ Stopp</button>` : `<button class="mini ok" data-rs="start" data-n="${esc(r.name)}">▶ Start</button>`}</span>`}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nichts gefunden.</td></tr>';
  };
  const missing = d.resources.filter((r) => !r.inList).length;
  $('svView').innerHTML = `<div class="toolbar"><input id="svq" type="search" placeholder="Ressource suchen" value="${esc(SV.q)}">
      ${[['', 'Alle'], ['started', 'Läuft'], ['stopped', 'Gestoppt'], ['fehlt', `Fehlt in Liste (${missing})`]].map(([v, l]) => `<button class="btn btn-ghost sm chip${SV.cat === v ? ' on' : ''}" data-rc="${v}">${l}</button>`).join('')}</div>
    <p class="muted" style="margin:-4px 0 12px;font-size:13.5px">Stand vom ${fmt(d.synced_at)} <button class="mini" id="svSync" ${d.online ? '' : 'disabled'}>↻ Jetzt aktualisieren</button> · Die Liste kommt direkt vom FiveM-Server. ${d.owner ? 'Starten, Stoppen und Neustarten geht direkt von hier (kommt in wenigen Sekunden ingame an).' : 'Starten und Stoppen darf nur der Owner.'} Haken setzen und übernehmen, dann landen die Ressourcen in eurer <a href="#scripts" style="color:var(--pink)">Scripts-Liste</a>.</p>
    <div class="table-wrap"><table><thead><tr><th>Ressource</th><th>Status</th><th>Version</th><th>Autor</th><th>Scripts-Liste</th><th>Steuern</th></tr></thead><tbody id="svBody"></tbody></table></div>
    ${missing ? `<div class="row" style="margin-top:12px"><button class="btn btn-pink sm" id="impSel">Ausgewählte übernehmen</button><button class="btn btn-ghost sm" id="impAll">Alle ${missing} fehlenden übernehmen</button></div>` : ''}`;
  draw();
  $('svq').oninput = () => { SV.q = $('svq').value; draw(); };
  app.querySelectorAll('[data-rc]').forEach((b) => (b.onclick = () => { SV.cat = b.dataset.rc; svResources(); }));
  const imp = async (names) => { if (!names.length) return toast('Nichts ausgewählt.', 'bad'); const r = await api('admin/server/import', { method: 'POST', body: { names } }); toast(`${r.added} Ressource${r.added === 1 ? '' : 'n'} übernommen.`); showServer(); };
  $('svBody').onclick = async (e) => {
    const b = e.target.closest('[data-rs]'); if (!b) return;
    if (!d.online) return toast('Der Server ist gerade nicht verbunden.', 'bad');
    const verb = { start: 'starten', stop: 'stoppen', restart: 'neu starten' }[b.dataset.rs];
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Wirklich ' + verb + '?'; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; draw(); } }, 4000); return; }
    try { await svCmd({ type: 'resource', what: b.dataset.rs, name: b.dataset.n }); toast(`${b.dataset.n} wird ${verb === 'neu starten' ? 'neu gestartet' : verb === 'starten' ? 'gestartet' : 'gestoppt'}. Die Liste aktualisiert sich gleich.`); setTimeout(() => { if (LIVE.view === 'server' && !isBusy()) showServer(); }, 9000); }
    catch (err) { toast(err.message, 'bad'); }
  };
  if ($('svSync')) $('svSync').onclick = async () => { try { await svCmd({ type: 'sync' }); toast('Server schickt gleich frische Daten.'); setTimeout(() => { if (LIVE.view === 'server' && !isBusy()) showServer(); }, 8000); } catch (err) { toast(err.message, 'bad'); } };
  if ($('impSel')) $('impSel').onclick = () => imp([...app.querySelectorAll('[data-imp]:checked')].map((c) => c.dataset.imp));
  if ($('impAll')) $('impAll').onclick = () => imp(d.resources.filter((r) => !r.inList).map((r) => r.name));
}

function svItems() {
  const d = SV.d;
  if (!d.items.length) { $('svView').innerHTML = `<div class="empty">Noch keine Items vom Server. Sobald rls_admin läuft, erscheinen hier alle Items aus ESX bzw. ox_inventory.</div>`; return; }
  const draw = () => {
    const q = SV.q.toLowerCase();
    const rows = d.items.filter((i) => !q || `${i.name} ${i.label}`.toLowerCase().includes(q)).sort((a, b) => a.label.localeCompare(b.label)).slice(0, 400);
    $('svBody').innerHTML = rows.map((i) => `<tr style="cursor:default"><td><b>${esc(i.label || i.name)}</b></td><td><code>${esc(i.name)}</code></td><td class="num">${i.weight}</td><td><button class="mini" data-cp="${esc(i.name)}">Name kopieren</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nichts gefunden.</td></tr>';
    $('svCount').textContent = `${rows.length}${rows.length === 400 ? '+' : ''} von ${d.items.length}`;
  };
  $('svView').innerHTML = `<div class="toolbar"><input id="svq" type="search" placeholder="Item suchen, z. B. bread oder Brot" value="${esc(SV.q)}"><span class="muted" id="svCount"></span></div>
    <p class="muted" style="margin:-4px 0 12px;font-size:13.5px">${d.info && d.info.inventory ? 'Quelle: ' + esc(d.info.inventory) + ' · ' : ''}Stand vom ${fmt(d.synced_at)}. Ingame gibst du Items im Admin-Menü unter „Spieler“ oder „Dev“.</p>
    <div class="table-wrap"><table><thead><tr><th>Item</th><th>Spawn-Name</th><th>Gewicht</th><th></th></tr></thead><tbody id="svBody"></tbody></table></div>`;
  draw();
  $('svq').oninput = () => { SV.q = $('svq').value; draw(); };
  $('svBody').onclick = (e) => { const b = e.target.closest('[data-cp]'); if (b) copyText(b.dataset.cp); };
}

function svCoords() {
  const d = SV.d, cats = [...new Set(d.coords.map((c) => c.category || 'Allgemein'))];
  const q = SV.q.toLowerCase();
  const rows = d.coords.filter((c) => (!SV.cat || (c.category || 'Allgemein') === SV.cat) && (!q || `${c.label} ${c.category}`.toLowerCase().includes(q)));
  $('svView').innerHTML = `
    <section class="card la-card"><h2>Koordinate eintragen</h2>
      <form class="cd-add" id="cdForm"><input name="label" maxlength="80" placeholder="Name, z. B. Garage Würfelpark" required><input name="category" maxlength="40" list="cdCats" placeholder="Kategorie, z. B. Garagen"><datalist id="cdCats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <input name="vector" placeholder="vector4(215.76, -810.12, 30.73, 157.5)" required spellcheck="false"><button class="btn btn-pink sm">Speichern</button></form>
      <p class="muted" style="font-size:13px;margin:8px 0 0">Am schnellsten geht es ingame: Admin-Menü → Dev → „Im Panel speichern“.</p></section>
    <div class="toolbar" style="margin-top:16px"><input id="svq" type="search" placeholder="Koordinate suchen" value="${esc(SV.q)}">
      ${cats.length > 1 ? [['', 'Alle'], ...cats.map((c) => [c, c])].map(([v, l]) => `<button class="btn btn-ghost sm chip${SV.cat === v ? ' on' : ''}" data-cc="${esc(v)}">${esc(l)}</button>`).join('') : ''}</div>
    ${rows.length ? `<div class="cd-grid">${rows.map((c) => `<article class="card cd">
      <div class="n-top"><span class="tagc">${esc(c.category || 'Allgemein')}</span><small class="muted">${esc(c.by_name || '–')} · ${ago(c.created_at)}</small></div>
      <h3>${esc(c.label)}</h3>
      <button class="cd-v" data-cp="${esc(v3(c))}"><code>${esc(v3(c))}</code><span>vector3</span></button>
      ${c.h !== null && c.h !== undefined ? `<button class="cd-v" data-cp="${esc(v4(c))}"><code>${esc(v4(c))}</code><span>vector4</span></button>` : ''}
      <div class="row"><button class="mini" data-cp="${esc(`{ x = ${(+c.x).toFixed(2)}, y = ${(+c.y).toFixed(2)}, z = ${(+c.z).toFixed(2)}${c.h != null ? `, h = ${(+c.h).toFixed(2)}` : ''} }`)}">Lua-Tabelle</button><button class="mini" data-cp="${esc(`${(+c.x).toFixed(2)}, ${(+c.y).toFixed(2)}, ${(+c.z).toFixed(2)}`)}">Nur Zahlen</button><span class="spacer"></span><button class="mini" data-cdel="${c.id}">Löschen</button></div>
    </article>`).join('')}</div>` : `<div class="empty">${d.coords.length ? 'Nichts gefunden.' : 'Noch keine Koordinaten gespeichert.'}</div>`}`;
  const keep = document.activeElement?.id;
  $('svq').oninput = () => { SV.q = $('svq').value; svCoords(); $('svq').focus(); $('svq').setSelectionRange(9e3, 9e3); };
  app.querySelectorAll('[data-cc]').forEach((b) => (b.onclick = () => { SV.cat = b.dataset.cc; svCoords(); }));
  $('svView').onclick = async (e) => {
    const cp = e.target.closest('[data-cp]'); if (cp) return copyText(cp.dataset.cp);
    const del = e.target.closest('[data-cdel]'); if (del) { if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Wirklich?'; return; } await api('admin/dev/coords/' + del.dataset.cdel, { method: 'DELETE' }); toast('Gelöscht.'); showServer(); }
  };
  $('cdForm').onsubmit = async (e) => { e.preventDefault(); try { await api('admin/dev/coords', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Koordinate gespeichert.'); showServer(); } catch (err) { toast(err.message, 'bad'); } };
  if (keep === 'svq') $('svq').focus();
}

function svSetup() {
  const d = SV.d, origin = location.origin;
  $('svView').innerHTML = `<section class="card la-card"><h2>${d.keySet ? 'Verbindung' : 'In 4 Schritten verbinden'}</h2>
    <ol class="sv-steps">
      <li><b>Server-Schlüssel erzeugen</b><p class="muted">Der Schlüssel ist das Passwort zwischen FiveM-Server und Panel. Er wird nur einmal angezeigt.</p>
        ${d.owner ? `<button class="btn ${d.keySet ? 'btn-ghost' : 'btn-pink'} sm" id="mkKey">${d.keySet ? 'Neuen Schlüssel erzeugen (alter wird ungültig)' : 'Schlüssel erzeugen'}</button>` : '<p class="muted">Das darf nur der Owner.</p>'}<div id="keyOut"></div></li>
      <li><b>Resource auf den Server legen</b><p class="muted">Den Ordner <code>rls_admin</code> in <code>resources/</code> kopieren und in die <code>server.cfg</code> nach ESX eintragen:</p>
        <div class="code-line"><code>ensure rls_admin</code><button class="mini" data-cp="ensure rls_admin">Kopieren</button></div></li>
      <li><b>config.lua ausfüllen</b><p class="muted">In <code>rls_admin/config.lua</code> diese beiden Werte eintragen:</p>
        <div class="code-line"><code>Config.PanelUrl = '${esc(origin)}'</code><button class="mini" data-cp="Config.PanelUrl = '${esc(origin)}'">Kopieren</button></div>
        <div class="code-line" style="margin-top:6px"><code>Config.PanelKey = 'DEIN-SCHLÜSSEL'</code></div></li>
      <li><b>Server neu starten</b><p class="muted">Nach dem Start erscheint der Server hier als <b>Online</b>. Ingame öffnest du das Menü mit <b>F10</b> oder <code>/admin</code>, nur mit Admin-Gruppe. Spieler melden sich mit <code>/report</code>.</p></li>
    </ol></section>
    ${d.commands.length ? `<section class="card la-card" style="margin-top:16px"><h2>Letzte Befehle ins Spiel</h2><ul class="feed">${d.commands.map((c) => `<li><a><span class="fi">${({ kick: '👢', announce: '📢', resource: '⚙️', message: '💬', heal: '❤️', revive: '💉', freeze: '🧊', unfreeze: '🔥', report: '🆘', sync: '↻' })[c.type] || '•'}</span><span>${c.type === 'kick' ? `Kick ID ${esc(c.payload.target)}: ${esc(c.payload.reason)}` : c.type === 'resource' ? `${esc(c.payload.name)}: ${esc(c.payload.what)}` : c.type === 'announce' || c.type === 'message' ? esc(c.payload.text) : c.type === 'report' ? `Report #${esc(c.payload.report)} → ${esc(c.payload.status)}` : `${esc(c.type)}${c.payload.target ? ' · ID ' + esc(c.payload.target) : ''}`}<small>${esc(c.by_name || 'automatisch')} · ${ago(c.created_at)} · ${c.delivered_at ? '✓ angekommen' : '⏳ wartet auf Server'}</small></span></a></li>`).join('')}</ul></section>` : ''}`;
  $('svView').onclick = (e) => { const cp = e.target.closest('[data-cp]'); if (cp) copyText(cp.dataset.cp); };
  if ($('mkKey')) $('mkKey').onclick = async (e) => {
    const b = e.currentTarget;
    if (d.keySet && b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Sicher? Der Server muss dann den neuen Schlüssel bekommen.'; return; }
    const r = await api('admin/server/key', { method: 'POST', body: {} });
    $('keyOut').innerHTML = `<div class="alert info" style="margin-top:12px"><p><b>Dein Server-Schlüssel</b> (nur jetzt sichtbar, gehört in die config.lua, nie auf GitHub):</p>
      <div class="code-line" style="margin-top:8px"><code>Config.PanelKey = '${esc(r.key)}'</code><button class="mini" data-cp="Config.PanelKey = '${esc(r.key)}'">Kopieren</button></div></div>`;
    b.remove(); window.EDITING = true;
  };
}

// Spielerliste live halten, solange die Seite offen ist
setInterval(async () => {
  if (LIVE.view !== 'server' || document.hidden || !me || isBusy()) return;
  if (SV.tab === 'karte' && SV.lmap) { try { SV.d = await api('admin/server'); svMapUpdate(); } catch {} return; }
  if (['spieler', 'reports', 'logs'].includes(SV.tab) && !document.activeElement?.matches?.('input,textarea')) showServer();
}, 10000);
