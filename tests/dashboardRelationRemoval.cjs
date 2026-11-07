// NODE_PATH=$(npm root -g) node tests/dashboardRelationRemoval.cjs
// Real UI with ALL GraphQL requests mocked; no evidence or real case is changed.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.FORENSIC_TEST_URL || 'https://forensic.dev.sea.maestro.living';
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
    const errors = [], removals = [], saves = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('forensic.authToken', 'mock-session'));
    const cases = [1, 2].map(id => ({__typename: 'CaseFile', id, caseId: `QA-${id}`,
      caseName: `Case ${id}`, status: 'ACTIVE', priority: 'MEDIUM',
      description: null, investigator: null, createdAt: '2026-11-01'}));
    let active = cases[0], failRemove = false;
    const filters = {1: {minAmount: 0, ignoredPairs: [], ignoredTxns: [], descRules: []},
      2: {minAmount: 0, ignoredPairs: [], ignoredTxns: [], descRules: []}};
    const accounts = [10, 20].map(id => ({__typename: 'BankAccount', id,
      accountNumber: `10000000${id}`, bankName: 'QA Bank', suspectId: null,
      iban: null, accountHolderName: `Owner ${id}`}));
    const txns = [
      [1, 10, '11111111', 'QA Person'], [2, 10, '22222222', 'QA Person'],
      [3, 20, '11111111', 'QA Person'], [4, 10, '33333333', 'Other Person'],
    ].map(([id, bankAccountId, counterpartyAccount, counterpartyName]) => ({
      __typename: 'BankTransaction', id, bankAccountId, counterpartyAccount,
      counterpartyName, counterpartyNationalId: null, timestamp: '2026-11-01T10:00:00Z',
      amount: 1000, type: 'credit', flagStatus: 'NORMAL', category: null,
      description: `QA transaction ${id}`, channel: null, runningBalance: null,
      currency: 'MNT', counterpartyOffender: false,
    }));
    function summary() {
      const visible = txns.filter(t => !filters[active.id].ignoredTxns.includes(t.id));
      const relation = (name, list) => ({key: `name:${name.toLowerCase()}`, name,
        account: list[0].counterpartyAccount, nationalId: null, offender: false,
        txnCount: list.length, creditCount: list.length, debitCount: 0,
        creditTotal: list.length * 1000, debitTotal: 0, netTotal: list.length * 1000,
        accountIds: [...new Set(list.map(t => t.bankAccountId))],
        mutual: new Set(visible.filter(t => t.counterpartyName === name).map(t => t.bankAccountId)).size > 1,
        subjectMatch: false});
      const relations = list => [...new Set(list.map(t => t.counterpartyName))]
        .map(name => relation(name, list.filter(t => t.counterpartyName === name)));
      return {statementAccounts: 2, totalRelations: relations(visible).length,
        mutualRelations: relations(visible).filter(r => r.mutual).length,
        txnCount: visible.length, creditCount: visible.length, debitCount: 0,
        creditTotal: visible.length * 1000, debitTotal: 0, netTotal: visible.length * 1000,
        unnamedTxnCount: 0, relations: relations(visible),
        byAccount: accounts.map(a => {
          const list = visible.filter(t => t.bankAccountId === a.id);
          return {accountId: a.id, label: a.accountHolderName, ownerName: a.accountHolderName,
            accountNumber: a.accountNumber, txnCount: list.length,
            relationCount: relations(list).length, mutualCount: relations(list).filter(r => r.mutual).length,
            creditCount: list.length, debitCount: 0, creditTotal: list.length * 1000,
            debitTotal: 0, netTotal: list.length * 1000, relations: relations(list)};
        })};
    }
    await page.route('**/*', async route => {
      let op;
      if (route.request().method() === 'POST') {try {op = route.request().postDataJSON();} catch {}}
      if (!op?.query) return route.continue();
      let data;
      switch (op.operationName) {
        case 'Me': data = {me: {__typename: 'User', id: 1, username: 'qa', rank: null,
          fullName: 'QA', role: 'ADMIN', active: true}}; break;
        case 'ActiveCase': data = {activeCase: active, caseFiles: cases}; break;
        case 'SetActiveCase': active = cases.find(c => c.id === op.variables.caseFileId);
          data = {setActiveCase: active}; break;
        case 'CaseNoiseFilter': data = {caseNoiseFilter: filters[active.id]}; break;
        case 'DashboardCase': data = {activeCase: active, suspects: [], bankAccounts: accounts,
          transactions: txns.filter(t => !filters[active.id].ignoredTxns.includes(t.id)),
          callRecords: [], suspectLinks: []}; break;
        case 'CaseRelations': data = {caseRelations: summary()}; break;
        case 'EvidenceForCase': data = {evidenceForCase: []}; break;
        case 'Transactions': data = {bankAccounts: accounts, transactions: txns}; break;
        case 'CallRecords': data = {callRecords: [], suspects: []}; break;
        case 'RemoveCaseRelation':
          removals.push(op.variables);
          if (failRemove) return route.fulfill({json: {errors: [{message: 'QA save failed'}]}});
          await new Promise(resolve => setTimeout(resolve, 150));
          assert.equal(op.variables.caseFileId, active.id);
          const ids = txns.filter(t => op.variables.bankAccountIds.includes(t.bankAccountId)
            && `name:${t.counterpartyName.toLowerCase()}` === op.variables.relationKey).map(t => t.id);
          filters[active.id].ignoredTxns = [...new Set([...filters[active.id].ignoredTxns, ...ids])];
          data = {removeCaseRelation: filters[active.id]}; break;
        case 'SaveCaseNoiseFilter':
          saves.push(op.variables.input); filters[active.id] = op.variables.input;
          data = {saveCaseNoiseFilter: filters[active.id]}; break;
        default: throw Error(`Unexpected GraphQL: ${op.operationName}`);
      }
      return route.fulfill({json: {data}});
    });
    await page.goto(`${base}/dashboard`);
    const rows = () => page.locator('.dashboard-relation-row').filter({hasText: 'QA Person'});
    const dialog = () => page.getByRole('dialog', {name: 'Харьцааны дэлгэрэнгүй'});
    const start = () => dialog().getByRole('button', {name: 'Харьцааг устгах', exact: true}).click();
    const confirm = () => dialog().getByRole('button', {name: 'Устгахыг баталгаажуулах', exact: true});
    await rows().first().waitFor();
    assert.equal(await rows().count(), 2);
    await rows().first().click(); await start();
    await dialog().getByRole('button', {name: 'Болих', exact: true}).click();
    assert.equal(removals.length, 0);
    // Simulate a case change delivered while the modal is open (e.g. another
    // scope control); dispatch because the overlay correctly blocks pointer clicks.
    await start();
    await page.locator('.app-header-select .select-trigger').dispatchEvent('click');
    await page.getByRole('option').filter({hasText: 'QA-2'}).dispatchEvent('click');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal(removals.length, 0);
    await page.locator('.app-header-select .select-trigger').click();
    await page.getByRole('option').filter({hasText: 'QA-1'}).click();
    await rows().first().click(); await start();
    failRemove = true;
    await confirm().click(); await dialog().getByRole('alert').waitFor();
    assert.equal(await rows().count(), 2);
    assert.deepEqual(filters[1].ignoredTxns, []);
    failRemove = false;
    await confirm().dblclick();
    await page.getByRole('status').filter({hasText: 'Харьцааг устгалаа.'}).waitFor();
    await rows().first().waitFor();
    assert.equal(await rows().count(), 1, 'Same party in another account must remain');
    assert.deepEqual(removals, [1, 2].map(() => ({caseFileId: 1,
      relationKey: 'name:qa person', bankAccountIds: [10]})));
    assert.deepEqual(filters[1].ignoredTxns, [1, 2]);
    assert.deepEqual(filters[2].ignoredTxns, []);
    await page.getByRole('link', {name: 'Хасагдсаныг сэргээх', exact: true}).click();
    await page.getByText('QA transaction 1', {exact: true}).waitFor();
    await page.getByText('QA transaction 2', {exact: true}).waitFor();
    assert(page.url().includes('view=removed'));
    await page.reload();
    await page.getByText('QA transaction 1', {exact: true}).waitFor();
    const removedRow = page.locator('tr').filter({hasText: 'QA transaction 1'});
    const saved = page.waitForResponse(r => {
      try {return r.request().postDataJSON().operationName === 'SaveCaseNoiseFilter';} catch {return false;}
    });
    await removedRow.getByRole('button', {name: /Сэргээх/}).click();
    await page.waitForFunction(() => !document.body.textContent.includes('QA transaction 1'));
    await saved;
    assert(saves.length > 0);
    assert.deepEqual(filters[1].ignoredTxns, [2]);
    await page.goto(`${base}/dashboard`);
    await rows().first().waitFor();
    assert.equal(await rows().count(), 2, 'Restored relation must return to dashboard');
    // New dialog controls fit in a narrow viewport.
    await page.setViewportSize({width: 390, height: 844});
    await rows().first().click(); await start();
    for (const button of await dialog().getByRole('button').all()) {
      const b = await button.boundingBox();
      assert(b && b.x >= 0 && b.x + b.width <= 391, 'Modal button outside viewport');
    }
    assert.deepEqual(errors, []);
    console.log('PASS: dashboard removal confirms, cancels on case switch, retries failure, scopes exact account, persists into Removed view and restores; controls fit at 390px (mock API)');
  } finally {await browser.close();}
})().catch(e => {console.error(e); process.exitCode = 1;});
