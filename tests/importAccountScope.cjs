// NODE_PATH=$(npm root -g) node tests/importAccountScope.cjs
// Exercise the actual preview UI; ALL GraphQL operations are mocked so no
// real accounts, imports, active-case selections or evidence can be changed.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage();const errors=[];const requests=[];const deletes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('forensic.authToken','mock-qa-session'));
  const cases=[{__typename:'CaseFile',id:901,caseId:'QA-A',caseName:'A',status:'ACTIVE',priority:'MEDIUM'},
    {__typename:'CaseFile',id:902,caseId:'QA-B',caseName:'B',status:'ACTIVE',priority:'MEDIUM'}];
  let active=cases[0];const rows={901:[account(101,'1111111111')],902:[account(202,'2222222222')]};
  function account(id,accountNumber){return {__typename:'AccountRecord',id,accountNumber,bankName:null,ownerName:'QA owner',txnCount:4,firstTxn:'2026-10-01T00:00:00Z',lastTxn:'2026-10-02T00:00:00Z',createdAt:'2026-10-01T00:00:00Z'};}
  await page.route('**/*',async route=>{
    const req=route.request();let op;
    if(req.method()==='POST'){try{op=req.postDataJSON();}catch{}}
    if(!op?.query)return route.continue();
    let data;const name=op.operationName;
    if(name==='Me')data={me:{__typename:'User',id:1,username:'qa',rank:null,fullName:'QA',role:'ADMIN',active:true}};
    else if(name==='ActiveCase')data={activeCase:active,caseFiles:cases};
    else if(name==='ImportSuspects')data={suspects:[]};
    else if(name==='CaseNoiseFilter')data={caseNoiseFilter:{minAmount:0,ignoredPairs:[],ignoredTxns:[],descRules:[]}};
    else if(name==='AccountRecords'){requests.push(op.variables);data={accountRecords:rows[op.variables.caseFileId]||[]};}
    else if(name==='SetActiveCase'){active=cases.find(c=>c.id===op.variables.caseFileId);data={setActiveCase:active};}
    else if(name==='DeleteBankAccount'){
      deletes.push(op.variables);assert.equal(op.variables.caseFileId,active.id);
      rows[active.id]=[];data={deleteBankAccount:{accountNumber:'2222222222',transactions:0,analyses:0,conclusions:0,evidence:1,links:0}};
    }else throw Error('Unexpected GraphQL operation: '+name);
    return route.fulfill({json:{data}});
  });
  await page.goto(process.env.FORENSIC_TEST_URL||'https://forensic.dev.longbinarycity.com/import');
  await page.getByText('Импортолсон данс удирдах',{exact:true}).click();
  const purge=page.locator('details.import-maintenance');
  await purge.locator('.select-trigger').click();
  await page.getByRole('option').filter({hasText:'1111111111'}).click();
  await purge.getByRole('button',{name:'УСТГАХ',exact:true}).click();
  await purge.getByRole('button',{name:'УСТГАХЫГ БАТАЛГААЖУУЛАХ',exact:true}).waitFor();
  // Switch cases with the old confirmation open. It must reset, and the new
  // list must be queried under its own case ID/cache key.
  await page.locator('.app-header-select .select-trigger').click();
  await page.getByRole('option').filter({hasText:'QA-B'}).click();
  await page.waitForFunction(()=>!document.body.textContent.includes('УСТГАХЫГ БАТАЛГААЖУУЛАХ'));
  await page.waitForFunction(()=>document.querySelector('.app-header-select')?.textContent.includes('QA-B'));
  await purge.locator('.select-trigger').click();
  assert.equal(await page.getByRole('option').filter({hasText:'1111111111'}).count(),0);
  await page.getByRole('option').filter({hasText:'2222222222'}).click();
  await purge.getByRole('button',{name:'УСТГАХ',exact:true}).click();
  await purge.getByRole('button',{name:'БОЛИХ',exact:true}).click();
  assert.equal(deletes.length,0);
  await purge.getByRole('button',{name:'УСТГАХ',exact:true}).click();
  await purge.getByRole('button',{name:'УСТГАХЫГ БАТАЛГААЖУУЛАХ',exact:true}).click();
  await purge.getByText('Данс алга',{exact:true}).waitFor();
  assert.deepEqual(deletes,[{id:202,caseFileId:902}]);
  assert(requests.some(v=>v.caseFileId===901));assert(requests.some(v=>v.caseFileId===902));
  assert.deepEqual(errors,[]);
  console.log('PASS: import account list scoped by case, confirmation resets on switch, cancel and deletion target exact case (mock API)');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
