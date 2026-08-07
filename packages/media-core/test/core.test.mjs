/**
 * Tests for `media-core`.
 *
 * Plain `node:test` against the built `dist/`, in JS rather than TS on purpose:
 * it needs no extra build step, no test-runner dependency, and it exercises the
 * package exactly as a consumer would — through its `exports` map. A broken
 * export field is a real bug that a src-relative test would never catch.
 *
 * Run: `npm run build:libs && npm test`
 *
 * The whole suite runs offline. `fetch` is injected, which is why it is a
 * config option rather than a global reach in the first place.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMediaClient,
  MediaEventEmitter,
  MediaCache,
  cacheKey,
  MediaAuthError,
  MediaRateLimitError,
  MediaError,
  mapPhoto,
  parseMediaId,
} from '../dist/index.js';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const rawPhoto = (id = 1) => ({
  id,
  width: 4000,
  height: 2000,
  url: `https://www.pexels.com/photo/${id}/`,
  photographer: 'Joey Farina',
  photographer_url: 'https://www.pexels.com/@joey',
  photographer_id: 680589,
  avg_color: '#978E82',
  alt: 'Brown rocks',
  src: {
    original: 'o.jpg', large2x: 'l2.jpg', large: 'l.jpg', medium: 'm.jpg',
    small: 's.jpg', portrait: 'p.jpg', landscape: 'ls.jpg', tiny: 't.jpg',
  },
});

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  };
  fn.calls = calls;
  return fn;
}

const ok = (body) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: { get: () => null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const fail = (status, headers = {}) => ({
  ok: false,
  status,
  statusText: 'Error',
  headers: { get: (name) => headers[name] ?? null },
  json: async () => ({}),
  text: async () => 'error body',
});

const photoPage = (count = 2) => ({
  page: 1,
  per_page: count,
  total_results: 100,
  next_page: 'https://api.pexels.com/v1/search?page=2',
  photos: Array.from({ length: count }, (_, i) => rawPhoto(i + 1)),
});

/* -------------------------------------------------------------------------- */
/* Emitter                                                                    */
/* -------------------------------------------------------------------------- */

test('emitter: on() returns a working, idempotent unsubscribe', () => {
  const emitter = new MediaEventEmitter();
  const seen = [];
  const off = emitter.on('view', (event) => seen.push(event));

  emitter.emit('view', { item: { id: 'a' }, surface: 'grid' });
  off();
  off(); // must not throw or double-remove someone else's listener
  emitter.emit('view', { item: { id: 'b' }, surface: 'grid' });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].item.id, 'a');
  assert.equal(emitter.listenerCount('view'), 0);
});

test('emitter: stamps `at` and `type` so listeners never have to', () => {
  const emitter = new MediaEventEmitter();
  let received;
  emitter.on('download', (event) => (received = event));
  emitter.emit('download', { item: { id: 'x' }, url: 'u', surface: 'lightbox' });

  assert.equal(received.type, 'download');
  assert.equal(typeof received.at, 'number');
});

test('emitter: a throwing listener does not break the others', () => {
  const errors = [];
  const emitter = new MediaEventEmitter({ onListenerError: (error) => errors.push(error) });
  const seen = [];

  emitter.on('view', () => {
    throw new Error('boom');
  });
  emitter.on('view', () => seen.push(1));
  emitter.emit('view', { item: { id: 'a' }, surface: 'grid' });

  assert.equal(seen.length, 1);
  assert.equal(errors.length, 1);
});

test('emitter: unsubscribing during dispatch does not corrupt the dispatch', () => {
  const emitter = new MediaEventEmitter();
  const seen = [];
  const offA = emitter.on('view', () => {
    seen.push('a');
    offA();
  });
  emitter.on('view', () => seen.push('b'));

  emitter.emit('view', { item: { id: '1' }, surface: 'grid' });
  assert.deepEqual(seen, ['a', 'b']);
});

/* -------------------------------------------------------------------------- */
/* Cache                                                                      */
/* -------------------------------------------------------------------------- */

test('cacheKey: param order does not create two entries', () => {
  assert.equal(cacheKey('/v1/search', { b: 2, a: 1 }), cacheKey('/v1/search', { a: 1, b: 2 }));
});

