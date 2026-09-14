const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),load=require('./load-ts.cjs');
const {NextRequest}=require('next/server');
const mod=load('src/lib/ecarts/piece-storage.ts'),cycle=load('src/lib/ecarts/cycle.ts');
const user='a1000000-0000-4000-8000-000000000001',company='e1000000-0000-4000-8000-000000000001',ecart='b1000000-0000-4000-8000-000000000067',id='87000000-0000-4000-8000-000000000001';
const bytes=Buffer.from('%PDF-1.4\nPreuve de recette\n%%EOF'),sha=createHash('sha256').update(bytes).digest('hex');
const piece={id,nom:'Preuve.pdf',mime:'application/pdf',taille:bytes.length,sha256:sha,ecart_id:ecart,revision_preparation:1,storage_path:mod.cheminPiece(company,ecart,id,sha,'application/pdf')};
function stream(data){return new ReadableStream({start(c){c.enqueue(new Uint8Array(data));c.close();}});}
test('Preuves : taille pendant le flux et signatures cohérentes',async()=>{
 assert.equal(mod.identifierPreuve('preuve.pdf',bytes).sha256,sha);
 assert.throws(()=>mod.identifierPreuve('preuve.jpg',bytes));assert.throws(()=>mod.identifierPreuve('preuve.svg',Buffer.from('<svg/>')));assert.throws(()=>mod.identifierPreuve('../preuve.pdf',bytes));
 assert.equal(mod.identifierPreuve('image.png',Buffer.from([137,80,78,71,13,10,26,10,0])).mime,'image/png');
 await assert.rejects(mod.lireFluxPreuve(stream(Buffer.alloc(5*1024*1024+1))),e=>e.status===413);
 assert.deepEqual(await mod.lireFluxPreuve(stream(bytes)),bytes);
});
test('Preuves : lecture bornée avec chemin exact et empreinte',async()=>{
 let reads=0;
 const service = {storage: {from(bucket) {
   assert.equal(bucket,'ecart-preuves');
   return {download(path,options,params) {
     reads++; assert.equal(params.redirect,'error');
     return {asStream: async()=>({data:stream(bytes),error:null})};
   }};
 }}};
 assert.deepEqual(await mod.chargerPiece(service,piece,company),bytes);
 await assert.rejects(mod.chargerPiece(service,{...piece,storage_path:'autre/secret.pdf'},company));assert.equal(reads,1);
 await assert.rejects(mod.chargerPiece(service,{...piece,taille:999},company));
 await assert.rejects(mod.chargerPiece(service,piece,'e2000000-0000-4000-8000-000000000001'));
});
test('Preuves : upload incertain, doublon identique accepté sans écrasement',async()=>{
 let stored=bytes,uploads=0,downloads=0;
 const service={storage:{from:()=>({upload:async(p,b,o)=>{uploads++;assert.equal(o.upsert,false);return{error:{statusCode:'409'}};},download:()=>{downloads++;return{asStream:async()=>({data:stream(stored),error:null})};}})}};
 await mod.stockerPiece(service,piece.storage_path,bytes,piece.mime);assert.equal(uploads,1);assert.equal(downloads,1);
 stored=Buffer.from('autre');await assert.rejects(mod.stockerPiece(service,piece.storage_path,bytes,piece.mime),e=>e.refusConfirme===false);
});
test('Preuves : la sélection du cycle est bornée, sans doublon et réservée à soumettre',()=>{
 const d={operationId:id,auteurId:user,entrepriseId:company,revision:1,action:'soumettre',responsable:'Entreprise',echeance:'2026-10-01',commentaire:'Les protections sont toutes remises en place.',pieces:[id]};
 assert.deepEqual(cycle.validerDemandeCycle(d).pieces,[id]);
 for(const pieces of [[id,id],['https://evil.test/'],null,Array(6).fill(id)])assert.throws(()=>cycle.validerDemandeCycle({...d,pieces}));
 assert.throws(()=>cycle.validerDemandeCycle({...d,action:'valider'}));
});
function uploadFixture(overrides={}) {
 let privileged=0,uploads=0,rpcs=0;const q=table=>({select(){return this;},eq(){return this;},single:async()=>({data:table==='profiles'?{role:overrides.role??'inspecteur',entreprise_id:company}:table==='ecarts'?{chantier_id:'site',statut:'en_cours_correction'}:{revision:overrides.revision??1},error:null}),maybeSingle:async()=>({data:overrides.existant??null,error:null})});
 const service={storage:{from:()=>({upload:async()=>{uploads++;return{error:null};}})},rpc:async(name,args)=>{rpcs++;assert.equal(name,'enregistrer_piece_ecart');assert.equal(args.p_acteur,user);return overrides.publication??{data:{id,sha256:sha},error:null};}};
 const route=load('src/app/api/ecarts/[id]/pieces/route.ts',{'@/lib/supabase/server':{createClient:async()=>({from:q}),createServiceClient:async()=>{privileged++;return service;}},'@/lib/supabase/require-api-user':{requireApiUser:async()=>({user:{id:user},response:null})},'@/lib/utils/security':{canAccessChantier:async()=>overrides.access!==false},'@/lib/rate-limit':{checkRateLimit:async()=>true}});
 return{counts:()=>({privileged,uploads,rpcs}),send:(headers={})=>route.POST(new NextRequest('https://app.test/api/ecarts/'+ecart+'/pieces',{method:'POST',headers:{'x-piece-id':id,'x-auteur-id':user,'x-entreprise-id':company,'x-revision':'1','x-nom-fichier':'Preuve.pdf',...headers},body:bytes}),{params:Promise.resolve({id:ecart})})};
}
test('Preuves API : compte, rôle et affectation avant tout accès privilégié',async()=>{
 for(const options of [{role:'invité'},{access:false},{revision:2}]) {const f=uploadFixture(options);assert.ok([403,409].includes((await f.send()).status));assert.equal(f.counts().privileged,0);}
 const f=uploadFixture();assert.equal((await f.send({'x-auteur-id':'autre'})).status,403);assert.equal(f.counts().privileged,0);
});
test('Preuves API : enregistrement exact et rejeu d’une pièce déjà enregistrée',async()=>{
 const f=uploadFixture();assert.equal((await f.send()).status,200);assert.deepEqual(f.counts(),{privileged:1,uploads:1,rpcs:1});
 const g=uploadFixture({existant:{...piece,auteur_id:user}});assert.equal((await g.send()).status,200);assert.equal(g.counts().uploads,0);
 const h=uploadFixture({publication:{data:null,error:{code:'NETWORK'}}});const r=await h.send();assert.equal(r.status,503);assert.equal((await r.json()).refusConfirme,false);
});
test('Preuves API : téléchargement refusé par RLS avant le service',async()=>{
 let privileged=0;const q={select:()=>q,eq:()=>q,single:async()=>({data:null,error:{code:'not_visible'}})};
 const route=load('src/app/api/ecarts/[id]/pieces/[pieceId]/route.ts',{'@/lib/supabase/server':{createClient:async()=>({from:()=>q}),createServiceClient:async()=>{privileged++;throw Error('Interdit');}},'@/lib/supabase/require-api-user':{requireApiUser:async()=>({user:{id:user},response:null})}});
 const r=await route.GET(new NextRequest('https://app.test/api/piece'),{params:Promise.resolve({id:ecart,pieceId:id})});assert.equal(r.status,404);assert.equal(privileged,0);
});
