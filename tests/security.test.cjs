const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-ts.cjs');
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://security-test.supabase.co';
const { referenceStockage, cheminRapportVisite, verifierRapportVisite } = load('src/lib/utils/storage-reference.ts');
const { requireApiUser } = load('src/lib/supabase/require-api-user.ts');
const { creerChargeurImagesPdf, ImagePdfInvalide } = load('src/lib/supabase/pdf-images.ts');
const base = 'https://security-test.supabase.co/storage/v1/object/public/';
const visit = { id: 'aaaaaaaa-1111-4111-8111-111111111111', chantier_id: 'bbbbbbbb-2222-4222-8222-222222222222', date_visite: '2026-09-13' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=', 'base64');
const user = { id: 'test-user' };
function session(data, error = null) {
  return { auth: { getUser: async () => ({ data: { user }, error: null }) }, rpc: async () => ({ data, error }) };
}

test('MFA : refus sans compte, aal1 refusé, panne fermée et session autorisée', async () => {
  const anonymous = { auth: { getUser: async () => ({ data: { user: null }, error: null }) }, rpc: () => { throw Error('RPC interdite'); } };
  assert.equal((await requireApiUser(anonymous)).response.status, 401);
  for (const client of [session(null), session(true, Error('panne')), { auth: { getUser: async () => { throw Error('réseau'); } } }]) {
    assert.equal((await requireApiUser(client)).response.status, 503);
  }
  const refused = await requireApiUser(session(false));
  assert.equal(refused.response.status, 403);
  assert.equal((await refused.response.json()).code, 'MFA_REQUIRED');
  assert.equal((await requireApiUser(session(true))).user.id, user.id);
});

test('Toutes les routes API refusent le MFA incomplet avant tout privilège', async () => {
  const { NextRequest } = require('next/server');
  const dir = path.resolve(__dirname, '../src/app/api');
  const files = fs.readdirSync(dir, { recursive: true }).filter(f => f.endsWith('route.ts'));
  assert.equal(files.length, 18);
  for (const file of files) {
    const route = load(path.join(dir, file), { '@/lib/supabase/server': {
      createClient: async () => session(false),
      createServiceClient: () => { throw Error('Accès privilégié interdit avant MFA'); },
    } });
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) if (route[method]) {
      const response = await route[method](new NextRequest('https://app.test/api/test', { method }), { params: Promise.resolve({ id: visit.id }) });
      assert.equal(response.status, 403, `${method} ${file}`);
      assert.equal((await response.json()).code, 'MFA_REQUIRED', file);
    }
  }
});

test('Références : origin exacte, encodage, schémas et traversées', () => {
  assert.deepEqual(referenceStockage(base + 'rapports/logos/logo%20un.png'), { bucket: 'rapports', chemin: 'logos/logo un.png' });
  assert.deepEqual(referenceStockage(base.replace('/public/', '/sign/') + 'visite-photos/a/b.png?token=test'), { bucket: 'visite-photos', chemin: 'a/b.png' });
  for (const url of [
    'http://127.0.0.1/image.png', 'http://[::1]/image.png', 'http://169.254.169.254/image.png',
    base.replace('https:', 'http:') + 'rapports/a.png',
    base.replace('.supabase.co', '.supabase.co.evil.test') + 'rapports/a.png',
    base.replace('security-test', 'user:pass@security-test') + 'rapports/a.png',
    base + 'rapports/a/../b.png', base + 'rapports/a/%2e%2e/b.png',
    base + 'rapports/a/%252e%252e/b.png', base + 'rapports/a/%5c..%5cb.png',
    base + 'rapports/a/%ZZ.png', base + 'rapports/a.png#fragment',
    base + 'autre/a.png', 'data:image/png;base64,AAAA', 'file:///tmp/photo.png',
  ]) assert.equal(referenceStockage(url), null, url);
});

