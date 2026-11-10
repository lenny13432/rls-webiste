// =====================================================================
//  Team-Panel – Teamwarns: Verwarnungen fürs Team mit Stufen, Punkten und Ablauf
//  Owner sieht alles und vergibt Warns. Alle anderen sehen nur ihre eigenen,
//  bestätigen sie und können eine Stellungnahme schreiben.
// =====================================================================
const TW = { f: 'aktiv', q: '', who: '' };
// Ab so vielen aktiven Punkten passiert etwas (nur Anzeige, entscheiden tut die Projektleitung)
const TW_STEPS = [
  { at: 0, label: 'Alles gut', c: '#3ddc97' },
  { at: 2, label: 'Gespräch führen', c: '#ffb84f' },
  { at: 4, label: 'Degradierung prüfen', c: '#ff8a5c' },
  { at: 6, label: 'Entlassung prüfen', c: '#ff5a6e' }
];
const TW_C = { hinweis: '#5cc8ff', verwarnung: '#ffb84f', schwer: '#ff8a5c', letzte: '#ff5a6e' };
const TW_ST = { aktiv: ['Aktiv', '#ff5a6e'], abgelaufen: ['Abgelaufen', '#9a8fbf'], aufgehoben: ['Aufgehoben', '#3ddc97'] };
const twStep = (p) => TW_STEPS.filter((s) => p >= s.at).pop();
const twPill = (c, l) => `<span class="pst" style="--c:${c}">${esc(l)}</span>`;

