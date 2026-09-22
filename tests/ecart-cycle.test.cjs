const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {NextRequest}=require('next/server');
const user='a1000000-0000-4000-8000-000000000001',company='e1000000-0000-4000-8000-000000000001',id='b1000000-0000-4000-8000-000000000004';
const demande={operationId:'86000000-0000-4000-8000-000000000001',auteurId:user,entrepriseId:company,revision:0,action:'planifier',responsable:'Entreprise test',echeance:'2026-10-01',commentaire:null};
const cycle=load('src/lib/ecarts/cycle.ts');
test('Cycle : dates réelles, bornes et preuves obligatoires',()=>{
 assert.equal(cycle.validerDemandeCycle(demande).action,'planifier');
 for(const patch of [{echeance:'2026-02-30'},{echeance:'2200-01-01'},{revision:-1},{revision:1.5},{action:'corrige'},{responsable:' '},{action:'soumettre',commentaire:'Court'},{action:'valider',commentaire:null}])assert.throws(()=>cycle.validerDemandeCycle({...demande,...patch}));
 assert.equal(cycle.validerDemandeCycle({...demande,action:'soumettre',commentaire:'Contrôle de toutes les fixations sur place.'}).action,'soumettre');
});
test('Cycle : retard au jour suisse, inclut attente de vérification',()=>{
 assert.equal(cycle.jourSuisse(new Date('2026-09-14T22:30:00Z')),'2026-09-15');
 assert.equal(cycle.estEnRetard('a_verifier','2026-09-14','2026-09-15'),true);
 assert.equal(cycle.estEnRetard('corrige','2026-09-14','2026-09-15'),false);
 assert.equal(cycle.estEnRetard('ouvert',null,'2026-09-15'),false);
 assert.equal(cycle.estEnRetard('ouvert','2026-09-15','2026-09-15'),false);
});
function fixture(options={}){
 const calls=[];const q={select:()=>q,eq:()=>q,single:async()=>({data:{entreprise_id:options.company??company},error:null})};
 const client={from:()=>q,rpc:async(name,args)=>{calls.push({name,args});return options.result??{data:{operation_id:demande.operationId,revision:1},error:null};}};
 const route=load('src/app/api/ecarts/[id]/statut/route.ts',{'@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/require-api-user':{requireApiUser:async()=>({user:{id:user},response:null})},'@/lib/rate-limit':{checkRateLimit:async()=>options.quota!==false}});
 return {calls,send:async(body=demande)=>route.PATCH(new NextRequest('https://app.test/api/ecarts/'+id+'/statut',{method:'PATCH',body:typeof body==='string'?body:JSON.stringify(body)}),{params:Promise.resolve({id})})};
}
test('Cycle API : l’ancien clic corrigé et les autres comptes sont refusés avant RPC',async()=>{const f=fixture();assert.equal((await f.send({statut:'corrige'})).status,400);assert.equal((await f.send({...demande,auteurId:'a2000000-0000-4000-8000-000000000001'})).status,403);assert.equal(f.calls.length,0);const other=fixture({company:'e2000000-0000-4000-8000-000000000001'});assert.equal((await other.send()).status,403);assert.equal(other.calls.length,0);});
test('Cycle API : quota fermé et corps borné sans longueur annoncée',async()=>{const f=fixture({quota:false});assert.equal((await f.send()).status,429);assert.equal(f.calls.length,0);const g=fixture();assert.equal((await g.send('x'.repeat(24001))).status,413);assert.equal((await g.send('{invalide')).status,400);assert.equal(g.calls.length,0);});
test('Cycle API : transaction avec identité et révision exactes',async()=>{const f=fixture();assert.equal((await f.send()).status,200);assert.deepEqual(f.calls,[{name:'avancer_cycle_ecart_v2',args:{p_ecart_id:id,p_operation_id:demande.operationId,p_revision:0,p_action:'planifier',p_responsable:'Entreprise test',p_echeance:'2026-10-01',p_commentaire:null,p_pieces:[]}}]);});
test('Cycle API : conflit confirmé distinct d’un résultat incertain',async()=>{const f=fixture({result:{data:null,error:{code:'40001'}}});const r=await f.send();assert.equal(r.status,409);assert.equal((await r.json()).refusConfirme,true);const g=fixture({result:{data:null,error:{code:'FETCH_ERROR'}}});const s=await g.send();assert.equal(s.status,503);assert.equal((await s.json()).refusConfirme,false);const h=fixture({result:{data:{operation_id:demande.operationId,revision:99},error:null}});assert.equal((await h.send()).status,503);});
test('Correction rapide : étapes du cycle existant, textes valides, aucune action directe',()=>{
 assert.equal(cycle.etapeCorrectionRapide('ouvert'),'planifier');
 assert.equal(cycle.etapeCorrectionRapide('en_cours_correction'),'soumettre');
 assert.equal(cycle.etapeCorrectionRapide('a_verifier'),'valider');
 assert.equal(cycle.etapeCorrectionRapide('corrige'),null);
 const sans=cycle.textesCorrectionRapide('2026-09-22','  ',0);
 assert.equal(sans.preuve,'Correction constatée sur place le 22.09.2026.');
 assert.equal(sans.conclusion,'Correction vérifiée sur place le 22.09.2026.');
 const avec=cycle.textesCorrectionRapide('2026-09-22','Garde-corps reposé',1);
 assert.equal(avec.preuve,'Correction constatée sur place le 22.09.2026 (photo jointe).\nGarde-corps reposé');
 assert.match(cycle.textesCorrectionRapide('2026-09-22','',3).preuve,/3 photos jointes/);
 assert.ok(cycle.textesCorrectionRapide('2026-09-22','x'.repeat(6000),0).preuve.length<=5000);
 const base={...demande,revision:1};
 assert.equal(cycle.validerDemandeCycle({...base,action:'soumettre',commentaire:sans.preuve,pieces:['c1000000-0000-4000-8000-000000000001']}).action,'soumettre');
 assert.equal(cycle.validerDemandeCycle({...base,revision:2,action:'valider',commentaire:sans.conclusion}).action,'valider');
});
