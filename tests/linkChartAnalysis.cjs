// NODE_PATH=$(npm root -g) node tests/linkChartAnalysis.cjs
// Real page/canvas/Sankey. ALL GraphQL mocked; no live evidence writes.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport:{width:1800,height:1100}});
    const errors = [], unexpected = [], mutations = [];
    page.on('pageerror', e => errors.push(e.message));
    const initial = {'s:1':{x:-300,y:100},'s:2':{x:300,y:100}};
    await page.addInitScript(p => {
      localStorage.setItem('forensic.authToken','mock-session');
      localStorage.setItem('forensic.nodePositions:1',JSON.stringify(p));
    },initial);
    const cases = [1,2].map(id => ({__typename:'CaseFile',id,caseId:`QA-${id}`,
      caseName:`Case ${id}`,status:'ACTIVE',priority:'MEDIUM'}));
    let active = cases[0];
    const people = Array.from({length:30},(_,i) => ({__typename:'Suspect',id:i+1,
      suspectId:`QA-${i+1}`,fullName:`QA Person ${String(i+1).padStart(2,'0')}`,
      riskLevel:'LOW',organization:null,initials:'Q',photoData:null,offender:i===2,
      phoneNumbers:[3,30].includes(i+1) ? [{__typename:'PhoneNumber',id:i+1,number:`880000${String(i+1).padStart(2,'0')}`}] : []}));
    const accounts = people.map(p => ({__typename:'BankAccount',id:p.id,suspectId:p.id,
      accountNumber:String(1000000000+p.id),bankName:'QA Bank'}));
    const pairs = [[1,3,-100],[2,3,-200],[1,3,25],
      ...Array.from({length:26},(_,i) => [1,i+4,-(300+i)])];
    const txns = pairs.map(([bankAccountId,cp,amount],i) => ({__typename:'BankTransaction',
      id:i+1,bankAccountId,counterpartyAccount:String(1000000000+cp),counterpartyName:`QA Person ${cp}`,
      counterpartyNationalId:null,timestamp:'2026-11-01T10:00:00Z',amount,type:amount<0?'debit':'credit',
      description:null,category:null,channel:null,runningBalance:100,currency:'MNT',
      flagStatus:'NORMAL',counterpartyOffender:cp===3}));
    const call = {__typename:'CallRecord',id:1,callerNumber:'88000003',calledNumber:'88000030',
      startTime:'2026-11-01T10:00:00Z',durationSeconds:90,callType:'VOICE',direction:'OUTGOING',
      location:null,flagStatus:'NORMAL',suspectId:3};
    await page.route('**/*', async route => {
      let op;
      if(route.request().method()==='POST'){try{op=route.request().postDataJSON();}catch{}}
      if(!op?.query)return route.continue();
      if(/\bmutation\b/.test(op.query))mutations.push(op.operationName);
      let data;
      const empty = active.id === 2;
      switch(op.operationName){
        case 'Me':data={me:{__typename:'User',id:1,username:'qa',rank:null,fullName:'QA',role:'ADMIN',active:true}};break;
        case 'ActiveCase':data={activeCase:active,caseFiles:cases};break;
        case 'SetActiveCase':active=cases.find(c=>c.id===op.variables.caseFileId);data={setActiveCase:active};break;
        case 'LinkChart':data={suspects:empty?[]:people,suspectLinks:[]};break;
        case 'LinkChartOwners':data=Object.fromEntries(Object.entries(op.variables).map(([key,id])=>
          [`owner${key.slice(2)}`,empty?null:people.find(p=>p.id===id)]));break;
        case 'Transactions':data={bankAccounts:empty?[]:accounts,transactions:empty?[]:txns};break;
        case 'CallRecords':data={callRecords:empty?[]:[call],suspects:empty?[]:people};break;
        case 'CaseGraphs':data={caseGraphs:[]};break;
        // Removed first statement row must never reappear in lower money/red totals.
        case 'CaseNoiseFilter':data={caseNoiseFilter:{minAmount:0,ignoredPairs:[],ignoredTxns:[1],descRules:[]}};break;
        default:unexpected.push(op.operationName);return route.fulfill({json:{errors:[{message:'Unexpected mock operation'}]}});
      }
      return route.fulfill({json:{data}});
    });
    const base = process.env.FORENSIC_TEST_URL || 'https://forensic.dev.sea.maestro.living';
    await page.goto(`${base}/linkchart`);
    const money=page.locator('#graph-money-flow'), shared=page.locator('#graph-shared-relations'), red=page.locator('#graph-red-relations');
    await money.locator('.sankey').waitFor();
    await shared.locator('canvas').waitFor();await red.locator('canvas').waitFor();
    assert.equal(await shared.locator('tbody tr').count(),1);
    assert((await shared.innerText()).includes('QA Person 03'));
    assert((await shared.innerText()).includes('QA Person 01 ↔ QA Person 02'));
    assert.equal(await red.locator('tbody tr').count(),3,'Two surviving money pairs and one owned-phone call');
    assert((await red.innerText()).includes('88000003'));
    assert((await red.innerText()).includes('ХЭРЭГТЭН'));
    assert.equal(await money.locator('tbody tr').count(),20);
    const values=await money.locator('.js-plotly-plot').evaluate(el=>el.data[0].link.value);
    assert.equal(values.reduce((s,v)=>s+v,0),Array.from({length:20},(_,i)=>325-i).reduce((s,v)=>s+v,0),
      'Diagram and list show the same flow page');
    assert(await money.locator('.graph-analysis-flow').evaluate(el=>el.scrollHeight>el.clientHeight),
      'Dense flow charts keep readable label spacing inside a bounded scroll pane');
    const pos = () => page.evaluate(()=>JSON.parse(localStorage.getItem('forensic.nodePositions:1')));
    const before=await pos();
    await shared.getByRole('button',{name:'Зурагт харах'}).click();
    assert.deepEqual(await pos(),before,'Lower graph focus cannot move the main arrangement');
    const list=await shared.locator('.graph-analysis-list').boundingBox();
    const diagram=await shared.locator('.graph-analysis-diagram').boundingBox();
    assert(Math.abs(list.y-diagram.y)<5 && diagram.x>list.x,'Wide screen has list and diagram side by side');
    await money.getByRole('button',{name:'Дараах',exact:true}).click();
    assert(new URL(page.url()).searchParams.get('flowPage')==='2');
    await page.waitForFunction(()=>document.querySelectorAll('#graph-money-flow tbody tr').length===8);
    const second=await money.locator('tbody').innerText();
    await page.reload();await money.locator('.sankey').waitFor();
    assert.equal(await money.locator('tbody').innerText(),second,'Paging survives reload');
    const secondValues=await money.locator('.js-plotly-plot').evaluate(el=>el.data[0].link.value);
    assert.equal(secondValues.reduce((s,v)=>s+v,0),25+200+Array.from({length:6},(_,i)=>300+i).reduce((s,v)=>s+v,0));
    await money.getByRole('button',{name:'Өмнөх',exact:true}).click();
    await page.goBack();
    assert.equal(new URL(page.url()).searchParams.get('flowPage'),'2','Paging supports browser Back');
    await page.setViewportSize({width:900,height:1000});
    const smallList=await shared.locator('.graph-analysis-list').boundingBox();
    const smallDiagram=await shared.locator('.graph-analysis-diagram').boundingBox();
    assert(smallDiagram.y>=smallList.y+smallList.height,'Narrow screen stacks list and diagram');
    const toggle=page.getByRole('button',{name:/^Гүйлгээ ·/});
    await toggle.click();
    await money.getByText('Харагдаж буй мөнгөн урсгал алга',{exact:true}).waitFor();
    await shared.getByText('Харагдаж буй дундын харилцаа алга',{exact:true}).waitFor();
    assert.equal(await red.locator('tbody tr').count(),1,'Money visibility applies to red relationships too');
    await toggle.click();await money.locator('.sankey').waitFor();
    await page.goto(`${base}/linkchart?case=2`);
    await money.getByText('Харагдаж буй мөнгөн урсгал алга',{exact:true}).waitFor();
    await red.getByText('Улаанаар тэмдэглэсэн этгээдийн харагдаж буй харилцаа алга',{exact:true}).waitFor();
    assert(!await money.locator('tbody tr').count(),'Other case cannot retain earlier rows');
    assert.deepEqual(mutations,['SetActiveCase']);
    assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
    console.log('PASS: three lists and diagrams, noise/visibility totals, red phone calls, independent focus, URL paging/reload/Back, responsive layout and case switching (mock API)');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
