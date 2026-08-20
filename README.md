# Sommerkino Quiz 2000

Statische Kahoot-ähnliche Quiz-Website für GitHub Pages.

## Architektur
- **Kein eigener Server nötig:** Der Beamer ist der Host.
- **Synchronisation:** Browser-zu-Browser über PeerJS.
- **Raum:** `SOMMERKINO-2026` (in `app.js` ändern, falls gewünscht).
- **Fragen:** `questions.json` – leicht editierbar.
- **Design:** VHS/Video-Store/Arcade-Ästhetik der 2000er.

## Start
1. Alle Dateien in ein GitHub-Repository laden.
2. GitHub → Settings → Pages → Deploy from branch → `main` / `/root`.
3. Die URL öffnen.
4. Auf dem Beamer **BEAMER / HOST** drücken.
5. Auf den Handys dieselbe URL öffnen und Namen/Icon wählen.

## Wichtiger Hinweis
n:point ist für diesen Anwendungsfall nicht ideal: Laut aktueller Doku ist es primär ein GET-basierter JSON-Speicher; API-Schreibzugriffe sind weiterhin private beta und n:point bezeichnet sich selbst nicht als vollständiges Backend. Für die reine Quiz-Synchronisation übernimmt deshalb der Beamer die Rolle des Servers. citeturn0search0

Wenn du später echtes Reconnect, persistente Räume, Moderations-Login oder mehrere parallele Räume brauchst, wäre eine kleine Realtime-Datenbank (z. B. Supabase/Firebase) die robustere nächste Stufe.
