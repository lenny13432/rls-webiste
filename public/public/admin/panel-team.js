// =====================================================================
//  Team-Panel – Team-Bereich: Teamliste & Teamakten, Kalender & Besprechungen,
//  Abwesenheiten, Abstimmungen, Textbausteine, Statistik
// =====================================================================
const RECORD_LABEL = { lob: '🌟 Lob', hinweis: '💬 Hinweis', verwarnung: '⚠️ Team-Verwarnung' };
const EV_ICON = { meeting: '👥', event: '🎉', schulung: '🎓', wartung: '🔧', release: '🚀', sonstiges: '📌' };
const RSVP_LABEL = { ja: 'Zusage', vielleicht: 'Vielleicht', nein: 'Absage' };
const dDE = (d) => d ? d.split('-').reverse().join('.') : '–';
const timeDE = (iso) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
const inDays = (iso) => Math.ceil((new Date(iso) - Date.now()) / 864e5);

// ---------------------------------------------------------------- Teamliste
const TL = { area: '' };
async function showTeamList() {
  setNav('teamliste');
  let d; try { d = await api('admin/teamlist'); } catch (e) { return errBox(e); }
  const order = (r) => { const i = d.ranks.indexOf(r.rank); return i < 0 ? 99 : i; };
  const rows = d.rows.filter((r) => r.active && (!TL.area || r.area === TL.area)).sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
  const inactive = d.rows.filter((r) => !r.active);
  const onl = new Set(LIVE.online.map((o) => o.id));
  const areas = [...new Set(d.rows.map((r) => r.area).filter(Boolean))];
  const today = new Date().toISOString().slice(0, 10);
  const card = (r) => {
    const ob = d.onboardingItems.filter((k) => r.onboarding[k]).length, obPct = Math.round(ob / d.onboardingItems.length * 100);
    const prob = r.probation_until && r.probation_until >= today;
    return `<a class="card mcard" href="#teamliste-${r.id}">
      <div class="mc-top">${ava(r.name, 'lg')}${onl.has(r.id) ? '<span class="live-dot" title="Gerade im Panel"></span>' : ''}</div>
      <b class="mc-name">${esc(r.name)}</b>
      <span class="rank">${esc(r.rank || 'Kein Rang')}</span>
      ${r.area ? `<small class="muted">${esc(r.area)}</small>` : ''}
      <div class="mc-tags">${r.away ? `<span class="tagx away">🌴 weg bis ${dDE(r.away.until)}</span>` : ''}${prob ? `<span class="tagx prob">Probezeit bis ${dDE(r.probation_until)}</span>` : ''}${r.role === 'owner' ? '<span class="tagx own">Owner</span>' : ''}</div>
      <div class="mc-stats"><span><b>${r.actions30}</b> Aktionen / 30 T.</span><span>${r.last_action ? 'aktiv ' + ago(r.last_action) : 'noch nie aktiv'}</span></div>
      ${ob < d.onboardingItems.length ? `<div class="mc-ob" title="Einarbeitung ${ob}/${d.onboardingItems.length}"><i style="width:${obPct}%"></i></div><small class="muted">Einarbeitung ${ob}/${d.onboardingItems.length}</small>` : ''}
      ${r.warns ? `<small class="warnline">⚠️ ${r.warns} Team-Verwarnung${r.warns === 1 ? '' : 'en'}</small>` : ''}
    </a>`;
  };
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Wer ist wer?</span>Teamliste</h1>${me.role === 'owner' ? '<a class="btn btn-ghost sm" href="#team">Konten &amp; Rechte verwalten</a>' : ''}</div>
    <div class="dev-stats four">
      <div><b>${rows.length}</b><span>Im Team</span></div>
      <div><b>${d.rows.filter((r) => r.active && onl.has(r.id)).length}</b><span>Gerade online</span></div>
      <div><b>${d.rows.filter((r) => r.active && r.away).length}</b><span>Abwesend</span></div>
      <div><b>${d.rows.filter((r) => r.active && r.probation_until && r.probation_until >= today).length}</b><span>In Probezeit</span></div>
    </div>
    ${areas.length ? `<div class="toolbar"><button class="btn btn-ghost sm chip${!TL.area ? ' on' : ''}" data-ar="">Alle Bereiche</button>${areas.map((a) => `<button class="btn btn-ghost sm chip${TL.area === a ? ' on' : ''}" data-ar="${esc(a)}">${esc(a)}</button>`).join('')}</div>` : ''}
    <div class="mgrid">${rows.map(card).join('') || '<div class="empty">Niemand in diesem Bereich.</div>'}</div>
    ${inactive.length ? `<p class="muted" style="margin-top:20px">Gesperrte Konten: ${inactive.map((r) => esc(r.name)).join(', ')}</p>` : ''}
    ${me.role === 'owner' && d.rows.some((r) => !r.rank) ? '<p class="muted" style="margin-top:14px">Tipp: Klick auf ein Teammitglied, um Rang, Bereich und Probezeit festzulegen.</p>' : ''}
  </div>`;
  app.querySelectorAll('[data-ar]').forEach((b) => (b.onclick = () => { TL.area = b.dataset.ar; showTeamList(); }));
}

async function showMember(id) {
  setNav('teamliste');
  let d; try { d = await api('admin/teamlist/' + id); } catch (e) { if (e.message !== 'login') app.innerHTML = `<div class="wrap admin-main"><a class="back" href="#teamliste">← Teamliste</a>${alertBox('bad', e.message)}</div>`; return; }
  const m = d.member, owner = me.role === 'owner', self = me.id === id;
  const ob = d.onboardingItems.filter((k) => m.onboarding[k]).length;
  const kindLabel = { bewerbung: 'Bewerbungen', spieler: 'Spielerakten', news: 'News', dev: 'Dev', pinnwand: 'Pinnwand', team: 'Team' };
  const kmax = Math.max(1, ...d.kinds.map((k) => k.n));
  app.innerHTML = `<div class="wrap admin-main">
    <a class="back" href="#teamliste">← Teamliste</a>
    <div class="admin-head"><div class="mh">${ava(m.name, 'xl')}<h1><span class="script">${esc(m.rank || 'Teammitglied')}</span>${esc(m.name)}</h1></div>
      <div class="row">${owner ? '<button class="btn btn-ghost sm" id="editRank">Rang &amp; Bereich</button>' : ''}${self ? '<button class="btn btn-ghost sm" id="editMe">Mein Profil bearbeiten</button>' : ''}</div></div>
    <div class="facts">
      <div><span>Rang</span><b>${esc(m.rank || '–')}</b></div><div><span>Bereich</span><b>${esc(m.area || '–')}</b></div><div><span>Discord</span><b>${esc(m.discord || '–')}</b></div>
      <div><span>Im Team seit</span><b>${m.joined ? dDE(m.joined) : fmtDate(m.created_at)}</b></div><div><span>Probezeit</span><b>${m.probation_until ? (m.probation_until >= new Date().toISOString().slice(0, 10) ? 'bis ' + dDE(m.probation_until) : 'bestanden ✓') : '–'}</b></div><div><span>Zuletzt angemeldet</span><b>${ago(m.last_login)}</b></div>
    </div>
    ${m.bio ? `<p class="bio">${nl(m.bio)}</p>` : ''}
    ${d.absences.length ? `<div class="alert info"><p>🌴 Abwesend: ${d.absences.map((x) => `${dDE(x.from_date)} – ${dDE(x.to_date)}${x.reason ? ' (' + esc(x.reason) + ')' : ''}`).join(' · ')}</p></div>` : ''}
    <div class="pl-grid">
      <section style="display:grid;gap:18px;align-content:start">
        <section class="card pad sm-pad"><h3 class="sub">Einarbeitung <small>${ob}/${d.onboardingItems.length}</small></h3>
          <div class="rm-bar" style="margin-bottom:10px"><i style="width:${Math.round(ob / d.onboardingItems.length * 100)}%"></i></div>
          <ul class="checks">${d.onboardingItems.map((k) => `<li class="${m.onboarding[k] ? 'done' : ''}"><label><input type="checkbox" data-ob="${esc(k)}" ${m.onboarding[k] ? 'checked' : ''} ${owner ? '' : 'disabled'}><span>${esc(k)}</span></label></li>`).join('')}</ul>
          ${owner ? '' : '<p class="muted" style="font-size:13px;margin:6px 0 0">Abhaken kann die Projektleitung.</p>'}</section>
        ${d.mayRecords ? `<section class="card pad sm-pad"><h3 class="sub">Teamakte <small>${owner ? 'sieht nur der Owner und ' + esc(m.name) : 'nur für dich und die Projektleitung'}</small></h3>
          ${owner ? `<form class="form" id="recForm" style="gap:10px;margin-bottom:14px"><div class="seg" id="recKind">${Object.entries(RECORD_LABEL).map(([k, l]) => `<button type="button" data-v="${k}" class="${k === 'lob' ? 'on' : ''}">${l}</button>`).join('')}</div>
            <textarea id="recText" maxlength="1500" class="ta" placeholder="z. B. „Hat am Wochenende 20 Tickets super gelöst“"></textarea><button class="btn btn-pink sm" style="justify-self:start">Eintragen</button></form>` : ''}
          <div class="s-list">${d.records.map((r) => `<article class="s-item rec-${r.kind}"><header><span class="s-type">${RECORD_LABEL[r.kind]}</span></header><p>${nl(r.text)}</p>
            <footer><span>${esc(r.by_name || '–')} · ${fmt(r.created_at)}</span>${owner ? `<button class="mini" data-rdel="${r.id}">Löschen</button>` : ''}</footer></article>`).join('') || '<p class="muted" style="margin:0">Noch keine Einträge.</p>'}</div></section>` : ''}
      </section>
      <aside style="display:grid;gap:18px;align-content:start">
        <section class="card pad sm-pad"><h3 class="sub">Aktivität <small>letzte 30 Tage</small></h3>
          ${d.kinds.length ? `<div class="hbars">${d.kinds.sort((a, b) => b.n - a.n).map((k) => `<div class="hb" data-tip="${k.n} Aktionen"><span>${esc(kindLabel[k.kind] || k.kind)}</span><i style="width:${Math.max(4, k.n / kmax * 100)}%"></i><b>${k.n}</b></div>`).join('')}</div>` : '<p class="muted" style="margin:0">Keine Aktivität in den letzten 30 Tagen.</p>'}</section>
        <section class="card pad sm-pad"><h3 class="sub">Zuletzt gemacht</h3><ul class="feed">${d.recent.map((e) => `<li><a href="${refLink(e)}"><span class="fi">${KIND_ICON[e.kind] || '•'}</span><span>${esc(e.text)}<small>${ago(e.created_at)}</small></span></a></li>`).join('') || '<li class="muted">Noch nichts.</li>'}</ul></section>
      </aside>
    </div></div>`;
  app.querySelectorAll('[data-ob]').forEach((c) => (c.onchange = async () => {
    const o = { ...m.onboarding }; if (c.checked) o[c.dataset.ob] = true; else delete o[c.dataset.ob];
    try { await api('admin/teamlist/' + id, { method: 'PUT', body: { onboarding: o } }); if (Object.keys(o).length === d.onboardingItems.length) confetti(); showMember(id); } catch (e) { toast(e.message, 'bad'); }
  }));
  if ($('recForm')) {
    let kind = 'lob';
    $('recKind').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; kind = b.dataset.v; $('recKind').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
    $('recForm').onsubmit = async (e) => { e.preventDefault(); try { await api(`admin/teamlist/${id}/records`, { method: 'POST', body: { kind, text: $('recText').value.trim() } }); toast('Eingetragen.'); showMember(id); } catch (err) { toast(err.message, 'bad'); } };
  }
  app.querySelectorAll('[data-rdel]').forEach((b) => (b.onclick = async () => { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Wirklich?'; return; } await api('admin/teamrecords/' + b.dataset.rdel, { method: 'DELETE' }); showMember(id); }));
  if ($('editRank')) $('editRank').onclick = () => openDialog(`<form class="form main" style="gap:14px">${dlgHead('Rang &amp; Bereich: ' + esc(m.name))}
    <div class="grid2"><label class="field"><span>Rang</span><input name="rank" list="rankList" maxlength="40" value="${esc(m.rank || '')}" placeholder="z. B. Supporter"><datalist id="rankList">${d.ranks.map((r) => `<option value="${esc(r)}">`).join('')}</datalist></label>
      <label class="field"><span>Bereich</span><input name="area" list="areaList" maxlength="40" value="${esc(m.area || '')}" placeholder="z. B. Support"><datalist id="areaList">${d.areas.map((r) => `<option value="${esc(r)}">`).join('')}</datalist></label>
      <label class="field"><span>Im Team seit</span><input type="date" name="joined" value="${esc(m.joined || '')}"></label>
      <label class="field"><span>Probezeit bis <small>(leer = keine)</small></span><input type="date" name="probation_until" value="${esc(m.probation_until || '')}"></label></div>
    <div class="dlg-foot"><span></span><button class="btn btn-pink" type="submit">Speichern</button></div></form>`,
  async (fd) => { await api('admin/teamlist/' + id, { method: 'PUT', body: Object.fromEntries(fd) }); toast('Gespeichert.'); showMember(id); });
  if ($('editMe')) $('editMe').onclick = () => openDialog(`<form class="form main" style="gap:14px">${dlgHead('Mein Profil')}
    <label class="field"><span>Discord-Name</span><input name="discord" maxlength="60" value="${esc(m.discord || '')}"></label>
    <label class="field"><span>Über mich <small>(was machst du im Team, wann bist du meistens da?)</small></span><textarea name="bio" maxlength="1000" style="min-height:110px">${esc(m.bio || '')}</textarea></label>
    <div class="dlg-foot"><span></span><button class="btn btn-pink" type="submit">Speichern</button></div></form>`,
  async (fd) => { await api('admin/teamlist/' + id, { method: 'PUT', body: Object.fromEntries(fd) }); toast('Profil gespeichert.'); showMember(id); });
}

// ---------------------------------------------------------------- Kalender, Besprechungen & Abwesenheiten
const CAL = { y: new Date().getFullYear(), m: new Date().getMonth(), data: null };
async function showCalendar() {
  setNav('kalender');
  const first = new Date(CAL.y, CAL.m, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const end = new Date(start); end.setDate(start.getDate() + 41);
  const from = new Date(Math.min(start, Date.now() - 864e5)), to = new Date(Math.max(end, Date.now() + 90 * 864e5));
  let d; try { d = await api(`admin/events?from=${from.toISOString()}&to=${new Date(to.getTime() + 864e5).toISOString()}`); } catch (e) { return errBox(e); }
  CAL.data = d;
  const todayKey = dayKey(new Date());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const day = new Date(start); day.setDate(start.getDate() + i); const k = dayKey(day);
    const evs = d.events.filter((e) => dayKey(new Date(e.starts_at)) === k);
    const abs = d.absences.filter((x) => x.from_date <= k && x.to_date >= k);
    cells.push(`<div class="cday${day.getMonth() !== CAL.m ? ' other' : ''}${k === todayKey ? ' today' : ''}" data-day="${k}">
      <span class="cnum">${day.getDate()}</span>
      ${evs.map((e) => `<button class="cev ev-${e.kind}" data-ev="${e.id}" title="${esc(e.title)}">${timeDE(e.starts_at)} ${esc(e.title)}</button>`).join('')}
      ${abs.length ? `<span class="cabs" title="${esc(abs.map((x) => x.name).join(', '))} abwesend">🌴 ${esc(abs.map((x) => x.name).join(', '))}</span>` : ''}</div>`);
  }
  const upcoming = d.events.filter((e) => new Date(e.ends_at || e.starts_at).getTime() > Date.now() - 2 * 3600e3).slice(0, 8);
  const awayNow = d.absences.filter((x) => x.to_date >= todayKey);
  const past = d.events.filter((e) => new Date(e.starts_at) < Date.now() && e.kind === 'meeting').reverse().slice(0, 5);
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Wann ist was?</span>Kalender</h1>
      <div class="row"><button class="btn btn-ghost sm" id="addAbs">🌴 Abwesenheit</button><button class="btn btn-pink sm" id="addEv">+ Termin</button></div></div>
    <div class="cal-grid">
      <section class="card cal">
        <div class="cal-head"><button class="mini" id="calPrev" aria-label="Voriger Monat">‹</button><h2>${first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</h2><button class="mini" id="calNext" aria-label="Nächster Monat">›</button><button class="mini" id="calToday">Heute</button></div>
        <div class="cweek">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => `<span>${w}</span>`).join('')}</div>
        <div class="cmonth">${cells.join('')}</div>
        <p class="muted" style="font-size:13px;margin:10px 4px 0">Klick auf einen Tag legt dort einen Termin an.</p>
      </section>
      <aside style="display:grid;gap:16px;align-content:start">
        <section class="card dpanel"><div class="dp-head"><h2>Nächste Termine</h2></div>
          <div class="upc">${upcoming.map((e) => `<button class="upc-i" data-ev="${e.id}"><span class="upc-d"><b>${new Date(e.starts_at).getDate()}</b>${new Date(e.starts_at).toLocaleDateString('de-DE', { month: 'short' })}</span>
            <span class="upc-t"><b>${EV_ICON[e.kind]} ${esc(e.title)}</b><small>${new Date(e.starts_at).toLocaleDateString('de-DE', { weekday: 'long' })}, ${timeDE(e.starts_at)}${e.location ? ' · ' + esc(e.location) : ''}</small>
            <small>${e.rsvp.filter((r) => r.status === 'ja').length} Zusagen${e.mine ? ` · du: <em class="rs-${e.mine}">${RSVP_LABEL[e.mine]}</em>` : ' · <em class="rs-open">noch nicht geantwortet</em>'}</small></span></button>`).join('') || '<p class="muted" style="margin:0">Keine Termine geplant.</p>'}</div></section>
        <section class="card dpanel"><div class="dp-head"><h2>Abwesend</h2></div>
          <div class="absl">${awayNow.map((x) => `<div class="abs-i">${ava(x.name)}<span><b>${esc(x.name)}</b><small>${dDE(x.from_date)} – ${dDE(x.to_date)}${x.reason ? ' · ' + esc(x.reason) : ''}</small></span>${x.admin_id === me.id || me.role === 'owner' ? `<button class="mini" data-adel="${x.id}" aria-label="Abwesenheit löschen">×</button>` : ''}</div>`).join('') || '<p class="muted" style="margin:0">Alle da. 💪</p>'}</div></section>
        ${past.length ? `<section class="card dpanel"><div class="dp-head"><h2>Letzte Meetings</h2></div><div class="upc">${past.map((e) => `<button class="upc-i" data-ev="${e.id}"><span class="upc-t"><b>${esc(e.title)}</b><small>${fmt(e.starts_at)} · ${e.protocol ? '📝 Protokoll da' : '<em class="rs-open">kein Protokoll</em>'}</small></span></button>`).join('')}</div></section>` : ''}
      </aside>
    </div></div>`;
  $('calPrev').onclick = () => { if (--CAL.m < 0) { CAL.m = 11; CAL.y--; } showCalendar(); };
  $('calNext').onclick = () => { if (++CAL.m > 11) { CAL.m = 0; CAL.y++; } showCalendar(); };
  $('calToday').onclick = () => { CAL.y = new Date().getFullYear(); CAL.m = new Date().getMonth(); showCalendar(); };
  $('addEv').onclick = () => eventForm();
  $('addAbs').onclick = absenceForm;
  app.querySelector('.cal-grid').onclick = (e) => {
    if (e.target.closest('[data-adel]')) return;
    const ev = e.target.closest('[data-ev]'); if (ev) return eventDetail(+ev.dataset.ev);
    const day = e.target.closest('[data-day]'); if (day && !e.target.closest('.cabs')) { const t = new Date(day.dataset.day + 'T20:00'); eventForm(null, t); }
  };
  app.querySelectorAll('[data-adel]').forEach((b) => (b.onclick = async (e) => { e.stopPropagation(); await api('admin/absences/' + b.dataset.adel, { method: 'DELETE' }); toast('Abwesenheit gelöscht.'); showCalendar(); }));
}

