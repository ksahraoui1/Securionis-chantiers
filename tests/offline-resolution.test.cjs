const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory } = require('fake-indexeddb');
const load = require('./load-ts.cjs');
const user='aaaaaaaa-1111-4111-8111-111111111111', entreprise='eeeeeeee-1111-4111-8111-111111111111';
const visit='bbbbbbbb-1111-4111-8111-111111111111', point='cccccccc-1111-4111-8111-111111111111', chantier='dddddddd-1111-4111-8111-111111111111';
const base={visite_id:visit,point_controle_id:point,valeur:'conforme',remarque:'locale',photos:[],updated_at:'2026-09-14'};
const jpeg=new Uint8Array([255,216,255,224,0,1,2]);
function fixture() {
 global.indexedDB=new IDBFactory(); const cache=new Map();
 const scopes=load('src/lib/offline/scope.ts',{},cache), scope=scopes.activateOfflineScope(user,entreprise);
 const db=load('src/lib/offline/db.ts',{},cache);
 const remote={valeur:'remarques',remarque:'serveur',photos:[],sync_revision:'origine',updated_at:'2026-09-14'};
 let closed=false, readError=false, conflictAtSend=false, sends=0;
 const client={from(table){const filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},in(){return q},single:async()=>read(table),maybeSingle:async()=>read(table),then(resolve){return Promise.resolve(table==='visites'?{data:[{id:visit,statut:closed?'terminee':'en_cours'}]}:{data:[{id:'response',visite_id:visit,point_controle_id:point,...remote}]}).then(resolve)}};return q},rpc:async(name,p)=>{sends++;assert.equal(name,'synchroniser_reponse_v2');if(conflictAtSend||p.p_revision_attendue!==remote.sync_revision)return{error:{code:'40001'}};Object.assign(remote,{valeur:p.p_valeur,remarque:p.p_remarque,photos:p.p_photos,sync_revision:crypto.randomUUID(),sync_operation_id:p.p_operation_id,sync_acteur:user});return{data:{id:'response',revision:remote.sync_revision,operation_id:p.p_operation_id}}}};
 function read(table){if(readError)return{error:{message:'indisponible'}};return{data:table==='visites'?{id:visit,chantier_id:chantier,date_visite:'2026-09-14',statut:closed?'terminee':'en_cours'}:table==='points_controle'?{intitule:'Protection des ouvertures'}:{...remote}}}
 const mocks={'@/lib/offline/client':{createOfflineClient:async()=>client},'@/lib/env':{getSupabaseUrl:()=> 'https://fixture.supabase.co'}};
 const resolution=load('src/lib/offline/resolution.ts',mocks,cache);
 return {scope,scopes,db,cache,mocks,resolution,remote,setClosed:v=>closed=v,setReadError:v=>readError=v,setConflict:v=>conflictAtSend=v,getSends:()=>sends};
}
test('Résolution : copies et photos atomiques, ancien accusé inoffensif',async()=>{
 const {scope,db}=fixture();
 const url=`https://fixture.supabase.co/storage/v1/object/public/visite-photos/${chantier}/${visit}/${point}/photo.jpg`;
 const first=await db.savePendingResponse(scope,{...base,photos:[url]},{editor_id:'premier',base_revision:'ancienne'});
 await db.savePendingResponse(scope,{...base,remarque:'second'},{editor_id:'second',base_revision:'ancienne'});
 await db.savePendingPhoto(scope,{id:'photo',visite_id:visit,chantier_id:chantier,reponse_key:point,filename:'photo.jpg',blob:new Blob([jpeg],{type:'image/jpeg'})});
 const snapshot=await db.readLocalSnapshot(scope), next={...first,revision:'choix',editor_id:'resolution',base_revision:'serveur',ancestors:[],photos:[]};
 await db.stageResponseResolution(scope,first.key,db.responseSnapshotToken(db.draftsForKey(snapshot,first.key)),next);
 await db.markResponseSynced(scope,first.key,first.revision,'accuse-ancien');
 const after=await db.readLocalSnapshot(scope);
 assert.equal(after.responses[0].revision,'choix');assert.equal(after.responses[0].base_revision,'serveur');
 assert.equal(after.recovery.length,0);assert.equal(after.photos.length,0);assert.equal(after.copies[0].responses.length,2);
 assert.deepEqual([...new Uint8Array(await after.copies[0].photos[0].blob.arrayBuffer())],[...jpeg]);
 await db.purgeReadCache(scope);assert.equal((await db.readLocalSnapshot(scope)).copies.length,1);
});
test('Résolution : une frappe concurrente annule le choix sans rien supprimer',async()=>{
 const {scope,db}=fixture();const first=await db.savePendingResponse(scope,base,{editor_id:'a',base_revision:'origine'});
 const token=db.responseSnapshotToken([first]);await db.savePendingResponse(scope,{...base,remarque:'nouvelle frappe'},{editor_id:'a',base_revision:'origine'});
 await assert.rejects(db.stageResponseResolution(scope,first.key,token,null),/saisie locale a changé/);
 assert.equal((await db.readLocalSnapshot(scope)).copies.length,0);assert.equal((await db.getUnsyncedResponses(scope))[0].remarque,'nouvelle frappe');
});
test('Résolution : comparer puis fusionner avec la révision serveur observée',async()=>{
 const f=fixture();const first=await f.db.savePendingResponse(f.scope,base,{editor_id:'a',base_revision:'ancienne'});
 const comparison=await f.resolution.compareResponse(f.scope,first.key);
 assert.equal(comparison.remote.remarque,'serveur');assert.equal(comparison.title,'Protection des ouvertures');
 const result=await f.resolution.resolveResponse(f.scope,comparison,{type:'content',content:{valeur:'non_conforme',remarque:'fusion choisie',photos:[]}});
 assert.equal(result.sent,true);assert.equal(f.remote.remarque,'fusion choisie');assert.equal(f.getSends(),1);
 assert.equal(await f.db.getPendingCount(f.scope),0);assert.equal((await f.db.readLocalSnapshot(f.scope)).copies[0].responses[0].remarque,'locale');
});
test('Résolution : changement serveur avant choix ou pendant envoi conserve les données',async()=>{
 const f=fixture();const first=await f.db.savePendingResponse(f.scope,base,{editor_id:'a',base_revision:'ancienne'});
 const comparison=await f.resolution.compareResponse(f.scope,first.key);f.remote.sync_revision='nouvelle';
 await assert.rejects(f.resolution.resolveResponse(f.scope,comparison,{type:'server'}),/serveur a changé/);assert.equal(f.getSends(),0);
 const fresh=await f.resolution.compareResponse(f.scope,first.key);f.setConflict(true);
 await assert.rejects(f.resolution.resolveResponse(f.scope,fresh,{type:'content',content:base}),/choix est conservé/);
 assert.equal((await f.db.getUnsyncedResponses(f.scope)).length,1);assert.equal((await f.db.readLocalSnapshot(f.scope)).copies.length,1);assert.equal(f.remote.remarque,'serveur');
});
test('Résolution : visite clôturée et lecture indisponible ne permettent pas une écriture',async()=>{
 const f=fixture();const first=await f.db.savePendingResponse(f.scope,base,{editor_id:'a',base_revision:'ancienne'});
 f.setReadError(true);await assert.rejects(f.resolution.compareResponse(f.scope,first.key),/Comparaison indisponible/);f.setReadError(false);f.setClosed(true);
 const comparison=await f.resolution.compareResponse(f.scope,first.key);
 await assert.rejects(f.resolution.resolveResponse(f.scope,comparison,{type:'content',content:base}),/clôturée/);
 await f.resolution.resolveResponse(f.scope,comparison,{type:'server'});
 assert.equal(f.getSends(),0);assert.equal(await f.db.getPendingCount(f.scope),0);assert.equal((await f.db.readLocalSnapshot(f.scope)).copies.length,1);
});
test('Photos sans réponse : classement récupérable, photo encore utilisée conservée',async()=>{
 const {scope,db}=fixture();const photo={id:'photo',visite_id:visit,chantier_id:chantier,reponse_key:point,filename:'photo.jpg',blob:new Blob([jpeg],{type:'image/jpeg'})};
 await db.savePendingPhoto(scope,photo);await db.savePendingPhoto(scope,{...photo,id:'autre',filename:'autre.jpg'});
 await db.savePendingResponse(scope,{...base,photos:[`https://fixture.supabase.co/storage/v1/object/public/visite-photos/${db.pendingPhotoPath(photo)}`]},{editor_id:'a',base_revision:null});
 assert.equal(await db.archiveUnusedPhotos(scope,['photo','autre']),1);assert.equal((await db.getAllPendingPhotos(scope))[0].id,'photo');assert.equal((await db.readLocalSnapshot(scope)).copies[0].photos[0].id,'autre');
});
test('Import : propriétaire vérifié, photos renommées, brouillon séparé et rejeu idempotent',async()=>{
 const f=fixture(), importer=load('src/lib/offline/import-backup.ts',f.mocks,f.cache);
 const raw={format:'securionis-offline-backup-v1',user_id:user,entreprise_id:entreprise,responses:[{...base,photos:[`https://fixture.supabase.co/storage/v1/object/public/visite-photos/${chantier}/${visit}/${point}/photo.jpg`]}],recovery:[],photos:[{id:'old',visite_id:visit,chantier_id:chantier,reponse_key:point,filename:'photo.jpg',mime_type:'image/jpeg',base64:Buffer.from(jpeg).toString('base64')}]};
 const original=await f.db.savePendingResponse(f.scope,base,{editor_id:'a',base_revision:'origine'});
 await assert.rejects(importer.prepareBackupImport(f.scope,new Blob([JSON.stringify({...raw,user_id:'autre'})])),/autre compte/);
 const prepared=await importer.prepareBackupImport(f.scope,new Blob([JSON.stringify(raw)]));
 assert.ok(prepared.photos[0].filename.startsWith('import-'));assert.ok(prepared.responses[0].photos[0].includes(prepared.photos[0].filename));assert.equal(prepared.responses[0].base_revision,undefined);
 assert.equal(await importer.applyBackupImport(f.scope,prepared),true);assert.equal(await importer.applyBackupImport(f.scope,prepared),false);
 assert.equal((await f.db.getUnsyncedResponses(f.scope))[0].revision,original.revision);assert.equal((await f.db.getRecoveryResponses(f.scope)).length,1);
 assert.deepEqual([...new Uint8Array(await (await f.db.getAllPendingPhotos(f.scope))[0].blob.arrayBuffer())],[...jpeg]);
});
test('Import : archive exportée conserve les octets et ne devient pas une saisie active',async()=>{
 const f=fixture();const first=await f.db.savePendingResponse(f.scope,base,{editor_id:'a',base_revision:'ancienne'});
 await f.db.stageResponseResolution(f.scope,first.key,f.db.responseSnapshotToken([first]),null);
 const exporter=load('src/lib/offline/backup.ts',f.mocks,f.cache), importer=load('src/lib/offline/import-backup.ts',f.mocks,f.cache);
 const file=await exporter.createOfflineBackup(f.scope);const prepared=await importer.prepareBackupImport(f.scope,file);
 assert.equal(prepared.responses.length,0);assert.equal(prepared.copies.length,1);
 await importer.applyBackupImport(f.scope,prepared);assert.equal(await f.db.getPendingCount(f.scope),0);
 f.scopes.deactivateOfflineScope();await assert.rejects(importer.applyBackupImport(f.scope,prepared),/session locale a changé/);
});