test('cacheKey: empty and undefined params are dropped', () => {
  assert.equal(cacheKey('/v1/search', { q: 'x', size: undefined, locale: '' }), '/v1/search?q=x');
});

test('cache: concurrent identical requests are de-duplicated into one call', async () => {
  const cache = new MediaCache();
  let calls = 0;
  const factory = async () => {
    calls += 1;
    return 'value';
  };

  const results = await Promise.all([
    cache.resolve('k', factory),
    cache.resolve('k', factory),
    cache.resolve('k', factory),
  ]);

  assert.deepEqual(results, ['value', 'value', 'value']);
  assert.equal(calls, 1, 'factory should run once for three concurrent callers');
  assert.equal(cache.stats().deduped, 2);
});

test('cache: a rejected request is not cached and does not poison the key', async () => {
  const cache = new MediaCache();
  let calls = 0;
  const factory = async () => {
    calls += 1;
    if (calls === 1) throw new Error('transient');
    return 'ok';
  };

  await assert.rejects(() => cache.resolve('k', factory));
  assert.equal(await cache.resolve('k', factory), 'ok');
  assert.equal(calls, 2);
});

test('cache: entries expire on the injected clock', async () => {
  let now = 0;
  const cache = new MediaCache({ ttlMs: 100, now: () => now });
  await cache.resolve('k', async () => 'first');

  now = 50;
  assert.equal(await cache.resolve('k', async () => 'second'), 'first');

  now = 150;
  assert.equal(await cache.resolve('k', async () => 'third'), 'third');
});

/* -------------------------------------------------------------------------- */
/* Mapping                                                                    */
/* -------------------------------------------------------------------------- */

test('mapPhoto: produces our domain shape, not Pexels shape', () => {
  const item = mapPhoto(rawPhoto(42));

  assert.equal(item.id, 'photo:42');
  assert.equal(item.kind, 'photo');
  assert.equal(item.aspectRatio, 2);
  assert.equal(item.author.name, 'Joey Farina');
  assert.equal(item.downloadUrl, 'o.jpg');
  assert.equal(item.durationSeconds, null);
  assert.ok(item.renditions.length > 1);
  // Renditions must be ascending by width or srcset selection breaks.
  const widths = item.renditions.map((r) => r.width);
  assert.deepEqual(widths, [...widths].sort((a, b) => a - b));
  // No provider field names leak through.
  assert.equal('photographer' in item, false);
  assert.equal('src' in item, false);
});

test('mapPhoto: falls back when Pexels returns an empty alt', () => {
  const item = mapPhoto({ ...rawPhoto(1), alt: '   ' });
  assert.equal(item.alt, 'Photo by Joey Farina');
});

test('parseMediaId: namespaced and bare ids', () => {
  assert.deepEqual(parseMediaId('video:99'), { kind: 'video', providerId: '99' });
  assert.deepEqual(parseMediaId('123'), { kind: 'photo', providerId: '123' });
});

/* -------------------------------------------------------------------------- */
/* Client                                                                     */
/* -------------------------------------------------------------------------- */

test('client: requires an apiKey', () => {
  assert.throws(() => createMediaClient({ apiKey: '' }), MediaError);
});

test('client: sends the key as the Authorization header and nowhere else', async () => {
  const fetchFn = fakeFetch(() => ok(photoPage()));
  const client = createMediaClient({ apiKey: 'SECRET', fetch: fetchFn, logEvents: false });

  await client.search({ query: 'mountains' });

  const { url, init } = fetchFn.calls[0];
  assert.equal(init.headers.Authorization, 'SECRET');
  assert.ok(!url.includes('SECRET'), 'key must never appear in the URL');
});

test('client: the key never leaks into events, errors or the client object', async () => {
  const fetchFn = fakeFetch(() => fail(401));
  const client = createMediaClient({ apiKey: 'SECRET', fetch: fetchFn, logEvents: false });

  const events = [];
  client.onAny((event) => events.push(event));

  await assert.rejects(() => client.search({ query: 'x' }), MediaAuthError);

  const serialisedEvents = JSON.stringify(events);
  assert.ok(!serialisedEvents.includes('SECRET'));
  assert.ok(!JSON.stringify(Object.keys(client)).includes('SECRET'));

  const error = await client.search({ query: 'x' }).catch((e) => e);
  assert.ok(!JSON.stringify({ m: error.message, e: error.endpoint }).includes('SECRET'));
});