function eventForm(ev, at) {
  const edit = !!ev; const start = edit ? new Date(ev.starts_at) : (at || (() => { const t = new Date(Date.now() + 864e5); t.setHours(20, 0, 0, 0); return t; })());
  const kinds = CAL.data ? CAL.data.kinds : { meeting: 'Teammeeting', event: 'Server-Event', schulung: 'Schulung', wartung: 'Wartung', release: 'Release', sonstiges: 'Sonstiges' };
  ev = ev || { kind: 'meeting', title: '', location: '', body: '' };
  openDialog(`<form class="form main" style="gap:14px">${dlgHead(edit ? 'Termin bearbeiten' : 'Neuer Termin')}
    <div class="grid2"><label class="field"><span>Titel</span><input name="title" maxlength="120" required value="${esc(ev.title)}" placeholder="z. B. Teammeeting Release-Planung"></label>
      <label class="field"><span>Art</span><select name="kind">${opts(kinds, ev.kind)}</select></label>
      <label class="field"><span>Beginn</span><input type="datetime-local" name="starts_at" required value="${localInput(start)}"></label>
      <label class="field"><span>Ende <small>(optional)</small></span><input type="datetime-local" name="ends_at" value="${ev.ends_at ? localInput(ev.ends_at) : ''}"></label></div>
    <label class="field"><span>Ort <small>(z. B. Discord-Talk, Ingame Rathaus)</small></span><input name="location" maxlength="120" value="${esc(ev.location || '')}"></label>
    <label class="field"><span>Tagesordnung / Beschreibung <small>(Zeilen mit „- “ oder „1.“ werden zur Liste)</small></span><textarea name="body" maxlength="6000" style="min-height:120px" placeholder="1. Stand Release\n2. Beta-Tester\n3. Sonstiges">${esc(ev.body || '')}</textarea></label>
    ${edit ? '' : '<p class="muted" style="margin:0;font-size:13px">Ist ein Discord-Webhook eingetragen, wird der Termin dort angekündigt.</p>'}
    <div class="dlg-foot"><span></span><button class="btn btn-pink" type="submit">${edit ? 'Speichern' : 'Termin anlegen'}</button></div></form>`,
  async (fd) => {
    const body = Object.fromEntries(fd);
    body.starts_at = new Date(body.starts_at).toISOString(); body.ends_at = body.ends_at ? new Date(body.ends_at).toISOString() : '';
    if (edit) await api('admin/events/' + ev.id, { method: 'PUT', body }); else await api('admin/events', { method: 'POST', body });
    toast(edit ? 'Termin gespeichert.' : 'Termin angelegt.'); route();
  });
}

