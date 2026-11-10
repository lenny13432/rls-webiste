// =====================================================================
//  Team-Panel – Planung: Social Media, Events, Fraktionen, Teamdokumente, Projekt
//  Alle Bereiche laufen über einen gemeinsamen Speicher (/api/admin/plan).
//  Welche Reiter und Felder es gibt, steht unten in PA – dort kann man leicht erweitern.
// =====================================================================
const PU = { area: null, tab: null, items: [], team: [], q: '', st: '', cal: {}, doc: {} };

// ---------- Bausteine für Felder
const st = (v, l, c) => ({ v, l, c });
const O = (...a) => Object.fromEntries(a.map((x) => (Array.isArray(x) ? x : [x, x])));
const PLATFORMS = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', shorts: 'YT Shorts', twitch: 'Twitch', kick: 'Kick', discord: 'Discord', x: 'X' };
const PCOL = { tiktok: '#25f4ee', instagram: '#e1306c', youtube: '#ff3b3b', shorts: '#ff6b6b', twitch: '#9146ff', kick: '#53fc18', discord: '#5865f2', x: '#d9d9d9' };
const FRAK_TYPES = O('Staatlich (Polizei/Sheriff)', 'Medizinisch (EMS)', 'Justiz', 'Regierung', 'Gang', 'Mafia / Kartell', 'Motorradclub', 'Business / Firma', 'Medien / News', 'Sonstiges');
const EVENT_TYPES = O('Stadtfest', 'Rennen', 'Turnier', 'Schnitzeljagd', 'Party / Club', 'Fraktions-Event', 'Staats-Event', 'Community-Event', 'Server-Event', 'Sonstiges');

