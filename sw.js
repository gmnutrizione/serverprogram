// Service worker di "GM - Nutrizione e Benessere"
// ------------------------------------------------
// Serve solo a far APRIRE L'APP PIÙ VELOCEMENTE: salva sul telefono il "guscio" dell'app
// (questo file principale, le icone, i caratteri, le librerie esterne) così le aperture
// successive non devono riscaricare tutto da zero ogni volta.
//
// NON tocca mai i dati del programma (login, pazienti, misurazioni, piano, ricette, alimenti):
// quelle richieste vanno sempre e solo a Google Apps Script, in diretta, esattamente come prima.
// Se qualcosa qui dentro fallisce o il browser non supporta i service worker, l'app continua a
// funzionare normalmente, solo senza questo miglioramento di velocità.

var CACHE_NOME = 'gm-app-shell-v2'; // cambiare questo nome (es. v3) forza tutti i telefoni a
                                     // scaricare di nuovo il guscio dell'app alla prossima apertura

var FILE_DA_PRECARICARE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', function (evento) {
  self.skipWaiting();
  evento.waitUntil(
    caches.open(CACHE_NOME).then(function (cache) {
      return cache.addAll(FILE_DA_PRECARICARE);
    })
  );
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nomiCache) {
      return Promise.all(
        nomiCache
          .filter(function (nome) { return nome !== CACHE_NOME; })
          .map(function (nome) { return caches.delete(nome); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

// Solo questi indirizzi vengono gestiti dalla cache (il sito stesso, i caratteri di Google Fonts,
// la libreria caricata da cdnjs). Tutto il resto — soprattutto Google Apps Script (i dati) e le
// foto delle ricette da Google Drive — passa sempre e solo dalla rete, esattamente come senza
// questo file: il comportamento del programma non cambia in nulla, cambia solo la velocità con
// cui si apre.
function fasciaDaMettereInCache_(url) {
  if (url.origin === self.location.origin) return true;
  return url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdnjs.cloudflare.com';
}

// La pagina principale (index.html, o "./" che la serve) è quella che cambia ad ogni aggiornamento
// del programma. Per lei NON usiamo "prima la cache": la si richiede sempre prima alla rete, così
// ogni apertura mostra subito l'ultima versione pubblicata — nessun bisogno di ricaricare due volte
// dopo un aggiornamento. Solo se il telefono è offline si usa l'ultima copia salvata, così l'app
// resta comunque apribile senza connessione.
function ePaginaPrincipale_(url) {
  return url.origin === self.location.origin &&
    (url.pathname.endsWith('/index.html') || url.pathname.endsWith('/'));
}

self.addEventListener('fetch', function (evento) {
  var richiesta = evento.request;
  if (richiesta.method !== 'GET') return; // le scritture (salvataggi) non c'entrano con questa cache

  var url = new URL(richiesta.url);

  if (ePaginaPrincipale_(url)) {
    evento.respondWith(
      fetch(richiesta).then(function (rispostaRete) {
        if (rispostaRete && rispostaRete.status === 200) {
          caches.open(CACHE_NOME).then(function (cache) { cache.put(richiesta, rispostaRete.clone()); });
        }
        return rispostaRete;
      }).catch(function () {
        return caches.open(CACHE_NOME).then(function (cache) { return cache.match(richiesta); });
      })
    );
    return;
  }

  if (!fasciaDaMettereInCache_(url)) return; // es. script.google.com o drive.google.com: sempre dalla rete

  evento.respondWith(
    caches.open(CACHE_NOME).then(function (cache) {
      return cache.match(richiesta).then(function (risposteSalvate) {
        // Per tutto il resto (caratteri, icone, librerie esterne — cose che cambiano di rado):
        // "prima la cache, poi aggiorno in background". L'app si apre subito con quello che è già
        // salvato (se c'è), e nel frattempo scarica in silenzio l'eventuale versione più recente,
        // pronta per la prossima apertura.
        var recuperoDallaRete = fetch(richiesta).then(function (rispostaRete) {
          if (rispostaRete && (rispostaRete.status === 200 || rispostaRete.type === 'opaque')) {
            cache.put(richiesta, rispostaRete.clone());
          }
          return rispostaRete;
        }).catch(function () {
          // niente rete (es. offline): va bene anche la versione già salvata, se c'è
          return risposteSalvate;
        });
        return risposteSalvate || recuperoDallaRete;
      });
    })
  );
});
