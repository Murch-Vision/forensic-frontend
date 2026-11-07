// NODE_PATH=$(npm root -g) node tests/multiCaseAnalysis.cjs
// All GraphQL is mocked. Never changes real cases, filters or evidence.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.FORENSIC_TEST_URL || 'https://forensic.dev.sea.maestro.living';
(async () => {
  const browser = await chromium.launch();
  try {
    const requests = [], mutations = [], errors = [], unexpected = [];
    let role = 'ADMIN', fail = false, delay = 0;
    const cases = [1, 2, 3].map(id => ({__typename: 'CaseFile', id,
      caseId: `QA-${id}`, caseName: `Case ${id}`, status: 'ACTIVE'}));
    const accounts = [10, 20].map((id, i) => ({caseFileIds: [1, 2], statementCaseFileIds: i ? [2] : [1, 2],
      account: {__typename: 'BankAccount', id, accountNumber: `10000000${id}`,
        suspectId: i + 1, bankName: 'QA Bank', accountHolderName: `Owner ${id}`, iban: null}}));
    const people = [1, 2].map(id => ({caseFileIds: [1, 2], person: {__typename: 'Suspect',
      id, fullName: `Owner ${id * 10}`, nationalId: null, riskLevel: 'LOW',
      organization: null, photoData: null, offender: false}}));
    const transactions = Array.from({length: 33}, (_, i) => ({caseFileIds: i === 32 ? [1] : [1, 2],
      relationKey: i === 32 ? 'name:solo' : 'name:shared', transaction: {
        __typename: 'BankTransaction', id: i + 1, bankAccountId: 10,
        timestamp: `2026-11-01T10:${String(i).padStart(2, '0')}:00Z`,
        amount: (i + 1) * 100, type: 'credit', counterpartyAccount: '1000000020',
        counterpartyName: i === 32 ? 'Solo Person' : 'Shared Person',
        counterpartyNationalId: 'AA12345678', description: `QA row ${i + 1}`,
        category: null, channel: null, referenceNumber: null, location: null,
        runningBalance: 0, currency: 'MNT', flagStatus: 'NORMAL'}}));
    const relations = [['shared', 32, [1, 2]], ['solo', 1, [1]]].map(([name, count, ids]) => ({
      caseFileIds: ids, relation: {key: `name:${name}`, name: `${name === 'shared' ? 'Shared' : 'Solo'} Person`,
        account: '1000000020', nationalId: 'AA12345678', txnCount: count, creditTotal: count * 100, debitTotal: 0}}));
    const analysis = ids => ids.includes(3) ? {cases: cases.filter(c => ids.includes(c.id)),
      accounts: [], people: [], transactions: [], relations: [], links: []}
      : {cases: cases.filter(c => ids.includes(c.id)), accounts, people, transactions, relations, links: []};
    async function setup(page) {
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => localStorage.setItem('forensic.authToken', 'mock-session'));
      await page.route('**/*', async route => {
        let op;
        if (route.request().method() === 'POST') {try {op = route.request().postDataJSON();} catch {}}
        if (!op?.query) return route.continue();
        if (/\bmutation\b/.test(op.query)) mutations.push(op.operationName);
        let data;
        switch (op.operationName) {
          case 'Me': data = {me: {__typename: 'User', id: 1, username: 'qa', fullName: 'QA',
            rank: null, role, active: true}}; break;
          case 'ActiveCase': data = {activeCase: null, caseFiles: cases}; break;
          case 'AdminAnalysisCases': data = {caseFiles: cases}; break;
          case 'AdminCaseAnalysis':
            requests.push(op.variables.caseFileIds);
            if (delay) await new Promise(resolve => setTimeout(resolve, delay));
            if (fail) return route.fulfill({json: {errors: [{message: 'QA analysis failed'}]}});
            data = {adminCaseAnalysis: analysis(op.variables.caseFileIds)}; break;
          case 'DashboardCase': data = {activeCase: null, suspects: [], bankAccounts: [],
            transactions: [], callRecords: [], suspectLinks: []}; break;
          case 'CaseRelations': data = {caseRelations: {statementAccounts: 0, totalRelations: 0,
            mutualRelations: 0, txnCount: 0, creditCount: 0, debitCount: 0, creditTotal: 0,
            debitTotal: 0, netTotal: 0, unnamedTxnCount: 0, relations: [], byAccount: []}}; break;
          case 'CaseNoiseFilter': data = {caseNoiseFilter: {minAmount: 0,
            ignoredPairs: [], ignoredTxns: [], descRules: []}}; break;
          default: unexpected.push(op.operationName);
            return route.fulfill({json: {errors: [{message: `Unexpected operation ${op.operationName}`}]}});
        }
        return route.fulfill({json: {data}});
      });
    }
    const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
    await setup(page);
    const main = page.locator('.multi-case-page');
    const tab = name => main.getByRole('tab', {name, exact: true});
    const rowCount = count => page.waitForFunction(n => document.querySelectorAll('.multi-case-page tbody tr').length === n, count);
    await page.goto(`${base}/case-analysis`);
    await main.getByText('Хамтад нь харах хэргүүдээ сонгоно уу.', {exact: true}).waitFor();
    assert.equal(await page.getByRole('link', {name: '🗂 Хэрэг дамнасан шинжилгээ'}).count(), 1);
    assert.equal(await page.locator('.app-header-select').count(), 0);
    assert.equal(requests.length, 0);
    await main.locator('.multi-case-picker .select-trigger').click();
    await page.getByRole('option').filter({hasText: 'QA-1'}).click();
    await page.getByRole('option').filter({hasText: 'QA-2'}).click();
    await main.getByText('Хамтад нь харах хэргүүд', {exact: true}).click();
    await main.locator('canvas').first().waitFor();
    assert.equal(new URL(page.url()).searchParams.get('cases'), '1,2');
    assert.deepEqual(requests.at(-1), [1, 2]);
    await tab('Дундын харьцаа').click();
    await main.getByRole('cell', {name: 'Shared Person'}).waitFor();
    assert.equal(await main.getByRole('cell', {name: 'Solo Person'}).count(), 0);
    assert((await main.locator('tbody').innerText()).includes('QA-2 · Case 2'));
    await tab('Бүх харьцаа').click();
    await main.getByRole('cell', {name: 'Solo Person'}).waitFor();
    await main.getByRole('row').filter({hasText: 'Solo Person'}).getByRole('button', {name: /Харах/}).click();
    await main.getByText('QA row 33', {exact: true}).waitFor();
    await rowCount(1);
    assert.equal(await main.getByRole('button', {name: 'Дараах', exact: true}).count(), 0,
      'Drilldown pagination must count filtered rows');
    assert(!page.url().includes('name:solo'));
    await main.getByRole('button', {name: 'Бүх гүйлгээг харах'}).click();
    await rowCount(25);
    await main.getByRole('button', {name: 'Дараах', exact: true}).click();
    await rowCount(8);
    assert.equal(new URL(page.url()).searchParams.get('page'), '2');
    await page.reload();
    await main.getByText('2 / 2', {exact: true}).waitFor();
    await rowCount(8);
    const second = await browser.newPage(); await setup(second);
    await second.goto(page.url());
    await second.getByText('2 / 2', {exact: true}).waitFor();
    await second.close();
    await main.locator('.multi-case-table-tools .select-trigger').click();
    await page.getByRole('option', {name: 'Их дүн', exact: true}).click();
    await main.getByText('1 / 2', {exact: true}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('sort'), 'amount');
    await page.reload();
    await main.getByText('QA row 33', {exact: true}).waitFor();
    await tab('Данс').click();
    await rowCount(2);
    await page.goBack();
    await main.getByText('QA row 33', {exact: true}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('sort'), 'amount');
    // New selection must hide stale rows during loading, on failure and on retry.
    delay = 450; fail = true;
    await main.locator('.multi-case-picker .select-trigger').click();
    await page.getByRole('option').filter({hasText: 'QA-3'}).click();
    await main.getByText('Хамтад нь харах хэргүүд', {exact: true}).click();
    await rowCount(0);
    await main.getByRole('alert').filter({hasText: 'QA analysis failed'}).waitFor();
    assert.equal(await main.getByText('QA row 33', {exact: true}).count(), 0);
    delay = 0; fail = false;
    await main.getByRole('button', {name: 'Дахин оролдох'}).click();
    await main.getByRole('tab', {name: 'Гүйлгээ', selected: true}).waitFor();
    await rowCount(0);
    await main.locator('.multi-case-picker .select-trigger').click();
    await page.getByRole('option', {name: 'Хэрэг сонгоогүй', exact: true}).click();
    await main.getByText('Хамтад нь харах хэргүүд', {exact: true}).click();
    await main.getByText('Хамтад нь харах хэргүүдээ сонгоно уу.', {exact: true}).waitFor();
    await main.getByRole('button', {name: 'Бүгдийг сонгох'}).click();
    await main.getByRole('tab', {name: 'Гүйлгээ', selected: true}).waitFor();
    assert.deepEqual(requests.at(-1), [1, 2, 3]);
    // Controls fit the usable content area at tablet width.
    await page.setViewportSize({width: 800, height: 1000});
    for (const control of await main.locator('.multi-case-picker button, .multi-case-tabs button').all()) {
      const box = await control.boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= 801, 'New control outside viewport');
    }
    const count = requests.length;
    role = 'DETECTIVE';
    const detective = await browser.newPage(); await setup(detective);
    await detective.goto(`${base}/case-analysis?cases=1,2`);
    await detective.waitForURL('**/dashboard');
    await detective.getByRole('link', {name: /Хяналтын самбар/}).waitFor();
    assert.equal(await detective.getByRole('link', {name: /Хэрэг дамнасан шинжилгээ/}).count(), 0);
    assert.equal(requests.length, count, 'Non-admin direct URL must not query combined data');
    assert.deepEqual(mutations, [], 'Combined view must never merge cases or change active scope/evidence');
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    console.log('PASS: admin-only menu/route, multi-select, graph/shared/all/transaction/account views, source cases, drilldown pagination, URL reload/back/new-window state, stale/loading/error/retry handling, tablet controls and no mutations (mock API)');
  } finally {await browser.close();}
})().catch(e => {console.error(e); process.exitCode = 1;});