// ---------- Alle Bereiche und Reiter
const PA = {
  social: {
    nav: 'sm', title: 'Social Media', script: 'Content, der Leute in die Stadt holt', icon: '📣',
    tabs: [
      { id: 'posts', label: 'Redaktionsplan', icon: '🗂️', view: 'board', noun: 'Beitrag', chips: ['platform', 'format'],
        statuses: [st('idee', 'Idee', '#c9a8ff'), st('entwurf', 'In Arbeit', '#ffb84f'), st('review', 'Freigabe', '#ff8a5c'), st('geplant', 'Geplant', '#5cc8ff'), st('live', 'Veröffentlicht', '#3ddc97')],
        fields: [
          { k: 'title', l: 'Thema / Titel', t: 'text', req: 1, ph: 'z. B. Trailer: Neue Polizeistation', full: 1 },
          { k: 'status', l: 'Status', t: 'status' },
          { k: 'date', l: 'Veröffentlichung', t: 'datetime' },
          { k: 'owner', l: 'Zuständig', t: 'owner' },
          { k: 'platform', l: 'Plattformen', t: 'multi', o: PLATFORMS, full: 1 },
          { k: 'format', l: 'Format', t: 'select', o: O('Clip', 'Reel / Short', 'Story', 'Trailer', 'Ankündigung', 'Livestream', 'Bild-Post', 'Umfrage', 'Gewinnspiel') },
          { k: 'kampagne', l: 'Kampagne', t: 'ref', tab: 'kampagnen' },
          { k: 'media', l: 'Material (Link zu Clip, Drive…)', t: 'url' },
          { k: 'caption', l: 'Text / Caption', t: 'textarea', full: 1, ph: 'Was steht im Post?' },
          { k: 'hashtags', l: 'Hashtags', t: 'text', full: 1, ph: '#fivem #gtarp #roleplay #reallifesouthland' },
          { k: 'checks', l: 'Checkliste', t: 'checklist', full: 1, def: ['Material aufgenommen', 'Geschnitten', 'Text geschrieben', 'Freigegeben', 'Gepostet'] },
          { k: 'views', l: 'Aufrufe (danach)', t: 'number' },
          { k: 'likes', l: 'Likes (danach)', t: 'number' },
          { k: 'notes', l: 'Feedback / Notizen', t: 'textarea' }
        ] },
      { id: 'kalender', label: 'Content-Kalender', icon: '📅', view: 'calendar', source: 'posts', colorBy: 'platform' },
      { id: 'kampagnen', label: 'Kampagnen', icon: '🚀', view: 'cards', noun: 'Kampagne', render: 'campaign',
        statuses: [st('geplant', 'Geplant', '#5cc8ff'), st('aktiv', 'Läuft', '#3ddc97'), st('pausiert', 'Pausiert', '#ffb84f'), st('fertig', 'Abgeschlossen', '#9a8fbf')],
        fields: [
          { k: 'title', l: 'Name der Kampagne', t: 'text', req: 1, ph: 'z. B. Release-Woche Southland III', full: 1 },
          { k: 'status', l: 'Status', t: 'status' },
          { k: 'date', l: 'Start', t: 'date' },
          { k: 'end', l: 'Ende', t: 'date' },
          { k: 'owner', l: 'Verantwortlich', t: 'owner' },
          { k: 'goal', l: 'Ziel-Kennzahl', t: 'text', ph: 'z. B. +1.000 Discord-Mitglieder' },
          { k: 'budget', l: 'Budget (€)', t: 'number' },
          { k: 'desc', l: 'Idee & Plan', t: 'textarea', full: 1 }
        ] },
      { id: 'ideen', label: 'Ideen-Pool', icon: '💡', view: 'table', noun: 'Idee', cols: ['title', 'status', 'platform', 'owner'],
        statuses: [st('neu', 'Neu', '#c9a8ff'), st('gut', 'Gute Idee', '#5cc8ff'), st('umsetzen', 'Wird umgesetzt', '#3ddc97'), st('verworfen', 'Verworfen', '#9a8fbf')],
        action: { label: '→ In den Redaktionsplan', to: 'posts', map: (it) => ({ title: it.title, status: 'idee', data: { caption: it.data.desc || '', platform: it.data.platform || [] } }), set: 'umsetzen' },
        fields: [
          { k: 'title', l: 'Idee', t: 'text', req: 1, full: 1, ph: 'z. B. „Ein Tag als Sanitäter“ als TikTok-Serie' },
          { k: 'status', l: 'Status', t: 'status' },
          { k: 'owner', l: 'Eingereicht von', t: 'owner', me: 1 },
          { k: 'platform', l: 'Passt zu', t: 'multi', o: PLATFORMS, full: 1 },
          { k: 'desc', l: 'Beschreibung', t: 'textarea', full: 1 },
          { k: 'ref', l: 'Inspiration (Link)', t: 'url', full: 1 }
        ] },
      { id: 'stats', label: 'Kennzahlen', icon: '📈', view: 'stats', noun: 'Messwert',
        autoTitle: (d) => `${PLATFORMS[d.platform] || d.platform} · ${d.followers}`,
        fields: [
          { k: 'platform', l: 'Plattform', t: 'select', o: PLATFORMS },
          { k: 'date', l: 'Datum', t: 'date', today: 1 },
          { k: 'followers', l: 'Follower / Mitglieder', t: 'number', req: 1 },
          { k: 'views', l: 'Aufrufe (letzte 7 Tage)', t: 'number' },
          { k: 'notes', l: 'Notiz', t: 'text', full: 1 }
        ] },
      { id: 'vorlagen', label: 'Hashtags & Vorlagen', icon: '#️⃣', view: 'cards', noun: 'Vorlage', render: 'template',
        fields: [
          { k: 'title', l: 'Name', t: 'text', req: 1, ph: 'z. B. Standard-Hashtags TikTok' },
          { k: 'kind', l: 'Art', t: 'select', o: O('Hashtag-Set', 'Caption-Vorlage', 'Ankündigung', 'Discord-Post', 'Video-Beschreibung') },
          { k: 'text', l: 'Text', t: 'textarea', full: 1, rows: 8 }
        ] },
      { id: 'kanaele', label: 'Kanäle (Website)', icon: '🔗', view: 'link', href: '#social' }
    ],
    kpis: (I) => {
      const posts = I('posts'), wk = Date.now() + 7 * 864e5;
      return [
        ['Diese Woche geplant', posts.filter((p) => p.date && new Date(p.date) >= new Date(today()) && new Date(p.date) <= wk).length, 'hot'],
        ['In Arbeit', posts.filter((p) => ['entwurf', 'review'].includes(p.status)).length],
        ['Veröffentlicht', posts.filter((p) => p.status === 'live').length],
        ['Offene Ideen', I('ideen').filter((p) => ['neu', 'gut'].includes(p.status)).length]
      ];
    }
  },

  events: {
    nav: 'events', title: 'Eventmanagement', script: 'Damit in der Stadt immer was los ist', icon: '🎉',
    tabs: [
      { id: 'events', label: 'Eventplanung', icon: '🗂️', view: 'board', noun: 'Event', chips: ['typ', 'ort'],
        statuses: [st('idee', 'Idee', '#c9a8ff'), st('planung', 'In Planung', '#ffb84f'), st('bereit', 'Bereit', '#5cc8ff'), st('laeuft', 'Läuft', '#ff4fb3'), st('fertig', 'Abgeschlossen', '#3ddc97')],
        fields: [
          { k: 'title', l: 'Name des Events', t: 'text', req: 1, full: 1, ph: 'z. B. Southland Street Race #1' },
          { k: 'status', l: 'Status', t: 'status' },
          { k: 'typ', l: 'Art', t: 'select', o: EVENT_TYPES },
          { k: 'owner', l: 'Eventleitung', t: 'owner' },
          { k: 'date', l: 'Beginn', t: 'datetime' },
          { k: 'end', l: 'Ende', t: 'datetime' },
          { k: 'ort', l: 'Ort', t: 'text', ph: 'z. B. Flughafen LSIA' },
          { k: 'helfer', l: 'Helfer aus dem Team', t: 'text', full: 1, ph: 'Wer hilft mit? z. B. Max (Absperrung), Lisa (Moderation)' },
          { k: 'fraktionen', l: 'Beteiligte Fraktionen', t: 'text', full: 1, ph: 'z. B. LSPD (Absperrung), EMS (Sanitätsdienst)' },
          { k: 'max', l: 'Max. Teilnehmer', t: 'number' },
          { k: 'budget', l: 'Budget', t: 'text', ph: 'z. B. 500.000 $ ingame' },
          { k: 'preise', l: 'Preise', t: 'textarea', ph: '1. Platz: …' },
          { k: 'desc', l: 'Ablauf / Beschreibung', t: 'textarea', full: 1, rows: 6, ph: '20:00 Treffpunkt\n20:15 Einweisung\n20:30 Start…' },
          { k: 'announce', l: 'Ankündigungstext (Discord)', t: 'textarea', full: 1, copy: 1 },
          { k: 'checks', l: 'Checkliste', t: 'checklist', full: 1, def: ['Konzept steht', 'Ort festgelegt', 'Fraktionen informiert', 'Ankündigung gepostet', 'Preise vorbereitet', 'Team eingeteilt', 'Nachbesprechung'] },
          { k: 'teilnahme', l: 'Teilnehmer (tatsächlich)', t: 'number', sec: 'Nach dem Event' },
          { k: 'rating', l: 'Bewertung', t: 'rating' },
          { k: 'fazit', l: 'Fazit / Was machen wir nächstes Mal besser?', t: 'textarea', full: 1 }
        ] },
      { id: 'kalender', label: 'Eventkalender', icon: '📅', view: 'calendar', source: 'events' },
      { id: 'ideen', label: 'Ideen-Pool', icon: '💡', view: 'table', noun: 'Event-Idee', cols: ['title', 'status', 'typ', 'aufwand', 'owner'],
        statuses: [st('neu', 'Neu', '#c9a8ff'), st('gut', 'Gute Idee', '#5cc8ff'), st('geplant', 'Wird geplant', '#3ddc97'), st('verworfen', 'Verworfen', '#9a8fbf')],
        action: { label: '→ Als Event planen', to: 'events', map: (it) => ({ title: it.title, status: 'planung', data: { typ: it.data.typ, desc: it.data.desc || '' } }), set: 'geplant' },
        fields: [
          { k: 'title', l: 'Idee', t: 'text', req: 1, full: 1 },
          { k: 'status', l: 'Status', t: 'status' },
          { k: 'typ', l: 'Art', t: 'select', o: EVENT_TYPES },
          { k: 'aufwand', l: 'Aufwand', t: 'select', o: O('klein', 'mittel', 'groß') },
          { k: 'owner', l: 'Eingereicht von', t: 'owner', me: 1 },
          { k: 'desc', l: 'Beschreibung', t: 'textarea', full: 1 }
        ] },
      { id: 'preise', label: 'Preise & Sponsoren', icon: '🏆', view: 'table', noun: 'Preis', cols: ['title', 'status', 'art', 'wert', 'event'],
        statuses: [st('offen', 'Offen', '#ffb84f'), st('zugesagt', 'Zugesagt', '#5cc8ff'), st('vergeben', 'Vergeben', '#3ddc97')],
        fields: [
          { k: 'title', l: 'Preis / Sponsor', t: 'text', req: 1, full: 1, ph: 'z. B. Sportwagen „Pariah“ oder Autohaus Premium Deluxe' },
          { k: 'status', l: 'Status', t: 'status' },
          { k: 'art', l: 'Art', t: 'select', o: O('Preis', 'Sponsor', 'Gutschein', 'Fahrzeug', 'Geld') },
          { k: 'wert', l: 'Wert', t: 'text' },
          { k: 'event', l: 'Für Event', t: 'ref', tab: 'events' },
          { k: 'winner', l: 'Gewinner', t: 'text' },
          { k: 'notes', l: 'Notiz', t: 'textarea', full: 1 }
        ] },
      { id: 'archiv', label: 'Archiv & Fazit', icon: '🗄️', view: 'table', source: 'events', filter: (it) => it.status === 'fertig', cols: ['title', 'date', 'typ', 'teilnahme', 'rating'] }
    ],
    kpis: (I) => {
      const ev = I('events'), next = ev.filter((e) => e.date && e.date >= today() && e.status !== 'fertig').sort((a, b) => a.date.localeCompare(b.date))[0];
      const rated = ev.filter((e) => +e.data.rating);
      return [
        ['Nächstes Event', next ? `${dShort(next.date.slice(0, 10))}` : '–', 'hot', next ? next.title : 'Nichts geplant'],
        ['In Planung', ev.filter((e) => ['idee', 'planung', 'bereit'].includes(e.status)).length],
        ['Durchgeführt', ev.filter((e) => e.status === 'fertig').length],
        ['Ø Bewertung', rated.length ? (rated.reduce((s, e) => s + +e.data.rating, 0) / rated.length).toFixed(1) + ' ★' : '–']
      ];
    }
  },

  frak: {
    nav: 'frak', title: 'Fraktionsverwaltung', script: 'Wer regiert die Straßen von Southland?', icon: '🏛️',
    tabs: [
      { id: 'fraktionen', label: 'Fraktionen', icon: '🏛️', view: 'cards', noun: 'Fraktion', render: 'faction',
        statuses: [st('aktiv', 'Aktiv', '#3ddc97'), st('probe', 'Probezeit', '#ffb84f'), st('geplant', 'Geplant', '#5cc8ff'), st('gesperrt', 'Gesperrt', '#ff5a6e'), st('geschlossen', 'Aufgelöst', '#9a8fbf')],
        fields: [
          { k: 'title', l: 'Name', t: 'text', req: 1, ph: 'z. B. Los Santos Police Department' },
          { k: 'kurz', l: 'Kürzel', t: 'text', ph: 'LSPD' },
          { k: 'status', l: 'Status', t: 'status' },
          { k: 'typ', l: 'Art', t: 'select', o: FRAK_TYPES },
          { k: 'farbe', l: 'Farbe', t: 'color' },
          { k: 'owner', l: 'Ansprechpartner im Team', t: 'owner' },
          { k: 'leitung', l: 'Leitung (IC-Name)', t: 'text' },
          { k: 'leitung_dc', l: 'Discord der Leitung', t: 'text' },
          { k: 'mitglieder', l: 'Mitglieder', t: 'number' },
          { k: 'slots', l: 'Max. Mitglieder', t: 'number' },
          { k: 'hq', l: 'HQ / Standort', t: 'text' },
          { k: 'date', l: 'Gegründet am', t: 'date' },
          { k: 'discord', l: 'Fraktions-Discord', t: 'url', full: 1 },
          { k: 'desc', l: 'Beschreibung / Konzept', t: 'textarea', full: 1 },
          { k: 'intern', l: 'Interne Notizen (nur Team)', t: 'textarea', full: 1 }
        ] },
      { id: 'bewerbungen', label: 'Fraktionsbewerbungen', icon: '📝', view: 'board', noun: 'Bewerbung', chips: ['typ', 'bewerber'],
        statuses: [st('offen', 'Neu', '#c9a8ff'), st('pruefung', 'In Prüfung', '#ffb84f'), st('gespraech', 'Gespräch', '#5cc8ff'), st('angenommen', 'Angenommen', '#3ddc97'), st('abgelehnt', 'Abgelehnt', '#ff5a6e')],
        action: { label: '→ Als Fraktion anlegen', to: 'fraktionen', map: (it) => ({ title: it.title, status: 'probe', data: { typ: it.data.typ, leitung: it.data.bewerber, leitung_dc: it.data.discord, mitglieder: it.data.mitglieder, desc: it.data.konzept } }), set: 'angenommen' },
        fields: [
          { k: 'title', l: 'Name der Fraktion', t: 'text', req: 1, full: 1 },
          { k: 'status', l: 'Status', t: 'status' },
          { k: 'typ', l: 'Art', t: 'select', o: FRAK_TYPES },
          { k: 'owner', l: 'Bearbeitet von', t: 'owner' },
          { k: 'bewerber', l: 'Bewerber (IC-Name)', t: 'text' },
          { k: 'discord', l: 'Discord', t: 'text' },
          { k: 'mitglieder', l: 'Startmitglieder', t: 'number' },
          { k: 'date', l: 'Gespräch am', t: 'datetime' },
          { k: 'konzept', l: 'Konzept', t: 'textarea', full: 1, rows: 7 },
          { k: 'checks', l: 'Prüfung', t: 'checklist', full: 1, def: ['Konzept gelesen', 'Mitglieder geprüft (keine aktiven Bans)', 'Gespräch geführt', 'Abstimmung im Team', 'Rückmeldung gegeben'] },
          { k: 'notes', l: 'Notizen aus dem Gespräch', t: 'textarea', full: 1 }
        ] },
      { id: 'strikes', label: 'Verwarnungen', icon: '⚠️', view: 'table', noun: 'Verwarnung', cols: ['fraktion', 'art', 'title', 'date', 'status', 'owner'],
        statuses: [st('aktiv', 'Aktiv', '#ff5a6e'), st('abgelaufen', 'Abgelaufen', '#9a8fbf'), st('aufgehoben', 'Aufgehoben', '#3ddc97')],
        fields: [
          { k: 'fraktion', l: 'Fraktion', t: 'ref', tab: 'fraktionen', req: 1 },
          { k: 'art', l: 'Art', t: 'select', o: O('Hinweis', 'Verwarnung', 'Strike', 'Sperre') },
          { k: 'title', l: 'Grund', t: 'text', req: 1, full: 1, ph: 'z. B. Massen-RDM im Gebiet der Ballas' },
          { k: 'status', l: 'Status', t: 'status' },
          { k: 'date', l: 'Datum', t: 'date', today: 1 },
          { k: 'until', l: 'Läuft ab', t: 'date' },
          { k: 'owner', l: 'Vergeben von', t: 'owner', me: 1 },
          { k: 'details', l: 'Details / Beweise', t: 'textarea', full: 1 }
        ] },
      { id: 'aktivitaet', label: 'Aktivitätsprüfung', icon: '📊', view: 'table', noun: 'Prüfung', cols: ['fraktion', 'date', 'aktive', 'status', 'title', 'owner'],
        autoTitle: (d) => d.aktive ? `${d.aktive} aktiv` : 'Prüfung',
        statuses: [st('gut', 'Gut', '#3ddc97'), st('ok', 'Okay', '#ffb84f'), st('kritisch', 'Kritisch', '#ff5a6e')],
        fields: [
          { k: 'fraktion', l: 'Fraktion', t: 'ref', tab: 'fraktionen', req: 1 },
          { k: 'date', l: 'Geprüft am', t: 'date', today: 1 },
          { k: 'aktive', l: 'Aktive Mitglieder', t: 'number' },
          { k: 'status', l: 'Ergebnis', t: 'status' },
          { k: 'owner', l: 'Geprüft von', t: 'owner', me: 1 },
          { k: 'title', l: 'Kurzfazit', t: 'text', full: 1 },
          { k: 'notes', l: 'Notizen', t: 'textarea', full: 1 }
        ] },
      { id: 'gebiete', label: 'Gebiete & HQs', icon: '🗺️', view: 'table', noun: 'Gebiet', cols: ['title', 'art', 'fraktion', 'status', 'coords'],
        statuses: [st('frei', 'Frei', '#5cc8ff'), st('vergeben', 'Vergeben', '#3ddc97'), st('umkaempft', 'Umkämpft', '#ff5a6e')],
        fields: [
          { k: 'title', l: 'Name', t: 'text', req: 1, ph: 'z. B. Grove Street' },
          { k: 'art', l: 'Art', t: 'select', o: O('HQ', 'Gebiet', 'Lager', 'Treffpunkt', 'Labor', 'Garage', 'Business') },
          { k: 'fraktion', l: 'Fraktion', t: 'ref', tab: 'fraktionen' },
          { k: 'status', l: 'Status', t: 'status' },
          { k: 'coords', l: 'Koordinaten / Ort', t: 'text', ph: 'vector3(…) oder Beschreibung', full: 1 },
          { k: 'notes', l: 'Notizen', t: 'textarea', full: 1 }
        ] }
    ],
    kpis: (I) => {
      const f = I('fraktionen');
      const mem = f.filter((x) => ['aktiv', 'probe'].includes(x.status)).reduce((s, x) => s + (+x.data.mitglieder || 0), 0);
      return [
        ['Aktive Fraktionen', f.filter((x) => x.status === 'aktiv').length, 'hot'],
        ['In Probezeit', f.filter((x) => x.status === 'probe').length],
        ['Mitglieder gesamt', mem],
        ['Offene Bewerbungen', I('bewerbungen').filter((x) => ['offen', 'pruefung', 'gespraech'].includes(x.status)).length],
        ['Aktive Strikes', I('strikes').filter((x) => x.status === 'aktiv').length, 'bad']
      ];
    }
  },

  docs: {
    nav: 'tdocs', title: 'Teamdokumente', script: 'Alles Wichtige an einem Ort', icon: '📁',
    tabs: [
      { id: 'dokumente', label: 'Dokumente', icon: '📄', view: 'docs', noun: 'Dokument', catKey: 'kat',
        fields: [
          { k: 'title', l: 'Titel', t: 'text', req: 1, full: 1 },
          { k: 'kat', l: 'Kategorie', t: 'select', o: O('Leitfaden', 'Konzept', 'Interne Regeln', 'Support', 'Vorlage', 'Sonstiges') },
          { k: 'owner', l: 'Verantwortlich', t: 'owner', me: 1 },
          { k: 'pin', l: 'Oben anheften', t: 'bool' },
          { k: 'body', l: 'Inhalt', t: 'md', full: 1 }
        ] },
      { id: 'protokolle', label: 'Besprechungen', icon: '🗣️', view: 'docs', noun: 'Protokoll', byDate: 1,
        fields: [
          { k: 'title', l: 'Thema', t: 'text', req: 1, full: 1, ph: 'z. B. Teammeeting KW 46' },
          { k: 'date', l: 'Datum', t: 'date', today: 1 },
          { k: 'owner', l: 'Protokoll von', t: 'owner', me: 1 },
          { k: 'teilnehmer', l: 'Teilnehmer', t: 'text', full: 1 },
          { k: 'body', l: 'Protokoll', t: 'md', full: 1, def: '## Themen\n- \n\n## Besprochen\n- \n\n## Offene Fragen\n- ' },
          { k: 'beschluesse', l: 'Beschlüsse & To-dos', t: 'checklist', full: 1 }
        ] },
      { id: 'onboarding', label: 'Einarbeitung', icon: '🎓', view: 'docs', noun: 'Einarbeitung',
        fields: [
          { k: 'title', l: 'Für welche Position?', t: 'text', req: 1, full: 1, ph: 'z. B. Neue Supporter' },
          { k: 'owner', l: 'Verantwortlich', t: 'owner' },
          { k: 'checks', l: 'Schritte', t: 'checklist', full: 1, def: ['Discord-Rollen geben', 'Panel-Konto anlegen', 'Regelwerk lesen lassen', 'Support-Leitfaden durchgehen', 'Erste Tickets begleitet', 'Probezeit-Gespräch'] },
          { k: 'body', l: 'Infos für Neue', t: 'md', full: 1 }
        ] },
      { id: 'links', label: 'Wichtige Links', icon: '🔗', view: 'table', noun: 'Link', cols: ['title', 'kat', 'url', 'notes'],
        fields: [
          { k: 'title', l: 'Name', t: 'text', req: 1 },
          { k: 'kat', l: 'Kategorie', t: 'select', o: O('Server', 'Discord', 'Tools', 'Cloud / Dateien', 'Design', 'Sonstiges') },
          { k: 'url', l: 'Link', t: 'url', full: 1, req: 1 },
          { k: 'notes', l: 'Wofür?', t: 'text', full: 1 }
        ] },
      { id: 'wiki', label: 'Dev-Wiki', icon: '📖', view: 'link', href: '#wiki' }
    ],
    kpis: (I) => [
      ['Dokumente', I('dokumente').length, 'hot'],
      ['Protokolle', I('protokolle').length],
      ['Offene Beschlüsse', I('protokolle').reduce((s, p) => s + (p.data.beschluesse || []).filter((c) => !c.d).length, 0)],
      ['Links', I('links').length]
    ]
  },

  projekt: {
    nav: 'projekt', title: 'Projektplanung', script: 'Vom Server zum Projekt', icon: '🎯',
    tabs: [
      { id: 'ziele', label: 'Ziele', icon: '🎯', view: 'cards', noun: 'Ziel', render: 'goal',
        statuses: [st('offen', 'Offen', '#c9a8ff'), st('laeuft', 'Läuft', '#ffb84f'), st('erreicht', 'Erreicht', '#3ddc97'), st('verfehlt', 'Verfehlt', '#ff5a6e')],
        fields: [
          { k: 'title', l: 'Ziel', t: 'text', req: 1, full: 1, ph: 'z. B. 64 Spieler gleichzeitig am Wochenende' },
          { k: 'status', l: 'Status', t: 'status' },
          { k: 'bereich', l: 'Bereich', t: 'select', o: O('Community', 'Server & Technik', 'Team', 'Marketing', 'Finanzen', 'Roleplay') },
          { k: 'date', l: 'Bis wann', t: 'date' },
          { k: 'owner', l: 'Verantwortlich', t: 'owner' },
          { k: 'progress', l: 'Fortschritt in % (ohne Teilziele)', t: 'number' },
          { k: 'desc', l: 'Warum & wie?', t: 'textarea', full: 1 },
          { k: 'checks', l: 'Teilziele', t: 'checklist', full: 1 }
        ] },
      { id: 'finanzen', label: 'Finanzen', icon: '💶', view: 'finance', noun: 'Buchung',
        fields: [
          { k: 'title', l: 'Beschreibung', t: 'text', req: 1, full: 1, ph: 'z. B. Server-Miete Zap-Hosting' },
          { k: 'typ', l: 'Art', t: 'select', o: { ausgabe: 'Ausgabe', einnahme: 'Einnahme' } },
          { k: 'betrag', l: 'Betrag (€)', t: 'number', req: 1, step: '0.01' },
          { k: 'date', l: 'Datum', t: 'date', today: 1 },
          { k: 'kat', l: 'Kategorie', t: 'select', o: O('Server / Hosting', 'Scripts & Assets', 'Marketing', 'Events', 'Domains & Tools', 'Spenden', 'Sonstiges') },
          { k: 'repeat', l: 'Wiederholung', t: 'select', o: { einmalig: 'Einmalig', monatlich: 'Monatlich', jaehrlich: 'Jährlich' } },
          { k: 'notes', l: 'Notiz', t: 'text', full: 1 }
        ] },
      { id: 'partner', label: 'Partner', icon: '🤝', view: 'table', noun: 'Partner', cols: ['title', 'art', 'status', 'kontakt', 'owner'],
        statuses: [st('anfrage', 'Anfrage', '#c9a8ff'), st('gespraech', 'Im Gespräch', '#ffb84f'), st('aktiv', 'Aktiv', '#3ddc97'), st('beendet', 'Beendet', '#9a8fbf')],
        fields: [
          { k: 'title', l: 'Name', t: 'text', req: 1 },
          { k: 'art', l: 'Art', t: 'select', o: O('Streamer / Creator', 'Server-Partner', 'Sponsor', 'Dienstleister', 'Sonstiges') },
          { k: 'status', l: 'Status', t: 'status' },
          { k: 'owner', l: 'Betreut von', t: 'owner' },
          { k: 'kontakt', l: 'Kontakt', t: 'text' },
          { k: 'url', l: 'Link', t: 'url' },
          { k: 'deal', l: 'Vereinbarung', t: 'textarea', full: 1 }
        ] },
      { id: 'feedback', label: 'Community-Feedback', icon: '💬', view: 'board', noun: 'Feedback', chips: ['quelle', 'votes'],
        statuses: [st('neu', 'Neu', '#c9a8ff'), st('geprueft', 'Geprüft', '#5cc8ff'), st('geplant', 'Geplant', '#ffb84f'), st('umgesetzt', 'Umgesetzt', '#3ddc97'), st('abgelehnt', 'Abgelehnt', '#9a8fbf')],
        fields: [
          { k: 'title', l: 'Wunsch / Feedback', t: 'text', req: 1, full: 1 },
          { k: 'status', l: 'Status', t: 'status' },
          { k: 'quelle', l: 'Quelle', t: 'select', o: O('Discord', 'Ingame', 'Umfrage', 'Support-Ticket', 'Team') },
          { k: 'votes', l: 'Wie oft gewünscht', t: 'number' },
          { k: 'owner', l: 'Zuständig', t: 'owner' },
          { k: 'desc', l: 'Details', t: 'textarea', full: 1 }
        ] },
      { id: 'roadmap', label: 'Roadmap', icon: '🗺️', view: 'link', href: '#roadmap' }
    ],
    kpis: (I) => {
      const fin = finSum(I('finanzen'));
      const z = I('ziele');
      return [
        ['Saldo gesamt', eur(fin.saldo), fin.saldo < 0 ? 'bad' : 'hot'],
        ['Fixkosten / Monat', eur(fin.monthly)],
        ['Ziele erreicht', `${z.filter((x) => x.status === 'erreicht').length}/${z.length}`],
        ['Aktive Partner', I('partner').filter((x) => x.status === 'aktiv').length],
        ['Neues Feedback', I('feedback').filter((x) => x.status === 'neu').length]
      ];
    }
  }
};
const PA_BY_NAV = Object.fromEntries(Object.entries(PA).map(([k, a]) => [a.nav, k]));


