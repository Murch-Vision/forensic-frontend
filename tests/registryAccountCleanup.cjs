// NODE_PATH=$(npm root -g) node tests/registryAccountCleanup.cjs
// Use the real preview UI with EVERY GraphQL request mocked. No real account,
// evidence, lookup service, or active case is modified by this test.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
    const errors = [], deletes = [], inspections = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('forensic.authToken', 'mock-qa-session'));
    const account = (id, accountNumber) => ({__typename: 'BankAccount', id, accountNumber,
      iban: null, bankName: 'Хаан банк', accountHolderName: 'QA owner'});
    function person(key, fullName, accounts) {
      return {key, fullName, aliases: [], riskLevel: 'LOW', photoData: null, occupation: null,
        nationalId: null, offender: false, matchedBy: [], phoneNumbers: [],
        accountNumbers: accounts.map(a => a.accountNumber), bankAccounts: accounts,
        transactionCount: 0, callRecordCount: 0, cases: [], suspects: [{
          __typename: 'Suspect', id: key === 'p1' ? 51 : 52, suspectId: key, fullName,
          aliases: null, nationalId: null, passportNumber: null, dateOfBirth: null,
          gender: null, address: null, city: null, country: null, primaryPhone: null,
          email: null, occupation: null, organization: null, riskLevel: 'LOW', notes: null,
          photoData: null, status: 'ACTIVE', createdAt: '2026-10-01', age: 0,
        }]};
    }
    const people = [person('p1', 'QA First', [account(101, '1111111111'), account(102, '2222222222')]),
      person('p2', 'QA Second', [account(201, '3333333333')])];
    let previewFails = false, deleteFails = false, slowDelete = false;
    await page.route('**/*', async route => {
      let op;
      if (route.request().method() === 'POST') { try { op = route.request().postDataJSON(); } catch {} }
      if (!op?.query) return route.continue();
      let data;
      switch (op.operationName) {
        case 'Me': data = {me: {__typename: 'User', id: 1, username: 'qa', rank: null,
          fullName: 'QA', role: 'ADMIN', active: true}}; break;
        case 'ActiveCase': data = {activeCase: null, caseFiles: []}; break;
        case 'CaseNoiseFilter': data = {caseNoiseFilter: {minAmount: 0, ignoredPairs: [], ignoredTxns: [], descRules: []}}; break;
        case 'GlobalPeople': data = {globalPeople: people}; break;
        case 'BankAccountCleanupPreview': {
          inspections.push(op.variables.id);
          if (previewFails) return route.fulfill({json: {errors: [{message: 'QA preview failed'}]}});
          const a = people.flatMap(p => p.bankAccounts).find(a => a.id === op.variables.id);
          assert(a);
          data = {bankAccountCleanupPreview: {__typename: 'BankAccountCleanupPreview',
            id: a.id, accountNumber: a.accountNumber, txnCount: 0,
            cases: a.id === 102 ? [{__typename: 'CaseFile', id: 8, caseId: 'OTHER', caseName: 'Other case'}] : []}};
          break;
        }
        case 'DeleteOrphanBankAccount': {
          deletes.push(op.variables);
          assert.notEqual(op.variables.id, 102, 'Shared account must never be deleted');
          if (slowDelete) await new Promise(resolve => setTimeout(resolve, 300));
          if (deleteFails) return route.fulfill({json: {errors: [{message: 'Энэ данс хэрэгт ашиглагдаж байна.'}]}});
          const p = people.find(p => p.bankAccounts.some(a => a.id === op.variables.id));
          const a = p.bankAccounts.find(a => a.id === op.variables.id);
          p.bankAccounts = p.bankAccounts.filter(a => a.id !== op.variables.id);
          p.accountNumbers = p.bankAccounts.map(a => a.accountNumber);
          data = {deleteOrphanBankAccount: {accountNumber: a.accountNumber,
            transactions: 0, analyses: 0, conclusions: 0, evidence: 0, links: 0}};
          break;
        }
        default: throw Error('Unexpected GraphQL: ' + op.operationName);
      }
      return route.fulfill({json: {data}});
    });
    await page.goto(process.env.FORENSIC_TEST_URL || 'https://forensic.dev.longbinarycity.com/people');
    const row = number => page.locator('.registry-account-row').filter({hasText: number});
    const confirm = () => page.getByRole('button', {name: 'Устгахыг баталгаажуулах', exact: true});
    const open = id => page.getByRole('button', {name: `Данс ${id} устгах`, exact: true}).click();
    await row('1111111111').waitFor();
    await open('1111111111'); await confirm().waitFor();
    await page.getByRole('button', {name: 'Болих', exact: true}).click();
    assert.equal(deletes.length, 0);
    await open('1111111111'); await confirm().waitFor();
    await page.locator('.person-row').filter({hasText: 'QA Second'}).click();
    assert.equal(await confirm().count(), 0, 'Changing person must discard confirmation');
    await page.locator('.person-row').filter({hasText: 'QA First'}).click();
    await open('2222222222');
    await page.getByRole('region').getByText('Other case · OTHER', {exact: true}).waitFor();
    assert.equal(await confirm().count(), 0);
    assert.equal(deletes.length, 0);
    await page.getByRole('button', {name: 'Болих', exact: true}).click();
    previewFails = true; await open('1111111111');
    await page.getByRole('alert').filter({hasText: 'QA preview failed'}).waitFor();
    assert.equal(await confirm().count(), 0);
    previewFails = false;
    await page.getByRole('button', {name: 'Дахин шалгах', exact: true}).click();
    await confirm().waitFor();
    deleteFails = true; await confirm().click();
    await page.getByRole('alert').filter({hasText: 'Энэ данс хэрэгт ашиглагдаж байна.'}).waitFor();
    assert.equal(await confirm().count(), 0, 'A rejected write must discard stale preview');
    assert.equal(await row('1111111111').count(), 1);
    deleteFails = false;
    await page.getByRole('button', {name: 'Дахин шалгах', exact: true}).click();
    await confirm().waitFor(); slowDelete = true;
    await confirm().dblclick();
    await row('1111111111').waitFor({state: 'detached'});
    assert.equal(await row('2222222222').count(), 1, 'Other account of same owner survives');
    await page.getByRole('status').filter({hasText: '1111111111 данс, 0 гүйлгээг устгалаа.'}).waitFor();
    assert.deepEqual(deletes, [{id: 101}, {id: 101}]); // one rejected, one successful
    assert(inspections.filter(id => id === 101).length >= 4);
    assert.deepEqual(errors, []);
    // The action holds a fixed column on narrow displays too.
    await page.setViewportSize({width: 390, height: 844});
    await row('2222222222').scrollIntoViewIfNeeded();
    const bounds = await row('2222222222').evaluate(el => {
      const b = el.getBoundingClientRect();
      const button = el.querySelector('button[aria-expanded]').getBoundingClientRect();
      return {rowRight: b.right, buttonRight: button.right, viewport: innerWidth};
    });
    assert(bounds.buttonRight <= bounds.rowRight + 1);
    assert(bounds.buttonRight <= bounds.viewport + 1);
    console.log('PASS: registry delete preview, cancel, person switch, protected case, retries, server veto, exact-ID deletion, refresh, double-click lock, mobile fit (all API mocked)');
  } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exitCode = 1;});