test('Rapport : chemin lié au chantier et à l’UUID complet, ancien format lisible', () => {
  const current = cheminRapportVisite(visit.chantier_id, visit.id);
  assert.equal(verifierRapportVisite(current, visit), current);
  const old = `${visit.chantier_id}/rapport_20260913_aaaaaaaa.pdf`;
  assert.equal(verifierRapportVisite(base + 'rapports/' + old, visit), old);
  for (const candidate of [current.replace(visit.chantier_id, visit.id), current.replace(visit.id, visit.chantier_id), 'base-documentaire/secret.pdf', old.replace('20260913', '20260912'), 'https://evil.test/storage/v1/object/public/rapports/' + old]) {
    assert.throws(() => verifierRapportVisite(candidate, visit));
  }
});

function storage(chunks, observer = {}) {
  return { storage: { from(bucket) { observer.bucket = bucket; return {
    download(objectPath, options, parameters) {
      observer.path = objectPath; observer.parameters = parameters;
      return { asStream: async () => ({ error: null, data: new ReadableStream({
        start(controller) { for (const chunk of chunks) controller.enqueue(chunk); },
        cancel() { observer.cancelled = true; },
        pull(controller) { if (!observer.keepOpen) controller.close(); },
      }) }) };
    },
  }; } } };
}

test('Images PDF : octets PNG autorisés, zéro téléchargement d’URL étrangère', async () => {
  let calls = 0;
  const forbidden = creerChargeurImagesPdf({ storage: { from() { calls++; throw Error('appel inattendu'); } } });
  for (const url of ['http://127.0.0.1/test.png', 'data:image/png;base64,AAAA', base + 'rapports/a.png']) {
    await assert.rejects(() => forbidden(url, 'visite-photos'), ImagePdfInvalide);
  }
  assert.equal(calls, 0);
  const observer = {};
  const image = await creerChargeurImagesPdf(storage([png], observer))(base + 'visite-photos/a/b.png', 'visite-photos');
  assert.equal(image, 'data:image/png;base64,' + png.toString('base64'));
  assert.equal(observer.bucket, 'visite-photos');
  assert.equal(observer.path, 'a/b.png');
  assert.equal(observer.parameters.redirect, 'error');
});

test('Images PDF : limites pendant le flux, type invalide et RLS refusée', async () => {
  const observer = { keepOpen: true };
  await assert.rejects(() => creerChargeurImagesPdf(storage([Buffer.alloc(10 * 1024 * 1024 + 1)], observer))(base + 'visite-photos/a.png', 'visite-photos'), ImagePdfInvalide);
  assert.equal(observer.cancelled, true);
  await assert.rejects(() => creerChargeurImagesPdf(storage([Buffer.from('<svg/>')]))(base + 'visite-photos/a.png', 'visite-photos'), ImagePdfInvalide);
  const denied = { storage: { from: () => ({ download: () => ({ asStream: async () => ({ data: null, error: Error('RLS') }) }) }) } };
  await assert.rejects(() => creerChargeurImagesPdf(denied)(base + 'visite-photos/a.png', 'visite-photos'), ImagePdfInvalide);
});

test('Signature d’affichage : une entrée étrangère reste nulle, même dans un lot', async () => {
  const { signerUrl, signerUrls, canoniserUrlStockage, decomposerUrlStockage } = load('src/lib/utils/url-signee.ts');
  const client = { storage: { from: () => ({ createSignedUrls: async paths => ({ data: paths.map(() => ({ signedUrl: 'https://signed.test/ok' })), error: null }) }) } };
  assert.equal(await signerUrl(client, 'http://127.0.0.1/a'), null);
  const canonical = canoniserUrlStockage(base.replace('/public/', '/sign/') + 'rapports/dossier/rapport%20%C3%A9t%C3%A9.pdf?token=temporary');
  assert.equal(canonical, base + 'rapports/dossier/rapport%20%C3%A9t%C3%A9.pdf');
  assert.deepEqual(decomposerUrlStockage(canonical), { bucket: 'rapports', chemin: 'dossier/rapport été.pdf' });
  assert.deepEqual(await signerUrls(client, ['http://127.0.0.1/a', base + 'visite-photos/a.png']), [null, 'https://signed.test/ok']);
});

