# Sommerkino Quiz 2000 – V4

Kahoot-artiger Ablauf mit Supabase Realtime.

## Ablauf
1. Host zeigt zunächst nur die Frage auf dem Beamer.
2. Host startet die Antwortphase.
3. Beamer + alle Handys zeigen gleichzeitig die 20 Sekunden.
4. Spieler wählen eine Antwort.
5. Sofort erscheint: **ANTWORT GESPEICHERT – SCHAU AUF DEN BEAMER**.
6. Antwort wird gesperrt.
7. Nach Ablauf: animierte Auswertung, schnellste richtige Antwort und Gesamtstand.
8. Host klickt **NÄCHSTE FRAGE**.

## Spieler-Refresh
Name, Icon und eine stabile Spieler-ID werden in `localStorage` gespeichert. Nach einem Refresh wird der Spieler automatisch wieder mit derselben Identität angemeldet.

## Punkte
Richtige Antworten starten bei 1000 Punkten und sinken mit der Antwortzeit bis auf mindestens 100 Punkte. Falsche Antworten geben 0 Punkte.

## URLs
Spieler: normale GitHub-Pages-URL
Host: `?host=2026`

Keine SQL-Tabelle erforderlich; Supabase Realtime Broadcast/Presence wird als Spielkanal verwendet.