test('client: search maps to MediaPage with pagination flags', async () => {
  const client = createMediaClient({
    apiKey: 'k',
    fetch: fakeFetch(() => ok(photoPage(3))),
    logEvents: false,
  });

  const page = await client.search({ query: 'mountains' });
  assert.equal(page.items.length, 3);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextPage, 2);
  assert.equal(page.totalResults, 100);
});

test('client: an empty query never touches the network', async () => {
  const fetchFn = fakeFetch(() => ok(photoPage()));
  const client = createMediaClient({ apiKey: 'k', fetch: fetchFn, logEvents: false });

  const page = await client.search({ query: '   ' });
  assert.equal(page.items.length, 0);
  assert.equal(fetchFn.calls.length, 0);
});

test('client: identical searches hit the cache, forceRefresh bypasses it', async () => {
  const fetchFn = fakeFetch(() => ok(photoPage()));
  const client = createMediaClient({ apiKey: 'k', fetch: fetchFn, logEvents: false });

  await client.search({ query: 'a' });
  await client.search({ query: 'a' });
  assert.equal(fetchFn.calls.length, 1);

  await client.search({ query: 'a' }, { forceRefresh: true });
  assert.equal(fetchFn.calls.length, 2);
});

test('client: 429 becomes MediaRateLimitError with retryAfterSeconds', async () => {
  const client = createMediaClient({
    apiKey: 'k',
    fetch: fakeFetch(() => fail(429, { 'Retry-After': '30' })),
    logEvents: false,
  });

  const error = await client.search({ query: 'x' }).catch((e) => e);
  assert.ok(error instanceof MediaRateLimitError);
  assert.equal(error.retryAfterSeconds, 30);
  assert.equal(error.retryable, true);
});

test('client: failures emit an error event', async () => {
  const client = createMediaClient({
    apiKey: 'k',
    fetch: fakeFetch(() => fail(500)),
    logEvents: false,
  });

  const errors = [];
  client.on('error', (event) => errors.push(event));
  await client.search({ query: 'x' }).catch(() => {});

  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'network');
});

test('client: download resolves url + filename and emits, without touching the DOM', () => {
  const client = createMediaClient({ apiKey: 'k', fetch: fakeFetch(() => ok({})), logEvents: false });
  const item = mapPhoto(rawPhoto(2014422));

  const events = [];
  client.on('download', (event) => events.push(event));

  const result = client.download(item, { surface: 'lightbox' });

  assert.equal(result.url, 'o.jpg');
  assert.equal(result.filename, 'pexels-joey-farina-2014422.jpg');
  assert.equal(events.length, 1);
  assert.equal(events[0].surface, 'lightbox');
});

test('client: search emits a search event with the result count', async () => {
  const client = createMediaClient({
    apiKey: 'k',
    fetch: fakeFetch(() => ok(photoPage(2))),
    logEvents: false,
  });

  const events = [];
  client.on('search', (event) => events.push(event));
  await client.search({ query: 'mountains', kind: 'photo' });

  assert.equal(events[0].query, 'mountains');
  assert.equal(events[0].resultCount, 2);
});

test('client: perPage is clamped to the provider ceiling', async () => {
  const fetchFn = fakeFetch(() => ok(photoPage()));
  const client = createMediaClient({ apiKey: 'k', fetch: fetchFn, logEvents: false });

  await client.search({ query: 'x', perPage: 500 });
  assert.match(fetchFn.calls[0].url, /per_page=80/);
});

test('client: dispose drops listeners and cache', async () => {
  const fetchFn = fakeFetch(() => ok(photoPage()));
  const client = createMediaClient({ apiKey: 'k', fetch: fetchFn, logEvents: false });

  client.on('view', () => {});
  await client.search({ query: 'a' });
  client.dispose();

  assert.equal(client.events.listenerCount(), 0);
  assert.equal(client.cacheStats().size, 0);
});
