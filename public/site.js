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
