// node tests/graphClusters.cjs
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const mod = {exports: {}};
const code = ts.transpileModule(fs.readFileSync(require.resolve('../src/lib/graphClusters.ts'), 'utf8'),
  {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
new Function('exports', 'require', 'module', code)(mod.exports, require, mod);
const {graphClusterClaims} = mod.exports;
const ids = ['A', 'B', 'a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'shared', 'child'];
const nodes = ids.map(id => ({id}));
const edge = (source, target, soft = false) => ({source, target, soft, kind: 'txn', strength: 1});
const links = ['a1','a2','a3'].map(id => edge('A', id))
  .concat(['b1','b2','b3'].map(id => edge('B', id)),
    [edge('A','shared'), edge('B','shared'), edge('shared','child')]);
const roots = (result, id) => [...result.claim.get(id).centers].sort();
const ordinary = graphClusterClaims(nodes, links);
assert.deepEqual(ordinary.centers.map(n => n.id), ['A', 'B']);
assert.deepEqual(roots(ordinary,'shared'), ['A','B']);
assert.deepEqual(roots(ordinary,'child'), ['A','B'], 'Tied claims propagate to shared descendants');
const generated = graphClusterClaims(nodes, links.concat(edge('a1','b1',true), edge('A','b2',true)));
for (const id of ['a1','b1','b2','shared','child']) assert.deepEqual(roots(generated,id), ['A','B']);
assert.deepEqual(roots(generated,'a2'), ['A']);
assert.deepEqual(roots(generated,'b3'), ['B']);
assert.deepEqual(roots(generated,'A'), ['A']);
assert.deepEqual(roots(generated,'B'), ['B']);
assert.deepEqual(generated.centers.map(n => n.id), ['A','B'], 'Soft bridges must not create hubs');
assert.deepEqual(roots(graphClusterClaims(nodes,links.concat(edge('a1','a2',true))), 'a1'), ['A']);
assert.deepEqual(graphClusterClaims([{id:'x'},{id:'y'}],[edge('x','y',true)]).centers, []);
console.log('PASS: generated cross-group endpoints join the middle group; own leaves/hubs stay separate; shared descendants and same-group links behave correctly');
