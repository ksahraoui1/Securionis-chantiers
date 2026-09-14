const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory } = require('fake-indexeddb');
const load = require('./load-ts.cjs');
const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const B = 'bbbbbbbb-2222-4222-8222-222222222222';
const E = 'cccccccc-3333-4333-8333-333333333333';
const data = { visite_id: 'visit', point_controle_id: 'point', valeur: 'conforme', remarque: 'privé A', photos: [], updated_at: '2026-09-13T10:00:00Z' };
function fixture() {
  global.indexedDB = new IDBFactory();
  const cache = new Map();
  return { scope: load('src/lib/offline/scope.ts', {}, cache), db: load('src/lib/offline/db.ts', {}, cache) };
}
test('IndexedDB : séparation compte/entreprise, reprise et refus des anciennes sessions', async () => {
  const { scope, db } = fixture();
  const a = scope.activateOfflineScope(A, E);
  await db.savePendingResponse(a, data);
  await db.savePendingPhoto(a, { id: 'photo', visite_id: 'visit', chantier_id: 'chantier', reponse_key: 'point', filename: 'p.jpg', blob: new Blob(['photo privée A']) });
  const b = scope.activateOfflineScope(B, E);
  assert.equal(await db.getPendingCount(b), 0);
  await assert.rejects(db.getUnsyncedResponses(a));
  assert.throws(() => db.savePendingResponse(a, data));
  assert.throws(() => scope.offlinePreferenceKey(a, 'themes'));
  assert.ok(scope.offlinePreferenceKey(b, 'themes').includes(B));
  const anotherOrg = scope.activateOfflineScope(A, null);
  assert.equal(await db.getPendingCount(anotherOrg), 0);
  const resumed = scope.activateOfflineScope(A, E);
  assert.equal((await db.getUnsyncedResponses(resumed))[0].remarque, 'privé A');
  assert.equal(await (await db.getPendingPhotos(resumed, 'visit'))[0].blob.text(), 'photo privée A');
});
test('IndexedDB : une écriture acceptée termine dans son compte après changement de session', async () => {
  const { scope, db } = fixture();
  const a = scope.activateOfflineScope(A, E);
  const write = db.savePendingResponse(a, data);
  const b = scope.activateOfflineScope(B, E);
  await write;
  assert.equal(await db.getPendingCount(b), 0);
  const resumed = scope.activateOfflineScope(A, E);
  assert.equal(await db.getPendingCount(resumed), 1);
});
test('Accusé de réception : une ancienne révision ne peut pas effacer une nouvelle saisie', async () => {
  const { scope, db } = fixture(); const a = scope.activateOfflineScope(A, E);
  const first = await db.savePendingResponse(a, data);
  const second = await db.savePendingResponse(a, { ...data, remarque: 'modification pendant envoi' });
  assert.equal(await db.markResponseSynced(a, first.key, first.revision), false);
  assert.equal((await db.getUnsyncedResponses(a))[0].revision, second.revision);
  assert.equal(await db.markResponseSynced(a, second.key, second.revision), true);
  assert.equal(await db.getPendingCount(a), 0);
});
test('Purge de lecture et expiration : aucune suppression des réponses/photos non envoyées', async () => {
  const { scope, db } = fixture(); const a = scope.activateOfflineScope(A, E);
  await db.savePendingResponse(a, data);
  await db.savePendingPhoto(a, { id: 'photo', visite_id: 'visit', blob: new Blob(['x']) });
  await db.cacheVisite(a, { visite_id: 'visit', cached_at: new Date().toISOString(), data: 'privé' });
  assert.equal((await db.getCachedVisite(a, 'visit')).data, 'privé');
  await db.purgeReadCache(a);
  assert.equal(await db.getCachedVisite(a, 'visit'), undefined);
  assert.equal(await db.getPendingCount(a), 2);
  await db.cacheVisite(a, { visite_id: 'visit', cached_at: '2020-01-01', data: 'expiré' });
  assert.equal(await db.getCachedVisite(a, 'visit'), undefined);
});
test('Ancienne base sans propriétaire : détection sans migration ni attribution automatique', async () => {
  const { scope, db } = fixture();
  const legacy = await new Promise((resolve, reject) => {
    const req = indexedDB.open('securionis-offline', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('pending_responses').put('ancien secret', 'key');
    req.onsuccess = () => resolve(req.result); req.onerror = reject;
  });
  assert.equal(await db.hasLegacyOfflineDatabase(), true);
  const a = scope.activateOfflineScope(A, E);
  assert.equal(await db.getPendingCount(a), 0);
  const value = await new Promise(resolve => { const req = legacy.transaction('pending_responses').objectStore('pending_responses').get('key'); req.onsuccess = () => resolve(req.result); });
  assert.equal(value, 'ancien secret'); legacy.close();
});

function pinnedFixture({ sessionId = A, verifiedId = A, mfa = true, entreprise = E } = {}) {
  const scope = load('src/lib/offline/scope.ts');
  const requests = []; let currentToken = 'token-A';
  const originalFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url = String(input); requests.push({ url, bearer: new Headers(init.headers).get('authorization') });
    const body = url.includes('/rpc/') ? mfa : url.includes('/profiles?') ? { entreprise_id: entreprise } : [];
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  };
  const module = load('src/lib/offline/client.ts', {
    '@/lib/offline/scope': scope,
    '@/lib/env': { getSupabaseUrl: () => 'https://fixture.supabase.co', getSupabaseAnonKey: () => 'public-fixture' },
    '@/lib/supabase/client': { createClient: () => ({ auth: {
      getSession: async () => ({ data: { session: { user: { id: sessionId }, access_token: currentToken } } }),
      getUser: async token => { assert.equal(token, 'token-A'); return { data: { user: { id: verifiedId } } }; },
    } }) },
  });
  return { scope, requests, module, swapToken: () => { currentToken = 'token-B'; }, restore: () => { global.fetch = originalFetch; } };
}
test('Client réseau : JWT capturé, refus après arrêt, aucun emprunt au compte suivant', async () => {
  const f = pinnedFixture();
  try {
    const a = f.scope.activateOfflineScope(A, E), client = await f.module.createOfflineClient(a);
    f.swapToken(); await client.from('reponses').select('id');
    assert.equal(f.requests.length, 3);
    assert.ok(f.requests.every(r => r.bearer === 'Bearer token-A'));
    f.scope.activateOfflineScope(B, E);
    const result = await client.from('reponses').select('id');
    assert.ok(result.error); assert.equal(f.requests.length, 3);
  } finally { f.restore(); }
});
test('Client réseau : session, identité vérifiée, MFA et entreprise contrôlées avant toute écriture', async () => {
  for (const options of [{ sessionId: B }, { verifiedId: B }, { mfa: false }, { entreprise: null }]) {
    const f = pinnedFixture(options);
    try {
      await assert.rejects(f.module.createOfflineClient(f.scope.activateOfflineScope(A, E)));
      assert.ok(f.requests.every(r => !r.url.includes('/reponses')));
    } finally { f.restore(); }
  }
});

