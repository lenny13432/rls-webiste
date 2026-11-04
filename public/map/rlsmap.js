/* =====================================================================
   RLS Live-Karte – echte GTA-V-Karte (Leaflet) mit Spielern als Punkte.
   Wird im Ingame-Menü und im Web-Panel benutzt (gleiche Datei).
   Spiel-Koordinaten (x, y) → Karte: latlng = [y, x]
   ===================================================================== */
(function () {
  const CX = 117.3, CY = 172.8, SX = 0.02072, SY = 0.0205;
  const CRS = L.extend({}, L.CRS.Simple, {
    projection: L.Projection.LonLat,
    transformation: new L.Transformation(SX, CX, -SY, CY),
    scale: (z) => Math.pow(2, z),
    zoom: (s) => Math.log(s) / Math.LN2,
    infinite: true,
  });
  // Bild deckt bei Zoom 0 genau 256 × 256 Pixel ab
  const BOUNDS = [[(CY - 256) / SY, (0 - CX) / SX], [(CY - 0) / SY, (256 - CX) / SX]];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /**
   * @param el      Element oder ID
   * @param styles  { dark: url, atlas: url, satellite: url }
   * @param opts    { onSelect(id), popup(p) -> html }
   */
  window.RLSMap = function (el, styles, opts = {}) {
    const map = L.map(el, { crs: CRS, minZoom: 1, maxZoom: 6, zoomSnap: 0.5, zoomDelta: 0.5, attributionControl: false, preferCanvas: true, maxBounds: L.latLngBounds(BOUNDS).pad(0.15), maxBoundsViscosity: 0.8 });
    const layers = {};
    for (const [k, url] of Object.entries(styles)) if (url) layers[k] = L.imageOverlay(url, BOUNDS, { className: 'rls-map-img' });
    const names = { dark: 'Spielkarte', atlas: 'Atlas', satellite: 'Satellit' };
    let current = Object.keys(layers)[0];
    layers[current].addTo(map);
    map.setView([-200, 300], 2);
    const ctrl = L.control({ position: 'topright' });
    ctrl.onAdd = () => {
      const d = L.DomUtil.create('div', 'rls-map-styles');
      d.innerHTML = Object.keys(layers).map((k) => `<button type="button" data-st="${k}" class="${k === current ? 'on' : ''}">${names[k] || k}</button>`).join('');
      L.DomEvent.disableClickPropagation(d);
      d.onclick = (e) => {
        const b = e.target.closest('[data-st]'); if (!b || b.dataset.st === current) return;
        map.removeLayer(layers[current]); current = b.dataset.st; layers[current].addTo(map); layers[current].bringToBack();
        d.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      };
      return d;
    };
    ctrl.addTo(map);
    // Koordinaten unter der Maus
    const pos = L.control({ position: 'bottomright' });
    pos.onAdd = () => { const d = L.DomUtil.create('div', 'rls-map-pos'); d.textContent = 'X –  Y –'; return d; };
    pos.addTo(map);
    map.on('mousemove', (e) => { pos.getContainer().textContent = `X ${e.latlng.lng.toFixed(1)}   Y ${e.latlng.lat.toFixed(1)}`; });

    const markers = new Map();
    let selected = null;
    const color = (p) => (p.me ? '#4fe0a0' : p.dead ? '#8a8aa0' : p.staff ? '#ff4fb3' : '#7aa8ff');
    function setPlayers(list) {
      const seen = new Set();
      for (const p of list) {
        if (p.x === undefined || p.y === undefined) continue;
        seen.add(p.id);
        let m = markers.get(p.id);
        const ll = [p.y, p.x];
        if (!m) {
          m = L.circleMarker(ll, { radius: 7, weight: 2, color: '#fff', fillOpacity: 1, fillColor: color(p) }).addTo(map);
          m.on('click', () => { selected = m._pid; restyle(); if (opts.onSelect) opts.onSelect(m._pid); });
          markers.set(p.id, m);
        } else m.setLatLng(ll);
        m._pid = p.id; m._p = p;
        m.setStyle({ fillColor: color(p) });
        m.unbindTooltip().bindTooltip(`<b>${esc(p.name)}</b> <span>[${p.id}]</span>${p.job ? `<br><small>${esc(p.job)}</small>` : ''}`, { direction: 'top', offset: [0, -8], className: 'rls-map-tip', permanent: p.id === selected || !!p.me });
      }
      for (const [id, m] of markers) if (!seen.has(id)) { map.removeLayer(m); markers.delete(id); }
      restyle();
    }
    function restyle() {
      for (const [id, m] of markers) {
        const sel = id === selected;
        m.setStyle({ radius: sel ? 10 : 7, weight: sel ? 3 : 2, color: sel ? '#ff4fb3' : '#fff' });
        if (sel) m.bringToFront();
      }
    }
    function focus(id, zoom) {
      const m = markers.get(id); if (!m) return;
      selected = id; restyle(); setPlayers([...markers.values()].map((x) => x._p));
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), zoom || 4), { duration: 0.6 });
    }
    return { map, setPlayers, focus, select(id) { selected = id; restyle(); }, invalidate() { map.invalidateSize(); } };
  };
})();