async function showTeamWarns() {
  setNav('teamwarns');
  let d; try { d = await api('admin/teamwarns'); } catch (e) { return errBox(e); }
  const active = d.warns.filter((w) => w.status === 'aktiv');
  const pts = {}; active.forEach((w) => (pts[w.admin_id] = (pts[w.admin_id] || 0) + w.points));
  const open = d.warns.filter((w) => !w.ack_at && w.status === 'aktiv');

  if (!d.owner) return myWarns(d, pts[d.me] || 0);

  let list = d.warns.filter((w) => (TW.f === 'alle' || w.status === TW.f) && (!TW.who || w.admin_id === +TW.who)
    && (!TW.q || (w.admin_name + ' ' + w.text + ' ' + w.category).toLowerCase().includes(TW.q)));
  const ranked = d.team.map((m) => ({ ...m, p: pts[m.id] || 0, n: active.filter((w) => w.admin_id === m.id).length, all: d.warns.filter((w) => w.admin_id === m.id).length }))
    .sort((a, b) => b.p - a.p || b.all - a.all || a.name.localeCompare(b.name, 'de'));
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Verwarnungen fürs Team, nur für die Projektleitung sichtbar</span>Teamwarns</h1><button class="btn btn-pink sm" id="twNew">+ Teamwarn vergeben</button></div>
    <div class="pkpis">
      <div class="pkpi bad"><b>${active.length}</b><span>Aktive Warns</span></div>
      <div class="pkpi"><b>${Object.keys(pts).length}</b><span>Teamler mit Warn</span></div>
      <div class="pkpi"><b>${open.length}</b><span>Noch nicht bestätigt</span></div>
      <div class="pkpi"><b>${d.warns.length}</b><span>Warns insgesamt</span></div>
    </div>
    <div class="tw-grid">
      <section class="card dpanel"><div class="dp-head"><h2>Team-Übersicht</h2><small class="muted">aktive Punkte</small></div>
        <div class="tw-team">${ranked.map((m) => { const s = twStep(m.p); return `<button class="tw-row${TW.who == m.id ? ' on' : ''}" data-who="${m.id}">${ava(m.name)}<span class="tw-n"><b>${esc(m.name)}</b><small>${esc(m.rank || 'Team')} · ${m.all} Warn${m.all === 1 ? '' : 's'} gesamt</small></span>
          <span class="tw-p"><b style="color:${s.c}">${m.p}</b> Pkt.</span><span class="tw-s">${twPill(s.c, s.label)}</span></button>`; }).join('') || '<p class="muted">Noch keine Teamler.</p>'}</div></section>
      <section class="card dpanel"><div class="dp-head"><h2>So funktionieren die Punkte</h2></div>
        <div class="tw-rules">${Object.entries(d.levels).map(([k, l]) => `<div>${twPill(TW_C[k], l)}<b>${d.points[k]} Pkt.</b></div>`).join('')}</div>
        <div class="tw-steps">${TW_STEPS.map((s) => `<div style="--c:${s.c}"><b>ab ${s.at} Pkt.</b><span>${s.label}</span></div>`).join('')}</div>
        <p class="muted" style="font-size:13px;margin:12px 0 0">Nur aktive Warns zählen. Läuft eine Warn ab oder wird aufgehoben, fallen ihre Punkte weg. Die Stufen sind eine Empfehlung, entscheiden tut ihr.</p></section>
    </div>
    <div class="ptool" style="margin-top:18px"><input type="search" id="twq" placeholder="Suchen nach Name, Grund oder Kategorie" value="${esc(TW.q)}">
      <select id="twf">${opts({ aktiv: 'Aktiv', abgelaufen: 'Abgelaufen', aufgehoben: 'Aufgehoben', alle: 'Alle' }, TW.f)}</select>
      ${TW.who ? `<button class="btn btn-ghost sm" id="twAllWho">Alle Teamler zeigen</button>` : ''}</div>
    <div class="tw-list">${list.map((w) => warnCard(w)).join('') || `<div class="empty">${TW.f === 'aktiv' ? 'Gerade hat niemand eine aktive Teamwarn. 👍' : 'Nichts gefunden.'}</div>`}</div></div>`;
  $('twNew').onclick = () => warnDialog(d);
  app.querySelectorAll('[data-who]').forEach((b) => (b.onclick = () => { TW.who = TW.who == b.dataset.who ? '' : b.dataset.who; TW.f = 'alle'; showTeamWarns(); }));
  if ($('twAllWho')) $('twAllWho').onclick = () => { TW.who = ''; showTeamWarns(); };
  $('twf').onchange = () => { TW.f = $('twf').value; showTeamWarns(); };
  let deb; $('twq').oninput = () => { clearTimeout(deb); deb = setTimeout(async () => { TW.q = $('twq').value.trim().toLowerCase(); await showTeamWarns(); const q = $('twq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
  bindWarnActions(d);
}

function warnCard(w, mine) {
  const st = TW_ST[w.status];
  return `<article class="tw-card st-${w.status}" style="--c:${TW_C[w.level]}">
    <header>${mine ? '' : ava(w.admin_name)}<div class="tw-h"><b>${mine ? esc(w.label) : esc(w.admin_name)}</b><small>${mine ? '' : esc(w.label) + ' · '}${esc(w.category || 'Ohne Kategorie')} · ${w.points} Pkt.</small></div>${twPill(st[1], st[0])}</header>
    <p class="tw-text">${nl(w.text)}</p>
    <div class="tw-meta"><span>Von ${esc(w.by_name || '–')} am ${fmtDate(w.created_at)}</span><span>${w.expires_at ? (w.status === 'aktiv' ? 'Läuft ab am ' : 'Abgelaufen am ') + fmtDate(w.expires_at) : 'Läuft nicht ab'}</span>
      <span>${w.ack_at ? `✓ Bestätigt am ${fmtDate(w.ack_at)}` : '<em class="rs-open">Noch nicht bestätigt</em>'}</span></div>
    ${w.statement ? `<div class="tw-stmt"><small>Stellungnahme</small><p>${nl(w.statement)}</p></div>` : ''}
    ${w.lifted_at ? `<div class="tw-stmt ok"><small>Aufgehoben von ${esc(w.lifted_name || '–')} am ${fmtDate(w.lifted_at)}</small>${w.lift_reason ? `<p>${nl(w.lift_reason)}</p>` : ''}</div>` : ''}
    <div class="tw-act">${mine ? (w.status === 'aktiv' ? `<button class="btn ${w.ack_at ? 'btn-ghost' : 'btn-pink'} sm" data-ack="${w.id}">${w.ack_at ? 'Stellungnahme ändern' : 'Zur Kenntnis nehmen'}</button>` : '')
      : `${w.status === 'aktiv' ? `<button class="btn btn-ghost sm" data-lift="${w.id}">Aufheben</button>` : ''}<button class="mini" data-twdel="${w.id}">Löschen</button>`}</div></article>`;
}

function bindWarnActions(d) {
  app.querySelectorAll('[data-lift]').forEach((b) => (b.onclick = () => openDialog(`<form class="form main" style="gap:14px">${dlgHead('Teamwarn aufheben')}
      <p class="muted" style="margin:0">Die Punkte zählen danach nicht mehr. Die Warn bleibt als „aufgehoben“ in der Akte.</p>
      <label class="field"><span>Warum? <small>(optional)</small></span><textarea name="reason" maxlength="500" placeholder="z. B. Hat sich deutlich verbessert"></textarea></label>
      <div class="dlg-foot"><span></span><button class="btn btn-pink" type="submit">Aufheben</button></div></form>`,
    async (fd) => { await api(`admin/teamwarns/${b.dataset.lift}/lift`, { method: 'POST', body: { reason: fd.get('reason') } }); toast('Teamwarn aufgehoben.'); showTeamWarns(); })));
  app.querySelectorAll('[data-twdel]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Wirklich löschen?'; return; }
    try { await api('admin/teamrecords/' + b.dataset.twdel, { method: 'DELETE' }); toast('Gelöscht.'); showTeamWarns(); } catch (err) { toast(err.message, 'bad'); }
  }));
  app.querySelectorAll('[data-ack]').forEach((b) => (b.onclick = () => {
    const w = d.warns.find((x) => x.id === +b.dataset.ack);
    openDialog(`<form class="form main" style="gap:14px">${dlgHead('Teamwarn zur Kenntnis nehmen')}
      <p class="muted" style="margin:0">Du bestätigst damit, dass du die Verwarnung gelesen hast. Wenn du willst, kannst du deine Sicht dazu schreiben. Die Projektleitung sieht sie.</p>
      <label class="field"><span>Stellungnahme <small>(optional)</small></span><textarea name="statement" maxlength="1500" style="min-height:120px">${esc(w.statement || '')}</textarea></label>
      <div class="dlg-foot"><span></span><button class="btn btn-pink" type="submit">${w.ack_at ? 'Speichern' : 'Gelesen & bestätigen'}</button></div></form>`,
    async (fd) => { await api(`admin/teamwarns/${w.id}/ack`, { method: 'POST', body: { statement: fd.get('statement') } }); toast('Danke, ist vermerkt.'); pulse(); showTeamWarns(); });
  }));
}

function myWarns(d, myPts) {
  const s = twStep(myPts);
  const act = d.warns.filter((w) => w.status === 'aktiv'), old = d.warns.filter((w) => w.status !== 'aktiv');
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Nur du und die Projektleitung sehen das</span>Meine Teamwarns</h1></div>
    <div class="pkpis"><div class="pkpi"><b style="color:${s.c}">${myPts}</b><span>Aktive Punkte</span></div><div class="pkpi"><b>${act.length}</b><span>Aktive Warns</span></div><div class="pkpi"><b>${old.length}</b><span>Abgelaufen / aufgehoben</span></div></div>
    ${act.length ? '' : `<div class="empty">Du hast keine aktive Teamwarn. Weiter so! 💪</div>`}
    <div class="tw-list">${act.map((w) => warnCard(w, true)).join('')}</div>
    ${old.length ? `<h3 class="psub" style="margin-top:22px">Frühere</h3><div class="tw-list">${old.map((w) => warnCard(w, true)).join('')}</div>` : ''}</div>`;
  bindWarnActions(d);
}

