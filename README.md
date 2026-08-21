# Sommerkino Quiz – V7

Änderungen gegenüber V6:

## Gefundene & behobene Bugs
- `showAnswers()` rief `runCountdown()` auf, definiert war aber `runHostCountdown()` -> der Antwort-Timer startete nie richtig (JS-Fehler).
- Auf dem Beamer (`renderHost`) fehlte komplett der Fall `phase==="answers"` -> während der ganzen Antwortzeit wurde fälschlich der "Spiel beendet"-Screen gezeigt.

## Umgesetzte ToDos
1. **Kein Scrollen auf dem Handy**: Frage, Timer und alle Antwortmöglichkeiten stecken jetzt in einem `#gv`-Container mit `height:100dvh`. Ein JS-Fit (`fitViewport()`) skaliert Schriftgröße/Abstände per Binärsuche so weit runter, bis alles ohne Scrollen passt – funktioniert unabhängig von Fragetyp/-länge und Displaygröße.
2. **Countdown endet vorzeitig**: Sobald alle Spieler geantwortet haben, ruft der Host sofort `endQuestion()` auf (Bug oben behoben, damit der Timer überhaupt zuverlässig läuft und stoppt).
3. **Neues Spiel = alle neu anmelden**: Jeder Spielstart bekommt eine neue `gameId`. Beim Reset wird sofort ein `reset_game`-Broadcast verschickt (aktive Geräte springen sofort zur Anmeldung zurück). Geräte, die offline waren, vergleichen beim nächsten Verbinden ihre gespeicherte `gameId` mit der aktuellen und werden bei Unterschied ebenfalls zur Anmeldung geschickt (`force_rejoin`). Es gibt keine echte Datenbank – nur den In-Memory-State des Host-Tabs plus `localStorage` je Handy; das wird beides zurückgesetzt.
4. **Selbst zurücksetzen**: Neuer Button "🔄 Neu anmelden" auf Warte-/Auswertungs-/Endscreen des Spielers. Löscht `localStorage`, meldet den Spieler beim Host ab und zeigt die Anmeldung erneut.
5. **Antwortmöglichkeiten auch auf dem Beamer**: Neue gemeinsame Funktion `answerAreaHtml()` rendert für Host und Handy exakt dasselbe Markup (nur auf dem Beamer nicht klickbar), inkl. Live-Zähler "X / Y geantwortet".
6. **Sounds**: `soundCountdown()` war im Code vorhanden, wurde aber nirgends aufgerufen – jetzt läuft sie in der Host-Countdown-Schleife und piept ab 5 Sekunden. "Neue Frage" (`soundNewQuestion`) und "Auswertung" (`soundResult`) liefen schon vorher.

Alle Sounds spielen bewusst nur auf dem Host-/Beamer-Gerät (wie im Original), da davon ausgegangen wird, dass dort die Lautsprecher für den ganzen Raum hängen.

## Ablauf pro Frage (unverändert)
1. Die Frage wird synchron Zeichen für Zeichen eingeblendet (~65 ms/Zeichen).
2. Nach dem letzten Buchstaben 2 Sekunden Pause.
3. Antwortmöglichkeiten erscheinen synchron auf Beamer und Handys, 20-Sekunden-Countdown startet.
4. Sobald alle geantwortet haben oder der Timer 0 erreicht, folgt automatisch die Auswertung.
