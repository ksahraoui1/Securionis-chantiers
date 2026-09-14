const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-ts.cjs');
const visite = '20000000-0000-4000-8000-000000000003';
const empreinte = 'a'.repeat(64);
const demande = { p_visite_id: visite, p_empreinte: empreinte, p_operation_id: '70000000-0000-4000-8000-000000000001', p_ecarts: [], p_renseignements_par: null, p_remarques_generales: null };
function fixture({ responses = [], photos = [], rpc } = {}) {
  const calls = [], scope = {}, cache = new Map();
  const mocks = {
    '@/lib/offline/scope': { assertOfflineScope() {} },
    '@/lib/offline/db': {
      flushOfflineWrites: async () => calls.push('flush'), getUnsyncedResponses: async () => responses,
      getPendingPhotos: async (_scope, id) => { assert.equal(id, visite); return photos; },
    },
    '@/lib/offline/sync': { syncPendingData: async () => calls.push('sync') },
    '@/lib/offline/client': { createOfflineClient: async () => ({ rpc: async (name, args) => {
      calls.push({ name, args });
      return rpc ? rpc(name, args) : { data: { empreinte, non_conformites: [] }, error: null };
    } }) },
  };
  return { scope, calls, preparations: load('src/lib/offline/preparations.ts', mocks, cache), module: load('src/lib/offline/cloture.ts', mocks, cache) };
}
test('Clôture : la préparation attend compression/photo puis écritures locales et synchronisation', async () => {
  const f = fixture(); let finish;
  const capture = f.preparations.runOfflinePreparation(f.scope, () => new Promise(resolve => { finish = resolve; }));
  const pending = f.module.preparerCloture(f.scope, visite);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 0);
  finish(); await capture;
  assert.equal((await pending).empreinte, empreinte);
  assert.deepEqual(f.calls.slice(0, 2), ['flush', 'sync']);
  assert.deepEqual(f.calls[2], { name: 'preparer_cloture_visite', args: { p_visite_id: visite } });
});
test('Clôture : une réponse ou photo non envoyée bloque la validation de sa visite', async () => {
  for (const options of [{ responses: [{ visite_id: visite }] }, { photos: [{ id: 'pending' }] }]) {
    const f = fixture(options);
    await assert.rejects(f.module.preparerCloture(f.scope, visite), error => error.refusConfirme && /locales/.test(error.message));
    assert.equal(f.calls.filter(x => typeof x === 'object').length, 0);
  }
  const other = fixture({ responses: [{ visite_id: 'autre-visite' }] });
  await other.module.preparerCloture(other.scope, visite);
});
test('Clôture : erreur de préparation et résultat invalide ne donnent aucun feu vert', async () => {
  for (const data of [null, { empreinte: 'invalide', non_conformites: [] }, { empreinte, non_conformites: [null] }]) {
    const f = fixture({ rpc: async () => ({ data, error: null }) });
    await assert.rejects(f.module.preparerCloture(f.scope, visite));
  }
});
test('Clôture : conflit SQL confirmé, réponse réseau perdue et résultat incohérent restent distincts', async () => {
  for (const [result, refus] of [
    [{ data: null, error: { code: '40001', message: 'Constat modifié' } }, true],
    [{ data: null, error: { code: '42501', message: 'Accès refusé' } }, true],
    [{ data: null, error: { code: 'NETWORK', message: 'réseau' } }, false],
    [{ data: { id: 'autre', statut: 'terminee' }, error: null }, false],
  ]) {
    const f = fixture({ rpc: async () => result });
    await assert.rejects(f.module.envoyerCloture(f.scope, demande), err => err.refusConfirme === refus);
  }
});
test('Clôture : rejeu exact après panne réseau, sans nouvel UUID ni resynchronisation d’une visite déjà terminée', async () => {
  let attempts = 0;
  const f = fixture({ rpc: async (name, args) => {
    assert.equal(name, 'cloturer_visite'); assert.deepEqual(args, demande);
    if (++attempts === 1) return { data: null, error: { code: 'NETWORK', message: 'réponse perdue' } };
    return { data: { id: visite, statut: 'terminee', deja_appliquee: true }, error: null };
  } });
  await assert.rejects(f.module.envoyerCloture(f.scope, demande));
  const previous = f.calls.length;
  await f.module.envoyerCloture(f.scope, demande, true);
  assert.equal(f.calls.length, previous + 1);
  assert.equal(f.calls.at(-1).args.p_operation_id, demande.p_operation_id);
});
test('Clôture : une préparation photo en échec interrompt la validation engagée', async () => {
  const f = fixture(); let reject;
  const photo = f.preparations.runOfflinePreparation(f.scope, () => new Promise((_resolve, fail) => { reject = fail; }));
  const closing = f.module.preparerCloture(f.scope, visite);
  await new Promise(resolve => setImmediate(resolve));
  reject(Error('stockage photo refusé'));
  await assert.rejects(photo); await assert.rejects(closing);
  assert.equal(f.calls.length, 0);
});