function syncFixture(mode) {
  const photo = { id: 'photo', chantier_id: A, visite_id: B, reponse_key: E, filename: 'photo.jpg', blob: new Blob(['original']) };
  const response = { ...data, key: `${B}:${E}`, revision: 'old', visite_id: B, point_controle_id: E, photos: [`https://fixture.supabase.co/storage/v1/object/public/visite-photos/${A}/${B}/${E}/photo.jpg`] };
  const calls = { deleted: 0, marked: 0, uploads: 0, upserts: 0 };
  const client = {
    from: table => ({
      select: () => ({ in: async () => ({ data: table === 'visites' ? [{ id: B, statut: mode === 'closed' ? 'terminee' : 'en_cours' }] : mode === 'conflict' ? [{ ...response, updated_at: '2027-01-01' }] : [], error: null }) }),
      upsert: () => { calls.upserts++; return { select: async () => ({ data: mode === 'write-error' ? null : [{ id: 'server' }], error: mode === 'write-error' ? Error('réseau') : null }) }; },
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
    storage: { from: () => ({
      upload: async () => { calls.uploads++; return { error: mode === 'upload-error' ? Error('réseau') : mode.startsWith('duplicate') ? { statusCode: 409, message: 'already exists' } : null }; },
      download: async () => ({ data: new Blob([mode === 'duplicate-identical' ? 'original' : 'different']), error: null }),
    }) },
  };
  const module = load('src/lib/offline/sync.ts', {
    '@/lib/offline/client': { createOfflineClient: async () => client },
    '@/lib/offline/scope': { assertOfflineScope() {} },
    '@/lib/env': { getSupabaseUrl: () => 'https://fixture.supabase.co' },
    '@/lib/offline/db': {
      getUnsyncedResponses: async () => [response], getAllPendingPhotos: async () => [photo],
      markResponseSynced: async (_scope, key, revision) => { assert.equal(key, response.key); assert.equal(revision, 'old'); calls.marked++; return mode !== 'new-revision'; },
      deletePendingPhoto: async () => { calls.deleted++; },
    },
  });
  return { run: () => module.syncPendingData({}), calls };
}
test('Synchronisation : photo conservée en cas de conflit, clôture, erreur réseau ou nouvelle révision', async () => {
  for (const mode of ['conflict', 'closed', 'upload-error', 'write-error', 'new-revision', 'duplicate-different']) {
    const f = syncFixture(mode); await f.run(); assert.equal(f.calls.deleted, 0, mode);
    if (['conflict', 'closed', 'upload-error', 'duplicate-different'].includes(mode)) assert.equal(f.calls.upserts, 0, mode);
  }
});
test('Synchronisation : photo retirée uniquement après accusé de réponse et contrôle des doublons', async () => {
  for (const mode of ['success', 'duplicate-identical']) {
    const f = syncFixture(mode); const result = await f.run();
    assert.equal(f.calls.marked, 1); assert.equal(f.calls.deleted, 1); assert.equal(result.syncedPhotos, 1);
  }
});

function serviceWorker() {
  const handlers = {}, stores = new Map(), put = [];
  let offline = false, policy = 'public';
  const cache = { addAll: async () => {}, match: async () => undefined, put: async req => { put.push(req.url); } };
  const caches = { keys: async () => [...stores.keys()], delete: async key => stores.delete(key), open: async key => { stores.set(key, cache); return cache; } };
  require('node:vm').runInNewContext(require('node:fs').readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://app.test' }, addEventListener: (name, fn) => { handlers[name] = fn; }, clients: { claim: async () => {} }, skipWaiting: async () => {} },
    caches, URL, Response, Set,
    fetch: async () => { if (offline) throw Error('offline'); return new Response('private server fixture', { headers: { 'cache-control': policy } }); },
  });
  return { put, stores, async request(path, mode = 'cors', headers = {}) {
    let result;
    handlers.fetch({ request: { url: new URL(path, 'https://app.test').href, method: 'GET', mode, headers: new Headers(headers) }, respondWith: promise => { result = promise; } });
    return result;
  }, async activate() { let result; handlers.activate({ waitUntil: p => { result = p; } }); await result; }, offline() { offline = true; }, policy(value) { policy = value; } };
}
test('Service Worker : aucun cache HTML/RSC/API/photo privée, seulement ressources publiques', async () => {
  const sw = serviceWorker();
  for (const path of ['/private.png', '/api/visites', 'https://fixture.supabase.co/storage/v1/object/sign/a']) assert.equal(await sw.request(path), undefined);
  assert.equal(await sw.request('/_next/static/test.js', 'cors', { RSC: '1' }), undefined);
  assert.equal(await sw.request('/_next/static/test.js', 'cors', { Authorization: 'Bearer fixture' }), undefined);
  assert.equal((await sw.request('/dashboard', 'navigate')).status, 200);
  assert.equal(sw.put.length, 0);
  await sw.request('/_next/static/test.js'); assert.equal(sw.put.length, 1);
  sw.policy('private, no-store'); await sw.request('/icon.svg'); assert.equal(sw.put.length, 1);
  sw.offline(); const fallback = await sw.request('/dashboard', 'navigate');
  assert.equal(fallback.status, 503); assert.equal(fallback.headers.get('cache-control'), 'no-store');
  assert.ok(!(await fallback.text()).includes('private server fixture'));
});
test('Service Worker : activation supprime les anciens caches privés sans toucher aux autres applications', async () => {
  const sw = serviceWorker();
  for (const name of ['securionis-pages-v9', 'securionis-static-v9', 'securionis-static-v10', 'other-app']) sw.stores.set(name, {});
  await sw.activate(); assert.deepEqual([...sw.stores.keys()], ['securionis-static-v10', 'other-app']);
});
test('Déconnexion hors ligne : cookies de ce projet effacés, verrou posé, file conservée', async () => {
  const { scope, db } = fixture(); const a = scope.activateOfflineScope(A, E); await db.savePendingResponse(a, data);
  const globals = { window: global.window, localStorage: global.localStorage, sessionStorage: global.sessionStorage, document: global.document, location: global.location, caches: global.caches };
  const storage = new Map(), cookies = new Map([['sb-fixture-auth-token.0', 'secret'], ['sb-fixture-auth-token.1', 'secret'], ['sb-fixture-auth-token-code-verifier', 'secret'], ['other', 'keep']]);
  try {
    global.window = { dispatchEvent() {} };
    global.localStorage = global.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
    global.location = { protocol: 'https:' };
    global.document = { get cookie() { return [...cookies].map(([k,v]) => `${k}=${v}`).join('; '); }, set cookie(value) { cookies.delete(value.split('=')[0]); } };
    const deleted = []; global.caches = { keys: async () => ['securionis-pages-v9', 'other'], delete: async name => { deleted.push(name); } };
    const logout = load('src/lib/offline/logout.ts', { '@/lib/offline/scope': scope, '@/lib/offline/db': db, '@/lib/supabase/client': { getAuthStorageKey: () => 'sb-fixture-auth-token', createClient: () => ({ auth: { signOut: async () => { throw Error('réseau'); } } }) } });
    assert.equal(await logout.logoutOfflineSession(a), false);
    assert.ok(a.signal.aborted); assert.equal(storage.get(scope.OFFLINE_LOCK_KEY), '1');
    assert.deepEqual([...cookies.keys()], ['other']); assert.deepEqual(deleted, ['securionis-pages-v9']);
    scope.unlockOfflineSessionAfterLogin();
    assert.equal(await db.getPendingCount(scope.activateOfflineScope(A, E)), 1);
  } finally { for (const [key,value] of Object.entries(globals)) { if (value === undefined) delete global[key]; else global[key] = value; } }
});