test('SDK réel : seul le projet configuré est contacté, le PDF ne fait aucun appel réseau', async () => {
  const { createClient } = require('@supabase/supabase-js');
  const requests = [];
  const client = createClient('https://security-test.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      requests.push({ url: String(url), redirect: options.redirect });
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    } },
  });
  const uri = await creerChargeurImagesPdf(client)(base + 'visite-photos/a.png', 'visite-photos');
  assert.deepEqual(requests, [{ url: 'https://security-test.supabase.co/storage/v1/object/visite-photos/a.png', redirect: 'error' }]);
  const { Document, Page, Image, renderToBuffer } = await import('@react-pdf/renderer');
  const { createElement } = require('react');
  const originalFetch = global.fetch;
  global.fetch = async () => { throw Error('Le moteur PDF ne doit pas accéder au réseau'); };
  try {
    const result = await renderToBuffer(createElement(Document, {}, createElement(Page, {}, createElement(Image, { src: uri }))));
    assert.equal(result.subarray(0, 4).toString(), '%PDF');
  } finally { global.fetch = originalFetch; }
});

test('Synchronisation : erreur, absence RLS et conflit conservent la file', async () => {
  const pending = { key: 'v:p', visite_id: 'v', point_controle_id: 'p', updated_at: '2026-09-12T12:00:00Z', photos: [] };
  for (const situation of ['network', 'invisible', 'conflict']) {
    let deleted = 0, marked = 0;
    const client = { from: table => ({ select: () => ({ in: async () => {
      if (table === 'visites') return situation === 'network' ? { data: null, error: Error('réseau') } : { data: situation === 'invisible' ? [] : [{ id: 'v' }], error: null };
      return { data: [{ visite_id: 'v', point_controle_id: 'p', updated_at: '2026-09-13T12:00:00Z' }], error: null };
    } }) }) };
    const module = load('src/lib/offline/sync.ts', { '@/lib/supabase/client': { createClient: () => client }, './db': {
      getUnsyncedResponses: async () => [pending],
      getPendingPhotos: async () => situation === 'conflict' ? [] : [{ id: 1 }],
      deletePendingPhoto: async () => { deleted++; }, markResponseSynced: async () => { marked++; },
    } });
    const result = await module.syncPendingData();
    assert.equal(deleted, 0, situation); assert.equal(marked, 0, situation);
    assert.equal(result.discarded, 0, situation);
    assert.equal(situation === 'conflict' ? result.conflicts : result.errors > 0, situation === 'conflict' ? 1 : true);
  }
});

test('Versions : chemins stricts et publication sans écrasement, hash des octets, conflit explicite', async () => {
  const { cheminVersionRapport } = load('src/lib/utils/storage-reference.ts');
  const { enregistrerVersionRapport } = load('src/lib/supabase/rapport-version.ts');
  const versionId = 'cccccccc-3333-4333-8333-333333333333';
  const chemin = cheminVersionRapport(visit.chantier_id, visit.id, versionId);
  assert.equal(verifierRapportVisite(chemin, visit), chemin);
  for (const bad of [chemin.replace(visit.id, visit.chantier_id), chemin + '/extra', chemin.replace(versionId, '../escape')]) assert.throws(() => verifierRapportVisite(bad, visit));
  assert.throws(() => cheminVersionRapport(visit.chantier_id, visit.id, '../escape'));
  const calls = [];
  let rpcError = null;
  const service = { storage: { from: () => ({ upload: async (...args) => { calls.push(args); return { error: null }; }, remove: () => { throw Error('Ne jamais effacer après un commit incertain'); } }) }, rpc: async (name, args) => {
    assert.equal(name, 'publier_version_rapport');
    assert.equal(args.p_sha256, require('node:crypto').createHash('sha256').update('PDF fixture').digest('hex'));
    assert.equal(args.p_reference_attendue, 'ancienne-reference');
    return { data: rpcError ? null : versionId, error: rpcError };
  } };
  const donnees = { versionId, visiteId: visit.id, chantierId: visit.chantier_id, auteurId: user.id, referenceAttendue: 'ancienne-reference', motif: 'Nouvelle version', source: {}, pdf: Buffer.from('PDF fixture') };
  assert.equal((await enregistrerVersionRapport(service, donnees)).chemin, chemin);
  assert.equal(calls[0][2].upsert, false);
  rpcError = { code: '40001' };
  await assert.rejects(() => enregistrerVersionRapport(service, donnees), error => error.status === 409);
  rpcError = { code: 'NETWORK' };
  await assert.rejects(() => enregistrerVersionRapport(service, donnees), error => error.status === 500);
});

