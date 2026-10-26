const test=require('node:test');const assert=require('node:assert/strict');const load=require('./load-ts.cjs');
const S=load('src/lib/visites/selection-points.ts');
const pt=(id,intitule,cat,catId,theme,extra={})=>({id,intitule,famille:null,categorie_id:catId,theme_id:theme,base_legale:null,mots_cles:[],categories:{libelle:cat},themes:{libelle:'t'},...extra});
const points=[
 pt('a','Gardes-corps de l’échafaudage','Échafaudages','c1','t1',{base_legale:'Suva 33024'}),
 pt('b','Ancrages contrôlés','Échafaudages','c1','t2'),
 pt('c','Échelle stable, dépasse de 1 m','Échelles','c2','t3'),
 pt('d','Tranchée blindée','Fouilles & Talus','c3','t4',{famille:'Fouilles & Terrasse',mots_cles:['fouille']}),
 pt('e','Point terrain ajouté','Échelles','c2','t5',{is_custom:true}),
];
test('Recherche: insensible aux accents, chaque mot comme début de mot, sur tout le texte',()=>{
 assert.deepEqual(S.filtrerPoints(points,{type:'tous'},'echa').map(p=>p.id),['a','b']);
 assert.deepEqual(S.filtrerPoints(points,{type:'tous'},'garde echaf').map(p=>p.id),['a']);
 assert.deepEqual(S.filtrerPoints(points,{type:'tous'},'corps').map(p=>p.id),['a']);
 assert.deepEqual(S.filtrerPoints(points,{type:'tous'},'orps').map(p=>p.id),[]);
 assert.deepEqual(S.filtrerPoints(points,{type:'tous'},'33024').map(p=>p.id),['a']);
 assert.deepEqual(S.filtrerPoints(points,{type:'tous'},'fouille').map(p=>p.id),['d']);
 assert.equal(S.filtrerPoints(points,{type:'tous'},'  ').length,points.length);
});
test('Familles: colonne famille prioritaire, sinon déduite de la catégorie',()=>{
 assert.deepEqual(S.filtrerPoints(points,{type:'famille',famille:'Protections antichute'},'').map(p=>p.id).sort(),['a','b','c','e']);
 assert.deepEqual(S.filtrerPoints(points,{type:'famille',famille:'Fouilles & Terrasse'},'').map(p=>p.id),['d']);
 assert.equal(S.compterParFamille(points).get('Protections antichute'),4);
 assert.deepEqual(S.filtrerPoints(points,{type:'categories',ids:['c2']},'').map(p=>p.id).sort(),['c','e']);
 assert.deepEqual(S.filtrerPoints(points,{type:'selection',ids:new Set(['b'])},'').map(p=>p.id),['b']);
});
test('Groupes: ordre des familles, puis catégorie, puis intitulé',()=>{
 const g=S.grouperParCategorie(points);
 assert.deepEqual(g.map(x=>x.libelle),['Échafaudages','Échelles','Fouilles & Talus']);
 assert.deepEqual(g[0].points.map(p=>p.id),['b','a']);
});
test('Rattachements: thèmes et catégories distincts de la sélection',()=>{
 assert.deepEqual(S.deduireRattachements([points[0],points[1],points[2]]),{themeIds:['t1','t2','t3'],categorieIds:['c1','c2']});
});