// ---------- Schlichte Linien-Icons statt Emojis (wirkt professioneller)
const PICO = {
  '📣': '<path d="M4 10v4h3l5 4V6L7 10zm12-1.5a4 4 0 0 1 0 7M18.5 6a7.5 7.5 0 0 1 0 12"/>',
  '🗂️': '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9.3 4v16M14.7 4v16"/>',
  '📅': '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4m7-4v4"/>',
  '🚀': '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  '💡': '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  '📈': '<path d="M4 20h16M6 16l4-5 3 3 5-7"/>',
  '#️⃣': '<path d="M9.5 4 7.5 20M16.5 4l-2 16M5 9h15M4 15h15"/>',
  '🔗': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  '🎉': '<path d="M12 3.5l2.2 5.1 5.5.6-4.1 3.7 1.2 5.5L12 15.6l-4.8 2.8 1.2-5.5-4.1-3.7 5.5-.6z"/>',
  '🏆': '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5.5a3 3 0 0 0 2.7 3.9M16 6h2.5a3 3 0 0 1-2.7 3.9M12 13v4M8.5 20h7M10 17h4"/>',
  '🗄️': '<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12h4"/>',
  '🏛️': '<path d="M4 9.5 12 5l8 4.5M5.5 10v8m4.33-8v8m4.34-8v8m4.33-8v8M4 19.5h16"/>',
  '📝': '<path d="M14 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9zM14 4v5h5M9 13h6M9 16.5h4"/>',
  '⚠️': '<path d="M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.1"/>',
  '📊': '<path d="M5 20V11m5 9V5m5 15v-7m5 7V9"/>',
  '🗺️': '<path d="M9 5 3.5 7v12L9 17l6 2 5.5-2V5L15 7zM9 5v12M15 7v12"/>',
  '📁': '<path d="M4 7a1 1 0 0 1 1-1h4.5l2 2H19a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>',
  '📄': '<path d="M14 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9zM14 4v5h5"/>',
  '🗣️': '<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 9.5h8M8 12.5h5"/>',
  '🎓': '<path d="M2.5 9.5 12 5l9.5 4.5L12 14zM6.5 11.5V16c1.5 1.5 3.5 2.2 5.5 2.2s4-.7 5.5-2.2v-4.5M21.5 9.5v5"/>',
  '📖': '<path d="M5 5.5C7 4.5 9.5 4.5 12 6c2.5-1.5 5-1.5 7-.5V19c-2-1-4.5-1-7 .5-2.5-1.5-5-1.5-7-.5zM12 6v13.5"/>',
  '🎯': '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  '💶': '<rect x="3.5" y="6" width="17" height="13" rx="2"/><path d="M3.5 10h17M15.5 14.5h2"/>',
  '🤝': '<circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.4"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5m1-4.6c2.3-.3 4 1.2 4.5 4.6"/>',
  '💬': '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12z"/>'
};
const ico = (e) => (PICO[e] ? `<svg class="pi" viewBox="0 0 24 24" aria-hidden="true">${PICO[e]}</svg>` : `<span>${e}</span>`);

