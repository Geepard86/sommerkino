# Sommerkino Quiz 2000 – Supabase V3

Diese Version verwendet **Supabase Realtime Broadcast + Presence** statt PeerJS.
Dadurch braucht die Website keine eigene Peer-Verbindung und keine eigene Serverinstanz.

## URLs

Spieler:
`https://DEINNAME.github.io/REPO/`

Host:
`https://DEINNAME.github.io/REPO/?host=2026`

## Supabase

Die Projekt-URL und der Publishable Key stehen in `config.js`.

Der `sb_publishable_...` Key ist für Client-Code gedacht und darf in einer GitHub-Pages-Seite stehen. Niemals einen `sb_secret_...` oder `service_role` Key in `config.js` eintragen.

## Keine SQL-Tabelle nötig

Für die Quiz-Synchronisation wird Supabase Realtime verwendet. Der aktuelle Spielstand liegt im Host-Browser; Supabase verteilt Events und Presence an alle Clients.

## GitHub Pages

Alle Dateien des Ordners ins Repository legen und GitHub Pages auf den Branch aktivieren.
