# Sommerkino Quiz – V8

Änderungen gegenüber V7 (alle 8 ToDos umgesetzt):

1. **Icons in der Auswahl**: Das Emoji wurde doppelt gerendert (einmal im `<span class="icon">`, einmal als Text daneben) – jetzt nur noch einmal, außerdem deutlich kleiner (40px → 28px) und mit kompakterem Button-Padding.

2. **Schätzfragen-Scoring**: Vorher gab `isCorrect()` für `type:"estimate"` immer `false` zurück – Schätzfragen brachten also **nie** Punkte (Bug). Jetzt werden alle abgegebenen Schätzungen nach Abstand zur richtigen Zahl sortiert; wer am nächsten dran ist, bekommt 1000 Punkte, jeder Rang danach 150 weniger (Minimum 100). Bei exakt gleichem Abstand entscheidet die schnellere Antwortzeit.

3. **Asynchroner Countdown**: Der Player-Countdown wurde rein aus der lokalen Gerätezeit berechnet – bei abweichender Systemuhr (z.B. Beamer-Laptop 1s vor) lief er entsprechend versetzt. Jeder `host_state`-Broadcast enthält jetzt einen Zeitstempel der Host-Uhr (`hostNow`); jedes Handy berechnet daraus laufend einen geglätteten Uhren-Offset und gleicht den eigenen Countdown/die Antwortzeit-Messung damit ab.

4. **Drag & Drop beim Anordnen**: Die "Reihenfolge"-Frage hatte weder auf dem Handy noch auf dem Beamer eine funktionierende Umsetzung (Beamer zeigte gar keine Liste, Handy nur Klick-Tausch-mit-Nachbar). Jetzt gibt es echtes, Touch- und Maus-taugliches Drag & Drop über Pointer Events (Ziehen am ☰-Griff), und der Beamer zeigt die Ausgangsreihenfolge zur Orientierung mit an.

5. **"Neu anmelden" weniger prominent**: Der große Button auf jedem Screen ist weg. Stattdessen sitzt ein dezenter Link oben in der Kopfleiste (nur für Spieler:innen sichtbar), der vor dem Zurücksetzen erst eine Bestätigung verlangt (`confirm()`).

6. **Funfact bei der Auswertung**: Die Beamer- und die Handy-Auswertung zeigen jetzt zusätzlich zur richtigen Antwort das Feld `fact` aus `questions.json`, falls für die Frage vorhanden.

7. **Robuste Wiederverbindung nach Sperrbildschirm**: Nach Bildschirmsperre/Hintergrund kann die Realtime-Verbindung stillschweigend einschlafen, ohne dass ein Fehler auftritt. Neu: Beim Sichtbarwerden der Seite (`visibilitychange`, `pageshow`, `focus`, `online`) wird automatisch neu synchronisiert (Channel-Status geprüft, ggf. neu abonniert, aktueller Stand angefragt). Klappt das nicht innerhalb von 4 Sekunden, lädt die Seite automatisch neu – dank der gespeicherten Spieler-Identität in `localStorage` landet man dabei zuverlässig wieder exakt dort, wo man war.

8. **Siegerehrung am Ende**: Der Beamer zeigt nach der letzten Frage nicht mehr sofort die volle Rangliste, sondern eine Siegerehrung mit "???"-Platzhaltern für die Top 3. Über einen Button werden nacheinander erst der dritte, dann der zweite, dann der erste Platz enthüllt; erst danach erscheinen die volle Endabrechnung und der "Neues Spiel"-Button.

## Nebenbei entdeckte/behobene kleinere Bugs
- Der Podium-Block in der Auswertung sortierte nach Antwortzeit statt nach erzielten Rundenpunkten – bei Schätzfragen (Ranking nach Nähe, nicht Zeit) hätte das eine falsche Podium-Reihenfolge ergeben. Jetzt Sortierung nach `roundPoints`.
- Während der Antwortphase hat jeder eingehende `host_state`-Broadcast (ausgelöst durch die Antwort eines *anderen* Spielers) den kompletten Bildschirm neu aufgebaut – damit wären eine laufende Drag&Drop-Sortierung oder eine angefangene Texteingabe verloren gegangen. Wird jetzt erkannt und unterdrückt, solange sich Frage/Phase nicht ändert.

## Ablauf pro Frage (unverändert)
1. Die Frage wird synchron Zeichen für Zeichen eingeblendet (~65 ms/Zeichen).
2. Nach dem letzten Buchstaben 2 Sekunden Pause.
3. Antwortmöglichkeiten erscheinen synchron auf Beamer und Handys, 20-Sekunden-Countdown startet.
4. Sobald alle geantwortet haben oder der Timer 0 erreicht, folgt automatisch die Auswertung.

## Hinweis zum Testen
Diese Version wurde nicht gegen eine echte Supabase-Realtime-Verbindung getestet (kein Netzwerkzugriff in dieser Umgebung), nur `node --check app.js` auf Syntaxfehler geprüft. Bitte vor dem Event einmal mit zwei Geräten (Beamer + mind. 1 Handy) durchklicken, insbesondere Drag & Drop auf einem echten Touchscreen und den Sperrbildschirm-Fall.