// ---------- Helfer
const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const tabDef = (id) => PA[PU.area].tabs.find((t) => t.id === id);
const itemsOf = (tab) => PU.items.filter((i) => i.tab === tab);
const val = (it, k) => (k === 'title' ? it.title : k === 'status' ? it.status : k === 'date' ? it.date : k === 'owner' ? it.owner_id : (it.data || {})[k]);
const stOf = (td, v) => (td.statuses || []).find((s) => s.v === v);
const stPill = (td, v) => { const s = stOf(td, v); return s ? `<span class="pst" style="--c:${s.c}">${esc(s.l)}</span>` : (v ? `<span class="pst">${esc(v)}</span>` : ''); };
const fmtWhen = (d) => !d ? '' : d.length > 10 ? new Date(d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) + ', ' + d.slice(11, 16) : d.split('-').reverse().join('.');
const refTitle = (id) => PU.items.find((i) => i.id === +id)?.title || '';
const checkProg = (c) => (Array.isArray(c) && c.length ? [c.filter((x) => x.d).length, c.length] : null);
function finSum(rows) {
  let inc = 0, out = 0, monthly = 0;
  for (const r of rows) {
    const b = +r.data.betrag || 0, sign = r.data.typ === 'einnahme' ? 1 : -1;
    if (sign > 0) inc += b; else out += b;
    if (r.data.repeat === 'monatlich') monthly += sign * -b; else if (r.data.repeat === 'jaehrlich') monthly += sign * -b / 12;
  }
  return { inc, out, saldo: inc - out, monthly: Math.max(0, monthly) };
}
function cellHtml(td, it, k) {
  const f = (td.fields || tabDef(td.source)?.fields || []).find((x) => x.k === k) || { t: 'text' };
  const v = val(it, k);
  if (k === 'title') return `<b>${esc(it.title)}</b>`;
  if (k === 'status') return stPill(td.statuses ? td : tabDef(td.source) || td, v);
  if (k === 'owner') return it.owner_name ? `<span class="pown">${ava(it.owner_name, 'sm')}${esc(it.owner_name)}</span>` : '<span class="muted">–</span>';
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '<span class="muted">–</span>';
  if (f.t === 'ref') return esc(refTitle(v));
  if (f.t === 'multi') return v.map((p) => `<span class="pchip" style="--c:${PCOL[p] || 'var(--violet)'}">${esc((f.o || {})[p] || p)}</span>`).join('');
  if (f.t === 'select') return esc((f.o || {})[v] || v);
  if (f.t === 'date' || f.t === 'datetime') return fmtWhen(v);
  if (f.t === 'url') return `<a href="${esc(v)}" target="_blank" rel="noopener" class="ext" onclick="event.stopPropagation()">${esc(String(v).replace(/^https?:\/\//, '').slice(0, 40))} ↗</a>`;
  if (f.t === 'rating') return '★'.repeat(+v) + '<span class="muted">' + '★'.repeat(5 - +v) + '</span>';
  return esc(v);
}

