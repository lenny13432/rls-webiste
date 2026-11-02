# Real Life Southland – Website

Offizielle Website von **Real Life Southland III** mit Team-Bewerbung und Team-Panel.
Läuft auf **Cloudflare Pages**, die Daten liegen in **Cloudflare D1**.

## Aufbau
| Ordner / Datei | Inhalt |
|---|---|
| `public/` | Alle Seiten, Bilder und das CSS (das, was Besucher sehen) |
| `public/admin/` | Team-Panel |
| `functions/api/[[path]].js` | Die Schnittstelle zur Datenbank (Bewerbungen, Login, Team) |
| `schema.sql` | Aufbau der Datenbank-Tabellen |

## Einrichtung in Cloudflare (einmalig)

**1. Projekt mit GitHub verbinden**
Cloudflare → **Workers & Pages** → **Erstellen** → **Pages** → **Mit Git verbinden** → dieses Repository wählen.
- Framework-Voreinstellung: **Keine**
- Build-Befehl: **leer**
- Ausgabeverzeichnis: **`public`**

→ **Speichern und bereitstellen**

**2. Datenbank verbinden**
Im Pages-Projekt → **Einstellungen** → **Bindungen** → **Hinzufügen** → **D1-Datenbank**
- Variablenname: **`DB`** (genau so, großgeschrieben)
- Datenbank: **`southland`**

**3. Einrichtungsschlüssel**
**Einstellungen** → **Variablen und Geheimnisse** → **Hinzufügen** → Typ **Geheimnis**
- `SETUP_KEY` = ein selbst ausgedachtes Wort (brauchst du gleich zum Anlegen deines Kontos)
- optional `DISCORD_WEBHOOK` = Webhook-URL eures Team-Kanals

**4. Neu bereitstellen**
**Bereitstellungen** → bei der neuesten auf **⋯** → **Erneut versuchen**. Erst dann gelten Datenbank und Schlüssel.

**5. Konto anlegen**
`https://DEIN-PROJEKT.pages.dev/admin/` öffnen → Einrichtungsschlüssel eingeben → Owner-Konto anlegen.

## Optionale Einstellungen
Unter **Variablen und Geheimnisse** als normale Variable (Typ **Text**):

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
