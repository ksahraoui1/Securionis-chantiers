const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

for (const [label, chantierResult, expected] of [
  ['chantier étranger absent de la RLS', { data: null }, false],
  ['lecture en erreur', { data: { id: 'chantier' }, error: { message: 'réseau' } }, false],
  ['chantier de son entreprise', { data: { id: 'chantier' } }, true],
]) test(`administrateur : ${label}`, async () => {
  const calls=[];
  const client={from(table){calls.push(table);const q={select(){return q},eq(){return q},maybeSingle:async()=>chantierResult,single:async()=>({data:{role:'administrateur'}})};return q}};
  const {canAccessChantier}=loadTs('src/lib/utils/security.ts');
  assert.equal(await canAccessChantier(client,'acteur','chantier'),expected);
  assert.equal(calls[0],'chantiers');
  if(!expected) assert.deepEqual(calls,['chantiers']);
});

for (const [prefix, expected] of [
  ['base-documentaire','base-documentaire/entreprise/'],
  ['points-controle/point','points-controle/entreprise/point/'],
  ['logos','logos/entreprise/'],
  ['chantiers/chantier/docs','chantiers/chantier/docs/'],
]) test(`préfixe de fichier : ${prefix}`, async () => {
  let uploaded;
  const client={auth:{getUser:async()=>({data:{user:{id:'acteur'}}})},from(){const q={select(){return q},eq(){return q},single:async()=>({data:{entreprise_id:'entreprise'}})};return q},storage:{from(){return {upload:async(path)=>{uploaded=path;return{}},getPublicUrl:path=>({data:{publicUrl:path}})}}}};
  const {uploadFileToStorage}=loadTs('src/lib/utils/storage-upload.ts',{
    '@/lib/supabase/client':{createClient:()=>client},
    './storage-path':loadTs('src/lib/utils/storage-path.ts'),
    './file-validation':{validatePdfOrImageFile:()=>({valid:true,sanitizedExtension:'pdf'}),validateFileSignature:async()=>null},
  });
  await uploadFileToStorage({name:'document.pdf',size:10,type:'application/pdf'},{bucket:'rapports',pathPrefix:prefix});
  assert.ok(uploaded.startsWith(expected),uploaded);
});

test('bibliothèque sans entreprise : aucun upload', async()=>{
  let uploads=0;
  const client={auth:{getUser:async()=>({data:{user:{id:'acteur'}}})},from(){const q={select(){return q},eq(){return q},single:async()=>({data:{entreprise_id:null}})};return q},storage:{from(){uploads++;return{}}}};
  const {uploadFileToStorage}=loadTs('src/lib/utils/storage-upload.ts',{
    '@/lib/supabase/client':{createClient:()=>client},
    './storage-path':loadTs('src/lib/utils/storage-path.ts'),
    './file-validation':{validatePdfOrImageFile:()=>({valid:true,sanitizedExtension:'pdf'}),validateFileSignature:async()=>null},
  });
  await assert.rejects(uploadFileToStorage({name:'document.pdf',size:10},{bucket:'rapports',pathPrefix:'base-documentaire'}),/Entreprise requise/);
  assert.equal(uploads,0);
});
