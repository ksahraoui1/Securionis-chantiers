const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory } = require('fake-indexeddb');
const load = require('./load-ts.cjs');
const user = 'aaaaaaaa-1111-4111-8111-111111111111';
const data = { visite_id: 'visit', point_controle_id: 'point', valeur: 'conforme', remarque: 'premier', photos: [], updated_at: '2099-01-01' };
function fixture() {
  global.indexedDB = new IDBFactory(); const cache = new Map();
  const scopes = load('src/lib/offline/scope.ts', {}, cache);
  const scope = scopes.activateOfflineScope(user, null);
  return { scope, scopes, cache, db: load('src/lib/offline/db.ts', {}, cache) };
}
test('Origine : une saisie suivante hérite du reçu de son formulaire, sans relire le serveur', async () => {
  const { scope, db } = fixture(); const edit = { editor_id: 'a', base_revision: 'vue-initiale' };
  const a = await db.savePendingResponse(scope, data, edit);
  await db.markResponseSynced(scope, a.key, a.revision, 'serveur-1');
  const b = await db.savePendingResponse(scope, { ...data, remarque: 'suite' }, edit);
  assert.equal(b.base_revision, 'serveur-1'); assert.deepEqual(b.ancestors, []);
  assert.equal(await db.getPendingCount(scope), 1);
});
test('Origine : les accusés retardés avancent les descendants sans effacer ni rembobiner la base', async () => {
  const { scope, db } = fixture(); const edit = { editor_id: 'a', base_revision: 'origine' };
  const a = await db.savePendingResponse(scope, data, edit);
  const b = await db.savePendingResponse(scope, { ...data, remarque: 'deuxième' }, edit);
  const c = await db.savePendingResponse(scope, { ...data, remarque: 'troisième' }, edit);
  await db.markResponseSynced(scope, b.key, b.revision, 'serveur-2');
  await db.markResponseSynced(scope, a.key, a.revision, 'serveur-1');
  const [pending] = await db.getUnsyncedResponses(scope);
  assert.equal(pending.revision, c.revision); assert.equal(pending.remarque, 'troisième');
  assert.equal(pending.base_revision, 'serveur-2'); assert.deepEqual(pending.ancestors, []);
});
test('Origine : deux formulaires ne remplacent pas leur file ; la saisie concurrente est récupérable', async () => {
  const { scope, db } = fixture();
  const first = await db.savePendingResponse(scope, data, { editor_id: 'a', base_revision: null });
  await db.savePendingResponse(scope, { ...data, remarque: 'autre onglet' }, { editor_id: 'b', base_revision: null });
  await db.savePendingResponse(scope, { ...data, remarque: 'autre onglet final' }, { editor_id: 'b', base_revision: null });
  assert.equal((await db.getUnsyncedResponses(scope))[0].revision, first.revision);
  assert.equal((await db.getRecoveryResponses(scope)).length, 1);
  assert.equal((await db.getRecoveryResponses(scope))[0].remarque, 'autre onglet final');
  await db.purgeReadCache(scope); assert.equal(await db.getPendingCount(scope), 2);
});
test('Origine : reprendre la version locale affichée préserve sa base, même inconnue', async () => {
  const { scope, db } = fixture();
  const old = await db.savePendingResponse(scope, data, { editor_id: 'a' });
  const next = await db.savePendingResponse(scope, data, { editor_id: 'b', base_revision: 'serveur-lu-plus-tard', local_revision: old.revision });
  assert.equal(next.base_revision, undefined); assert.deepEqual(next.ancestors, [old.revision]);
});
test('Origine : un ancien formulaire ne prend pas la base acquittée par un autre formulaire', async () => {
  const { scope, db } = fixture();
  const fresh = await db.savePendingResponse(scope, data, { editor_id: 'b', base_revision: 'base-b' });
  await db.markResponseSynced(scope, fresh.key, fresh.revision, 'serveur-b');
  const stale = await db.savePendingResponse(scope, data, { editor_id: 'a', base_revision: 'base-a' });
  assert.equal(stale.base_revision, 'base-a');
});
test('Sauvegarde : réponses, conflits et octets des photos sont exportés sans purger la file', async () => {
  const { scope, db, cache } = fixture();
  await db.savePendingResponse(scope, data, { editor_id: 'a', base_revision: null });
  await db.savePendingResponse(scope, { ...data, remarque: 'concurrent' }, { editor_id: 'b', base_revision: null });
  await db.savePendingPhoto(scope, { id: 'photo', visite_id: 'visit', chantier_id: 'chantier', reponse_key: 'point', filename: 'p.jpg', blob: new Blob([new Uint8Array([0, 128, 255, 37])], { type: 'image/jpeg' }) });
  const backup = load('src/lib/offline/backup.ts', {}, cache);
  const exported = JSON.parse(await (await backup.createOfflineBackup(scope)).text());
  assert.equal(exported.user_id, user); assert.equal(exported.responses.length, 1); assert.equal(exported.recovery.length, 1);
  assert.deepEqual([...Buffer.from(exported.photos[0].base64, 'base64')], [0, 128, 255, 37]);
  assert.equal(await db.getPendingCount(scope), 3);
});
test('IndexedDB v1 vers v2 : les anciennes réponses et photos restent accessibles sans origine inventée', async () => {
  const { scope, db } = fixture();
  await new Promise((resolve, reject) => {
    const req = indexedDB.open(scope.database, 1);
    req.onupgradeneeded = () => {
      const responses = req.result.createObjectStore('pending_responses', { keyPath: 'key' });
      responses.createIndex('visite_id', 'visite_id'); responses.createIndex('synced', 'synced');
      responses.put({ ...data, key: 'visit:point', revision: 'ancienne', synced: 0 });
      req.result.createObjectStore('cached_visites', { keyPath: 'visite_id' });
      const photos = req.result.createObjectStore('pending_photos', { keyPath: 'id' }); photos.createIndex('visite_id', 'visite_id');
      photos.put({ id: 'old-photo', visite_id: 'visit', blob: new Blob(['photo ancienne']) });
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { req.result.close(); resolve(); };
  });
  const [response] = await db.getUnsyncedResponses(scope);
  assert.equal(response.revision, 'ancienne'); assert.equal(response.base_revision, undefined);
  assert.equal(await (await db.getAllPendingPhotos(scope))[0].blob.text(), 'photo ancienne');
  assert.deepEqual(await db.getRecoveryResponses(scope), []);
});
