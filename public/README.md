# Real Life Southland – Website

Offizielle Website von **Real Life Southland III** mit Team-Bewerbung und Team-Panel.
Läuft auf **Cloudflare Pages**, die Daten liegen in **Cloudflare D1**.

## Aufbau
| Ordner / Datei | Inhalt |
|---|---|
| `public/` | Alle Seiten, Bilder und das CSS (das, was Besucher sehen) |
| `public/admin/` | Team-Panel |
| `functions/api/[[path]].js` | Die Schnittstelle zur Datenbank (Bewerbungen, Login, Team) |
| `src/worker.js` | Startpunkt des Workers |
| `wrangler.toml` | Einstellungen für Cloudflare (Name, Datenbank) |
| `schema.sql` | Aufbau der Datenbank-Tabellen |

## Einrichtung in Cloudflare (einmalig) – als Worker

**1. Datenbank-ID eintragen**
Cloudflare → **Speicher & Datenbanken** → **D1** → `southland` → **Datenbank-ID** kopieren.
In `wrangler.toml` bei `database_id` einfügen. Bei `name` den Namen deines Workers eintragen.

**2. Worker mit GitHub verbinden**
Cloudflare → **Workers & Pages** → **Erstellen** → **Repository importieren** → dieses Repository wählen.
- Build-Befehl: **leer**
- Bereitstellungsbefehl: `npx wrangler deploy` (Standard)

Die Seiten (`public`), die Datenbank und die Schnittstelle kommen automatisch aus `wrangler.toml`.

**3. Einrichtungsschlüssel**
Im Worker → **Einstellungen** → **Variablen und Geheimnisse** → **Hinzufügen** → Typ **Geheimnis**
- `SETUP_KEY` = ein selbst ausgedachtes Wort
- optional `DISCORD_WEBHOOK` = Webhook-URL eures Team-Kanals

**4. Konto anlegen**
`https://DEIN-WORKER.DEIN-NAME.workers.dev/admin/` öffnen → Einrichtungsschlüssel eingeben → Owner-Konto anlegen.

## Optionale Einstellungen
In `wrangler.toml` unter `[vars]` (danach auf GitHub speichern):

| Name | Standard | Bedeutung |
|---|---|---|
| `MIN_AGE` | 16 | Mindestalter fürs Team |
| `COOLDOWN_DAYS` | 7 | Wartezeit nach einer Ablehnung |
| `DELETE_AFTER_DAYS` | 90 | Entschiedene Bewerbungen nach X Tagen löschen (0 = nie) |
| `SITE_URL` | – | z. B. `https://southland-rp.de`, für Links in Discord-Nachrichten |

## Datenbank-Tabellen
Falls die Datenbank `southland` noch leer ist: Cloudflare → **Speicher & Datenbanken** → **D1** → `southland` → **Konsole**,
den Inhalt von `schema.sql` hineinkopieren und ausführen.

## Änderungen
Datei hier auf GitHub bearbeiten oder neu hochladen → **Commit changes** → nach 1–2 Minuten ist die Website aktualisiert.
Die Datenbank bleibt dabei unverändert.

## Team-Panel (`/admin/`)
**Admin:** Übersicht mit Pinnwand und Live-Aktivität, Bewerbungen, Spielerakten (Verwarnungen, Kicks, Bans mit Dauer), Website-News (erscheinen automatisch auf der Startseite), Team-Konten, Protokoll aller Änderungen, Einstellungen.
**Regelwerk:** Kapitel, Paragraphen und Strafkatalog im Panel unter „Regelwerk“ bearbeiten und veröffentlichen, mit Versionsverlauf. Die Seite regelwerk.html lädt automatisch die neueste Version.
**Team:** Teamliste mit Rängen, Bereichen, Probezeit und Einarbeitungs-Checkliste, Teamakte (Lob, Hinweis, Team-Verwarnung), Kalender mit Zu-/Absagen, Tagesordnung und Meeting-Protokoll, Abwesenheiten, Abstimmungen, Textbausteine, Team-Statistik.
**Dev:** To-do-Board (Ziehen oder Pfeile), Aufgaben mit Checkliste und Kommentaren, Roadmap mit Meilensteinen, Bug-Tracker, Scripts-Liste, Wiki.
**Live:** Änderungen anderer Teammitglieder erscheinen nach wenigen Sekunden von selbst, inklusive „Gerade online“. **Strg + K** öffnet die Schnellsuche.
Alle Tabellen legt das Panel beim ersten Anmelden selbst an.
