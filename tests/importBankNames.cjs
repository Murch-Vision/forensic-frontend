// NODE_PATH=$(npm root -g) node tests/importBankNames.cjs
// Actual import controls; all GraphQL mocked, no evidence/data writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  const errors=[],unexpected=[],imports=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('forensic.authToken','mock-session'));
  const headers=['Огноо','Данс','Дүн','Харьцсан данс','Эхний нэр','Хоёр дахь нэр'];
  const sample=['2026-11-01','1001','100','2001','Банкны нэр','САРАН БОЛД'];
  await page.route('**/*',async route=>{
    let op; if(route.request().method()==='POST'){try{op=route.request().postDataJSON();}catch{}}
    if(!op?.query) return route.continue();
    let data;
    const active={__typename:'CaseFile',id:1,caseId:'QA',caseName:'Name matching',status:'ACTIVE',priority:'MEDIUM'};
    switch(op.operationName){
      case 'Me':data={me:{__typename:'User',id:1,username:'qa',rank:null,fullName:'QA',role:'ADMIN',active:true}};break;
      case 'ActiveCase':data={activeCase:active,caseFiles:[active]};break;
      case 'ImportSuspects':data={suspects:[]};break;
      case 'AccountRecords':data={accountRecords:[]};break;
      case 'CaseNoiseFilter':data={caseNoiseFilter:{minAmount:0,ignoredPairs:[],ignoredTxns:[],descRules:[]}};break;
      case 'PreviewImport':data={previewImport:{headers,sampleRows:[sample],totalRows:1,detectedProfile:null,
        domain:'BANK',confidence:'LOW',headerRow:1,firstDataRow:2,lastDataRow:2,sheetRows:2,
        mapping:[{field:'date',column:headers[0]},{field:'account',column:headers[1]},
          {field:'amount',column:headers[2]},{field:'counterpartyAccount',column:headers[3]},
          {field:'counterpartyName',column:headers[4]}]}};break;
      case 'ImportData':imports.push(op.variables);data={importData:{totalRows:1,importedRows:1,skippedRows:0,
        duplicateRows:0,errors:[],messages:["Нэрээр данс таарууллаа"],detectedProfile:null,domain:'BANK'}};break;
      default:unexpected.push(op.operationName);return route.fulfill({json:{errors:[{message:'Unexpected mock query'}]}});
    }
    return route.fulfill({json:{data}});
  });
  await page.goto(process.env.FORENSIC_TEST_URL||'https://forensic.dev.sea.maestro.living/import');
  await page.locator('input[type="file"]').setInputFiles({name:'two-names.csv',mimeType:'text/csv',
    buffer:Buffer.from(headers.join(',')+'\n'+sample.join(','))});
  const field=label=>page.locator('.import-mapping > div').filter({has:page.locator('label').filter({hasText:new RegExp('^'+label+'$')})});
  const primary=field('Харьцсан харилцагчийн нэр'),secondary=field('Харьцсан харилцагчийн нэр 2');
  await secondary.locator('.select-trigger').waitFor();
  assert.equal((await primary.locator('.select-trigger').innerText()).split('\n')[0],'Эхний нэр');
  await secondary.locator('.select-trigger').scrollIntoViewIfNeeded();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await secondary.locator('.select-trigger').click();
  await page.getByRole('option').filter({hasText:'Хоёр дахь нэр'}).click();
  assert.equal((await primary.locator('.select-trigger').innerText()).split('\n')[0],'Эхний нэр','Selecting an alternate does not replace the primary mapping');
  await page.getByRole('button',{name:'ИМПОРТЛОХ',exact:true}).click();
  await page.getByText('Импорт дууслаа',{exact:true}).waitFor();
  assert.equal(imports.length,1);
  const map=Object.fromEntries(imports[0].mapping.map(m=>[m.field,m.column]));
  assert.equal(map.counterpartyName,'Эхний нэр');assert.equal(map.counterpartyName2,'Хоёр дахь нэр');
  assert.equal(imports[0].kind,'BANK');
  // Clearing the optional field keeps single-name bank statements supported.
  await secondary.locator('.select-trigger').scrollIntoViewIfNeeded();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await secondary.locator('.select-trigger').click();
  await page.getByRole('option',{name:'—',exact:true}).click();
  await page.getByRole('button',{name:'ИМПОРТЛОХ',exact:true}).click();
  await page.getByText('Импорт дууслаа',{exact:true}).waitFor();
  assert.equal(imports.length,2);
  assert(imports[1].mapping.some(m=>m.field==='counterpartyName2' && m.column===''));
  assert((await page.getByRole('status').innerText()).includes('Нэрээр данс таарууллаа'));
  assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  console.log('PASS: independent second bank-name column selection, import payload and optional single-name compatibility (mock API)');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
