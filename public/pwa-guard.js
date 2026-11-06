// An update must never activate over another open app window/form.
self.addEventListener('message', event => {
  if (event.data?.type !== 'PCIF_CHECK_SINGLE_WINDOW') return;
  event.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(clients => {
    event.ports[0]?.postMessage({safe: clients.length === 1 && clients[0].id === event.source?.id});
  }));
});
