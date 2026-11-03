// =====================================================================
//  Team-Panel – Dev-Bereich: To-do-Board, Roadmap, Bugs, Scripts, Wiki
// =====================================================================
const DEV = {
  ST: { idee: 'Ideen', todo: 'To-do', arbeit: 'In Arbeit', test: 'Testen', fertig: 'Fertig' },
  PR: { niedrig: 'Niedrig', normal: 'Normal', hoch: 'Hoch', kritisch: 'Kritisch' },
  MS: { geplant: 'Geplant', arbeit: 'In Arbeit', fertig: 'Fertig' },
  data: null, f: { q: '', cat: '', who: '', ms: '' }
};
const today = () => new Date().toISOString().slice(0, 10);
const dShort = (d) => d ? new Date(d + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '';
const PRANK = { kritisch: 0, hoch: 1, normal: 2, niedrig: 3 };
async function loadDev() { DEV.data = await api('admin/dev'); return DEV.data; }

// ---------------------------------------------------------------- Board & Roadmap
async function showDev(tab, openId) {
  setNav(tab === 'roadmap' ? 'roadmap' : 'dev');
  try { await loadDev(); } catch (e) { return errBox(e); }
  const d = DEV.data, T = d.tasks;
  const n = (s) => T.filter((t) => s.includes(t.status)).length;
  const done = n(['fertig']), total = T.length, pct = total ? Math.round(done / total * 100) : 0;
  const late = T.filter((t) => t.due && t.due < today() && t.status !== 'fertig').length;
  app.innerHTML = `<div class="wrap admin-main dev">
    <div class="admin-head"><h1><span class="script">${tab === 'roadmap' ? 'Wohin geht die Reise?' : 'Was wird gebaut?'}</span>${tab === 'roadmap' ? 'Roadmap' : 'To-do-Board'}</h1>
      <div class="row"><button class="btn btn-ghost sm" id="addMs">+ Meilenstein</button><button class="btn btn-pink sm" id="addTask">+ Aufgabe</button></div></div>
    ${tab === 'roadmap' ? (() => { const M = d.milestones, nx = M.filter((m) => m.status !== 'fertig').sort((a, b) => (a.end_date || a.start_date || '9').localeCompare(b.end_date || b.start_date || '9'))[0]; const nd = nx && (nx.end_date || nx.start_date); const days = nd ? Math.round((new Date(nd + 'T12:00') - new Date(today() + 'T12:00')) / 864e5) : null;
      return `<div class="dev-stats"><div><b>${M.length}</b><span>Meilensteine</span></div><div><b>${M.filter((m) => m.status === 'arbeit').length}</b><span>In Arbeit</span></div><div><b>${M.filter((m) => m.status === 'fertig').length}</b><span>Abgeschlossen</span></div><div class="${days !== null && days < 0 ? 'late' : ''}"><b>${days === null ? '–' : days < 0 ? Math.abs(days) + ' T' : days + ' T'}</b><span>${days === null ? 'Nächster Termin' : days < 0 ? 'überfällig' : 'bis zum nächsten Ziel'}</span></div><div class="dev-pct"><b>${nx ? esc(nx.title) : 'Alles erledigt'}</b><span>Nächster Meilenstein</span><i style="--p:${pct}%"></i></div></div>`; })() : `<div class="dev-stats">
      <div><b>${n(['idee', 'todo'])}</b><span>Offen</span></div>
      <div><b>${n(['arbeit', 'test'])}</b><span>In Arbeit</span></div>
      <div><b>${done}</b><span>Erledigt</span></div>
      <div class="${late ? 'late' : ''}"><b>${late}</b><span>Überfällig</span></div>
      <div class="dev-pct"><b>${pct}%</b><span>Fortschritt gesamt</span><i style="--p:${pct}%"></i></div>
    </div>`}
    ${!total && !d.milestones.length ? `<div class="empty dev-empty"><p>Noch nichts geplant. Leg los mit <b>+ Aufgabe</b> oder lade eine Beispiel-Roadmap für einen FiveM-Server, die ihr dann anpasst.</p><button class="btn btn-ghost sm" id="seedDev">Beispiel-Roadmap laden</button></div>` : ''}
    <div id="devView"></div></div>`;
  $('addTask').onclick = () => taskDialog();
  $('addMs').onclick = () => msDialog();
  if ($('seedDev')) $('seedDev').onclick = seedDev;
  tab === 'roadmap' ? renderRoadmap() : renderBoard();
  if (openId) { const t = T.find((x) => x.id === openId); if (t) taskDialog(t); else toast('Diese Aufgabe gibt es nicht mehr.', 'bad'); }
}

function filteredTasks() {
  const f = DEV.f, q = f.q.toLowerCase();
  return DEV.data.tasks.filter((t) =>
    (!q || (t.title + ' ' + (t.body || '') + ' #' + t.id).toLowerCase().includes(q)) &&
    (!f.cat || t.category === f.cat) &&
    (!f.who || (f.who === 'me' ? t.assignee_id === me.id : f.who === 'none' ? !t.assignee_id : String(t.assignee_id) === f.who)) &&
    (!f.ms || (f.ms === 'none' ? !t.milestone_id : String(t.milestone_id) === f.ms)));
}

function card(t) {
  const ms = DEV.data.milestones.find((m) => m.id === t.milestone_id);
  const late = t.due && t.due < today() && t.status !== 'fertig';
  const keys = Object.keys(DEV.ST), i = keys.indexOf(t.status);
  return `<article class="tcard pr-${t.priority}${t.category === 'Bug' ? ' is-bug' : ''}" draggable="true" data-id="${t.id}">
    <div class="tc-top"><span class="tag">${t.category === 'Bug' ? '🐞 ' : ''}${esc(t.category)}</span>${t.priority === 'hoch' || t.priority === 'kritisch' ? `<span class="prio">${DEV.PR[t.priority]}</span>` : ''}<span class="tid">#${t.id}</span></div>
    <h4>${esc(t.title)}</h4>
    ${ms ? `<div class="tc-ms">◆ ${esc(ms.title)}</div>` : ''}
    ${t.checks ? `<div class="tc-check"><i style="--p:${Math.round(t.checks_done / t.checks * 100)}%"></i><span>${t.checks_done}/${t.checks}</span></div>` : ''}
    <div class="tc-foot">
      ${ava(t.assignee_name, t.assignee_name ? '' : 'none')}
      ${t.due ? `<span class="due${late ? ' late' : ''}">${late ? 'überfällig ' : ''}${dShort(t.due)}</span>` : ''}
      ${t.comments ? `<span class="cmt" title="Kommentare">💬 ${t.comments}</span>` : ''}
      <span class="mv">${i > 0 ? `<button data-mv="${keys[i - 1]}" title="Zurück" aria-label="Eine Spalte zurück">‹</button>` : ''}${i < keys.length - 1 ? `<button data-mv="${keys[i + 1]}" title="Weiter" aria-label="Eine Spalte weiter">›</button>` : ''}</span>
    </div></article>`;
}

function filterBar() {
  const d = DEV.data, f = DEV.f;
  return `<div class="toolbar dev-filter">
    <input id="dq" type="search" placeholder="Aufgaben durchsuchen" value="${esc(f.q)}">
    <select id="dcat"><option value="">Alle Bereiche</option>${d.categories.map((c) => `<option${f.cat === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select id="dwho"><option value="">Alle Personen</option><option value="me"${f.who === 'me' ? ' selected' : ''}>Nur meine</option><option value="none"${f.who === 'none' ? ' selected' : ''}>Niemand zugewiesen</option>${d.team.map((p) => `<option value="${p.id}"${f.who === String(p.id) ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <select id="dms"><option value="">Alle Meilensteine</option><option value="none"${f.ms === 'none' ? ' selected' : ''}>Ohne Meilenstein</option>${d.milestones.map((m) => `<option value="${m.id}"${f.ms === String(m.id) ? ' selected' : ''}>${esc(m.title)}</option>`).join('')}</select>
    ${f.q || f.cat || f.who || f.ms ? '<button class="btn btn-ghost sm" id="dreset">Filter zurücksetzen</button>' : ''}
  </div>`;
}

function renderBoard() {
  const tasks = filteredTasks();
  $('devView').innerHTML = filterBar() + `<div class="board">${Object.entries(DEV.ST).map(([k, label]) => {
    const col = tasks.filter((t) => t.status === k).sort((a, b) => PRANK[a.priority] - PRANK[b.priority] || (a.due || '9').localeCompare(b.due || '9'));
    return `<section class="col col-${k}" data-col="${k}"><header><b>${label}</b><span>${col.length}</span></header>
      <div class="col-body">${col.map(card).join('') || '<p class="col-empty">Hierher ziehen</p>'}</div>
      ${k !== 'fertig' ? `<button class="col-add" data-add="${k}">+ Aufgabe</button>` : ''}</section>`;
  }).join('')}</div>`;
  let deb;
  $('dq').oninput = () => { clearTimeout(deb); deb = setTimeout(() => { DEV.f.q = $('dq').value; renderBoard(); $('dq').focus(); $('dq').setSelectionRange(9e3, 9e3); }, 200); };
  ['dcat', 'dwho', 'dms'].forEach((id, i) => ($(id).onchange = () => { DEV.f[['cat', 'who', 'ms'][i]] = $(id).value; renderBoard(); }));
  if ($('dreset')) $('dreset').onclick = () => { DEV.f = { q: '', cat: '', who: '', ms: '' }; renderBoard(); };
  const board = $('devView').querySelector('.board');
  board.onclick = (e) => {
    const mv = e.target.closest('[data-mv]');
    if (mv) { e.stopPropagation(); return moveTask(+mv.closest('.tcard').dataset.id, mv.dataset.mv); }
    const add = e.target.closest('[data-add]'); if (add) return taskDialog(null, add.dataset.add);
    const c = e.target.closest('.tcard'); if (c) taskDialog(DEV.data.tasks.find((t) => t.id === +c.dataset.id));
  };
  board.addEventListener('dragstart', (e) => { const c = e.target.closest('.tcard'); if (!c) return; e.dataTransfer.setData('text/plain', c.dataset.id); e.dataTransfer.effectAllowed = 'move'; c.classList.add('drag'); });
  board.addEventListener('dragend', (e) => e.target.closest?.('.tcard')?.classList.remove('drag'));
  board.querySelectorAll('.col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
    col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('over'); const id = +e.dataTransfer.getData('text/plain'); if (id) moveTask(id, col.dataset.col); });
  });
}

async function moveTask(id, status) {
  const t = DEV.data.tasks.find((x) => x.id === id);
  if (!t || t.status === status) return;
  const prev = t.status; t.status = status; renderBoard();
  try { await api('admin/dev/tasks/' + id, { method: 'PUT', body: { status } }); toast(`„${t.title}“ → ${DEV.ST[status]}`); if (status === 'fertig') confetti(); }
  catch (e) { t.status = prev; renderBoard(); toast(e.message, 'bad'); }
}

// ---------------------------------------------------------------- Aufgabe: Dialog mit Checkliste & Kommentaren
async function taskDialog(t, status = 'todo', msId = '', category = '') {
  if (!DEV.data) { try { await loadDev(); } catch { return; } }
  const d = DEV.data, edit = !!t;
  t = t || { status, priority: category === 'Bug' ? 'hoch' : 'normal', category: category || 'Script', milestone_id: msId, assignee_id: '' };
  let changed = false;
  const dlg = openDialog(`<form class="form main" style="gap:14px">${dlgHead(edit ? `${t.category === 'Bug' ? '🐞 Bug' : 'Aufgabe'} #${t.id}` : category === 'Bug' ? '🐞 Bug melden' : 'Neue Aufgabe')}
    <label class="field"><span>Titel</span><input name="title" maxlength="120" required value="${esc(t.title || '')}" placeholder="${category === 'Bug' ? 'z. B. Garage spawnt Auto im Boden' : 'z. B. Tankstellen-Script einbauen'}"></label>
    <label class="field"><span>Beschreibung <small>(optional)</small></span><textarea name="body" maxlength="4000" style="min-height:90px" placeholder="${category === 'Bug' || t.category === 'Bug' ? 'Was passiert? Wie kann man es nachstellen? Wo auf der Map? F8-Fehler?' : 'Was genau muss gemacht werden? Links, Ressourcen-Namen…'}">${esc(t.body || '')}</textarea></label>
    <div class="grid3">
      <label class="field"><span>Status</span><select name="status">${opts(DEV.ST, t.status)}</select></label>
      <label class="field"><span>${t.category === 'Bug' ? 'Schwere' : 'Priorität'}</span><select name="priority">${opts(DEV.PR, t.priority)}</select></label>
      <label class="field"><span>Bereich</span><select name="category">${opts(Object.fromEntries(d.categories.map((c) => [c, c])), t.category)}</select></label>
      <label class="field"><span>Zuständig</span><select name="assignee_id"><option value="">Niemand</option>${opts(Object.fromEntries(d.team.map((p) => [p.id, p.name])), t.assignee_id)}</select></label>
      <label class="field"><span>Meilenstein</span><select name="milestone_id"><option value="">Keiner</option>${opts(Object.fromEntries(d.milestones.map((m) => [m.id, m.title])), t.milestone_id)}</select></label>
      <label class="field"><span>Fällig bis</span><input name="due" type="date" value="${esc(t.due || '')}"></label>
    </div>
    <div class="dlg-foot">${edit ? '<button type="button" class="btn btn-ghost sm" data-del>Löschen</button>' : '<span></span>'}<span class="row">${edit ? '' : ''}<button class="btn btn-pink" type="submit">${edit ? 'Speichern' : category === 'Bug' ? 'Bug melden' : 'Aufgabe anlegen'}</button></span></div>
  </form>
  ${edit ? `<div class="td-extra" id="tdExtra"><p class="muted">Lade Checkliste und Kommentare…</p></div>` : ''}`,
  async (fd) => {
    const body = Object.fromEntries(fd);
    if (edit) await api('admin/dev/tasks/' + t.id, { method: 'PUT', body }); else await api('admin/dev/tasks', { method: 'POST', body });
    if (edit && body.status === 'fertig' && t.status !== 'fertig') confetti();
    toast(edit ? 'Gespeichert.' : body.category === 'Bug' ? 'Bug gemeldet.' : 'Aufgabe angelegt.'); changed = true;
  }, async () => { await api('admin/dev/tasks/' + t.id, { method: 'DELETE' }); toast('Aufgabe gelöscht.'); changed = true; },
  { wide: edit, noFocus: edit, onClose: () => { if (/^#aufgabe-/.test(location.hash)) location.hash = t.category === 'Bug' ? '#bugs' : '#dev'; else if (changed) route(); } });
  if (edit) loadTaskExtra(t.id, () => (changed = true));
  return dlg;
}

async function loadTaskExtra(id, mark) {
  const box = $('tdExtra'); if (!box) return;
  let d; try { d = await api('admin/dev/tasks/' + id); } catch (e) { box.innerHTML = alertBox('bad', e.message); return; }
  const done = d.checks.filter((c) => c.done).length;
  box.innerHTML = `<section><h3 class="sub">Checkliste <small>${d.checks.length ? `${done}/${d.checks.length}` : ''}</small></h3>
      ${d.checks.length ? `<div class="rm-bar" style="margin-bottom:8px"><i style="width:${Math.round(done / d.checks.length * 100)}%"></i></div>` : ''}
      <ul class="checks">${d.checks.map((c) => `<li class="${c.done ? 'done' : ''}"><label><input type="checkbox" data-ck="${c.id}" ${c.done ? 'checked' : ''}><span>${esc(c.text)}</span></label><button class="mini" data-ckdel="${c.id}" aria-label="Punkt entfernen">×</button></li>`).join('')}</ul>
      <form class="inline-add" id="ckForm"><input id="ckText" maxlength="200" placeholder="Punkt hinzufügen, z. B. „Config anpassen“"><button class="btn btn-ghost sm">+</button></form></section>
    <section><h3 class="sub">Kommentare <small>${d.comments.length || ''}</small></h3>
      <div class="comments">${d.comments.map((c) => `<div class="cm">${ava(c.admin_name)}<div><header><b>${esc(c.admin_name || '–')}</b><small>${ago(c.created_at)}</small></header><p>${nl(c.body)}</p></div></div>`).join('') || '<p class="muted" style="margin:0 0 8px">Noch keine Kommentare.</p>'}</div>
      <form class="inline-add col" id="cmForm"><textarea id="cmText" maxlength="3000" placeholder="Kommentar schreiben… (Strg + Enter zum Senden)"></textarea><button class="btn btn-ghost sm">Kommentieren</button></form>
      <p class="muted meta-line">Erstellt von ${esc(d.task.created_by_name || '–')} am ${fmt(d.task.created_at)} · zuletzt geändert ${ago(d.task.updated_at)}</p></section>`;
  const reload = () => { mark(); loadTaskExtra(id, mark); };
  box.querySelectorAll('[data-ck]').forEach((c) => (c.onchange = async () => { await api('admin/dev/checks/' + c.dataset.ck, { method: 'PUT', body: { done: c.checked } }); reload(); }));
  box.querySelectorAll('[data-ckdel]').forEach((b) => (b.onclick = async () => { await api('admin/dev/checks/' + b.dataset.ckdel, { method: 'DELETE' }); reload(); }));
  $('ckForm').onsubmit = async (e) => { e.preventDefault(); const v = $('ckText').value.trim(); if (!v) return; await api(`admin/dev/tasks/${id}/checks`, { method: 'POST', body: { text: v } }); reload(); setTimeout(() => $('ckText')?.focus(), 80); };
  const sendCm = async () => { const v = $('cmText').value.trim(); if (!v) return; try { await api(`admin/dev/tasks/${id}/comments`, { method: 'POST', body: { body: v } }); reload(); } catch (err) { toast(err.message, 'bad'); } };
  $('cmForm').onsubmit = (e) => { e.preventDefault(); sendCm(); };
  $('cmText').onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendCm(); } };
}

// ---------------------------------------------------------------- Roadmap: Zeitleiste + Meilenstein-Karten
const RM = { f: 'alle' };
const dIso = (s) => s ? new Date(s + 'T12:00') : null;
const dFmt = (s) => s ? s.split('-').reverse().join('.') : '';
const daysBetween = (a, b) => Math.round((dIso(b) - dIso(a)) / 864e5);
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function msInfo(m, tasks) {
  const ts = tasks.filter((t) => t.milestone_id === m.id);
  const dn = ts.filter((t) => t.status === 'fertig').length;
  const p = ts.length ? Math.round(dn / ts.length * 100) : (m.status === 'fertig' ? 100 : 0);
  const t0 = today();
  let when = '', cls = '';
  if (m.status === 'fertig') { when = 'abgeschlossen'; cls = 'ok'; }
  else if (m.end_date && m.end_date < t0) { when = `${daysBetween(m.end_date, t0)} Tage überfällig`; cls = 'bad'; }
  else if (m.start_date && m.start_date > t0) { const n = daysBetween(t0, m.start_date); when = n === 1 ? 'startet morgen' : `startet in ${n} Tagen`; }
  else if (m.end_date) { const n = daysBetween(t0, m.end_date); when = n === 0 ? 'endet heute' : `noch ${n} Tag${n === 1 ? '' : 'e'}`; cls = n <= 7 ? 'warn' : ''; }
  const range = m.start_date && m.end_date && m.start_date !== m.end_date ? `${dFmt(m.start_date)} – ${dFmt(m.end_date)}` : (m.end_date || m.start_date) ? dFmt(m.end_date || m.start_date) : (m.target || 'Ohne Termin');
  return { ts, dn, p, when, cls, range };
}
const ring = (p, st) => `<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" class="ring-bg"/><circle cx="22" cy="22" r="18" class="ring-fg ms-ring-${st}" stroke-dasharray="${(p / 100 * 113.1).toFixed(1)} 113.1" transform="rotate(-90 22 22)"/><text x="22" y="26" text-anchor="middle">${p}%</text></svg>`;

function gantt(ms, tasks) {
  const dated = ms.filter((m) => m.start_date || m.end_date);
  if (!dated.length) return `<div class="card gantt-empty"><b>Noch keine Zeitleiste.</b> Trag bei deinen Meilensteinen Start und Ende ein, dann erscheinen sie hier als Balken mit Heute-Linie.</div>`;
  const t0 = today();
  const starts = dated.map((m) => m.start_date || m.end_date), ends = dated.map((m) => m.end_date || m.start_date);
  let lo = [...starts, t0].sort()[0], hi = [...ends, t0].sort().at(-1);
  const a = dIso(lo), b = dIso(hi);
  const from = new Date(a.getFullYear(), a.getMonth(), 1), to = new Date(b.getFullYear(), b.getMonth() + 1, 1);
  const span = (to - from) / 864e5;
  const X = (s) => Math.max(0, Math.min(100, (dIso(s) - from) / 864e5 / span * 100));
  const months = []; for (let d = new Date(from); d < to; d.setMonth(d.getMonth() + 1)) months.push(new Date(d));
  const todayX = X(t0);
  return `<section class="card gantt">
    <div class="g-head"><span class="g-label"></span><div class="g-track g-months">${months.map((d) => { const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; return `<span style="left:${X(k)}%">${MONTHS.at(d.getMonth())} ${String(d.getFullYear()).slice(2)}</span>`; }).join('')}<b class="g-now-l" style="left:${todayX}%">Heute</b></div></div>
    ${dated.map((m) => {
      const i = msInfo(m, tasks), s = m.start_date || m.end_date, e = m.end_date || m.start_date, one = s === e;
      const left = X(s), width = Math.max(X(e) + (one ? 0 : 100 / span) - left, 0.8);
      return `<div class="g-row" data-goms="${m.id}"><span class="g-label"><b>${esc(m.title)}</b><small>${esc(i.range)}</small></span>
        <div class="g-track">${months.map((d) => { const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; return `<i class="g-grid" style="left:${X(k)}%"></i>`; }).join('')}<i class="g-now" style="left:${todayX}%"></i>
          ${one ? `<span class="g-dia gs-${m.status}" style="left:${left}%" data-tip="${esc(m.title)} · ${dFmt(s)}"></span>`
            : `<span class="g-bar gs-${m.status}" style="left:${left}%;width:${width}%" data-tip="${esc(m.title)} · ${esc(i.range)} · ${i.dn}/${i.ts.length} Aufgaben"><i style="width:${i.p}%"></i><em>${i.p}%</em></span>`}
        </div></div>`;
    }).join('')}
    <div class="g-legend"><span><i class="gs-geplant"></i>Geplant</span><span><i class="gs-arbeit"></i>In Arbeit</span><span><i class="gs-fertig"></i>Fertig</span><span class="muted">Balkenfüllung = erledigte Aufgaben</span></div>
  </section>`;
}

function renderRoadmap() {
  const d = DEV.data;
  const loose = d.tasks.filter((t) => !t.milestone_id);
  const list = d.milestones.filter((m) => RM.f === 'alle' || (RM.f === 'aktiv' ? m.status !== 'fertig' : m.status === 'fertig'));
  const pub = d.milestones.filter((m) => m.public).length;
  const KEYS = Object.keys(DEV.ST);
  $('devView').innerHTML = !d.milestones.length
    ? `<div class="empty">Noch keine Meilensteine. Mit <b>+ Meilenstein</b> legst du z. B. „Closed Beta“ oder „Release“ an, mit Start, Ende und Ziel.</div>`
    : `${gantt(d.milestones, d.tasks)}
    <div class="toolbar rm-tools">${[['alle', 'Alle'], ['aktiv', 'Offen'], ['fertig', 'Abgeschlossen']].map(([v, l]) => `<button class="btn btn-ghost sm chip${RM.f === v ? ' on' : ''}" data-rmf="${v}">${l}</button>`).join('')}
      <span class="spacer"></span><a class="btn btn-ghost sm" href="../roadmap.html" target="_blank" rel="noopener">🌐 Öffentliche Roadmap ${pub ? `(${pub})` : ''} ↗</a></div>
    <ol class="roadmap">${list.map((m) => {
      const i = msInfo(m, d.tasks);
      const open = i.ts.filter((t) => t.status !== 'fertig').sort((a, b) => KEYS.indexOf(b.status) - KEYS.indexOf(a.status) || PRANK[a.priority] - PRANK[b.priority]);
      const done = i.ts.filter((t) => t.status === 'fertig');
      const counts = KEYS.map((k) => [k, i.ts.filter((t) => t.status === k).length]).filter(([, n]) => n);
      const allDone = i.ts.length && !open.length && m.status !== 'fertig';
      const row = (t) => `<li data-tid="${t.id}" class="s-${t.status}"><span class="sdot s-${t.status}"></span><span class="rt-t">${esc(t.title)}</span><small>${DEV.ST[t.status]}${t.assignee_name ? ' · ' + esc(t.assignee_name) : ''}</small></li>`;
      return `<li class="rm rm-${m.status}" id="ms-${m.id}">
        <div class="rm-dot"></div>
        <div class="card rm-card">
          <div class="rm-top"><span class="pill ms-${m.status}">${DEV.MS[m.status]}</span><span class="rm-when">${esc(i.range)}</span>${i.when ? `<span class="rm-cd ${i.cls}">${i.when}</span>` : ''}${m.public ? '<span class="tagx" title="Steht auf der öffentlichen Roadmap">🌐 öffentlich</span>' : ''}
            <span class="spacer"></span>${m.owner_name ? `<span class="tname">${ava(m.owner_name)}<small>${esc(m.owner_name)}</small></span>` : ''}</div>
          <div class="rm-main"><div class="rm-text"><h3>${esc(m.title)}</h3>${m.body ? `<p class="muted">${nl(m.body)}</p>` : ''}</div>${ring(i.p, m.status)}</div>
          ${m.goal ? `<div class="rm-goal"><b>🎯 Fertig, wenn:</b> ${nl(m.goal)}</div>` : ''}
          ${i.ts.length ? `<div class="rm-stack" aria-label="Aufgaben nach Status">${counts.map(([k, n]) => `<i class="sb-${k}" style="flex:${n}" data-tip="${DEV.ST[k]}: ${n}"></i>`).join('')}</div>
            <p class="rm-count">${i.dn} von ${i.ts.length} Aufgaben erledigt · ${counts.map(([k, n]) => `${DEV.ST[k]} ${n}`).join(' · ')}</p>` : '<p class="rm-count">Noch keine Aufgaben zugeordnet.</p>'}
          ${open.length ? `<ul class="rm-tasks">${open.map(row).join('')}</ul>` : ''}
          ${done.length ? `<details class="rm-done"><summary>✓ ${done.length} erledigt</summary><ul class="rm-tasks">${done.map(row).join('')}</ul></details>` : ''}
          <div class="row rm-act"><button class="btn btn-ghost sm" data-addto="${m.id}">+ Aufgabe</button><button class="btn btn-ghost sm" data-ems="${m.id}">Bearbeiten</button>
            ${m.status === 'geplant' ? `<button class="btn btn-ghost sm" data-mst="${m.id}:arbeit">▶ Starten</button>` : ''}
            ${allDone ? `<button class="btn btn-pink sm" data-mst="${m.id}:fertig">🎉 Alle Aufgaben fertig – abschließen</button>` : m.status === 'arbeit' && i.ts.length === 0 ? `<button class="btn btn-ghost sm" data-mst="${m.id}:fertig">Abschließen</button>` : ''}</div>
        </div></li>`;
    }).join('') || '<li class="muted">Keine Meilensteine in diesem Filter.</li>'}</ol>
    ${loose.length ? `<p class="muted" style="margin-top:20px">${loose.length} Aufgabe${loose.length === 1 ? '' : 'n'} ohne Meilenstein, zu finden im <a href="#dev" style="color:var(--pink)">To-do-Board</a>.</p>` : ''}`;
  $('devView').onclick = async (e) => {
    const f = e.target.closest('[data-rmf]'); if (f) { RM.f = f.dataset.rmf; return renderRoadmap(); }
    const g = e.target.closest('[data-goms]'); if (g) { const el = $('ms-' + g.dataset.goms); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); } return; }
    const st = e.target.closest('[data-mst]'); if (st) { const [id, s] = st.dataset.mst.split(':'); await api('admin/dev/milestones/' + id, { method: 'PUT', body: { status: s } }); if (s === 'fertig') confetti(); toast(s === 'fertig' ? 'Meilenstein abgeschlossen!' : 'Meilenstein gestartet.'); return route(); }
    const em = e.target.closest('[data-ems]'); if (em) return msDialog(d.milestones.find((m) => m.id === +em.dataset.ems));
    const at = e.target.closest('[data-addto]'); if (at) return taskDialog(null, 'todo', +at.dataset.addto);
    const li = e.target.closest('[data-tid]'); if (li) taskDialog(d.tasks.find((t) => t.id === +li.dataset.tid));
  };
}

function msDialog(m) {
  const edit = !!m; m = m || { status: 'geplant' };
  const team = DEV.data ? DEV.data.team : [];
  openDialog(`<form class="form main" style="gap:14px">${dlgHead(edit ? 'Meilenstein bearbeiten' : 'Neuer Meilenstein')}
    <div class="grid2"><label class="field"><span>Name</span><input name="title" maxlength="80" required value="${esc(m.title || '')}" placeholder="z. B. Closed Beta"></label>
      <label class="field"><span>Status</span><select name="status">${opts(DEV.MS, m.status)}</select></label>
      <label class="field"><span>Start</span><input type="date" name="start_date" value="${esc(m.start_date || '')}"></label>
      <label class="field"><span>Ende / Termin</span><input type="date" name="end_date" value="${esc(m.end_date || '')}"></label>
      <label class="field"><span>Verantwortlich</span><select name="owner_id"><option value="">Niemand</option>${opts(Object.fromEntries(team.map((p) => [p.id, p.name])), m.owner_id)}</select></label>
      <label class="field"><span>Anzeige ohne Datum <small>(optional)</small></span><input name="target" maxlength="40" value="${esc(m.target || '')}" placeholder="z. B. Anfang 2027"></label></div>
    <label class="field"><span>Beschreibung <small>(worum geht es?)</small></span><textarea name="body" maxlength="2000" style="min-height:80px">${esc(m.body || '')}</textarea></label>
    <label class="field"><span>🎯 Fertig, wenn … <small>(woran erkennt ihr, dass der Meilenstein geschafft ist?)</small></span><textarea name="goal" maxlength="1000" style="min-height:70px" placeholder="z. B. 30 Beta-Tester waren eine Woche online, keine kritischen Bugs offen">${esc(m.goal || '')}</textarea></label>
    <div class="grid2"><label class="chk"><input type="checkbox" name="public" ${m.public ? 'checked' : ''}> 🌐 Auf der öffentlichen Roadmap zeigen</label>
      <label class="field"><span>Reihenfolge <small>(kleiner = weiter oben)</small></span><input name="sort" type="number" value="${esc(m.sort ?? '')}" style="max-width:140px"></label></div>
    <p class="muted" style="margin:0;font-size:13px">Auf der Website stehen nur Name, Zeitraum, Beschreibung, Ziel und Fortschritt, nie die einzelnen Aufgaben.</p>
    <div class="dlg-foot">${edit && me.role === 'owner' ? '<button type="button" class="btn btn-ghost sm" data-del>Löschen</button>' : '<span></span>'}<button class="btn btn-pink" type="submit">${edit ? 'Speichern' : 'Meilenstein anlegen'}</button></div>
  </form>`, async (fd) => {
    const body = Object.fromEntries(fd); body.public = fd.has('public');
    if (edit) await api('admin/dev/milestones/' + m.id, { method: 'PUT', body }); else await api('admin/dev/milestones', { method: 'POST', body });
    if (body.status === 'fertig' && m.status !== 'fertig') confetti();
    toast('Gespeichert.'); if (location.hash !== '#roadmap') location.hash = '#roadmap'; else route();
  }, async () => { await api('admin/dev/milestones/' + m.id, { method: 'DELETE' }); toast('Meilenstein gelöscht. Die Aufgaben bleiben erhalten.'); route(); });
}

async function seedDev() {
  const b = $('seedDev'); b.disabled = true; b.textContent = 'Wird angelegt…';
  const plan = [
    ['Server-Grundlage', 'November 2026', 'arbeit', 'ESX, Datenbank, txAdmin und Sicherheit stehen.', ['2026-10-15', '2026-11-30', 'Server startet stabil, Team kann sich einloggen, Anti-Cheat ist aktiv.'], [
      ['ESX-Grundgerüst und Datenbank einrichten', 'Server', 'hoch', 'fertig'], ['txAdmin: Rechte und Whitelist für das Team', 'Server', 'normal', 'arbeit'],
      ['Anti-Cheat einbauen und testen', 'Server', 'kritisch', 'todo'], ['Regelwerk auf der Website fertig schreiben', 'Website', 'normal', 'fertig']]],
    ['Jobs & Fraktionen', 'Dezember 2026', 'geplant', 'Staatliche Fraktionen und das Gründungssystem ingame.', ['2026-12-01', '2026-12-31', 'LSPD, EMS und Mechaniker sind spielbar, eine Fraktion kann komplett gegründet werden.'], [
      ['LSPD: Dienst, Fahrzeuge, MDT', 'Fraktionen', 'hoch', 'todo'], ['EMS: Wiederbelebung und Krankenhaus', 'Fraktionen', 'hoch', 'todo'],
      ['Fraktion gründen: Bankkredit und Gebäude beim Rathaus beantragen', 'Script', 'normal', 'idee'], ['Mechaniker-Job mit Tuning', 'Script', 'normal', 'idee']]],
    ['Closed Beta', 'Januar 2027', 'geplant', 'Ausgewählte Spieler testen, wir sammeln Bugs.', ['2027-01-04', '2027-01-31', '30 Beta-Tester waren eine Woche online, keine kritischen Bugs offen.'], [
      ['Beta-Tester im Discord auswählen', 'Discord', 'normal', 'idee'], ['Bug-Report-Kanal und Vorlage', 'Discord', 'niedrig', 'todo'], ['Performance-Test mit 50+ Spielern', 'Server', 'hoch', 'idee']]],
    ['Release', 'Februar 2027', 'geplant', 'Server geht öffentlich online.', ['2027-02-14', '2027-02-14', 'Server ist öffentlich, Launcher freigegeben, Release im Discord angekündigt.'], [
      ['Launcher: finale Version veröffentlichen', 'Launcher', 'hoch', 'todo'], ['Countdown auf der Website auf das Release-Datum stellen', 'Website', 'normal', 'idee'], ['Release-Trailer', 'Sonstiges', 'normal', 'idee']]]
  ];
  try {
    for (let i = 0; i < plan.length; i++) {
      const [title, target, status, body, [start_date, end_date, goal], tasks] = plan[i];
      const ms = await api('admin/dev/milestones', { method: 'POST', body: { title, target, status, body, start_date, end_date, goal, public: true, sort: i + 1 } });
      for (const [tt, category, priority, st] of tasks) await api('admin/dev/tasks', { method: 'POST', body: { title: tt, category, priority, status: st, milestone_id: ms.id } });
    }
    toast('Beispiel-Roadmap angelegt. Passt sie einfach an.'); location.hash = '#roadmap'; route();
  } catch (e) { toast(e.message, 'bad'); b.disabled = false; b.textContent = 'Beispiel-Roadmap laden'; }
}

// ---------------------------------------------------------------- Bugs
const BUG = { f: 'offen', q: '' };
async function showBugs() {
  setNav('bugs');
  try { await loadDev(); } catch (e) { return errBox(e); }
  const all = DEV.data.tasks.filter((t) => t.category === 'Bug');
  const open = all.filter((t) => t.status !== 'fertig');
  const term = BUG.q.toLowerCase();
  const rows = all.filter((t) => (BUG.f === 'offen' ? t.status !== 'fertig' : BUG.f === 'behoben' ? t.status === 'fertig' : true) && (!term || (t.title + ' ' + (t.body || '')).toLowerCase().includes(term)))
    .sort((a, b) => (a.status === 'fertig') - (b.status === 'fertig') || PRANK[a.priority] - PRANK[b.priority] || b.id - a.id);
  const keepFocus = document.activeElement?.id === 'bq';
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Was ist kaputt?</span>Bug-Tracker</h1><button class="btn btn-pink sm" id="addBug">🐞 Bug melden</button></div>
    <div class="dev-stats four">
      <div class="${open.length ? 'late' : ''}"><b>${open.length}</b><span>Offen</span></div>
      <div class="${open.some((t) => t.priority === 'kritisch') ? 'late' : ''}"><b>${open.filter((t) => t.priority === 'kritisch').length}</b><span>Kritisch</span></div>
      <div><b>${open.filter((t) => t.status === 'arbeit' || t.status === 'test').length}</b><span>Wird gefixt</span></div>
      <div><b>${all.length - open.length}</b><span>Behoben</span></div>
    </div>
    <div class="toolbar"><input id="bq" type="search" placeholder="Bugs durchsuchen" value="${esc(BUG.q)}">
      ${[['offen', 'Offen'], ['behoben', 'Behoben'], ['alle', 'Alle']].map(([v, l]) => `<button class="btn btn-ghost sm chip${BUG.f === v ? ' on' : ''}" data-bf="${v}">${l}</button>`).join('')}</div>
    <div class="table-wrap">${rows.length ? `<table><thead><tr><th>#</th><th>Bug</th><th>Schwere</th><th>Status</th><th>Zuständig</th><th>Gemeldet</th></tr></thead><tbody>
      ${rows.map((t) => `<tr data-bid="${t.id}" class="${t.status === 'fertig' ? 'dimrow' : ''}"><td class="num">${t.id}</td><td><b>${esc(t.title)}</b>${t.comments ? ` <span class="cmt">💬 ${t.comments}</span>` : ''}</td>
        <td><span class="sev sev-${t.priority}">${DEV.PR[t.priority]}</span></td><td><span class="sdot s-${t.status}"></span> ${DEV.ST[t.status]}</td>
        <td>${t.assignee_name ? `<span class="tname">${ava(t.assignee_name)}${esc(t.assignee_name)}</span>` : '<span class="muted">–</span>'}</td><td class="num">${esc(t.created_by_name || '–')} · ${ago(t.created_at)}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${BUG.f === 'offen' && !BUG.q ? 'Keine offenen Bugs. 🎉' : 'Keine Bugs gefunden.'}</div>`}</div></div>`;
  if (keepFocus) { $('bq').focus(); $('bq').setSelectionRange(9e3, 9e3); }
  let deb; $('bq').oninput = () => { clearTimeout(deb); deb = setTimeout(() => { BUG.q = $('bq').value.trim(); showBugs(); }, 220); };
  app.querySelectorAll('[data-bf]').forEach((b) => (b.onclick = () => { BUG.f = b.dataset.bf; showBugs(); }));
  app.querySelector('tbody')?.addEventListener('click', (e) => { const tr = e.target.closest('[data-bid]'); if (tr) taskDialog(DEV.data.tasks.find((t) => t.id === +tr.dataset.bid)); });
  $('addBug').onclick = () => taskDialog(null, 'todo', '', 'Bug');
}

// ---------------------------------------------------------------- Scripts / Ressourcen
const RS = { q: '', st: '' };
const RS_LABEL = { aktiv: 'Aktiv', test: 'Im Test', geplant: 'Geplant', aus: 'Deaktiviert' };
async function showScripts() {
  setNav('scripts');
  let d; try { d = await api('admin/dev/resources'); } catch (e) { return errBox(e); }
  const term = RS.q.toLowerCase();
  const rows = d.rows.filter((r) => (!RS.st || r.status === RS.st) && (!term || (r.name + ' ' + (r.notes || '') + ' ' + (r.kind || '')).toLowerCase().includes(term)));
  const cnt = (s) => d.rows.filter((r) => r.status === s).length;
  const keepFocus = document.activeElement?.id === 'rq';
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Was läuft auf dem Server?</span>Scripts &amp; Ressourcen</h1><button class="btn btn-pink sm" id="addRes">+ Script eintragen</button></div>
    <div class="dev-stats four">${Object.entries(RS_LABEL).map(([k, l]) => `<button class="stat-btn${RS.st === k ? ' on' : ''}" data-rst="${k}"><b>${cnt(k)}</b><span>${l}</span></button>`).join('')}</div>
    <div class="toolbar"><input id="rq" type="search" placeholder="Ressource suchen, z. B. esx_" value="${esc(RS.q)}">${RS.st ? '<button class="btn btn-ghost sm" id="rsAll">Alle zeigen</button>' : ''}</div>
    <div class="table-wrap">${rows.length ? `<table><thead><tr><th>Ressource</th><th>Version</th><th>Art</th><th>Status</th><th>Quelle</th><th>Notizen</th><th>Geändert</th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-rid="${r.id}"><td><code>${esc(r.name)}</code></td><td class="num">${esc(r.version || '–')}</td><td>${esc(r.kind || '–')}</td><td><span class="pill rs-${r.status}">${RS_LABEL[r.status]}</span></td>
        <td>${/^https?:\/\//.test(r.source || '') ? `<a href="${esc(r.source)}" target="_blank" rel="noopener" class="ext">Link ↗</a>` : esc(r.source || '–')}</td><td class="clip">${esc(r.notes || '')}</td><td class="num">${esc(r.admin_name || '–')} · ${ago(r.updated_at)}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${d.rows.length ? 'Nichts gefunden.' : 'Noch keine Scripts eingetragen. Tragt hier alle Ressourcen aus eurer server.cfg ein, dann weiß jeder, was läuft, was im Test ist und woher es kommt.'}</div>`}</div></div>`;
  if (keepFocus) { $('rq').focus(); $('rq').setSelectionRange(9e3, 9e3); }
  let deb; $('rq').oninput = () => { clearTimeout(deb); deb = setTimeout(() => { RS.q = $('rq').value.trim(); showScripts(); }, 220); };
  app.querySelectorAll('[data-rst]').forEach((b) => (b.onclick = () => { RS.st = RS.st === b.dataset.rst ? '' : b.dataset.rst; showScripts(); }));
  if ($('rsAll')) $('rsAll').onclick = () => { RS.st = ''; showScripts(); };
  app.querySelector('tbody')?.addEventListener('click', (e) => { if (e.target.closest('a')) return; const tr = e.target.closest('[data-rid]'); if (tr) resDialog(d.rows.find((r) => r.id === +tr.dataset.rid), d); });
  $('addRes').onclick = () => resDialog(null, d);
}
function resDialog(r, d) {
  const edit = !!r; r = r || { status: 'test', kind: 'ESX' };
  openDialog(`<form class="form main" style="gap:14px">${dlgHead(edit ? 'Script bearbeiten' : 'Script eintragen')}
    <div class="grid2"><label class="field"><span>Ressourcen-Name</span><input name="name" maxlength="80" required value="${esc(r.name || '')}" placeholder="z. B. esx_garage" style="font-family:var(--mono)"></label>
      <label class="field"><span>Version</span><input name="version" maxlength="30" value="${esc(r.version || '')}" placeholder="1.0.0"></label>
      <label class="field"><span>Art</span><select name="kind">${opts(Object.fromEntries(d.kinds.map((k) => [k, k])), r.kind)}</select></label>
      <label class="field"><span>Status</span><select name="status">${opts(RS_LABEL, r.status)}</select></label></div>
    <label class="field"><span>Quelle <small>(GitHub, Tebex, Forum… optional)</small></span><input name="source" maxlength="300" value="${esc(r.source || '')}" placeholder="https://"></label>
    <label class="field"><span>Notizen <small>(Abhängigkeiten, Config, bekannte Probleme)</small></span><textarea name="notes" maxlength="3000" style="min-height:90px">${esc(r.notes || '')}</textarea></label>
    <div class="dlg-foot">${edit ? '<button type="button" class="btn btn-ghost sm" data-del>Entfernen</button>' : '<span></span>'}<button class="btn btn-pink" type="submit">${edit ? 'Speichern' : 'Eintragen'}</button></div></form>`,
  async (fd) => {
    const body = Object.fromEntries(fd);
    if (edit) await api('admin/dev/resources/' + r.id, { method: 'PUT', body }); else await api('admin/dev/resources', { method: 'POST', body });
    toast('Gespeichert.'); showScripts();
  }, async () => { await api('admin/dev/resources/' + r.id, { method: 'DELETE' }); toast('Entfernt.'); showScripts(); });
}

// ---------------------------------------------------------------- Wiki
function md(src) {
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  let out = '', list = '', code = null;
  const close = () => { if (list) { out += `</${list}>`; list = ''; } };
  for (const line of String(src || '').split('\n')) {
    if (line.trim().startsWith('```')) { if (code === null) { close(); code = []; } else { out += `<pre><code>${esc(code.join('\n'))}</code></pre>`; code = null; } continue; }
    if (code !== null) { code.push(line); continue; }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { close(); const h = m[1].length + 1; out += `<h${h}>${inline(m[2])}</h${h}>`; }
    else if ((m = line.match(/^\s*[-*]\s+\[( |x)\]\s+(.*)/i))) { if (list !== 'ul') { close(); out += '<ul class="tl">'; list = 'ul'; } out += `<li class="${m[1].trim() ? 'ok' : ''}">${inline(m[2])}</li>`; }
    else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^>\s?(.*)/))) { close(); out += `<blockquote>${inline(m[1])}</blockquote>`; }
    else if (/^---+\s*$/.test(line)) { close(); out += '<hr>'; }
    else if (!line.trim()) close();
    else { close(); out += `<p>${inline(line)}</p>`; }
  }
  if (code !== null) out += `<pre><code>${esc(code.join('\n'))}</code></pre>`;
  close();
  return out;
}
const WIKI = { q: '', rows: [] };
async function showWiki(id, editMode) {
  setNav('wiki'); window.EDITING = false;
  try { WIKI.rows = (await api('admin/dev/docs')).rows; } catch (e) { return errBox(e); }
  const rows = WIKI.rows, doc = id ? rows.find((r) => r.id === id) : null;
  if (id && !doc) { toast('Diese Wiki-Seite gibt es nicht mehr.', 'bad'); location.hash = '#wiki'; return; }
  const cats = [...new Set(rows.map((r) => r.category || 'Allgemein'))];
  const term = WIKI.q.toLowerCase();
  const visible = rows.filter((r) => !term || (r.title + ' ' + (r.body || '')).toLowerCase().includes(term));
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Wie geht das nochmal?</span>Wiki</h1><button class="btn btn-pink sm" id="addDoc">+ Neue Seite</button></div>
    <div class="wiki">
      <aside class="card wiki-nav"><input id="wq" type="search" placeholder="Wiki durchsuchen" value="${esc(WIKI.q)}">
        ${cats.map((c) => { const items = visible.filter((r) => (r.category || 'Allgemein') === c); return items.length ? `<p>${esc(c)}</p>${items.map((r) => `<a href="#wiki-${r.id}" class="${doc && doc.id === r.id ? 'on' : ''}">${esc(r.title)}</a>`).join('')}` : ''; }).join('') || '<small class="muted">Noch keine Seiten.</small>'}
      </aside>
      <section class="card wiki-page" id="wikiPage"></section>
    </div></div>`;
  let deb; $('wq').oninput = () => { clearTimeout(deb); deb = setTimeout(() => { WIKI.q = $('wq').value.trim(); showWiki(id); setTimeout(() => { $('wq').focus(); $('wq').setSelectionRange(9e3, 9e3); }); }, 220); };
  $('addDoc').onclick = () => wikiEdit(null, cats);
  if (editMode) return wikiEdit(doc, cats);
  if (!doc) {
    $('wikiPage').innerHTML = `<div class="wiki-empty"><h2>Euer Team-Wiki</h2><p class="muted">Hier landet alles, was man sonst im Discord sucht: Wie man den Server neu startet, wie ein Script eingebaut wird, welche Befehle es gibt, Absprachen im Team.</p>
      <div class="md">${md('## So schreibst du\n- `# Überschrift`, `## Unterüberschrift`\n- `**fett**` wird **fett**\n- `` `code` `` wird `code`\n- `- [ ] Aufgabe` und `- [x] Erledigt`\n- `[Link](https://…)`\n- Drei Backticks ``` für Code-Blöcke')}</div>
      ${rows.length ? '' : '<button class="btn btn-ghost sm" id="seedWiki">Startseiten anlegen</button>'}</div>`;
    if ($('seedWiki')) $('seedWiki').onclick = seedWiki;
    return;
  }
  $('wikiPage').innerHTML = `<div class="wp-head"><div><span class="tagc">${esc(doc.category || 'Allgemein')}</span><h2>${esc(doc.title)}</h2><small class="muted">Zuletzt bearbeitet von ${esc(doc.admin_name || '–')} · ${ago(doc.updated_at)}</small></div><button class="btn btn-ghost sm" id="editDoc">Bearbeiten</button></div>
    <div class="md">${md(doc.body) || '<p class="muted">Diese Seite ist noch leer.</p>'}</div>`;
  $('editDoc').onclick = () => wikiEdit(doc, cats);
}
function wikiEdit(doc, cats) {
  window.EDITING = true;
  const edit = !!doc; doc = doc || { title: '', category: '', body: '' };
  $('wikiPage').innerHTML = `<form class="form" id="wikiForm" style="gap:12px"><div id="wMsg"></div>
    <div class="grid2"><label class="field"><span>Titel</span><input id="w_title" maxlength="100" required value="${esc(doc.title)}" placeholder="z. B. Server neu starten"></label>
      <label class="field"><span>Kategorie</span><input id="w_cat" maxlength="40" list="wcats" value="${esc(doc.category || '')}" placeholder="z. B. Server, Scripts, Team"><datalist id="wcats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label></div>
    <div class="wiki-split"><label class="field"><span>Inhalt</span><textarea id="w_body" maxlength="30000">${esc(doc.body || '')}</textarea></label>
      <div class="field"><span>Vorschau</span><div class="md wiki-prev" id="w_prev"></div></div></div>
    <div class="dlg-foot">${edit ? '<button type="button" class="btn btn-ghost sm" id="w_del">Löschen</button>' : '<span></span>'}<span class="row"><button type="button" class="btn btn-ghost sm" id="w_cancel">Abbrechen</button><button class="btn btn-pink" type="submit">Speichern</button></span></div></form>`;
  const prev = () => { $('w_prev').innerHTML = md($('w_body').value) || '<p class="muted">Vorschau erscheint hier.</p>'; };
  $('w_body').oninput = prev; prev(); $('w_title').focus();
  $('w_cancel').onclick = () => { window.EDITING = false; edit ? showWiki(doc.id) : showWiki(); };
  $('wikiForm').onsubmit = async (e) => {
    e.preventDefault();
    const body = { title: $('w_title').value.trim(), category: $('w_cat').value.trim(), body: $('w_body').value };
    try {
      window.EDITING = false;
      if (edit) { await api('admin/dev/docs/' + doc.id, { method: 'PUT', body }); toast('Seite gespeichert.'); showWiki(doc.id); }
      else { const r = await api('admin/dev/docs', { method: 'POST', body }); toast('Seite angelegt.'); location.hash = '#wiki-' + r.id; }
    } catch (err) { window.EDITING = true; $('wMsg').innerHTML = alertBox('bad', err.message); }
  };
  if ($('w_del')) $('w_del').onclick = async (e) => {
    const b = e.currentTarget;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Wirklich löschen?'; return; }
    window.EDITING = false; await api('admin/dev/docs/' + doc.id, { method: 'DELETE' }); toast('Seite gelöscht.'); location.hash = '#wiki';
  };
}
async function seedWiki() {
  const pages = [
    ['Server neu starten', 'Server', '1. In **txAdmin** anmelden\n2. Vorher im Discord ankündigen (mind. 10 Minuten)\n3. Ingame `/announce Restart in 10 Minuten`\n4. In txAdmin auf **Restart** klicken\n\n> Nie während großer Szenen (Raub, Geiselnahme) neu starten.\n\n## Checkliste danach\n- [ ] F8-Konsole auf Fehler prüfen\n- [ ] Ein Teammitglied joint und testet kurz'],
    ['Neues Script einbauen', 'Scripts', '1. Script zuerst auf dem **Testserver** einbauen\n2. Im Panel unter **Scripts** eintragen (Status: Im Test)\n3. `ensure name_des_scripts` in die `server.cfg`\n4. SQL-Dateien in die Datenbank einspielen\n5. Testen, dann auf den Live-Server\n\n```\nensure esx_garage\n```'],
    ['Team-Regeln', 'Team', '- Wir sind freundlich, auch wenn Spieler es nicht sind\n- Jede Sanktion kommt mit Grund in die **Spielerakte**\n- Keine Entscheidungen bei eigenen Freunden, übergeben\n- Bei Unsicherheit: Projektleitung fragen']
  ];
  try { for (const [title, category, body] of pages) await api('admin/dev/docs', { method: 'POST', body: { title, category, body } }); toast('Startseiten angelegt.'); showWiki(); }
  catch (e) { toast(e.message, 'bad'); }
}

// ---------------------------------------------------------------- Kleines Konfetti, wenn etwas fertig wird
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas'); c.className = 'confetti'; document.body.appendChild(c);
  const x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
  const cols = ['#ff4fb3', '#ff7a45', '#5b34e0', '#4fe0a0', '#ffc04f'];
  const P = Array.from({ length: 90 }, () => ({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - .5) * 14, vy: Math.random() * -12 - 3, s: Math.random() * 6 + 4, c: cols[Math.random() * 5 | 0], r: Math.random() * 6 }));
  let f = 0;
  (function tick() {
    x.clearRect(0, 0, c.width, c.height);
    P.forEach((p) => { p.vy += .35; p.x += p.vx; p.y += p.vy; p.r += .1; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore(); });
    if (++f < 110) requestAnimationFrame(tick); else c.remove();
  })();
}
