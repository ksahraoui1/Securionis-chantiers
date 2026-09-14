const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const load = require('./load-ts.cjs');
process.env.NEXT_PUBLIC_SUPABASE_URL='https://archive-test.supabase.co';
const mod=load('src/lib/supabase/visite-archive.ts');
const base='https://archive-test.supabase.co/storage/v1/object/public/';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=','base64');
const photo=base+'visite-photos/chantier/visite/source.jpg';
const demande={visiteId:'f2000000-0000-4000-8000-000000000001',operationId:'71000000-0000-4000-8000-000000000001',auteurId:'a2000000-0000-4000-8000-000000000001',empreinte:'a'.repeat(64)};
function fixture() {
 const stored=new Map([['visite-photos/chantier/visite/source.jpg',png],['rapports/points-controle/doc.pdf',Buffer.from('%PDF-document-test')]]);
 const data={source:{visite:{id:demande.visiteId},chantier:{id:'c2000000-0000-4000-8000-000000000001',adresse:'Adresse figée'},entreprise:{logo_url:null},reponses:[{photos:[photo]}]},empreinte:demande.empreinte,mode:'cloture',fichiers:[{bucket:'visite-photos',reference:photo,type:'image'},{bucket:'rapports',reference:'points-controle/doc.pdf',type:'document'}]};
 const calls=[];const state={stored,data,calls,registerError:null};
 const client={rpc:async(name,args)=>{calls.push([name,args]);return{data:state.data,error:null};},storage:{from:bucket=>({download:(path,_opts,params)=>({asStream:async()=>{calls.push(['download',bucket,path]);assert.equal(params.redirect,'error');const bytes=stored.get(`${bucket}/${path}`);return bytes?{error:null,data:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})}:{data:null,error:Error('RLS')};}})})}};
 const service={storage:{from:bucket=>({upload:async(path,bytes,opts)=>{assert.equal(opts.upsert,false);calls.push(['upload',bucket,path]);stored.set(`${bucket}/${path}`,bytes);return{error:null};},remove:()=>{throw Error('Aucune suppression');}})},rpc:async(name,args)=>{calls.push([name,args]);if(name==='consommer_quota')return{data:true,error:null};state.manifest=args.p_fichiers;return{data:state.registerError?null:demande.operationId,error:state.registerError};}};
 return Object.assign(state,{client,service});
}
function archive(f) {
 const contenu=JSON.stringify({format:'securionis-archive-v1',mode:'cloture',source:f.data.source,fichiers:f.manifest});
 return{id:demande.operationId,visite_id:demande.visiteId,mode:'cloture',created_at:'2026-09-14',contenu,sha256:createHash('sha256').update(contenu).digest('hex')};
}
test('Archives : copies privées neuves, manifeste complet et reprise sans recopie',async()=>{
 const f=fixture();assert.equal(await mod.preparerArchive(f.client,f.service,demande),demande.operationId);
 assert.equal(f.manifest.length,2);
 for(const item of f.manifest){assert.ok(item.chemin.includes(demande.operationId));assert.equal(item.sha256,createHash('sha256').update(f.stored.get(`${item.bucket}/${item.chemin}`)).digest('hex'));}
 const before=f.calls.filter(c=>c[0]==='upload').length;f.data={preparee:true};await mod.preparerArchive(f.client,f.service,demande);assert.equal(f.calls.filter(c=>c[0]==='upload').length,before);
});
test('Archives : fichier manquant ou URL externe interrompt la clôture sans publier',async()=>{
 for(const situation of ['inaccessible','url']){const f=fixture();if(situation==='inaccessible')f.stored.delete('rapports/points-controle/doc.pdf');else f.data.fichiers[0].reference='http://127.0.0.1/secret';await assert.rejects(mod.preparerArchive(f.client,f.service,demande),mod.ArchiveError);assert.equal(f.calls.some(c=>c[0]==='enregistrer_preparation_archive'),false);}
});
test('Archives : refus des faux fichiers, limite de taille et conflit final',async()=>{
 for(const bytes of [Buffer.from('<svg/>'),Buffer.alloc(10*1024*1024+1)]){const f=fixture();f.stored.set('visite-photos/chantier/visite/source.jpg',bytes);await assert.rejects(mod.preparerArchive(f.client,f.service,demande));assert.equal(f.calls.some(c=>c[0]==='upload'),false);}
 const f=fixture();f.registerError={code:'40001'};await assert.rejects(mod.preparerArchive(f.client,f.service,demande),e=>e.status===409);assert.equal(f.calls.filter(c=>c[0]==='upload').length,2);
});
test('Archives : rapport depuis copies, ZIP portable et refus des octets altérés',async()=>{
 const f=fixture();await mod.preparerArchive(f.client,f.service,demande);const a=archive(f);const source=mod.sourceRapportArchive(a);assert.equal(source.chantier.adresse,'Adresse figée');assert.ok(source.reponses[0].photos[0].includes('/archives/'));
 const zip=await require('jszip').loadAsync(await mod.exporterArchive(f.client,a));assert.equal(await zip.file('contenu-canonique.json').async('string'),a.contenu);assert.equal(Object.values(zip.files).filter(x=>!x.dir).length,5);
 f.stored.set(`${f.manifest[0].bucket}/${f.manifest[0].chemin}`,Buffer.from('altéré'));await assert.rejects(mod.exporterArchive(f.client,a),e=>e.status===503&&/intégrité/.test(e.message));
 assert.throws(()=>mod.verifierArchive({...a,contenu:a.contenu+' '}),/intégrité/);
});
test('Archives : le moteur PDF vérifie aussi le hash de chaque copie',async()=>{
 const f=fixture();const {creerChargeurImagesPdf}=load('src/lib/supabase/pdf-images.ts');
 await assert.rejects(creerChargeurImagesPdf(f.client,new Map([['visite-photos/chantier/visite/source.jpg','0'.repeat(64)]]))(photo,'visite-photos'),/intégrité/);
 const uri=await creerChargeurImagesPdf(f.client,new Map([['visite-photos/chantier/visite/source.jpg',createHash('sha256').update(png).digest('hex')]]))(photo,'visite-photos');assert.ok(uri.startsWith('data:image/png'));
});
test('Archive API : identité attendue différente, aucun accès privilégié',async()=>{
 const {NextRequest}=require('next/server');const route=load('src/app/api/visites/[id]/archive/route.ts',{'@/lib/supabase/server':{createClient:async()=>({}),createServiceClient:()=>{throw Error('Interdit');}},'@/lib/supabase/require-api-user':{requireApiUser:async()=>({user:{id:'autre'},response:null})}});
 const res=await route.POST(new NextRequest('https://app.test/api/archive',{method:'POST',body:JSON.stringify({operationId:demande.operationId,auteurId:demande.auteurId,empreinte:demande.empreinte})}),{params:Promise.resolve({id:demande.visiteId})});assert.equal(res.status,409);
});

test('Archives : quota indisponible, réponse ambiguë et dépassement ferment la copie', async () => {
 for (const result of [{data:null,error:Error('panne')},{data:null,error:null},{data:true,error:Error('refus')},{data:'true',error:null}]) await assert.rejects(mod.verifierQuotaArchive({rpc:async()=>result},'acteur','copy'),e=>e.status===503);
 await assert.rejects(mod.verifierQuotaArchive({rpc:async()=>({data:false,error:null})},'acteur','zip'),e=>e.status===429);
 await mod.verifierQuotaArchive({rpc:async()=>({data:true,error:null})},'acteur','copy');
});