function warnDialog(d, who) {
  openDialog(`<form class="form main" style="gap:14px">${dlgHead('Teamwarn vergeben')}
    <div class="pform">
      <label class="field"><span>Teamler</span><select name="admin_id" required><option value="">Bitte wählen</option>${opts(Object.fromEntries(d.team.filter((m) => m.id !== d.me).map((m) => [m.id, m.name])), who)}</select></label>
      <label class="field"><span>Stufe</span><select name="level" id="twLevel">${opts(d.levels, 'verwarnung')}</select></label>
      <label class="field"><span>Punkte</span><input type="number" name="points" id="twPts" min="0" max="10" value="${d.points.verwarnung}"></label>
      <label class="field"><span>Kategorie</span><select name="category">${opts(Object.fromEntries(d.categories.map((c) => [c, c])), 'Sonstiges')}</select></label>
      <label class="field"><span>Läuft ab nach</span><select name="days">${opts({ 30: '30 Tagen', 60: '60 Tagen', 90: '90 Tagen', 180: '6 Monaten', 0: 'Nie' }, 90)}</select></label>
      <span></span>
      <label class="field full"><span>Was ist passiert?</span><textarea name="text" required minlength="5" maxlength="2000" style="min-height:130px" placeholder="Sachlich beschreiben: Wann, was, Beweise (Ticket, Clip, Screenshot-Link)…"></textarea></label>
    </div>
    <p class="muted" style="margin:0;font-size:13px">Der Teamler sieht die Warn in seinem Panel unter „Teamwarns“ und muss sie bestätigen. Andere Teamler sehen sie nicht.</p>
    <div class="dlg-foot"><span></span><button class="btn btn-pink" type="submit">Teamwarn vergeben</button></div></form>`,
  async (fd) => { await api('admin/teamwarns', { method: 'POST', body: Object.fromEntries(fd) }); toast('Teamwarn vergeben.'); showTeamWarns(); }, null, { wide: true });
  $('twLevel').onchange = () => { $('twPts').value = d.points[$('twLevel').value]; };
}