test('Génération : motif obligatoire, droits actuels et données complètes avant publication', async () => {
  const { NextRequest } = require('next/server');
  let assigned = true, published = 0, answers = [], rendered = 0;
  const client = { auth: { getUser: async () => ({ data: { user }, error: null }) }, rpc: async () => ({ data: true, error: null }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.test/file' }, error: null }) }) },
    from(table) {
      const data = { visites: { ...visit, inspecteur_id: user.id, statut: 'terminee', rapport_url: 'ancien' }, chantiers: { id: visit.chantier_id }, profiles: { nom: 'Test', email: 'test@example.test', entreprise_id: null }, reponses: answers, ecarts: [], destinataires: [] }[table];
      const result = { data, error: data === null ? Error('lecture refusée') : null };
      const query = { select: () => query, eq: () => query, order: () => query, single: async () => result, then: (ok, fail) => Promise.resolve(result).then(ok, fail) };
      return query;
    },
  };
  const route = load('src/app/api/visites/[id]/pdf/route.ts', {
    '@/lib/supabase/server': { createClient: async () => client, createServiceClient: async () => ({}) },
    '@/lib/utils/security': { canAccessVisite: async () => true, canAccessChantier: async () => assigned, getUserRole: async () => 'inspecteur' },
    '@/lib/roles/limites': { getLimits: () => ({ canGeneratePdf: true }) },
    '@/lib/rate-limit': { checkRateLimit: async () => true },
    '@react-pdf/renderer': { renderToBuffer: async () => { rendered++; return Buffer.from('PDF'); } },
    '@/components/pdf/rapport-visite': { RapportVisite: props => { assert.ok(props.versionId); assert.equal(props.signatureDataUri, undefined); return props; } },
    '@/lib/supabase/rapport-version': { ...load('src/lib/supabase/rapport-version.ts'), enregistrerVersionRapport: async (_, input) => { published++; assert.equal(input.motif, 'Réédition documentée'); return { chemin: 'version', sha256: 'hash' }; } },
  });
  const invoke = body => route.POST(new NextRequest('https://app.test/api/visites/id/pdf', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: visit.id }) });
  assert.equal((await invoke({})).status, 400);
  assigned = false;
  assert.equal((await invoke({ motif: 'Réédition documentée', rapportReference: 'ancien' })).status, 403);
  assigned = true;
  assert.equal((await invoke({ motif: 'Réédition documentée', rapportReference: 'autre-version' })).status, 409);
  answers = null;
  assert.equal((await invoke({ motif: 'Réédition documentée', rapportReference: 'ancien' })).status, 500);
  assert.equal(published, 0); assert.equal(rendered, 0);
  answers = [];
  assert.equal((await invoke({ motif: 'Réédition documentée', rapportReference: 'ancien' })).status, 200);
  assert.equal(published, 1); assert.equal(rendered, 1);
});

test('Email : une version différente de celle choisie est refusée avant tout téléchargement ou envoi', async () => {
  const { NextRequest } = require('next/server');
  let sent = 0;
  const client = { ...session(true), from(table) {
    assert.equal(table, 'visites');
    const query = { select: () => query, eq: () => query, single: async () => ({ data: { ...visit, rapport_url: 'nouvelle-version' }, error: null }) };
    return query;
  }, storage: { from: () => { throw Error('Téléchargement non autorisé'); } } };
  const route = load('src/app/api/visites/[id]/email/route.ts', {
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/utils/security': { canAccessVisite: async () => true, getUserRole: async () => 'inspecteur' },
    '@/lib/roles/limites': { getLimits: () => ({ canSendEmail: true }) },
    '@/lib/rate-limit': { checkRateLimit: async () => true },
    '@/lib/email/send-rapport': { sendRapport: async () => { sent++; } },
  });
  for (const body of [{ rapportReference: 'ancienne-version' }, {}]) {
    const response = await route.POST(new NextRequest('https://app.test/api/visites/id/email', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: visit.id }) });
    assert.equal(response.status, 409);
  }
  assert.equal(sent, 0);
});
