// Markiert die aktuelle Seite in der Leiste und steuert das Handy-Menü
(function () {
  var nav = document.querySelector('.rls-nav');
  if (!nav) return;
  var page = location.pathname.split('/').pop() || 'index.html';
  if (page === 'status.html') page = 'bewerbung.html';
  nav.querySelectorAll('.rls-links a').forEach(function (a) {
    if (a.getAttribute('href').replace('./', 'index.html') === page) a.classList.add('on');
    a.addEventListener('click', function () { nav.classList.remove('open'); });
  });
  var b = nav.querySelector('.rls-burger');
  b.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    b.setAttribute('aria-expanded', open);
  });
})();

// Social Media: Namen, Farben und schlichte Symbole (gemeinsam für Website und Panel)
window.RLS_SOCIAL = {
  names: { discord: 'Discord', youtube: 'YouTube', twitch: 'Twitch', tiktok: 'TikTok', instagram: 'Instagram', x: 'X', kick: 'Kick' },
  colors: { discord: '#5865f2', youtube: '#ff3b3b', twitch: '#9146ff', tiktok: '#ff2d6f', instagram: '#e1306c', x: '#d9d9e3', kick: '#53fc18' },
  icon: function (k) {
    var p = {
      discord: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17H6.5A2.5 2.5 0 0 1 4 14.5z"/><circle cx="9.5" cy="10.5" r="1.1" fill="currentColor"/><circle cx="14.5" cy="10.5" r="1.1" fill="currentColor"/>',
      youtube: '<rect x="3" y="5.5" width="18" height="13" rx="4"/><path d="M10.5 9.5v5l4.5-2.5z" fill="currentColor"/>',
      twitch: '<rect x="4" y="4" width="16" height="11" rx="2"/><path d="M9 19h6M12 15v4"/><circle cx="12" cy="9.5" r="2" fill="currentColor"/>',
      tiktok: '<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.4 2.6 2.2 4.3 5 4.6"/>',
      instagram: '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r="1" fill="currentColor"/>',
      x: '<path d="M5 5l14 14M19 5L5 19"/>',
      kick: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 8v8M10 12l4-4M10 12l4 4"/>'
    }[k] || '<circle cx="12" cy="12" r="8"/>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
};
// Kleine Social-Leiste im Footer jeder Seite
(function () {
  var foot = document.querySelector('.rls-foot .rls-in'); if (!foot || !window.fetch) return;
  fetch('/api/socials').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.platforms || !d.platforms.length) return;
    var S = window.RLS_SOCIAL, box = document.createElement('div'); box.className = 'rls-soc';
    box.innerHTML = d.platforms.map(function (p) {
      var u = /^https:\/\//.test(p.url) ? p.url : '#';
      return '<a href="' + u.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener" title="' + S.names[p.key] + '" aria-label="' + S.names[p.key] + '" style="--c:' + S.colors[p.key] + '">' + S.icon(p.key) + '</a>';
    }).join('');
    foot.appendChild(box);
  }).catch(function () {});
})();