// ---------- Seite
async function showPlan(nav, tabId, openId) {
  const area = PA_BY_NAV[nav]; if (!area) return showStart();
  const A = PA[area];
  if (PU.area !== area) { PU.area = area; PU.q = ''; PU.st = ''; PU.tab = null; }
  const tab = A.tabs.find((t) => t.id === tabId && t.view !== 'link') || A.tabs.find((t) => t.id === PU.tab && t.view !== 'link') || A.tabs[0];
  setNav(nav + '-' + tab.id);
  if (PU.tab !== tab.id) { PU.q = ''; PU.st = ''; }
  PU.tab = tab.id;
  let d; try { d = await api('admin/plan?area=' + area); } catch (e) { return errBox(e); }
  PU.items = d.items; PU.team = d.team;
  const I = (t) => itemsOf(t);
  const count = (t) => (t.view === 'link' || t.view === 'calendar' ? '' : `<em>${(t.filter ? I(t.source).filter(t.filter) : I(t.id)).length}</em>`);
  app.innerHTML = `<div class="wrap admin-main plan-page">
    <div class="admin-head"><h1><span class="script">${esc(A.script)}</span>${esc(A.title)}</h1></div>
    <div class="pkpis">${A.kpis(I).map(([l, v, cls, sub]) => `<div class="pkpi ${cls || ''}"><b>${esc(v)}</b><span>${esc(l)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`).join('')}</div>
    <nav class="ptabs">${A.tabs.map((t) => `<a href="${t.view === 'link' ? t.href : `#${A.nav}-${t.id}`}" class="${t.id === tab.id ? 'on' : ''}">${ico(t.icon)}${esc(t.label)}${count(t)}${t.view === 'link' ? ' ↗' : ''}</a>`).join('')}</nav>
    <div id="pview"></div></div>`;
  renderTab(tab);
  if (openId) { const it = PU.items.find((i) => i.id === openId); if (it) itemDialog(tabDef(it.tab), it); }
}
function toolbar(td, extra = '') {
  const t = td.source ? tabDef(td.source) : td;
  return `<div class="ptool"><input type="search" id="pq" placeholder="Suchen…" value="${esc(PU.q)}">
    ${t.statuses && td.view !== 'board' ? `<select id="pst"><option value="">Alle Status</option>${t.statuses.map((s) => `<option value="${s.v}"${PU.st === s.v ? ' selected' : ''}>${esc(s.l)}</option>`).join('')}</select>` : ''}
    ${extra}${td.source && !td.allowAdd ? '' : `<button class="btn btn-pink sm" id="pnew">+ ${esc(td.noun || 'Neu')}</button>`}</div>`;
}
function bindToolbar(td) {
  let deb;
  const q = $('pq'); if (q) q.oninput = () => { clearTimeout(deb); deb = setTimeout(() => { PU.q = q.value.trim().toLowerCase(); renderTab(td, true); }, 200); };
  const s = $('pst'); if (s) s.onchange = () => { PU.st = s.value; renderTab(td); };
  const n = $('pnew'); if (n) n.onclick = () => itemDialog(td.source ? tabDef(td.source) : td);
}
function filtered(td) {
  let rows = td.source ? itemsOf(td.source) : itemsOf(td.id);
  if (td.filter) rows = rows.filter(td.filter);
  if (PU.st) rows = rows.filter((r) => r.status === PU.st);
  if (PU.q) rows = rows.filter((r) => (r.title + ' ' + JSON.stringify(r.data) + ' ' + (r.owner_name || '')).toLowerCase().includes(PU.q));
  return rows;
}
function renderTab(td, keepFocus) {
  const el = $('pview'); if (!el) return;
  const pos = keepFocus && $('pq') ? $('pq').selectionStart : null;
  const V = { board: viewBoard, table: viewTable, cards: viewCards, calendar: viewCalendar, docs: viewDocs, stats: viewStats, finance: viewFinance };
  V[td.view](td, el);
  if (pos !== null && $('pq')) { $('pq').focus(); $('pq').setSelectionRange(pos, pos); }
}

// ---------- Ansicht: Board (Spalten nach Status, Drag & Drop)
function viewBoard(td, el) {
  const rows = filtered(td);
  el.innerHTML = toolbar(td) + `<div class="board pboard" style="grid-template-columns:repeat(${td.statuses.length},minmax(215px,1fr))">${td.statuses.map((s) => {
    const col = rows.filter((r) => r.status === s.v || (!r.status && s === td.statuses[0])).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
    return `<section class="col" data-st="${s.v}"><header><b style="color:${s.c}">${esc(s.l)}</b><span>${col.length}</span></header>
      <div class="col-body">${col.map((it) => boardCard(td, it, s)).join('') || '<p class="col-empty">Hierher ziehen</p>'}</div>
      <button class="col-add" data-add="${s.v}">+ ${esc(td.noun)}</button></section>`;
  }).join('')}</div>`;
  bindToolbar(td);
  el.querySelectorAll('[data-id]').forEach((c) => {
    c.onclick = () => itemDialog(td, PU.items.find((i) => i.id === +c.dataset.id));
    c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('drag'); };
    c.ondragend = () => c.classList.remove('drag');
  });
  el.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => itemDialog(td, null, { status: b.dataset.add })));
  el.querySelectorAll('.col').forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = () => col.classList.remove('over');
    col.ondrop = async (e) => {
      e.preventDefault(); col.classList.remove('over');
      const it = PU.items.find((i) => i.id === +e.dataTransfer.getData('text/plain'));
      if (!it || it.status === col.dataset.st) return;
      it.status = col.dataset.st; renderTab(td);
      try { await api('admin/plan/' + it.id, { method: 'PUT', body: { status: it.status } }); if (['live', 'fertig', 'angenommen', 'umgesetzt'].includes(it.status)) confetti(); }
      catch (err) { toast(err.message, 'bad'); showPlan(PA[PU.area].nav, td.id); }
    };
  });
}
function boardCard(td, it, s) {
  const cp = checkProg(it.data.checks);
  const chips = (td.chips || []).map((k) => {
    const f = td.fields.find((x) => x.k === k), v = it.data[k];
    if (v === undefined || v === '' || v === null || (Array.isArray(v) && !v.length)) return '';
    if (f && f.t === 'multi') return v.map((p) => `<span class="pchip" style="--c:${PCOL[p] || 'var(--violet)'}">${esc(f.o[p] || p)}</span>`).join('');
    if (k === 'votes') return `<span class="tag">👍 ${esc(v)}</span>`;
    return `<span class="tag">${esc(f && f.o ? f.o[v] || v : v)}</span>`;
  }).join('');
  const late = it.date && it.date.slice(0, 10) < today() && !['live', 'fertig', 'angenommen', 'abgelehnt', 'umgesetzt'].includes(it.status);
  return `<article class="tcard pcard" draggable="true" data-id="${it.id}" style="border-left-color:${s.c}">
    ${chips ? `<div class="tc-top pchips">${chips}</div>` : ''}<h4>${esc(it.title)}</h4>
    <div class="pc-foot">${it.date ? `<span class="${late ? 'late' : ''}">${fmtWhen(it.date)}</span>` : ''}${cp ? `<span class="pc-cp${cp[0] === cp[1] ? ' done' : ''}">✓ ${cp[0]}/${cp[1]}</span>` : ''}${it.owner_name ? ava(it.owner_name, 'sm') : ''}</div></article>`;
}

// ---------- Ansicht: Tabelle
function viewTable(td, el) {
  const src = td.source ? tabDef(td.source) : td;
  const rows = filtered(td).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  const cols = td.cols || ['title', 'status', 'owner'];
  const label = (k) => k === 'owner' ? (src.fields.find((f) => f.k === 'owner')?.l || 'Zuständig') : (src.fields.find((f) => f.k === k)?.l || k);
  el.innerHTML = toolbar(td) + (rows.length ? `<div class="table-wrap"><table class="ptable"><thead><tr>${cols.map((k) => `<th>${esc(label(k))}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((it) => `<tr data-id="${it.id}">${cols.map((k) => `<td>${cellHtml(src, it, k)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : `<div class="empty">${PU.q || PU.st ? 'Nichts gefunden.' : td.source ? 'Hier landet alles automatisch, sobald es abgeschlossen ist.' : `Noch nichts eingetragen. Leg oben ${td.noun === 'Idee' || td.noun === 'Verwarnung' || td.noun === 'Prüfung' ? 'die erste' : 'den ersten Eintrag'} an.`}</div>`);
  bindToolbar(td);
  el.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => itemDialog(src, PU.items.find((i) => i.id === +tr.dataset.id))));
}

