// =====================================================================
//  Team-Panel – Regelwerk-Editor
//  Kapitel und Paragraphen bearbeiten, Strafkatalog pflegen, veröffentlichen.
//  Die Seite regelwerk.html lädt danach automatisch die neueste Version.
// =====================================================================
const RW = { data: null, meta: null, dirty: false, open: new Set([0]) };
const PEN_NAMES = { '#4fe0a0': 'Grün', '#ffc04f': 'Gelb', '#ff7a45': 'Orange', '#ff4f6a': 'Rot', '#7aa8ff': 'Blau', '#b47cff': 'Lila' };

// Erstes Öffnen: das aktuelle Regelwerk aus der Website-Datei übernehmen
async function importRulesFromPage() {
  const html = await (await fetch('../regelwerk.html', { cache: 'no-store' })).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const chapters = [...doc.querySelectorAll('section.chapter')].map((sec) => {
    const h = sec.querySelector('h2').cloneNode(true); h.querySelector('.n')?.remove();
    return { title: h.textContent.trim(), rules: [...sec.querySelectorAll('.rule')].map((r) => ({ title: r.querySelector('h3')?.textContent.trim() || '', text: r.querySelector('p')?.textContent.trim() || '' })) };
  });
  const penalties = [...doc.querySelectorAll('table.strafen tbody tr')].map((tr) => {
    const td = tr.querySelectorAll('td'); const bg = (td[0]?.querySelector('.lv')?.getAttribute('style') || '').match(/#[0-9a-f]{6}/i);
    return { label: td[1]?.textContent.trim() || '', example: td[2]?.textContent.trim() || '', color: bg ? bg[0].toLowerCase() : '#4fe0a0' };
  });
  const intro = doc.querySelector('header .wrap > p')?.textContent.trim() || '';
  const st = (doc.querySelector('.meta .pill b')?.textContent || '').trim().match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return { stand: st ? `${st[3]}-${st[2]}-${st[1]}` : new Date().toISOString().slice(0, 10), intro, chapters, penalties };
}

// Text einfügen → Kapitel & Regeln anhängen
// Kapitel: Zeile ohne „§“ und ohne Doppelpunkt (z. B. „4. New Life Regelung“ oder „Crimes/Gangs“)
// Regel:   „§6.1 Überschrift: Text“ oder „Überschrift: Text“. Regeln vor der ersten Kapitelzeile kommen ins letzte Kapitel.
function parseRulesText(txt) {
  const out = []; let cur = null;
  for (let line of String(txt).split(/\r?\n/)) {
    line = line.replace(/\s+/g, ' ').trim(); if (!line) continue;
    const isRule = /^§/.test(line) || /^[^:]{1,90}:\s+\S/.test(line);
    if (!isRule) { cur = { title: line.replace(/^\d+[.)]\s*/, '').trim().slice(0, 80), rules: [] }; out.push(cur); continue; }
    line = line.replace(/^§\s*[\d.]+\s*/, '');
    const k = line.indexOf(':');
    const rule = k > 0 && k < 120 ? { title: line.slice(0, k).trim(), text: line.slice(k + 1).trim() } : { title: '', text: line };
    if (!cur) { cur = { title: '', rules: [], toLast: true }; out.push(cur); }
    cur.rules.push(rule);
  }
  return out;
}
function mergeRules(D, parsed) {
  let ch = 0, ru = 0, skip = 0;
  const norm = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  for (const p of parsed) {
    let target = p.toLast ? D.chapters[D.chapters.length - 1] : D.chapters.find((c) => norm(c.title) === norm(p.title));
    if (!target) { target = { title: p.title || 'Weitere Regeln', rules: [] }; D.chapters.push(target); ch++; }
    for (const r of p.rules) {
      if (target.rules.some((x) => norm(x.title) && norm(x.title) === norm(r.title))) { skip++; continue; }
      target.rules.push(r); ru++;
    }
  }
  return { ch, ru, skip };
}
function openRulesImport() {
  openDialog(`<form class="form main" style="gap:14px">${dlgHead('Regeln einfügen')}
    <p class="muted" style="margin:0;font-size:13.5px">Text einfach reinkopieren. Alles wird <b>unter</b> eure bestehenden Regeln gehängt, nichts wird überschrieben.<br>
      Kapitel = Zeile ohne „:“ (z. B. <code>4. New Life Regelung</code>) · Regel = <code>§6.1 Überschrift: Text</code>. Regeln vor der ersten Kapitelzeile landen im letzten Kapitel. Gleiche Kapitelnamen werden zusammengeführt, doppelte Regeln übersprungen.</p>
    <label class="field"><span>Text</span><textarea name="txt" id="rwImpTxt" style="min-height:260px;font-family:var(--mono);font-size:13px" placeholder="4. New Life Regelung&#10;§6.1 Verbluten und Gedächtnisverlust: Wer ohne Hilfe verblutet, …"></textarea></label>
    <p class="muted" id="rwImpPrev" style="margin:0;font-size:13px">Noch nichts eingefügt.</p>
    <div class="dlg-foot"><span></span><button class="btn btn-pink" type="submit">Anhängen</button></div></form>`,
  async (fd) => {
    const parsed = parseRulesText(fd.get('txt'));
    if (!parsed.length) throw new Error('Keine Regeln erkannt.');
    const r = mergeRules(RW.data, parsed);
    RW.open = new Set(RW.data.chapters.map((_, i) => i).slice(-Math.max(1, r.ch)));
    rwDirty(); renderRulesEditor();
    toast(`${r.ru} Regeln${r.ch ? ` in ${r.ch} neuen Kapiteln` : ''} angehängt${r.skip ? `, ${r.skip} doppelte übersprungen` : ''}. Prüfen und dann „Veröffentlichen“.`);
  });
  const t = $('rwImpTxt');
  t.oninput = () => { const p = parseRulesText(t.value); const n = p.reduce((a, c) => a + c.rules.length, 0); $('rwImpPrev').innerHTML = n ? `Erkannt: <b>${n} Regeln</b> in ${p.filter((c) => !c.toLast).length} Kapiteln: ${p.map((c) => esc(c.toLast ? '(ins letzte Kapitel)' : c.title)).join(' · ')}` : 'Noch nichts erkannt.'; };
}