function eventDetail(id) {
  const e = CAL.data?.events.find((x) => x.id === id);
  if (!e) { location.hash = '#kalender'; return; }
  const by = (s) => e.rsvp.filter((r) => r.status === s);
  const canDel = me.role === 'owner' || e.created_by === me.id;
  const dlg = openDialog(`<div class="evd">${dlgHead(EV_ICON[e.kind] + ' ' + esc(e.title))}
    <div class="ev-meta"><span class="tagc">${esc(CAL.data?.kinds[e.kind] || e.kind)}</span><span>📅 ${new Date(e.starts_at).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}, ${timeDE(e.starts_at)}${e.ends_at ? ' – ' + timeDE(e.ends_at) : ''} Uhr</span>${e.location ? `<span>📍 ${esc(e.location)}</span>` : ''}<span class="muted">angelegt von ${esc(e.created_by_name || '–')}</span></div>
    <div class="rsvp-row">${Object.entries(RSVP_LABEL).map(([k, l]) => `<button class="btn btn-ghost sm rsvp rs-${k}${e.mine === k ? ' on' : ''}" data-rs="${k}">${k === 'ja' ? '✅' : k === 'nein' ? '❌' : '🤔'} ${l} <b>${by(k).length}</b></button>`).join('')}</div>
    <div class="rsvp-names">${Object.entries(RSVP_LABEL).map(([k, l]) => by(k).length ? `<p><b>${l}:</b> ${by(k).map((r) => esc(r.name)).join(', ')}</p>` : '').join('')}
      ${(() => { const ans = new Set(e.rsvp.map((r) => r.admin_id)); const open = (CAL.data?.team || []).filter((t) => !ans.has(t.id)); return open.length ? `<p class="muted"><b>Noch keine Antwort:</b> ${open.map((t) => esc(t.name)).join(', ')}</p>` : ''; })()}</div>
    ${e.body ? `<h3 class="sub">Tagesordnung</h3><div class="md">${md(e.body)}</div>` : ''}
    <h3 class="sub" style="margin-top:16px">Protokoll &amp; Beschlüsse</h3>
    <div id="protoView" class="md">${e.protocol ? md(e.protocol) : '<p class="muted">Noch kein Protokoll. Nach dem Meeting festhalten, was besprochen und beschlossen wurde.</p>'}</div>
    <div id="protoEdit" hidden><textarea id="protoText" class="ta" style="min-height:200px" placeholder="## Besprochen\n- …\n\n## Beschlüsse\n- [x] Release am 14.02.\n\n## Aufgaben\n- Lenny: …">${esc(e.protocol || '')}</textarea></div>
    <div class="dlg-foot" style="margin-top:14px"><span class="row">${canDel ? '<button class="btn btn-ghost sm" data-del>Termin löschen</button>' : ''}<button class="btn btn-ghost sm" id="evIcs">📥 In meinen Kalender</button></span>
      <span class="row"><button class="btn btn-ghost sm" id="evEdit">Bearbeiten</button><button class="btn btn-pink sm" id="protoBtn">${e.protocol ? 'Protokoll bearbeiten' : 'Protokoll schreiben'}</button></span></div></div>`,
  null, async () => { await api('admin/events/' + id, { method: 'DELETE' }); toast('Termin gelöscht.'); route(); }, { wide: true, noFocus: true });
  dlg.querySelectorAll('[data-rs]').forEach((b) => (b.onclick = async () => { await api(`admin/events/${id}/rsvp`, { method: 'POST', body: { status: b.dataset.rs } }); toast(`${RSVP_LABEL[b.dataset.rs]} gespeichert.`); dlg.close(); route(); }));
  $('evEdit').onclick = () => { dlg.close(); eventForm(e); };
  $('protoBtn').onclick = async () => {
    if ($('protoEdit').hidden) { $('protoEdit').hidden = false; $('protoView').hidden = true; $('protoBtn').textContent = 'Protokoll speichern'; $('protoText').focus(); return; }
    try { await api('admin/events/' + id, { method: 'PUT', body: { protocol: $('protoText').value } }); toast('Protokoll gespeichert.'); dlg.close(); route(); } catch (err) { toast(err.message, 'bad'); }
  };
  $('evIcs').onclick = () => {
    const t = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const endIso = e.ends_at || new Date(new Date(e.starts_at).getTime() + 3600e3).toISOString();
    const escI = (s) => String(s || '').replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Real Life Southland//Team-Panel//DE', 'BEGIN:VEVENT', `UID:rls-event-${e.id}@${location.host}`, `DTSTAMP:${t(new Date().toISOString())}`, `DTSTART:${t(e.starts_at)}`, `DTEND:${t(endIso)}`, `SUMMARY:${escI(e.title)}`, `LOCATION:${escI(e.location)}`, `DESCRIPTION:${escI(e.body)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = `${e.title.replace(/[^\w\- ]+/g, '').trim() || 'termin'}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
}

function absenceForm() {
  const t = new Date().toISOString().slice(0, 10);
  const team = CAL.data?.team || [];
  openDialog(`<form class="form main" style="gap:14px">${dlgHead('🌴 Abwesenheit eintragen')}
    ${me.role === 'owner' && team.length > 1 ? `<label class="field"><span>Wer?</span><select name="admin_id">${opts(Object.fromEntries(team.map((x) => [x.id, x.name])), me.id)}</select></label>` : ''}
    <div class="grid2"><label class="field"><span>Von</span><input type="date" name="from_date" required value="${t}"></label><label class="field"><span>Bis</span><input type="date" name="to_date" required value="${t}"></label></div>
    <label class="field"><span>Grund <small>(optional, z. B. Urlaub, Prüfungen, krank)</small></span><input name="reason" maxlength="200"></label>
    <div class="dlg-foot"><span></span><button class="btn btn-pink" type="submit">Eintragen</button></div></form>`,
  async (fd) => { await api('admin/absences', { method: 'POST', body: Object.fromEntries(fd) }); toast('Abwesenheit eingetragen. Das Team sieht es auf der Übersicht.'); route(); });
}

// ---------------------------------------------------------------- Abstimmungen
async function showPolls() {
  setNav('abstimmungen');
  let d; try { d = await api('admin/polls'); } catch (e) { return errBox(e); }
  const open = d.rows.filter((p) => p.open), done = d.rows.filter((p) => !p.open);
  const card = (p) => {
    const max = Math.max(...p.counts, 0);
    return `<article class="card poll${p.open ? '' : ' closed'}">
      <div class="n-top"><span class="pill ${p.open ? 'st-angenommen' : 'st-pruefung'}">${p.open ? 'Läuft' : 'Beendet'}</span>${p.anonymous ? '<span class="tagx">🕶 Anonym</span>' : ''}${p.open && p.closes_at ? `<small class="muted">endet ${inDays(p.closes_at) <= 0 ? 'heute' : 'in ' + inDays(p.closes_at) + ' Tag' + (inDays(p.closes_at) === 1 ? '' : 'en')}</small>` : ''}</div>
      <h3>${esc(p.question)}</h3>${p.body ? `<p class="muted">${nl(p.body)}</p>` : ''}
      <div class="popts">${p.options.map((o, i) => { const pct = p.total ? Math.round(p.counts[i] / p.total * 100) : 0; return `<button class="popt${p.mine === i ? ' mine' : ''}${!p.open && p.counts[i] === max && max > 0 ? ' win' : ''}" data-vote="${p.id}:${i}" ${p.open ? '' : 'disabled'}>
          <i style="width:${pct}%"></i><span>${p.mine === i ? '✓ ' : ''}${esc(o)}</span><b>${pct}% · ${p.counts[i]}</b></button>${p.voters && p.voters[i].length ? `<small class="pvoters">${p.voters[i].map(esc).join(', ')}</small>` : ''}`; }).join('')}</div>
      <footer><small class="muted">${p.total} von ${p.teamSize} haben abgestimmt · von ${esc(p.created_by_name || '–')} · ${ago(p.created_at)}</small>
        ${p.created_by === me.id || me.role === 'owner' ? `<span class="row">${p.open ? `<button class="mini" data-pclose="${p.id}">Beenden</button>` : ''}<button class="mini" data-pdel="${p.id}">Löschen</button></span>` : ''}</footer></article>`;
  };
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Was meint das Team?</span>Abstimmungen</h1><button class="btn btn-pink sm" id="addPoll">+ Abstimmung</button></div>
    ${open.length ? `<div class="pgrid">${open.map(card).join('')}</div>` : '<div class="empty">Gerade läuft keine Abstimmung. Starte eine, wenn das Team etwas entscheiden soll.</div>'}
    ${done.length ? `<h2 class="sec2">Beendet</h2><div class="pgrid">${done.map(card).join('')}</div>` : ''}</div>`;
  app.querySelectorAll('[data-vote]').forEach((b) => (b.onclick = async () => { const [pid, opt] = b.dataset.vote.split(':'); try { await api(`admin/polls/${pid}/vote`, { method: 'POST', body: { option: +opt } }); toast('Stimme gespeichert.'); showPolls(); } catch (e) { toast(e.message, 'bad'); } }));
  app.querySelectorAll('[data-pclose]').forEach((b) => (b.onclick = async () => { await api(`admin/polls/${b.dataset.pclose}/close`, { method: 'POST', body: {} }); showPolls(); }));
  app.querySelectorAll('[data-pdel]').forEach((b) => (b.onclick = async () => { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Wirklich?'; return; } await api('admin/polls/' + b.dataset.pdel, { method: 'DELETE' }); showPolls(); }));
  $('addPoll').onclick = pollForm;
}
function pollForm() {
  const dlg = openDialog(`<form class="form main" style="gap:14px">${dlgHead('Neue Abstimmung')}
    <label class="field"><span>Frage</span><input name="question" maxlength="200" required placeholder="z. B. Release am Freitag oder Samstag?"></label>
    <label class="field"><span>Erklärung <small>(optional)</small></span><textarea name="body" maxlength="2000" style="min-height:70px"></textarea></label>
    <div class="field"><span>Antworten</span><div id="pOpts" style="display:grid;gap:8px"></div><button type="button" class="btn btn-ghost sm" id="pAdd" style="justify-self:start">+ Antwort</button></div>
    <div class="grid2"><label class="field"><span>Endet am <small>(optional)</small></span><input type="datetime-local" name="closes_at"></label>
      <div class="field"><span>&nbsp;</span><label class="chk"><input type="checkbox" name="anonymous"> Anonym (niemand sieht, wer was gewählt hat)</label></div></div>
    <div class="dlg-foot"><span></span><button class="btn btn-pink" type="submit">Abstimmung starten</button></div></form>`,
  async (fd, form) => {
    const options = [...form.querySelectorAll('.p-opt')].map((i) => i.value.trim()).filter(Boolean);
    const c = fd.get('closes_at');
    await api('admin/polls', { method: 'POST', body: { question: fd.get('question'), body: fd.get('body'), options, anonymous: fd.has('anonymous'), closes_at: c ? new Date(c).toISOString() : '' } });
    toast('Abstimmung gestartet.'); showPolls();
  });
  const add = (v = '') => { if (dlg.querySelectorAll('.p-opt').length >= 10) return; $('pOpts').insertAdjacentHTML('beforeend', `<div class="set-row"><input class="p-opt" maxlength="100" value="${esc(v)}" placeholder="Antwort ${dlg.querySelectorAll('.p-opt').length + 1}"><span></span><button type="button" class="icon-btn" aria-label="Antwort entfernen">×</button></div>`); bindRm(); };
  const bindRm = () => dlg.querySelectorAll('#pOpts .icon-btn').forEach((b) => (b.onclick = () => { if (dlg.querySelectorAll('.p-opt').length > 2) b.closest('.set-row').remove(); }));
  add('Ja'); add('Nein');
  $('pAdd').onclick = () => { add(); dlg.querySelectorAll('.p-opt')[dlg.querySelectorAll('.p-opt').length - 1].focus(); };
}

// ---------------------------------------------------------------- Textbausteine
const SN = { q: '', cat: '', name: '' };
async function showSnippets() {
  setNav('vorlagen');
  let d; try { d = await api('admin/snippets'); } catch (e) { return errBox(e); }
  const cats = [...new Set(d.rows.map((r) => r.category || 'Allgemein'))];
  const term = SN.q.toLowerCase();
  const rows = d.rows.filter((r) => (!SN.cat || (r.category || 'Allgemein') === SN.cat) && (!term || (r.title + ' ' + r.body).toLowerCase().includes(term)));
  const fill = (t) => SN.name ? t.replace(/\{name\}/gi, SN.name) : t;
  const keep = document.activeElement?.id;
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Nicht jedes Mal neu tippen</span>Textbausteine</h1><button class="btn btn-pink sm" id="addSn">+ Textbaustein</button></div>
    <div class="toolbar"><input id="snq" type="search" placeholder="Textbausteine durchsuchen" value="${esc(SN.q)}"><input id="snName" class="name-in" placeholder="{name} ersetzen durch…" value="${esc(SN.name)}" maxlength="40"></div>
    ${cats.length > 1 ? `<div class="toolbar"><button class="btn btn-ghost sm chip${!SN.cat ? ' on' : ''}" data-sc="">Alle</button>${cats.map((c) => `<button class="btn btn-ghost sm chip${SN.cat === c ? ' on' : ''}" data-sc="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
    <div class="sngrid">${rows.map((r) => `<article class="card sn"><div class="n-top"><span class="tagc">${esc(r.category || 'Allgemein')}</span><small class="muted">${r.uses}× benutzt</small></div>
      <h3>${esc(r.title)}</h3><pre class="sn-body">${esc(fill(r.body))}</pre>
      <footer><button class="btn btn-pink sm" data-copy="${r.id}">📋 Kopieren</button><button class="mini" data-sedit="${r.id}">Bearbeiten</button></footer></article>`).join('')
      || `<div class="empty">${d.rows.length ? 'Nichts gefunden.' : 'Noch keine Textbausteine. Leg Antworten an, die ihr ständig schreibt: Ticket-Begrüßung, Ablehnung, Ban-Begründung, Whitelist-Infos…'}</div>`}</div>
    ${d.rows.length ? '' : '<button class="btn btn-ghost sm" id="seedSn" style="margin-top:14px">Beispiele anlegen</button>'}</div>`;
  if (keep && $(keep)) { $(keep).focus(); $(keep).setSelectionRange(9e3, 9e3); }
  let deb;
  $('snq').oninput = () => { clearTimeout(deb); deb = setTimeout(() => { SN.q = $('snq').value.trim(); showSnippets(); }, 220); };
  $('snName').oninput = () => { clearTimeout(deb); deb = setTimeout(() => { SN.name = $('snName').value.trim(); showSnippets(); }, 300); };
  app.querySelectorAll('[data-sc]').forEach((b) => (b.onclick = () => { SN.cat = b.dataset.sc; showSnippets(); }));
  app.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => {
    const r = d.rows.find((x) => x.id === +b.dataset.copy);
    try { await navigator.clipboard.writeText(fill(r.body)); toast('Kopiert. Mit Strg + V einfügen.'); } catch { toast('Kopieren nicht möglich, bitte markieren.', 'bad'); return; }
    api(`admin/snippets/${r.id}/use`, { method: 'POST', body: {} }).catch(() => {});
  }));
  app.querySelectorAll('[data-sedit]').forEach((b) => (b.onclick = () => snippetForm(d.rows.find((x) => x.id === +b.dataset.sedit), cats)));
  $('addSn').onclick = () => snippetForm(null, cats);
  if ($('seedSn')) $('seedSn').onclick = async () => {
    const ex = [
      ['Support', 'Ticket-Begrüßung', 'Hey {name}, danke für dein Ticket! 👋\nIch kümmere mich jetzt um dein Anliegen. Schick mir bitte kurz einen Clip oder Screenshot, falls du einen hast.'],
      ['Support', 'Ticket schließen', 'Alles klar {name}, dann schließe ich das Ticket jetzt. Wenn noch etwas ist, mach gerne ein neues auf. Viel Spaß in Southland! 🌴'],
      ['Sanktionen', 'Ban-Nachricht', 'Hallo {name},\ndu wurdest wegen eines Regelverstoßes gebannt.\nGrund: \nDauer: \nWenn du denkst, dass das ein Fehler ist, kannst du im Discord einen Entbannungsantrag stellen.'],
      ['Bewerbungen', 'Absage Team-Bewerbung', 'Hey {name}, vielen Dank für deine Bewerbung! Leider hat es diesmal nicht gepasst. Du kannst dich in 7 Tagen gerne erneut bewerben. Bleib uns gewogen! 💜'],
      ['Bewerbungen', 'Einladung Gespräch', 'Hey {name}, deine Bewerbung hat uns gefallen! 🎉 Wann hast du Zeit für ein kurzes Gespräch im Discord-Talk?']
    ];
    for (const [category, title, body] of ex) await api('admin/snippets', { method: 'POST', body: { category, title, body } });
    showSnippets();
  };
}
function snippetForm(s, cats) {
  const edit = !!s; s = s || { category: '', title: '', body: '' };
  openDialog(`<form class="form main" style="gap:14px">${dlgHead(edit ? 'Textbaustein bearbeiten' : 'Neuer Textbaustein')}
    <div class="grid2"><label class="field"><span>Name</span><input name="title" maxlength="100" required value="${esc(s.title)}" placeholder="z. B. Ticket-Begrüßung"></label>
      <label class="field"><span>Kategorie</span><input name="category" maxlength="40" list="snCats" value="${esc(s.category || '')}" placeholder="z. B. Support"><datalist id="snCats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label></div>
    <label class="field"><span>Text <small><code>{name}</code> wird beim Kopieren durch den Namen ersetzt</small></span><textarea name="body" maxlength="4000" required style="min-height:160px">${esc(s.body)}</textarea></label>
    <div class="dlg-foot">${edit ? '<button type="button" class="btn btn-ghost sm" data-del>Löschen</button>' : '<span></span>'}<button class="btn btn-pink" type="submit">${edit ? 'Speichern' : 'Anlegen'}</button></div></form>`,
  async (fd) => { const body = Object.fromEntries(fd); if (edit) await api('admin/snippets/' + s.id, { method: 'PUT', body }); else await api('admin/snippets', { method: 'POST', body }); toast('Gespeichert.'); showSnippets(); },
  async () => { await api('admin/snippets/' + s.id, { method: 'DELETE' }); toast('Gelöscht.'); showSnippets(); });
}

// ---------------------------------------------------------------- Statistik
const ST = { days: 30 };
async function showStats() {
  setNav('statistik');
  let d; try { d = await api('admin/stats?days=' + ST.days); } catch (e) { return errBox(e); }
  // Tagesreihe lückenlos auffüllen
  const days = [];
  for (let i = d.days - 1; i >= 0; i--) { const x = new Date(Date.now() - i * 864e5); const k = x.toISOString().slice(0, 10); days.push({ k, n: d.daily.find((r) => r.d === k)?.n || 0 }); }
  const dmax = Math.max(1, ...days.map((x) => x.n));
  const amax = Math.max(1, ...d.rows.map((r) => r.actions));
  const top = d.rows[0];
  const t = d.totals;
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Wer reißt was?</span>Team-Statistik</h1>
      <div class="seg" id="stDays">${[7, 30, 90].map((n) => `<button type="button" data-v="${n}" class="${ST.days === n ? 'on' : ''}">${n} Tage</button>`).join('')}</div></div>
    <div class="kpis">
      <div class="kpi"><b>${t.actions}</b><span>Aktionen im Panel</span></div>
      <div class="kpi"><b>${t.apps}</b><span>Neue Bewerbungen</span></div>
      <div class="kpi"><b>${t.sanctions}</b><span>Sanktionen</span></div>
      <div class="kpi"><b>${t.tasks}</b><span>Aufgaben erledigt</span></div>
      <div class="kpi"><b>${top && top.actions ? esc(top.name) : '–'}</b><span>Aktivstes Teammitglied</span></div>
    </div>
    <section class="card dpanel" style="margin-bottom:16px"><div class="dp-head"><h2>Team-Aktivität pro Tag</h2><small class="muted">Aktionen im Panel</small></div>
      <div class="vbars" style="--n:${days.length}">${days.map((x) => `<div class="vb" data-tip="${new Date(x.k + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}: ${x.n} Aktion${x.n === 1 ? '' : 'en'}"><i style="height:${x.n ? Math.max(3, x.n / dmax * 100) : 0}%"></i></div>`).join('')}</div>
      <div class="vaxis"><span>${dDE(days[0].k)}</span><span>Höchster Tag: ${dmax}</span><span>heute</span></div></section>
    <section class="card dpanel"><div class="dp-head"><h2>Pro Teammitglied</h2><small class="muted">sortiert nach Aktionen</small></div>
      <div class="table-wrap" style="border:0;background:none"><table><thead><tr><th>Teammitglied</th><th style="width:34%">Aktionen</th><th>Bewerbungen entschieden</th><th>Sanktionen</th><th>Aufgaben erledigt</th></tr></thead><tbody>
      ${d.rows.map((r, i) => `<tr style="cursor:pointer" data-mid="${r.id}"><td><span class="tname">${i < 3 && r.actions ? ['🥇', '🥈', '🥉'][i] : ''}${ava(r.name)}<span><b>${esc(r.name)}</b>${r.rank ? `<br><small class="muted">${esc(r.rank)}</small>` : ''}</span></span></td>
        <td><div class="hb solo" data-tip="${r.actions} Aktionen"><i style="width:${r.actions ? Math.max(3, r.actions / amax * 100) : 0}%"></i><b>${r.actions}</b></div></td>
        <td class="num">${r.decided}</td><td class="num">${r.sanctions}</td><td class="num">${r.tasks}</td></tr>`).join('')}</tbody></table></div></section>
  </div>`;
  $('stDays').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { ST.days = +b.dataset.v; showStats(); } };
  app.querySelector('tbody').onclick = (e) => { const tr = e.target.closest('[data-mid]'); if (tr) location.hash = '#teamliste-' + tr.dataset.mid; };
}

