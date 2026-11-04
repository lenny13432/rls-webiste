// =====================================================================
//  Team-Panel – Social Media: Kanäle und Creator für die Seite socials.html
// =====================================================================
const SOC = { s: null, dirty: false };
const SOC_HINT = { discord: 'https://discord.gg/…', youtube: 'https://youtube.com/@…', twitch: 'https://twitch.tv/…', tiktok: 'https://tiktok.com/@…', instagram: 'https://instagram.com/…', x: 'https://x.com/…', kick: 'https://kick.com/…' };
const SOC_TEXT = { discord: 'Community, Support & News', youtube: 'Trailer, Highlights & Updates', twitch: 'Livestreams aus Southland', tiktok: 'Kurze Clips aus der Stadt', instagram: 'Screenshots & Ankündigungen', x: 'News & Ankündigungen', kick: 'Livestreams aus Southland' };

async function showSocials(flash) {
  setNav('social');
  let d; try { d = await api('admin/socials'); } catch (e) { return errBox(e); }
  const S = window.RLS_SOCIAL;
  SOC.s = JSON.parse(JSON.stringify(d.socials)); SOC.dirty = false; window.EDITING = false;
  const s = SOC.s; s.platforms = s.platforms || {}; s.creators = s.creators || [];
  for (const k of d.platforms) s.platforms[k] = s.platforms[k] || { url: '', handle: '', text: '', show: false };
  const live = d.platforms.filter((k) => s.platforms[k].show && s.platforms[k].url).length;
  app.innerHTML = `<div class="wrap admin-main">
    <div class="admin-head"><h1><span class="script">Wo findet man uns?</span>Social Media</h1><a class="btn btn-ghost sm" href="../socials.html" target="_blank" rel="noopener">Seite ansehen ↗</a></div>
    ${flash ? alertBox('ok', flash) : ''}
    <p class="muted" style="margin:-8px 0 18px">${live} Kanal${live === 1 ? '' : 'e'} auf der Website sichtbar. Die Links erscheinen auf der Seite „Social Media“ und als Symbole im Footer jeder Seite.</p>
    <section class="card la-card"><h2>Kanäle</h2>
      <div class="soc-rows">${d.platforms.map((k) => { const p = s.platforms[k]; return `<div class="soc-row" style="--c:${S.colors[k]}">
        <span class="soc-ic">${S.icon(k)}</span>
        <div class="soc-f"><div class="soc-name"><b>${S.names[k]}</b><label class="sw"><input type="checkbox" data-k="${k}" data-f="show" ${p.show ? 'checked' : ''}><span></span>${p.show ? 'sichtbar' : 'ausgeblendet'}</label></div>
          <input data-k="${k}" data-f="url" value="${esc(p.url)}" placeholder="${SOC_HINT[k]}" maxlength="300" spellcheck="false">
          <div class="soc-two"><input data-k="${k}" data-f="handle" value="${esc(p.handle)}" placeholder="Name oder @handle" maxlength="60"><input data-k="${k}" data-f="text" value="${esc(p.text)}" placeholder="${SOC_TEXT[k]}" maxlength="80"></div></div>
      </div>`; }).join('')}</div>
      <p class="muted" style="font-size:13px;margin:12px 0 0">Ein Kanal erscheint erst, wenn ein Link eingetragen und „sichtbar“ an ist. Leeres Feld = nichts wird angezeigt.</p></section>

    <section class="card la-card" style="margin-top:16px"><h2>Unsere Creator</h2>
      <p class="muted hint" style="margin-top:0">Streamer und Creator, die auf Southland spielen. Sie erscheinen unter den Kanälen.</p>
      <div id="crList" class="cr-list"></div>
      <button type="button" class="btn btn-ghost sm" id="crAdd">+ Creator</button></section>

    <section class="card la-card" style="margin-top:16px"><h2>Text oben auf der Seite</h2>
      <textarea id="socIntro" class="ta" maxlength="300" placeholder="Trailer, Clips, Livestreams und alle News rund um Real Life Southland III. Such dir deinen Kanal aus.">${esc(s.intro || '')}</textarea></section>

    <div class="savebar" id="socBar" hidden><span>Ungespeicherte Änderungen</span><button class="btn btn-ghost sm" id="socReset">Verwerfen</button><button class="btn btn-pink sm" id="socSave">Speichern</button></div>
  </div>`;
  const dirty = () => { SOC.dirty = true; window.EDITING = true; $('socBar').hidden = false; };
  app.querySelectorAll('[data-k]').forEach((el) => {
    el[el.type === 'checkbox' ? 'onchange' : 'oninput'] = () => {
      const p = s.platforms[el.dataset.k];
      if (el.type === 'checkbox') { p.show = el.checked; el.parentElement.lastChild.textContent = el.checked ? 'sichtbar' : 'ausgeblendet'; }
      else { p[el.dataset.f] = el.value.trim(); if (el.dataset.f === 'url' && el.value.trim() && !p.show) { p.show = true; const c = app.querySelector(`[data-k="${el.dataset.k}"][data-f="show"]`); c.checked = true; c.parentElement.lastChild.textContent = 'sichtbar'; } }
      dirty();
    };
  });
  $('socIntro').oninput = () => { s.intro = $('socIntro').value; dirty(); };
  const renderCr = () => {
    $('crList').innerHTML = s.creators.map((c, i) => `<div class="cr-row" data-i="${i}">
      <input data-cf="name" value="${esc(c.name)}" placeholder="Name" maxlength="40">
      <select data-cf="platform">${opts(Object.fromEntries(d.platforms.filter((k) => k !== 'discord').map((k) => [k, S.names[k]])), c.platform)}</select>
      <input data-cf="url" value="${esc(c.url)}" placeholder="https://twitch.tv/…" maxlength="300" spellcheck="false">
      <input data-cf="note" value="${esc(c.note || '')}" placeholder="z. B. LSPD · Mo, Mi, Fr ab 20 Uhr" maxlength="100">
      <span class="row"><button type="button" class="mini" data-cup="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">↑</button><button type="button" class="mini" data-cdel="${i}" aria-label="Entfernen">×</button></span></div>`).join('') || '<p class="muted" style="margin:0 0 10px">Noch keine Creator eingetragen.</p>';
    $('crList').querySelectorAll('[data-cf]').forEach((el) => (el[el.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => { s.creators[+el.closest('.cr-row').dataset.i][el.dataset.cf] = el.value.trim(); dirty(); }));
    $('crList').querySelectorAll('[data-cdel]').forEach((b) => (b.onclick = () => { s.creators.splice(+b.dataset.cdel, 1); dirty(); renderCr(); }));
    $('crList').querySelectorAll('[data-cup]').forEach((b) => (b.onclick = () => { const i = +b.dataset.cup; [s.creators[i - 1], s.creators[i]] = [s.creators[i], s.creators[i - 1]]; dirty(); renderCr(); }));
  };
  renderCr();
  $('crAdd').onclick = () => { s.creators.push({ name: '', platform: 'twitch', url: '', note: '' }); dirty(); renderCr(); $('crList').querySelector('.cr-row:last-child [data-cf=name]').focus(); };
  $('socReset').onclick = () => showSocials();
  $('socSave').onclick = async () => {
    $('socSave').disabled = true;
    try { await api('admin/socials', { method: 'PUT', body: s }); window.EDITING = false; toast('Gespeichert. Die Website zeigt es sofort.'); showSocials('Gespeichert. Die Seite „Social Media“ und der Footer zeigen jetzt deine Kanäle.'); }
    catch (err) { toast(err.message, 'bad'); $('socSave').disabled = false; }
  };
}
