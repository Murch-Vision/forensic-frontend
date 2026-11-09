// node tests/graphAnalysis.cjs — pure, no API or evidence mutations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const cache = new Map();
function load(name) {
  const filename = path.resolve(__dirname, '../src/lib', `${name}.ts`);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = {exports: {}}; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'),
    {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  new Function('exports', 'require', 'module', code)(mod.exports,
    dep => dep.startsWith('.') ? load(dep.slice(2)) : require(dep), mod);
  return mod.exports;
}
const {analyseGraph, sharedGraphRelations} = load('graphAnalysis');
const {graphVerdict} = load('linkVerdict');
const node = (id, extra = {}) => ({id, label:id, type:'PERSON', cluster:id,
  weight:1, stats:[], ...extra});
const nodes = [node('A', {stats:[['Гүйлгээ','10']], offender:true}),
  node('B', {stats:[['Гүйлгээ','10']]}), node('shared'), node('midA'), node('midB'),
  node('twoHop'), node('unrelated', {riskLevel:'HIGH'}),
  node('aPhone', {type:'PHONE'}), node('bPhone', {type:'PHONE'}),
  node('unknown', {type:'ACCOUNT', sub:'Unknown bank account'})];
const edge = (source, target, kind = 'txn', facts = {}, extra = {}) =>
  ({source, target, kind, facts, strength:1, ...extra});
const links = [edge('A','shared','txn',{txnTotal:150,moneyOut:100,moneyIn:50,txnCount:2}),
  edge('B','shared','txn',{txnTotal:20,moneyOut:20,txnCount:1}),
  edge('A','midA'), edge('B','midB'), edge('midA','twoHop'), edge('midB','twoHop'),
  edge('A','aPhone','owns'), edge('B','bPhone','owns'),
  edge('aPhone','bPhone','call',{callCount:3,callSeconds:90}),
  edge('B','unrelated','manual'),
  edge('A','unknown','txn',{txnTotal:7,moneyOut:999}, {soft:true})];
const a = analyseGraph(nodes, links);
assert.deepEqual(a.flow.map(r => [r.source.id,r.target.id,r.amount,r.directed]),
  [['A','shared',100,true],['shared','A',50,true],['B','shared',20,true],['A','unknown',7,false]]);
assert.equal(a.flow.reduce((sum,r) => sum+r.amount,0), 177);
assert.deepEqual(a.shared.map(r => [r.node.id,r.distance]), [['shared',1],['twoHop',2]]);
assert.equal(a.shared[0].money,170);
assert.equal(a.shared[0].txns,3);
for (const id of ['A','B','shared','midA','midB','twoHop'])
  assert(a.sharedScene.nodes.some(n => n.id === id), `Shared scene includes full path: ${id}`);
assert.equal(a.sharedScene.links.length,6);
assert(a.red.some(r => r.link.kind === 'call' && r.sourcePerson.id === 'A'), 'Owned-phone calls included');
assert(!a.red.some(r => r.link.kind === 'owns'), 'Ownership is context, not evidence');
assert(!a.red.some(r => r.source.id === 'unrelated' || r.target.id === 'unrelated'), 'Risk alone is not a red flag');
assert(a.redScene.links.some(l => l.kind === 'owns' && l.target === 'aPhone'));
assert(!a.redScene.nodes.some(n => n.id === 'unrelated'));
assert.equal(a.undirectedScene.links.filter(l => l.kind !== 'owns').length,1);
const verdictRows = graphVerdict(nodes,links).find(v => v.rows).rows;
assert.equal(verdictRows.length,a.shared.length, 'Printed verdict and panels share one bridge rule');
const filtered = analyseGraph(nodes.filter(n => n.id !== 'B'), links);
assert.equal(filtered.shared.length,0, 'A hidden/missing endpoint cannot remain a shared root');
assert.equal(filtered.flow.length,3);
const removed = analyseGraph(nodes,links.filter(l => l.kind !== 'txn'));
assert.equal(removed.flow.length,0);
assert(!removed.red.some(r => r.link.kind === 'txn'));
assert.equal(sharedGraphRelations([node('A'),node('B'),node('shared')],links.slice(0,2)).length,0,
  'Degree alone does not promote counterparties into statement owners');
assert.deepEqual(analyseGraph([],[]).flow,[]);
const unknownShared = analyseGraph(nodes, [edge('A','unknown'),edge('B','unknown')]);
assert.equal(unknownShared.shared[0].node.type,'ACCOUNT','Unknown-owner accounts remain identifiable shared bridges');
console.log('PASS: directional/unknown totals, shared one/two-hop paths, shared verdict rules, exact red flags, phone ownership, filtered and empty scenes');
