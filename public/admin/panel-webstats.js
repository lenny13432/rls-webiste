// =====================================================================
//  Team-Panel – Besucher & Downloads: Website- und Launcher-Statistik
//  Jede Person zählt nur einmal (anonyme Besucher-/Installations-Nummer).
// =====================================================================
const WS = { days: 30 };
const PAGE_NAMES = { '/index.html': 'Startseite', '/launcher.html': 'Launcher', '/bewerbung.html': 'Bewerbung', '/regelwerk.html': 'Regelwerk', '/roadmap.html': 'Roadmap', '/socials.html': 'Social Media', '/fraktion.html': 'Fraktionen', '/status.html': 'Bewerbungsstatus' };
const COUNTRY = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', NL: 'Niederlande', PL: 'Polen', US: 'USA', GB: 'Großbritannien', FR: 'Frankreich', '': 'Unbekannt' };
const n0 = (n) => (+n || 0).toLocaleString('de-DE');

async function showWebStats() {
  setNav('besucher');
  let d; try { d = await api('admin/webstats?days=' + WS.days); } catch (e) { return errBox(e); }
  const w = d.web, l = d.launcher, sum = (k) => d.series.reduce((s, x) => s + x[k], 0);
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Jede Person zählt nur einmal, egal wie oft sie wiederkommt</span>Besucher &amp; Downloads</h1>
      <div class="seg" id="wsDays">${[7, 30, 90].map((x) => `<button type="button" data-d="${x}" class="${WS.days === x ? 'on' : ''}">${x} Tage</button>`).join('')}</div></div>
    <h3 class="psub">Website</h3>
    <div class="pkpis">
      <div class="pkpi hot"><b>${n0(w.people)}</b><span>Personen insgesamt</span><small>${n0(w.newPeople)} neu in ${d.days} Tagen</small></div>
      <div class="pkpi"><b>${n0(w.today)}</b><span>Personen heute</span></div>
      <div class="pkpi"><b>${n0(w.views)}</b><span>Seitenaufrufe</span><small>in ${d.days} Tagen</small></div>
      <div class="pkpi"><b>${n0(w.downloads)}</b><span>Launcher heruntergeladen</span><small>${n0(w.downloadsRange)} in ${d.days} Tagen · je Person 1×</small></div>
    </div>
    <h3 class="psub">Launcher</h3>
    <div class="pkpis">
      <div class="pkpi hot"><b>${n0(l.installs)}</b><span>Installiert (PCs)</span><small>${n0(sum('installs'))} neu in ${d.days} Tagen</small></div>
      <div class="pkpi"><b>${n0(l.active7)}</b><span>Aktiv letzte 7 Tage</span></div>
      <div class="pkpi"><b>${n0(l.active30)}</b><span>Aktiv letzte 30 Tage</span></div>
      <div class="pkpi"><b>${n0(l.played)}</b><span>Haben schon „Spielen“ gedrückt</span></div>
    </div>
    <div class="ws-charts">
      <section class="card dpanel"><div class="dp-head"><h2>Personen auf der Website pro Tag</h2><small class="muted">Summe der Tage: ${n0(sum('visitors'))}</small></div>${wsBars(d.series, 'visitors', 'var(--pink)')}</section>
      <section class="card dpanel"><div class="dp-head"><h2>Launcher-Nutzer pro Tag</h2><small class="muted">PCs, die den Launcher geöffnet haben</small></div>${wsBars(d.series, 'launcher', '#8b6cff')}</section>
    </div>
    <div class="ws-lists">
      ${wsList('Beliebteste Seiten', w.top.map((r) => [PAGE_NAMES[r.path] || r.path, r.people, `${n0(r.people)} Pers. · ${n0(r.views)} Aufrufe`]))}
      ${wsList('Woher kommen sie?', w.refs.map((r) => [r.k ? r.k : 'Direkt / Discord-App', r.n]), 'Erster Besuch')}
      ${wsList('Länder', w.countries.map((r) => [COUNTRY[r.k] || r.k, r.n]))}
      ${wsList('Geräte', w.devices.map((r) => [r.k, r.n]))}
      ${wsList('Launcher-Versionen', l.versions.map((r) => [r.k === '?' ? 'Unbekannt' : 'Version ' + r.k, r.n]), 'Aktiv letzte 30 Tage')}
    </div>
    <p class="muted" style="font-size:13px;margin-top:18px">lENNY DER GEILGE DADDY TRAING PANEL</p>
  </div>`;
  $('wsDays').onclick = (e) => { const b = e.target.closest('[data-d]'); if (b) { WS.days = +b.dataset.d; showWebStats(); } };
  app.querySelectorAll('.ws-bars').forEach(bindBarTips);
}

function wsBars(series, key, color) {
  const max = Math.max(1, ...series.map((s) => s[key]));
  const step = Math.ceil(max / 4) || 1, top = step * 4;
  const W = 100 / series.length;
  return `<div class="ws-chart"><div class="ws-y">${[4, 3, 2, 1, 0].map((i) => `<span>${n0(step * i)}</span>`).join('')}</div>
    <div class="ws-bars" style="--c:${color}">${[1, 2, 3, 4].map((i) => `<i class="ws-grid" style="bottom:${i * 25}%"></i>`).join('')}
    ${series.map((s, i) => `<div class="ws-b" style="left:${i * W}%;width:${W}%" data-tip="${new Date(s.day + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}: ${n0(s[key])} ${key === 'visitors' ? 'Personen' : 'PCs'}"><span style="height:${(s[key] / top) * 100}%"></span></div>`).join('')}</div></div>
    <div class="ws-x"><span>${dFmt(series[0].day)}</span><span>${dFmt(series[Math.floor(series.length / 2)].day)}</span><span>heute</span></div>`;
}
function bindBarTips(box) {
  const tip = document.createElement('div'); tip.className = 'ws-tip'; tip.hidden = true; box.appendChild(tip);
  box.addEventListener('mousemove', (e) => {
    const b = e.target.closest('.ws-b');
    box.querySelectorAll('.ws-b.on').forEach((x) => x !== b && x.classList.remove('on'));
    if (!b) { tip.hidden = true; return; }
    b.classList.add('on'); tip.textContent = b.dataset.tip; tip.hidden = false;
    const r = box.getBoundingClientRect(), bw = tip.offsetWidth / 2 + 4;
    tip.style.left = Math.min(Math.max(e.clientX - r.left, bw), r.width - bw) + 'px';
  });
  box.addEventListener('mouseleave', () => { tip.hidden = true; box.querySelectorAll('.ws-b.on').forEach((x) => x.classList.remove('on')); });
}
function wsList(title, rows, sub) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return `<section class="card dpanel"><div class="dp-head"><h2>${esc(title)}</h2>${sub ? `<small class="muted">${esc(sub)}</small>` : ''}</div>
    ${rows.length ? rows.map(([k, v, label]) => `<div class="ws-row"><span class="ws-k">${esc(k)}</span><span class="ws-v">${esc(label || n0(v))}</span><div class="ws-track"><i style="width:${(v / max) * 100}%"></i></div></div>`).join('') : '<p class="muted" style="margin:0">Noch keine Daten.</p>'}</section>`;
}