// ---------- Ansicht: Karten (Fraktionen, Kampagnen, Ziele, Vorlagen)
function viewCards(td, el) {
  const rows = filtered(td);
  const R = CARD_RENDER[td.render];
  el.innerHTML = toolbar(td) + (rows.length ? `<div class="pgrid">${rows.map((it) => R(td, it)).join('')}</div>` : `<div class="empty">${PU.q || PU.st ? 'Nichts gefunden.' : 'Noch nichts eingetragen.'}</div>`);
  bindToolbar(td);
  el.querySelectorAll('[data-id]').forEach((c) => (c.onclick = (e) => { if (e.target.closest('[data-copy],a')) return; itemDialog(td, PU.items.find((i) => i.id === +c.dataset.id)); }));
  el.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => {
    const it = PU.items.find((i) => i.id === +b.dataset.copy);
    try { await navigator.clipboard.writeText(it.data.text || ''); toast('Kopiert.'); } catch { toast('Kopieren hat nicht geklappt.', 'bad'); }
  }));
}
const bar = (p, c = 'linear-gradient(90deg,var(--violet),var(--pink))') => `<div class="pbar"><i style="width:${Math.max(0, Math.min(100, p))}%;background:${c}"></i></div>`;
const CARD_RENDER = {
  faction: (td, it) => {
    const d = it.data, c = d.farbe || '#8b5cf6';
    const strikes = itemsOf('strikes').filter((s) => +s.data.fraktion === it.id && s.status === 'aktiv');
    const lastCheck = itemsOf('aktivitaet').filter((a) => +a.data.fraktion === it.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    const m = +d.mitglieder || 0, sl = +d.slots || 0;
    return `<article class="pfcard" data-id="${it.id}" style="--fc:${esc(c)}">
      <header><span class="pf-badge">${esc((d.kurz || it.title).slice(0, 4).toUpperCase())}</span><div><h3>${esc(it.title)}</h3><small>${esc(d.typ || 'Fraktion')}</small></div>${stPill(td, it.status)}</header>
      <div class="pf-rows">
        <span><small>Leitung</small>${esc(d.leitung || '–')}</span><span><small>HQ</small>${esc(d.hq || '–')}</span>
        <span><small>Ansprechpartner</small>${it.owner_name ? esc(it.owner_name) : '–'}</span>
        <span><small>Aktivität</small>${lastCheck ? `${stPill(tabDef('aktivitaet'), lastCheck.status)}` : 'nicht geprüft'}</span>
      </div>
      <div class="pf-mem"><span>${m}${sl ? ' / ' + sl : ''} Mitglieder</span>${strikes.length ? `<span class="pf-strike">${strikes.length} Strike${strikes.length > 1 ? 's' : ''} aktiv</span>` : ''}</div>
      ${sl ? bar(m / sl * 100, c) : ''}
      ${d.discord ? `<a class="ext pf-dc" href="${esc(d.discord)}" target="_blank" rel="noopener">Discord ↗</a>` : ''}</article>`;
  },
  campaign: (td, it) => {
    const posts = itemsOf('posts').filter((p) => +p.data.kampagne === it.id), live = posts.filter((p) => p.status === 'live').length;
    return `<article class="pcard2" data-id="${it.id}"><header><h3>${esc(it.title)}</h3>${stPill(td, it.status)}</header>
      <p class="muted">${it.date ? fmtWhen(it.date) : 'Kein Start'}${it.data.end ? ' – ' + fmtWhen(it.data.end) : ''}${it.owner_name ? ' · ' + esc(it.owner_name) : ''}</p>
      ${it.data.goal ? `<p><small class="muted">Ziel</small> ${esc(it.data.goal)}</p>` : ''}
      <div class="pf-mem"><span>${live}/${posts.length} Beiträge veröffentlicht</span>${it.data.budget ? `<span>${eur(it.data.budget)}</span>` : ''}</div>${posts.length ? bar(live / posts.length * 100) : ''}</article>`;
  },
  goal: (td, it) => {
    const cp = checkProg(it.data.checks), p = cp ? Math.round(cp[0] / cp[1] * 100) : (+it.data.progress || 0);
    const s = stOf(td, it.status);
    return `<article class="pcard2" data-id="${it.id}"><header><h3>${esc(it.title)}</h3>${stPill(td, it.status)}</header>
      <p class="muted">${esc(it.data.bereich || '')}${it.date ? ' · bis ' + fmtWhen(it.date) : ''}${it.owner_name ? ' · ' + esc(it.owner_name) : ''}</p>
      <div class="pf-mem"><span>${cp ? `☑ ${cp[0]}/${cp[1]} Teilziele` : 'Fortschritt'}</span><b>${p}%</b></div>${bar(p, s ? s.c : undefined)}</article>`;
  },
  template: (td, it) => `<article class="pcard2" data-id="${it.id}"><header><h3>${esc(it.title)}</h3><span class="tag">${esc(it.data.kind || 'Vorlage')}</span></header>
    <pre class="ptpl">${esc(it.data.text || '')}</pre><button class="btn btn-ghost sm" data-copy="${it.id}">Kopieren</button></article>`
};

// ---------- Ansicht: Kalender
function viewCalendar(td, el) {
  const src = tabDef(td.source);
  const c = PU.cal[PU.area] || (PU.cal[PU.area] = { y: new Date().getFullYear(), m: new Date().getMonth() });
  const first = new Date(c.y, c.m, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const rows = itemsOf(td.source).filter((r) => r.date);
  const days = [];
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
  const unplanned = itemsOf(td.source).filter((r) => !r.date && !['live', 'fertig', 'verworfen'].includes(r.status));
  el.innerHTML = `<div class="ptool pcal-head"><button class="btn btn-ghost sm" id="cPrev">←</button><b>${first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</b><button class="btn btn-ghost sm" id="cNext">→</button><button class="btn btn-ghost sm" id="cToday">Heute</button><span style="flex:1"></span><button class="btn btn-pink sm" id="pnew">+ ${esc(src.noun)}</button></div>
    <div class="pcal">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => `<div class="pcal-dn">${d}</div>`).join('')}
    ${days.map((d) => {
      const k = iso(d), list = rows.filter((r) => r.date.slice(0, 10) === k).sort((a, b) => a.date.localeCompare(b.date));
      return `<div class="pcal-d${d.getMonth() !== c.m ? ' out' : ''}${k === today() ? ' now' : ''}" data-day="${k}"><span class="pcal-n">${d.getDate()}</span>
        ${list.map((it) => { const s = stOf(src, it.status); const col = td.colorBy && (it.data[td.colorBy] || [])[0] ? PCOL[it.data[td.colorBy][0]] : s ? s.c : 'var(--violet)';
          return `<button class="pcal-i" data-id="${it.id}" style="--c:${col}" title="${esc(it.title)}">${it.date.length > 10 ? `<small>${it.date.slice(11, 16)}</small>` : ''}${esc(it.title)}</button>`; }).join('')}</div>`;
    }).join('')}</div>
    ${unplanned.length ? `<section class="card dpanel" style="margin-top:16px"><div class="dp-head"><h2>Noch ohne Datum (${unplanned.length})</h2></div><div class="punpl">${unplanned.map((it) => `<button class="pcal-i" data-id="${it.id}" style="--c:${stOf(src, it.status)?.c || 'var(--violet)'}">${esc(it.title)}</button>`).join('')}</div></section>` : ''}`;
  const mv = (n) => { c.m += n; if (c.m < 0) { c.m = 11; c.y--; } if (c.m > 11) { c.m = 0; c.y++; } renderTab(td); };
  $('cPrev').onclick = () => mv(-1); $('cNext').onclick = () => mv(1);
  $('cToday').onclick = () => { c.y = new Date().getFullYear(); c.m = new Date().getMonth(); renderTab(td); };
  $('pnew').onclick = () => itemDialog(src);
  el.querySelectorAll('[data-id]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); itemDialog(src, PU.items.find((i) => i.id === +b.dataset.id)); }));
  el.querySelectorAll('[data-day]').forEach((d) => (d.ondblclick = () => itemDialog(src, null, { date: d.dataset.day + (src.fields.find((f) => f.k === 'date')?.t === 'datetime' ? 'T20:00' : '') })));
  el.querySelectorAll('[data-day]').forEach((d) => (d.title = 'Doppelklick: neuer Eintrag an diesem Tag'));
}

// ---------- Ansicht: Dokumente (Liste links, Lesen rechts)
function viewDocs(td, el) {
  let rows = filtered(td);
  if (td.byDate) rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  else rows.sort((a, b) => (+!!b.data.pin - +!!a.data.pin) || a.title.localeCompare(b.title, 'de'));
  const sel = PU.doc[td.id] && rows.find((r) => r.id === PU.doc[td.id]) || rows[0];
  const groups = {};
  rows.forEach((r) => { const g = td.catKey ? (r.data[td.catKey] || 'Sonstiges') : td.byDate ? (r.date ? new Date(r.date).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) : 'Ohne Datum') : ''; (groups[g] = groups[g] || []).push(r); });
  el.innerHTML = toolbar(td) + (rows.length ? `<div class="pdocs"><aside class="pdoc-list">${Object.entries(groups).map(([g, list]) => `${g ? `<p class="pdoc-g">${esc(g)}</p>` : ''}${list.map((r) => {
    const cp = checkProg(r.data.checks || r.data.beschluesse);
    return `<button class="pdoc-i${sel && r.id === sel.id ? ' on' : ''}" data-doc="${r.id}">${r.data.pin ? '📌 ' : ''}<b>${esc(r.title)}</b><small>${r.date ? fmtWhen(r.date) + ' · ' : ''}${cp ? `☑ ${cp[0]}/${cp[1]} · ` : ''}${ago(r.updated_at)}</small></button>`; }).join('')}`).join('')}</aside>
    <article class="card pdoc-read" id="pdocRead"></article></div>` : `<div class="empty">${PU.q ? 'Nichts gefunden.' : `Noch kein ${esc(td.noun)} angelegt.`}</div>`);
  bindToolbar(td);
  el.querySelectorAll('[data-doc]').forEach((b) => (b.onclick = () => { PU.doc[td.id] = +b.dataset.doc; renderTab(td); }));
  if (!sel) return;
  const r = $('pdocRead');
  const lists = td.fields.filter((f) => f.t === 'checklist' && (sel.data[f.k] || []).length);
  r.innerHTML = `<header class="pdoc-h"><div><h2>${esc(sel.title)}</h2><p class="muted">${[sel.data.kat, sel.date && fmtWhen(sel.date), sel.owner_name && 'von ' + sel.owner_name, sel.data.teilnehmer && 'Teilnehmer: ' + sel.data.teilnehmer, 'geändert ' + ago(sel.updated_at)].filter(Boolean).map(esc).join(' · ')}</p></div><button class="btn btn-ghost sm" id="pdocEdit">Bearbeiten</button></header>
    ${lists.map((f) => `<div class="pdoc-cl"><h3>${esc(f.l)}</h3>${sel.data[f.k].map((c, i) => `<label class="chk"><input type="checkbox" data-ck="${f.k}" data-i="${i}" ${c.d ? 'checked' : ''}> <span${c.d ? ' class="done"' : ''}>${esc(c.t)}</span></label>`).join('')}</div>`).join('')}
    <div class="md">${sel.data.body ? md(sel.data.body) : '<p class="muted">Noch kein Inhalt.</p>'}</div>`;
  $('pdocEdit').onclick = () => itemDialog(td, sel);
  r.querySelectorAll('[data-ck]').forEach((cb) => (cb.onchange = async () => {
    sel.data[cb.dataset.ck][+cb.dataset.i].d = cb.checked;
    cb.nextElementSibling.classList.toggle('done', cb.checked);
    try { await api('admin/plan/' + sel.id, { method: 'PUT', body: { data: sel.data, quiet: true } }); } catch (err) { toast(err.message, 'bad'); }
  }));
}

// ---------- Ansicht: Kennzahlen (Follower-Verlauf je Plattform)
function viewStats(td, el) {
  const rows = itemsOf(td.id).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
  const byP = {};
  rows.forEach((r) => (byP[r.data.platform] = byP[r.data.platform] || []).push(r));
  const spark = (list, c) => {
    if (list.length < 2) return '';
    const v = list.map((r) => +r.data.followers || 0), mn = Math.min(...v), mx = Math.max(...v), W = 220, H = 54;
    const pts = v.map((n, i) => `${(i / (v.length - 1) * W).toFixed(1)},${(H - 4 - (mx === mn ? .5 : (n - mn) / (mx - mn)) * (H - 8)).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  };
  el.innerHTML = toolbar(td) + (rows.length ? `<div class="pstats">${Object.entries(byP).map(([p, list]) => {
    const last = list[list.length - 1], prev = list[list.length - 2], c = PCOL[p] || 'var(--pink)';
    const diff = prev ? (+last.data.followers || 0) - (+prev.data.followers || 0) : null;
    return `<div class="pstat" style="--c:${c}"><header><span class="pchip" style="--c:${c}">${esc(PLATFORMS[p] || p)}</span><small class="muted">${fmtWhen(last.date)}</small></header>
      <b>${(+last.data.followers || 0).toLocaleString('de-DE')}</b>${diff !== null ? `<span class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲ +' : '▼ '}${diff.toLocaleString('de-DE')} seit ${fmtWhen(prev.date)}</span>` : '<span class="muted">Erster Messwert</span>'}
      ${spark(list, c)}</div>`; }).join('')}</div>
    <h3 class="psub">Alle Messwerte</h3><div class="table-wrap"><table class="ptable"><thead><tr><th>Datum</th><th>Plattform</th><th>Follower</th><th>Aufrufe (7 T.)</th><th>Notiz</th></tr></thead><tbody>
    ${rows.slice().reverse().map((r) => `<tr data-id="${r.id}"><td>${fmtWhen(r.date)}</td><td>${esc(PLATFORMS[r.data.platform] || r.data.platform)}</td><td class="num">${(+r.data.followers || 0).toLocaleString('de-DE')}</td><td class="num">${r.data.views ? (+r.data.views).toLocaleString('de-DE') : '–'}</td><td>${esc(r.data.notes || '')}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">Trag einmal pro Woche eure Follower-Zahlen ein, dann siehst du hier, wie jeder Kanal wächst.</div>');
  bindToolbar(td);
  el.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => itemDialog(td, PU.items.find((i) => i.id === +tr.dataset.id))));
}

// ---------- Ansicht: Finanzen
function viewFinance(td, el) {
  const rows = filtered(td).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  const all = itemsOf(td.id), s = finSum(all);
  const month = today().slice(0, 7), m = finSum(all.filter((r) => (r.date || '').startsWith(month)));
  const cats = {};
  all.filter((r) => r.data.typ !== 'einnahme').forEach((r) => (cats[r.data.kat || 'Sonstiges'] = (cats[r.data.kat || 'Sonstiges'] || 0) + (+r.data.betrag || 0)));
  const mx = Math.max(1, ...Object.values(cats));
  el.innerHTML = toolbar(td) + `<div class="pfin">
    <div class="pstat"><span class="muted">Einnahmen gesamt</span><b class="up">${eur(s.inc)}</b></div>
    <div class="pstat"><span class="muted">Ausgaben gesamt</span><b class="down">${eur(s.out)}</b></div>
    <div class="pstat"><span class="muted">Dieser Monat</span><b class="${m.saldo < 0 ? 'down' : 'up'}">${eur(m.saldo)}</b></div>
    <div class="pstat"><span class="muted">Laufende Kosten / Monat</span><b>${eur(s.monthly)}</b></div></div>
    ${Object.keys(cats).length ? `<section class="card dpanel" style="margin:0 0 16px"><div class="dp-head"><h2>Ausgaben nach Kategorie</h2></div>${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="pfin-row"><span>${esc(k)}</span>${bar(v / mx * 100)}<b>${eur(v)}</b></div>`).join('')}</section>` : ''}
    ${rows.length ? `<div class="table-wrap"><table class="ptable"><thead><tr><th>Datum</th><th>Beschreibung</th><th>Kategorie</th><th>Wiederholung</th><th style="text-align:right">Betrag</th></tr></thead><tbody>
    ${rows.map((r) => `<tr data-id="${r.id}"><td>${fmtWhen(r.date)}</td><td><b>${esc(r.title)}</b></td><td>${esc(r.data.kat || '')}</td><td>${esc({ monatlich: 'monatlich', jaehrlich: 'jährlich' }[r.data.repeat] || '')}</td><td class="num ${r.data.typ === 'einnahme' ? 'up' : 'down'}" style="text-align:right">${r.data.typ === 'einnahme' ? '+' : '−'}${eur(r.data.betrag)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">Trag Server-Miete, Script-Käufe und Spenden ein, dann siehst du hier, was das Projekt kostet.</div>'}`;
  bindToolbar(td);
  el.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => itemDialog(td, PU.items.find((i) => i.id === +tr.dataset.id))));
}

// ---------- Dialog: Eintrag anlegen / bearbeiten
function fieldHtml(td, f, it, pre) {
  const v0 = it ? val(it, f.k) : pre[f.k] !== undefined ? pre[f.k] : f.k === 'owner' && f.me ? me.id : f.today ? today() : f.k === 'status' && td.statuses ? td.statuses[0].v : f.t === 'select' && f.o ? Object.keys(f.o)[0] : f.def !== undefined && f.t !== 'checklist' ? f.def : '';
  const v = v0 ?? '';
  const cls = 'field' + (f.full || ['textarea', 'md', 'checklist', 'multi'].includes(f.t) ? ' full' : '');
  const L = `<span>${esc(f.l)}${f.req ? '' : ''}</span>`;
  const n = `name="${f.k}"`;
  switch (f.t) {
    case 'status': return `<label class="${cls}">${L}<select ${n}>${td.statuses.map((s) => `<option value="${s.v}"${s.v === v ? ' selected' : ''}>${esc(s.l)}</option>`).join('')}</select></label>`;
    case 'owner': return `<label class="${cls}">${L}<select ${n}><option value="">Niemand</option>${opts(Object.fromEntries(PU.team.map((p) => [p.id, p.name])), v)}</select></label>`;
    case 'select': return `<label class="${cls}">${L}<select ${n}><option value="">–</option>${opts(f.o, v)}</select></label>`;
    case 'ref': return `<label class="${cls}">${L}<select ${n}${f.req ? ' required' : ''}><option value="">–</option>${opts(Object.fromEntries(itemsOf(f.tab).map((r) => [r.id, r.title])), v)}</select></label>`;
    case 'date': return `<label class="${cls}">${L}<input type="date" ${n} value="${esc(String(v).slice(0, 10))}"></label>`;
    case 'datetime': return `<label class="${cls}">${L}<input type="datetime-local" ${n} value="${esc(String(v).length === 10 ? v + 'T20:00' : v)}"></label>`;
    case 'number': return `<label class="${cls}">${L}<input type="number" ${n} step="${f.step || 'any'}" value="${esc(v)}"${f.req ? ' required' : ''}></label>`;
    case 'url': return `<label class="${cls}">${L}<input type="url" ${n} value="${esc(v)}" placeholder="https://…" spellcheck="false"${f.req ? ' required' : ''}></label>`;
    case 'color': return `<label class="${cls}">${L}<input type="color" ${n} value="${esc(v || '#8b5cf6')}" class="pcolor"></label>`;
    case 'bool': return `<div class="${cls} pbool"><span>&nbsp;</span><label class="chk"><input type="checkbox" ${n} ${v ? 'checked' : ''}> ${esc(f.l)}</label></div>`;
    case 'rating': return `<div class="${cls}">${L}<div class="prate" data-rate="${f.k}">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-r="${i}" class="${i <= +v ? 'on' : ''}">★</button>`).join('')}<input type="hidden" ${n} value="${esc(v)}"></div></div>`;
    case 'multi': return `<div class="${cls}">${L}<div class="pmulti" data-multi="${f.k}">${Object.entries(f.o).map(([k, l]) => `<label class="pchip sel${(Array.isArray(v) ? v : []).includes(k) ? ' on' : ''}" style="--c:${PCOL[k] || 'var(--violet)'}"><input type="checkbox" value="${esc(k)}" ${(Array.isArray(v) ? v : []).includes(k) ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div></div>`;
    case 'checklist': {
      const list = Array.isArray(v) && v.length ? v : !it && f.def ? f.def.map((t) => ({ t, d: false })) : [];
      return `<div class="${cls}">${L}<div class="pcl" data-cl="${f.k}">${list.map((c) => clRow(c)).join('')}</div><button type="button" class="mini" data-cladd="${f.k}">+ Punkt</button></div>`;
    }
    case 'md': return `<label class="${cls}">${L}<textarea ${n} class="pmd" placeholder="Markdown geht: ## Überschrift, **fett**, - Liste, [Link](https://…)">${esc(v || (!it && f.def) || '')}</textarea></label>`;
    case 'textarea': return `<label class="${cls}">${L}${f.copy && v ? `<button type="button" class="mini pcopy" data-copyf="${f.k}">📋 Kopieren</button>` : ''}<textarea ${n} rows="${f.rows || 3}" placeholder="${esc(f.ph || '')}">${esc(v)}</textarea></label>`;
    default: return `<label class="${cls}">${L}<input ${n} value="${esc(v)}" maxlength="${f.k === 'title' ? 160 : 500}" placeholder="${esc(f.ph || '')}"${f.req ? ' required' : ''}></label>`;
  }
}
const clRow = (c) => `<div class="pcl-r"><input type="checkbox" ${c.d ? 'checked' : ''}><input class="pcl-t" value="${esc(c.t)}" maxlength="200" placeholder="Was ist zu tun?"><button type="button" class="mini" data-cldel aria-label="Entfernen">×</button></div>`;

function itemDialog(td, it, pre = {}) {
  const edit = !!it;
  const fields = td.fields;
  let html = '', sec = '';
  for (const f of fields) {
    if (f.sec && f.sec !== sec) { sec = f.sec; html += `<p class="psec full">${esc(sec)}</p>`; }
    html += fieldHtml(td, f, it, pre);
  }
  const canDel = edit && (it.created_by === me.id || me.role === 'owner');
  const dlg = openDialog(`<form class="form main" style="gap:14px">${dlgHead(edit ? `${esc(td.noun)} bearbeiten` : `${esc(td.noun)} anlegen`)}
    <div class="pform">${html}</div>
    ${edit ? `<p class="muted pmeta">Angelegt ${it.creator_name ? 'von ' + esc(it.creator_name) + ' ' : ''}${ago(it.created_at)} · zuletzt geändert ${ago(it.updated_at)}</p>` : ''}
    <div class="dlg-foot">${canDel ? '<button type="button" class="btn btn-ghost sm" data-del>Löschen</button>' : '<span></span>'}<span class="row">${edit && td.action ? `<button type="button" class="btn btn-ghost sm" id="pAct">${esc(td.action.label)}</button>` : ''}<button class="btn btn-pink" type="submit">${edit ? 'Speichern' : 'Anlegen'}</button></span></div></form>`,
  async (fd, form) => {
    const body = collect(td, form, it);
    if (!body.title) throw new Error('Bitte gib einen Titel ein.');
    if (edit) await api('admin/plan/' + it.id, { method: 'PUT', body });
    else await api('admin/plan', { method: 'POST', body: { area: PU.area, tab: td.id, ...body } });
    if (edit && body.status !== it.status && ['live', 'fertig', 'angenommen', 'erreicht', 'umgesetzt'].includes(body.status)) confetti();
    toast(edit ? 'Gespeichert.' : `${td.noun} angelegt.`);
  }, async () => { await api('admin/plan/' + it.id, { method: 'DELETE' }); toast('Gelöscht.'); },
  { wide: true, noFocus: edit, onClose: () => { if (/^#plan-/.test(location.hash)) history.replaceState(null, '', `#${PA[PU.area].nav}-${PU.tab}`); showPlan(PA[PU.area].nav, PU.tab); } });
  // Checklisten
  dlg.querySelectorAll('[data-cladd]').forEach((b) => (b.onclick = () => { const box = dlg.querySelector(`[data-cl="${b.dataset.cladd}"]`); box.insertAdjacentHTML('beforeend', clRow({ t: '', d: false })); box.lastElementChild.querySelector('.pcl-t').focus(); }));
  dlg.addEventListener('click', (e) => { const x = e.target.closest('[data-cldel]'); if (x) x.closest('.pcl-r').remove(); });
  dlg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('pcl-t')) { e.preventDefault(); e.target.closest('.pcl').insertAdjacentHTML('beforeend', clRow({ t: '', d: false })); e.target.closest('.pcl').lastElementChild.querySelector('.pcl-t').focus(); } });
  // Mehrfachauswahl, Sterne, Kopieren
  dlg.querySelectorAll('.pmulti input').forEach((c) => (c.onchange = () => c.parentElement.classList.toggle('on', c.checked)));
  dlg.querySelectorAll('[data-rate]').forEach((box) => box.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => {
    const inp = box.querySelector('input'), n = inp.value === b.dataset.r ? '' : b.dataset.r; inp.value = n;
    box.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', +x.dataset.r <= +n));
  })));
  dlg.querySelectorAll('[data-copyf]').forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(dlg.querySelector(`[name="${b.dataset.copyf}"]`).value); toast('Kopiert.'); } catch {} }));
  // Übernehmen (Idee → Plan, Bewerbung → Fraktion)
  const ab = dlg.querySelector('#pAct');
  if (ab) ab.onclick = async () => {
    ab.disabled = true;
    try {
      const cur = { ...it, ...collect(td, dlg.querySelector('form.main'), it) };
      const x = td.action.map(cur);
      const r = await api('admin/plan', { method: 'POST', body: { area: PU.area, tab: td.action.to, ...x } });
      await api('admin/plan/' + it.id, { method: 'PUT', body: { ...collect(td, dlg.querySelector('form.main'), it), status: td.action.set } });
      toast(`Übernommen: ${x.title}`); confetti();
      PU.tab = td.action.to; dlg.close();
      setTimeout(() => { location.hash = `#${PA[PU.area].nav}-${td.action.to}`; }, 50);
      void r;
    } catch (err) { toast(err.message, 'bad'); ab.disabled = false; }
  };
  return dlg;
}
function collect(td, form, it) {
  const data = { ...(it ? it.data : {}) }, out = { data };
  for (const f of td.fields) {
    let v;
    if (f.t === 'checklist') v = [...form.querySelectorAll(`[data-cl="${f.k}"] .pcl-r`)].map((r) => ({ t: r.querySelector('.pcl-t').value.trim(), d: r.querySelector('input[type=checkbox]').checked })).filter((c) => c.t);
    else if (f.t === 'multi') v = [...form.querySelectorAll(`[data-multi="${f.k}"] input:checked`)].map((c) => c.value);
    else if (f.t === 'bool') v = form.querySelector(`[name="${f.k}"]`).checked;
    else { const el = form.querySelector(`[name="${f.k}"]`); v = el ? el.value.trim() : ''; if (f.t === 'number' && v !== '') v = +v; if (f.t === 'ref' && v !== '') v = +v; }
    if (f.k === 'title') out.title = v; else if (f.k === 'status') out.status = v; else if (f.k === 'date') out.date = v || null; else if (f.k === 'owner') out.owner_id = v || null; else data[f.k] = v;
  }
  if (!out.title && td.autoTitle) out.title = td.autoTitle(data);
  if (!td.fields.some((f) => f.k === 'title') && td.autoTitle) out.title = td.autoTitle(data);
  if (!td.fields.some((f) => f.k === 'status') && !td.statuses) out.status = null;
  return out;
}

