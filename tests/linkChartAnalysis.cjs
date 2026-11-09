// NODE_PATH=$(npm root -g) node tests/linkChartAnalysis.cjs
// Real page/canvas/Sankey. ALL GraphQL mocked; no live evidence writes.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport:{width:1800,height:1100}});
    const errors = [], unexpected = [], mutations = [];
    const staged=new Map(), exports=[];let nextUpload=0;
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
      assert(Buffer.byteLength(route.request().postData())<700000,'Full report must fit the preview proxy in bounded chunks');
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
        case 'Reports':data={activeCase:active,accountAnalyses:[],directTransfers:[],caseRelations:{
          mutualRelations:0,txnCount:0,creditTotal:0,debitTotal:0,netTotal:0,relations:[]}};break;
        case 'BeginReportGraphUpload':{
          const id=`upload-${++nextUpload}`;staged.set(id,'');data={beginReportGraphUpload:id};break;
        }
        case 'AppendReportGraphUpload':{
          const {uploadId,offset,chunk}=op.variables;assert.equal(staged.get(uploadId).length,offset);
          staged.set(uploadId,staged.get(uploadId)+chunk);data={appendReportGraphUpload:offset+chunk.length};break;
        }
        case 'ReleaseReportGraphUpload':staged.delete(op.variables.uploadId);data={releaseReportGraphUpload:true};break;
        case 'ReportVerdictPdf':case 'ReportVerdictDocx':case 'ReportVerdictHtml':{
          const graph=op.variables.graph;
          const encoded=graph.analysisUploadId?staged.get(graph.analysisUploadId):graph.analysisBase64;
          exports.push({analysis:JSON.parse(Buffer.from(encoded,'base64').toString('utf8')),graph});
          const field=op.operationName[0].toLowerCase()+op.operationName.slice(1);
          data={[field]:{filename:'QA-report',mimeType:'application/octet-stream',base64:Buffer.from('report').toString('base64')}};break;
        }
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
    const mainBefore=await pos();
    await page.getByRole('button',{name:'Тайланд оруулах',exact:true}).click();
    await page.waitForURL('**/reports');await page.locator('.report-analysis-preview').waitFor();
    assert.equal(await page.locator('.report-analysis-preview table').nth(0).locator('tbody tr').count(),28,
      'Report captures every filtered row even when chart table page 2 is open');
    assert.equal(await page.locator('.report-analysis-image').count(),2,'Shared and red arranged scenes are captured');
    assert.deepEqual(await pos(),mainBefore);
    // Exercise analysis chunking independently of the main chart image.
    await page.evaluate(async()=>{
      const moduleUrl=performance.getEntriesByType('resource').map(r=>r.name).find(n=>n.includes('/src/lib/reportGraph.ts'));
      const {reportGraphDraft}=await import(moduleUrl||'/src/lib/reportGraph.ts');
      const c=document.createElement('canvas');c.width=768;c.height=384;
      const ctx=c.getContext('2d'),pixels=ctx.createImageData(c.width,c.height);let seed=123;
      for(let i=0;i<pixels.data.length;i++){seed=(seed*1664525+1013904223)>>>0;pixels.data[i]=i%4===3?255:seed>>>24;}
      ctx.putImageData(pixels,0,0);const draft=reportGraphDraft();
      reportGraphDraft({...draft,analysis:{...draft.analysis,shared:{...draft.analysis.shared,
        image:{imageBase64:c.toDataURL('image/png').split(',')[1],width:c.width,height:c.height}}}});
    });
    await page.waitForFunction(()=>document.querySelector('.report-analysis-image')?.getAttribute('width')==='768');
    for(const name of ['ТАЙЛАН PDF','ТАЙЛАН WORD','ТАЙЛАН HTML']){
      const downloaded=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();await downloaded;
      await page.waitForFunction(()=>!document.querySelector('button[disabled].btn-primary'));
    }
    assert.equal(exports.length,3);
    for(const e of exports){
      assert(e.graph.analysisUploadId,'Large analysis gets its own case-bound chunk transport');
      assert.equal(e.analysis.flow.length,28);assert.equal(e.analysis.shared.rows.length,1);assert.equal(e.analysis.red.rows.length,3);
      assert.equal(e.analysis.flow.reduce((s,r)=>s+r.amount,0),25+200+Array.from({length:26},(_,i)=>300+i).reduce((s,v)=>s+v,0));
    }
    assert.deepEqual(exports[0].analysis,exports[1].analysis);assert.deepEqual(exports[1].analysis,exports[2].analysis);
    assert.equal(staged.size,0,'Analysis buffers are reclaimed after each edition');
    await page.goto(`${base}/linkchart?case=2`);
    await money.getByText('Харагдаж буй мөнгөн урсгал алга',{exact:true}).waitFor();
    await red.getByText('Улаанаар тэмдэглэсэн этгээдийн харагдаж буй харилцаа алга',{exact:true}).waitFor();
    assert(!await money.locator('tbody tr').count(),'Other case cannot retain earlier rows');
    assert(mutations.every(m=>['SetActiveCase','BeginReportGraphUpload','AppendReportGraphUpload','ReleaseReportGraphUpload'].includes(m)));
    assert.equal(mutations.filter(m=>m==='SetActiveCase').length,1);
    assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
    console.log('PASS: three lists and diagrams, noise/visibility totals, red phone calls, independent focus, URL paging/reload/Back, responsive layout and case switching (mock API)');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
