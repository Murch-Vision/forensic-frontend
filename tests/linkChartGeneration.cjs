// NODE_PATH=$(npm root -g) node tests/linkChartGeneration.cjs
// Real canvas/page, all GraphQL mocked; no live case/evidence changes.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const initial = Object.fromEntries(Array.from({length: 8}, (_, i) =>
      [`s:${i + 1}`, {x: i * 90, y: 100, ...(i === 2 ? {s: 1.7, sh: 'rect'} : {})}]));
    await page.addInitScript(initial => {
      localStorage.setItem('forensic.authToken', 'mock-session');
      localStorage.setItem('forensic.nodePositions:1', JSON.stringify(initial));
    }, initial);
    const active = {__typename: 'CaseFile', id: 1, caseId: 'QA', caseName: 'QA',
      status: 'ACTIVE', priority: 'MEDIUM'};
    const people = Array.from({length: 8}, (_, i) => ({__typename: 'Suspect', id: i + 1,
      suspectId: `QA-${i + 1}`, fullName: `QA Person ${i + 1}`, riskLevel: 'LOW',
      organization: null, initials: 'Q', photoData: null, offender: false, phoneNumbers: []}));
    const accounts = people.map(p => ({__typename: 'BankAccount', id: p.id,
      accountNumber: String(1000000000 + p.id), bankName: 'QA Bank', suspectId: p.id}));
    const pairs = [[1,3],[1,4],[1,5],[2,6],[2,7],[2,8],[3,null]];
    const txns = pairs.map(([bankAccountId, cp], i) => ({__typename: 'BankTransaction',
      id: i + 1, bankAccountId, counterpartyAccount: cp ? String(1000000000 + cp) : null,
      counterpartyName: cp ? `QA Person ${cp}` : 'QA Person 6', counterpartyNationalId: null,
      timestamp: '2026-11-01T10:00:00Z', amount: 100, type: 'credit', description: null,
      category: null, channel: null, runningBalance: 100, flagStatus: 'NORMAL',
      currency: 'MNT', counterpartyOffender: false}));
    let generated = false, fail = true, foreignBacking = true;
    const link = () => ({__typename: 'SuspectLink', id: 500, sourceSuspectId: 3,
      targetSuspectId: 6, linkType: 'FINANCIAL_TRANSFER', description: 'QA inferred transfer',
      strength: 1, totalFinancialValue: 999999, totalCallCount: null,
      confidenceLevel: 'MEDIUM', contributingTxnIds: foreignBacking ? [9999] : [7], caseGraphId: null});
    await page.route('**/*', async route => {
      let op;
      if (route.request().method() === 'POST') {try {op = route.request().postDataJSON();} catch {}}
      if (!op?.query) return route.continue();
      let data;
      switch (op.operationName) {
        case 'Me': data = {me: {__typename: 'User', id: 1, username: 'qa', rank: null,
          fullName: 'QA', role: 'ADMIN', active: true}}; break;
        case 'ActiveCase': data = {activeCase: active, caseFiles: [active]}; break;
        case 'LinkChart': data = {suspects: people, suspectLinks: generated ? [link()] : []}; break;
        case 'Transactions': data = {bankAccounts: accounts, transactions: txns}; break;
        case 'CallRecords': data = {callRecords: [], suspects: people}; break;
        case 'CaseGraphs': data = {caseGraphs: []}; break;
        case 'CaseNoiseFilter': data = {caseNoiseFilter: {minAmount: 0, ignoredPairs: [], ignoredTxns: [], descRules: []}}; break;
        case 'NetworkFlow': data = {networkFlow: {nodeLabels: [], nodeColors: [],
          sourceIndices: [], targetIndices: [], values: [], linkColors: []}}; break;
        case 'GenerateLinks':
          if (fail) return route.fulfill({json: {errors: [{message: 'QA generation failed'}]}});
          generated = true; data = {generateLinks: [link()]}; break;
        default: throw Error(`Unexpected GraphQL ${op.operationName}`);
      }
      await route.fulfill({json: {data}});
    });
    await page.goto(process.env.FORENSIC_TEST_URL || 'https://forensic.dev.sea.maestro.living/linkchart');
    await page.locator('canvas').first().waitFor();
    const generate = () => page.getByRole('button', {name: 'ХОЛБООС ҮҮСГЭХ', exact: true}).click();
    const positions = () => page.evaluate(() => JSON.parse(localStorage.getItem('forensic.nodePositions:1')));
    await generate(); await page.getByRole('alert').filter({hasText: 'QA generation failed'}).waitFor();
    assert.deepEqual(await positions(), initial, 'Failed generation preserves the arrangement');
    fail = false; await generate();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('forensic.nodePositions:1'))['s:1'].x < 0);
    let pos = await positions();
    assert(Math.abs(pos['s:3'].x - pos['s:1'].x) < 200, 'Foreign-only backing cannot create a bridge');
    foreignBacking = false; await generate();
    await page.waitForFunction(() => {
      const p = JSON.parse(localStorage.getItem('forensic.nodePositions:1'));
      return Math.abs(p['s:3'].x - (p['s:1'].x + p['s:2'].x) / 2) < 1;
    });
    pos = await positions();
    for (const id of ['s:3','s:6']) assert(Math.abs(pos[id].x - (pos['s:1'].x + pos['s:2'].x) / 2) < 1);
    assert(Math.abs(pos['s:4'].x - pos['s:1'].x) < 200);
    assert(Math.abs(pos['s:7'].x - pos['s:2'].x) < 200);
    assert.equal(pos['s:3'].s, 1.7); assert.equal(pos['s:3'].sh, 'rect');
    assert.deepEqual(errors, []);
    console.log('PASS: canvas regenerates shared middle groups from pinned drafts, preserves size/shape, excludes foreign-only backing and retains arrangement on failure (mock API)');
  } finally {await browser.close();}
})().catch(e => {console.error(e); process.exitCode = 1;});