async function openPlanItem(id) {
  try {
    const { item } = await api('admin/plan/' + id);
    const nav = PA[item.area].nav;
    history.replaceState(null, '', `#${nav}-${item.tab}`);
    PU.area = item.area;
    const td = PA[item.area].tabs.find((t) => t.id === item.tab);
    if (td.view === 'docs') PU.doc[item.tab] = item.id;
    return showPlan(nav, item.tab, td.view === 'docs' ? null : item.id);
  } catch (e) { errBox(e); }
}

// ---------- Seitenleiste: jede Planung ist eine eigene Kategorie mit Unterpunkten (auf- und zuklappbar)
const NAV_EXTRA = { social: [{ href: '#social', nav: 'social', icon: '🔗', label: 'Social-Links (Website)' }] };
function buildPlanNav() {
  const box = document.getElementById('planNav'); if (!box) return;
  let open = {}; try { open = JSON.parse(localStorage.getItem('rls_navopen') || '{}'); } catch {}
  box.outerHTML = Object.entries(PA).map(([k, A]) => {
    const links = A.tabs.filter((t) => t.view !== 'link').map((t) => ({ href: `#${A.nav}-${t.id}`, nav: `${A.nav}-${t.id}`, icon: t.icon, label: t.label })).concat(NAV_EXTRA[k] || []);
    return `<div class="sb-cat${open[A.nav] ? ' open' : ''}" data-cat="${A.nav}" data-navs="${links.map((l) => l.nav).join(' ')}">
      <button type="button" class="sb-cat-h">${ico(A.icon)}${esc(A.title)}<i>›</i></button>
      <div class="sb-cat-b">${links.map((l) => `<a href="${l.href}" data-nav="${l.nav}">${ico(l.icon)}${esc(l.label)}</a>`).join('')}</div></div>`;
  }).join('');
  document.querySelectorAll('.sb-cat-h').forEach((h) => (h.onclick = () => {
    const c = h.parentElement; c.classList.toggle('open');
    try { const o = JSON.parse(localStorage.getItem('rls_navopen') || '{}'); o[c.dataset.cat] = c.classList.contains('open'); localStorage.setItem('rls_navopen', JSON.stringify(o)); } catch {}
  }));
}
function planNavSync(view) {
  document.querySelectorAll('.sb-cat').forEach((c) => { const has = c.dataset.navs.split(' ').includes(view); c.classList.toggle('has-on', has); if (has) c.classList.add('open'); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPlanNav); else setTimeout(buildPlanNav);
