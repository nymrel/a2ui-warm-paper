const CACHE = "nymrel-open-desk-0.1.0";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.mjs",
  "./core.mjs",
  "./icon.svg",
  "./manifest.webmanifest",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("nymrel-open-desk-") && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const scope = new URL("./", self.location.href);
  if (!url.pathname.startsWith(scope.pathname)) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        return response;
      })
      .catch(() =>
        caches
          .match(request, { ignoreSearch: true })
          .then((cached) => cached || Response.error()),
      ),
  );
});
