#!/usr/bin/env node
'use strict';
// Sauvegarde Storage uniquement. Aucune méthode d'écriture distante n'est appelée.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {Readable,Transform}=require('node:stream');const {pipeline}=require('node:stream/promises');
const {createReadStream,createWriteStream}=require('node:fs');
const MAX_FILE=200*1024*1024,MAX_TOTAL=2*1024*1024*1024,MAX_OBJECTS=100000;
function digest(value){return crypto.createHash('sha256').update(value).digest('hex');}
function filename(bucket,name){return digest(JSON.stringify([bucket,name]))+'.enc';}
function keyValid(key){if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Clé de sauvegarde de 32 octets requise.');}
async function newDirectory(dir){if(!path.isAbsolute(dir))throw Error('Chemin absolu requis.');await fs.mkdir(dir,{mode:0o700});}
function bounded(max,hash){let size=0;return new Transform({transform(chunk,_encoding,done){size+=chunk.length;if(size>max)return done(Error('Limite de sauvegarde dépassée.'));hash?.update(chunk);done(null,chunk);},flush(done){this.bytes=size;done();}});}
async function encrypt(source,target,key,max){
 keyValid(key);const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),hash=crypto.createHash('sha256'),limit=bounded(max,hash);
 await pipeline(source,limit,cipher,createWriteStream(target,{flags:'wx',mode:0o600}));
 return{iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),sha256:hash.digest('hex'),size:limit.bytes};
}
async function decrypt(source,target,key,meta,max){
 keyValid(key);if(!Number.isSafeInteger(meta.size)||meta.size<0||meta.size>max||!/^[a-f0-9]{64}$/.test(meta.sha256))throw Error('Taille ou empreinte invalide.');if(!/^[a-f0-9]{24}$/.test(meta.iv)||!/^[a-f0-9]{32}$/.test(meta.tag))throw Error('Enveloppe invalide.');
 const cipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(meta.iv,'hex'));cipher.setAuthTag(Buffer.from(meta.tag,'hex'));
 const hash=crypto.createHash('sha256'),limit=bounded(max,hash);
 const handle=await fs.open(target,'wx',0o600);
 try{await pipeline(createReadStream(source),cipher,limit,createWriteStream(target,{fd:handle.fd,autoClose:false}));}
 catch(e){await handle.close();await fs.rm(target,{force:true});throw e;}
 await handle.close();
 if(limit.bytes!==meta.size||hash.digest('hex')!==meta.sha256){await fs.rm(target,{force:true});throw Error('Intégrité de sauvegarde invalide.');}
}
function storageReader(origin,key,transport=fetch){
 if(!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(origin||'')||!key)throw Error('Configuration Supabase invalide.');
 const segment=value=>{if(typeof value!=='string'||!value||value==='.'||value==='..'||/[\\/\0]/.test(value))throw Error('Chemin distant invalide.');return encodeURIComponent(value);};
 async function request(route,body,stream=false){
  const response=await transport(origin+'/storage/v1/'+route,{method:body?'POST':'GET',headers:{apikey:key,Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(120000)});
  if(!response.ok||!response.body){await response.body?.cancel();throw Error('Lecture Storage refusée ou indisponible.');}
  if(stream)return{data:response.body,error:null};
  const chunks=[];let size=0;
  for await(const chunk of Readable.fromWeb(response.body)){size+=chunk.length;if(size>16*1024*1024)throw Error('Réponse d’inventaire trop grande.');chunks.push(chunk);}
  return{data:JSON.parse(Buffer.concat(chunks).toString('utf8')),error:null};
 }
 return{storage:{listBuckets:async()=>{
  const buckets=[];
  for(let offset=0;;offset+=1000){const r=await request('bucket?limit=1000&offset='+offset+'&sortColumn=name&sortOrder=asc');if(!Array.isArray(r.data))throw Error('Inventaire invalide.');buckets.push(...r.data);if(buckets.length>10000)throw Error('Trop de buckets.');if(r.data.length<1000)return{data:buckets,error:null};}
 },from:bucket=>({
  list:(prefix,options)=>request('object/list/'+segment(bucket),{...options,prefix}),
  download:name=>({asStream:()=>request('object/'+segment(bucket)+'/'+name.split('/').map(segment).join('/'),undefined,true)})
 })}};
}
async function inventory(client){
 const {data:buckets,error}=await client.storage.listBuckets();if(error||!Array.isArray(buckets))throw Error('Inventaire des buckets indisponible.');
 const objects=[];let declared=0;
 for(const bucket of [...buckets].sort((a,b)=>a.id.localeCompare(b.id))){
  const folders=[''];const seen=new Set();
  for(let i=0;i<folders.length;i++){
   if(folders.length>MAX_OBJECTS)throw Error('Trop de dossiers.');
   const prefix=folders[i];if(seen.has(prefix))throw Error('Dossier répété.');seen.add(prefix);
   for(let offset=0;;offset+=1000){
    const {data,error}=await client.storage.from(bucket.id).list(prefix,{limit:1000,offset,sortBy:{column:'name',order:'asc'}});
    if(error||!Array.isArray(data))throw Error('Inventaire des objets indisponible.');
    for(const o of data){
     if(typeof o.name!=='string'||!o.name||o.name.includes('/')||o.name==='.'||o.name==='..')throw Error('Nom d’objet non pris en charge.');
     const name=prefix?prefix+'/'+o.name:o.name;
     if(o.id===null){folders.push(name);continue;}
     const size=Number(o.metadata?.size);if(!o.id||!Number.isSafeInteger(size)||size<0||size>MAX_FILE)throw Error('Métadonnées ou taille non prises en charge.');
     declared+=size;if(declared>MAX_TOTAL||objects.length>=MAX_OBJECTS)throw Error('Limite totale de sauvegarde dépassée.');
     objects.push({bucket:bucket.id,name,id:o.id,updated_at:o.updated_at,size,metadata:o.metadata});
    }
    if(data.length<1000)break;
   }
  }
 }
 objects.sort((a,b)=>JSON.stringify([a.bucket,a.name]).localeCompare(JSON.stringify([b.bucket,b.name])));
 if(new Set(objects.map(o=>filename(o.bucket,o.name))).size!==objects.length)throw Error('Inventaire ambigu.');
 return{buckets,objects};
}
function inventoryToken(i){return digest(JSON.stringify({buckets:[...i.buckets].sort((a,b)=>a.id.localeCompare(b.id)),objects:i.objects}));}
async function backup(client,dir,key,project){
 keyValid(key);const before=await inventory(client);await newDirectory(dir);const disk=await fs.statfs(dir);const total=before.objects.reduce((s,o)=>s+o.size,0);
 if(disk.bavail*disk.bsize<total+256*1024*1024)throw Error('Espace disque insuffisant.');
 const files=[];
 for(const o of before.objects){
  const {data,error}=await client.storage.from(o.bucket).download(o.name).asStream();if(error||!data)throw Error('Téléchargement indisponible.');
  const encrypted=filename(o.bucket,o.name),meta=await encrypt(Readable.fromWeb(data),path.join(dir,encrypted),key,Math.min(MAX_FILE,o.size));
  if(meta.size!==o.size)throw Error('Taille distante modifiée.');files.push({...o,encrypted,...meta});
 }
 const after=await inventory(client);if(inventoryToken(before)!==inventoryToken(after))throw Error('Le stockage a changé pendant la copie ; sauvegarde non validée.');
 const manifest={format:'securionis-storage-backup-v1',project,createdAt:new Date().toISOString(),buckets:before.buckets,files};
 const envelope=await encrypt(Readable.from([Buffer.from(JSON.stringify(manifest))]),path.join(dir,'manifest.enc'),key,64*1024*1024);
 await fs.writeFile(path.join(dir,'receipt.json'),JSON.stringify({format:manifest.format,createdAt:manifest.createdAt,count:files.length,bytes:total,envelope},null,2),{flag:'wx',mode:0o600});
 return{count:files.length,bytes:total};
}
/** Restauration des octets dans un dossier neuf, sans réseau et sans chemin métier réutilisé. */
async function restore(dir,out,key){
 const receipt=JSON.parse(await fs.readFile(path.join(dir,'receipt.json'),'utf8'));
 if(receipt.format!=='securionis-storage-backup-v1')throw Error('Format inconnu.');
 await newDirectory(out);const manifestPath=path.join(out,'manifest.json');
 await decrypt(path.join(dir,'manifest.enc'),manifestPath,key,receipt.envelope,64*1024*1024);
 const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
 if(manifest.format!==receipt.format||!Array.isArray(manifest.files)||manifest.files.length!==receipt.count||manifest.files.length>MAX_OBJECTS)throw Error('Manifeste incohérent.');
 let total=0;const used=new Set();
 for(const f of manifest.files){
  if(typeof f.bucket!=='string'||typeof f.name!=='string'||f.encrypted!==filename(f.bucket,f.name)||used.has(f.encrypted)||!Number.isSafeInteger(f.size)||f.size<0||f.size>MAX_FILE)throw Error('Référence de fichier invalide.');
  used.add(f.encrypted);total+=f.size;if(total>MAX_TOTAL)throw Error('Limite totale dépassée.');
  await decrypt(path.join(dir,f.encrypted),path.join(out,f.encrypted.replace(/\.enc$/,'.bin')),key,f,MAX_FILE);
 }
 if(total!==receipt.bytes)throw Error('Total incohérent.');
 await fs.writeFile(path.join(out,'VERIFIED.json'),JSON.stringify({count:manifest.files.length,bytes:total,verifiedAt:new Date().toISOString()}),{flag:'wx',mode:0o600});
 return{count:manifest.files.length,bytes:total};
}
module.exports={backup,restore,inventory,encrypt,decrypt,filename,storageReader};
if(require.main===module){(async()=>{
 const [action,dir,out]=process.argv.slice(2),key=await fs.readFile(process.env.BACKUP_KEY_FILE||'');keyValid(key);
 let result;
 if(action==='backup'){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;if(!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(url||'')||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Configuration Supabase invalide.');
  const client=storageReader(url,process.env.SUPABASE_SERVICE_ROLE_KEY);
  result=await backup(client,dir,key,new URL(url).hostname.split('.')[0]);
 }else if(action==='restore')result=await restore(dir,out,key);else throw Error('Usage : storage.cjs backup DOSSIER_NEUF | restore SAUVEGARDE DOSSIER_NEUF');
 console.log(JSON.stringify({action,...result}));
})().catch(()=>{console.error('Échec : sauvegarde ou restauration non validée. Les données précédentes sont conservées.');process.exitCode=1;});}
