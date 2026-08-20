# Sommerkino Quiz 2000 – Version 2

## URLs

**Spieler:** normale GitHub-Pages-URL  
**Host/Beamer:** dieselbe URL mit `?host=2026`

Beispiel:
`https://DEINNAME.github.io/REPO/?host=2026`

Der Host-Modus ist damit komplett von der Spieleroberfläche getrennt.

## Ablauf

1. GitHub Pages aktivieren.
2. Auf dem Beamer die Host-URL öffnen.
3. Spieler öffnen die normale URL.
4. Namen + Icon auswählen.
5. Host startet das Quiz.
6. Antworten werden live an den Host übertragen.

Der Beamer ist weiterhin der zentrale Spielserver; es wird keine Datenbank benötigt.

## Hinweis

Für einen öffentlichen Einsatz mit vielen Geräten sollte die Verbindung vorher mit dem tatsächlichen WLAN getestet werden. PeerJS übernimmt die Peer-to-Peer-Verbindung; bei Verbindungsabbruch versucht die Spieler-Seite automatisch einen Reconnect.