async function showRules() {
  setNav('regelwerk');
  let d; try { d = await api('admin/rules'); } catch (e) { return errBox(e); }
  RW.meta = d; RW.dirty = false; window.EDITING = false;
  let imported = false;
  if (d.current && d.current.data) RW.data = JSON.parse(JSON.stringify(d.current.data));
  else { try { RW.data = await importRulesFromPage(); imported = true; } catch { RW.data = { stand: new Date().toISOString().slice(0, 10), intro: '', chapters: [{ title: 'Allgemeines', rules: [] }], penalties: [] }; } }
  const owner = me.role === 'owner';
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Was gilt auf Southland?</span>Regelwerk</h1>
      <div class="row">${me.role === 'owner' ? '<button class="btn btn-pink sm" id="rwImport">+ Text einfügen</button>' : ''}<a class="btn btn-ghost sm" href="../regelwerk.html" target="_blank" rel="noopener">Ansehen ↗</a></div></div>
    ${imported ? alertBox('info', 'Das Regelwerk wurde aus der aktuellen Website übernommen. Prüf es kurz und klick einmal auf „Veröffentlichen“. Ab dann kommt alles aus dem Panel, HTML musst du nicht mehr anfassen.') : ''}
    ${d.current ? `<p class="muted" style="margin:-8px 0 16px">Zuletzt veröffentlicht von <b style="color:var(--fg)">${esc(d.current.admin_name || '–')}</b> · ${ago(d.current.created_at)}${d.current.note ? ` · „${esc(d.current.note)}“` : ''}</p>` : ''}
    ${owner ? '' : alertBox('info', 'Du kannst das Regelwerk ansehen. Ändern und veröffentlichen darf der Owner.')}
    <div class="rw-grid"><div class="rw-main" id="rwMain"></div>
      <aside class="rw-side">
        <section class="card dpanel"><div class="dp-head"><h2>Inhalt</h2></div><ol class="rw-toc" id="rwToc"></ol></section>
        <section class="card dpanel"><div class="dp-head"><h2>Versionen</h2></div>
          <ul class="rw-vers">${d.versions.map((v, i) => `<li><span><b>${fmt(v.created_at)}</b><small>${esc(v.admin_name || '–')}${v.note ? ' · ' + esc(v.note) : ''}</small></span>${i === 0 ? '<span class="tagx own">aktuell</span>' : `<button class="mini" data-ver="${v.id}">Laden</button>`}</li>`).join('') || '<li class="muted">Noch nichts veröffentlicht.</li>'}</ul>
          <p class="muted" style="font-size:12.5px;margin:8px 0 0">„Laden“ holt eine alte Version in den Editor. Live geht sie erst mit „Veröffentlichen“.</p></section>
      </aside></div>
    <div class="savebar" id="rwBar" ${imported && owner ? '' : 'hidden'}><input id="rwNote" maxlength="200" placeholder="Was hast du geändert? (optional, z. B. „§ 2.6 auf 30 Minuten angepasst“)">
      <label class="chk" title="${d.webhook ? 'Geht in euren Regelwerk-Kanal' : 'Erst unter Einstellungen → Discord-Kanäle einen Webhook eintragen'}"><input type="checkbox" id="rwAnn" ${d.webhook ? 'checked' : 'disabled'}> Im Discord ankündigen${d.webhook ? '' : ' <a href="#einstellungen" style="color:var(--pink)">(einrichten)</a>'}</label>
      <button class="btn btn-ghost sm" id="rwReset">Verwerfen</button><button class="btn btn-pink sm" id="rwSave">Veröffentlichen</button></div>
  </div>`;
  renderRulesEditor();
  app.querySelectorAll('[data-ver]').forEach((b) => (b.onclick = async () => {
    const v = await api('admin/rules/versions/' + b.dataset.ver); RW.data = v.data; rwDirty(); renderRulesEditor(); toast('Alte Version geladen. Zum Übernehmen „Veröffentlichen“ klicken.');
  }));
  if (!owner) return;
  $('rwImport').onclick = openRulesImport;
  $('rwReset').onclick = () => showRules();
  $('rwSave').onclick = async () => {
    $('rwSave').disabled = true;
    try {
      const r = await api('admin/rules', { method: 'POST', body: { ...RW.data, note: $('rwNote').value.trim(), announce: $('rwAnn').checked } });
      window.EDITING = false; RW.dirty = false; toast('Regelwerk veröffentlicht. Die Website zeigt es sofort.'); confetti();
      if (r.announced) toast(r.announced.ok ? 'Im Discord angekündigt.' : 'Discord: ' + r.announced.error, r.announced.ok ? '' : 'bad');
      showRules();
    } catch (err) { toast(err.message, 'bad'); $('rwSave').disabled = false; }
  };
}

function rwDirty() { RW.dirty = true; window.EDITING = true; const b = $('rwBar'); if (b && me.role === 'owner') b.hidden = false; renderToc(); }

function renderToc() {
  const t = $('rwToc'); if (!t) return;
  t.innerHTML = RW.data.chapters.map((c, i) => `<li><a href="#" data-goch="${i}"><span>${String(i + 1).padStart(2, '0')}</span>${esc(c.title || 'Ohne Namen')}<small>${c.rules.length}</small></a></li>`).join('');
  t.onclick = (e) => { const a = e.target.closest('[data-goch]'); if (!a) return; e.preventDefault(); const i = +a.dataset.goch; RW.open.add(i); renderRulesEditor(); $('ch-' + i)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
}

function renderRulesEditor() {
  const D = RW.data, ro = me.role !== 'owner' ? 'disabled' : '';
  const ch = (c, i) => `<section class="card rw-ch${RW.open.has(i) ? ' open' : ''}" id="ch-${i}">
    <header class="rw-ch-head"><button type="button" class="rw-tog" data-tog="${i}" aria-label="Kapitel auf- oder zuklappen">${RW.open.has(i) ? '▾' : '▸'}</button><span class="rw-n">${String(i + 1).padStart(2, '0')}</span>
      <input class="rw-ch-title" data-ch="${i}" value="${esc(c.title)}" placeholder="Kapitelname, z. B. Roleplay" maxlength="80" ${ro}>
      <small class="muted">${c.rules.length} Regel${c.rules.length === 1 ? '' : 'n'}</small>
      ${ro ? '' : `<span class="row"><button class="mini" data-chup="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Kapitel nach oben">↑</button><button class="mini" data-chdown="${i}" ${i === D.chapters.length - 1 ? 'disabled' : ''} aria-label="Kapitel nach unten">↓</button><button class="mini" data-chdel="${i}">Löschen</button></span>`}</header>
    ${RW.open.has(i) ? `<div class="rw-rules">${c.rules.map((r, j) => `<div class="rw-rule">
        <span class="rw-par">§ ${i + 1}.${j + 1}</span>
        <div class="rw-fields"><input data-rt="${i}:${j}" value="${esc(r.title)}" placeholder="Überschrift, z. B. New Life Rule" maxlength="120" ${ro}>
          <textarea data-rx="${i}:${j}" maxlength="3000" placeholder="Was genau gilt?" ${ro}>${esc(r.text)}</textarea></div>
        ${ro ? '' : `<div class="rw-ops"><button class="mini" data-rup="${i}:${j}" ${j === 0 ? 'disabled' : ''} aria-label="Regel nach oben">↑</button><button class="mini" data-rdown="${i}:${j}" ${j === c.rules.length - 1 ? 'disabled' : ''} aria-label="Regel nach unten">↓</button><button class="mini" data-rdel="${i}:${j}" aria-label="Regel löschen">×</button></div>`}
      </div>`).join('') || '<p class="muted" style="margin:0">Noch keine Regeln in diesem Kapitel.</p>'}
      ${ro ? '' : `<button class="btn btn-ghost sm" data-radd="${i}">+ Regel</button>`}</div>` : ''}
  </section>`;
  $('rwMain').innerHTML = `
    <section class="card rw-gen"><div class="grid2"><label class="field"><span>Stand</span><input type="date" id="rwStand" value="${esc(D.stand)}" ${ro}></label>
      <div class="field"><span>Überblick</span><p class="muted" style="margin:6px 0 0">${D.chapters.length} Kapitel · ${D.chapters.reduce((n, c) => n + c.rules.length, 0)} Regeln · ${D.penalties.length} Strafstufen</p></div></div>
      <label class="field" style="margin-top:12px"><span>Einleitung <small>(steht oben auf der Regelwerk-Seite)</small></span><textarea id="rwIntro" maxlength="600" style="min-height:70px" ${ro}>${esc(D.intro)}</textarea></label></section>
    ${D.chapters.map(ch).join('')}
    ${ro ? '' : '<button class="btn btn-ghost sm" id="rwAddCh">+ Kapitel</button>'}
    <section class="card rw-pen"><div class="dp-head"><h2>Strafkatalog</h2><small class="muted">eigener Abschnitt am Ende des Regelwerks</small></div>
      ${D.penalties.map((p, k) => `<div class="rw-pen-row"><span class="rw-lv" style="background:${esc(p.color)}">${k + 1}</span>
        <input data-pl="${k}" value="${esc(p.label)}" placeholder="Strafe, z. B. Bann 1–7 Tage" maxlength="80" ${ro}>
        <input data-pe="${k}" value="${esc(p.example)}" placeholder="Beispiele, z. B. RDM, VDM" maxlength="200" ${ro}>
        <select data-pc="${k}" ${ro}>${opts(PEN_NAMES, p.color)}</select>
        ${ro ? '' : `<button class="mini" data-pdel="${k}" aria-label="Stufe löschen">×</button>`}</div>`).join('') || '<p class="muted" style="margin:0">Kein Strafkatalog.</p>'}
      ${ro ? '' : '<button class="btn btn-ghost sm" id="rwAddPen" style="margin-top:10px">+ Strafstufe</button>'}</section>`;
  renderToc();
  if (ro) return;
  const m = $('rwMain');
  const ij = (s) => s.split(':').map(Number);
  m.oninput = (e) => {
    const t = e.target, ds = t.dataset;
    if (t.id === 'rwStand') D.stand = t.value;
    else if (t.id === 'rwIntro') D.intro = t.value;
    else if (ds.ch !== undefined) D.chapters[+ds.ch].title = t.value;
    else if (ds.rt) { const [i, j] = ij(ds.rt); D.chapters[i].rules[j].title = t.value; }
    else if (ds.rx) { const [i, j] = ij(ds.rx); D.chapters[i].rules[j].text = t.value; }
    else if (ds.pl !== undefined) D.penalties[+ds.pl].label = t.value;
    else if (ds.pe !== undefined) D.penalties[+ds.pe].example = t.value;
    else if (ds.pc !== undefined) { D.penalties[+ds.pc].color = t.value; t.closest('.rw-pen-row').querySelector('.rw-lv').style.background = t.value; }
    else return;
    rwDirty();
  };
  m.onchange = m.oninput;
  const swap = (arr, a, b) => { [arr[a], arr[b]] = [arr[b], arr[a]]; };
  m.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return; const ds = b.dataset;
    if (ds.tog !== undefined) { const i = +ds.tog; RW.open.has(i) ? RW.open.delete(i) : RW.open.add(i); return renderRulesEditor(); }
    if (ds.chup !== undefined) { const i = +ds.chup; swap(D.chapters, i, i - 1); RW.open = new Set([i - 1]); }
    else if (ds.chdown !== undefined) { const i = +ds.chdown; swap(D.chapters, i, i + 1); RW.open = new Set([i + 1]); }
    else if (ds.chdel !== undefined) { if (ds.armed !== '1') { ds.armed = '1'; b.textContent = 'Wirklich?'; return; } D.chapters.splice(+ds.chdel, 1); RW.open = new Set(); }
    else if (ds.radd !== undefined) { const i = +ds.radd; D.chapters[i].rules.push({ title: '', text: '' }); rwDirty(); renderRulesEditor(); const all = document.querySelectorAll(`[data-rt^="${i}:"]`); all[all.length - 1]?.focus(); return; }
    else if (ds.rup) { const [i, j] = ij(ds.rup); swap(D.chapters[i].rules, j, j - 1); }
    else if (ds.rdown) { const [i, j] = ij(ds.rdown); swap(D.chapters[i].rules, j, j + 1); }
    else if (ds.rdel) { const [i, j] = ij(ds.rdel); const r = D.chapters[i].rules[j]; if ((r.title || r.text) && ds.armed !== '1') { ds.armed = '1'; b.textContent = '?'; b.title = 'Nochmal klicken zum Löschen'; return; } D.chapters[i].rules.splice(j, 1); }
    else if (ds.pdel !== undefined) D.penalties.splice(+ds.pdel, 1);
    else if (b.id === 'rwAddCh') { D.chapters.push({ title: '', rules: [{ title: '', text: '' }] }); RW.open.add(D.chapters.length - 1); rwDirty(); renderRulesEditor(); document.querySelector(`[data-ch="${D.chapters.length - 1}"]`)?.focus(); return; }
    else if (b.id === 'rwAddPen') D.penalties.push({ label: '', example: '', color: ['#4fe0a0', '#ffc04f', '#ff7a45', '#ff4f6a'].at(Math.min(D.penalties.length, 3)) });
    else return;
    rwDirty(); renderRulesEditor();
  };
}
