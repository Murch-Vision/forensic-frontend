// NODE_PATH=$(npm root -g) node tests/reportGraph.cjs
// Real graph canvas and report navigation; ALL GraphQL mocked, no real data writes.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.FORENSIC_TEST_URL || 'https://forensic.dev.sea.maestro.living';
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1100}});
    const errors=[], exports=[], mutations=[], unexpected=[], staged=new Map();
    let uploads=0, failChunk=false;
    page.on('pageerror',e=>errors.push(e.message));
    const positions = {'s:1':{x:-1500,y:100},'s:2':{x:0,y:200,s:1.7,sh:'rect'},'s:3':{x:1500,y:100}};
    await page.addInitScript(p=>{
      localStorage.setItem('forensic.authToken','mock-session');
      localStorage.setItem('forensic.nodePositions:1',JSON.stringify(p));
    },positions);
    const cases=[1,2].map(id=>({__typename:'CaseFile',id,caseId:`QA-${id}`,caseName:`Case ${id}`,
      status:'ACTIVE',priority:'MEDIUM',description:null,investigator:null,createdAt:'2026-11-01'}));
    let active=cases[0], fail=false;
    const people=[1,2,3].map(id=>({__typename:'Suspect',id,suspectId:`QA-${id}`,
      fullName:`QA Person ${id}`,riskLevel:'LOW',organization:null,initials:'Q',photoData:null,
      offender:id===2,phoneNumbers:[]}));
    const accounts=people.map(p=>({__typename:'BankAccount',id:p.id,accountNumber:String(1000000000+p.id),
      suspectId:p.id,bankName:'QA Bank',accountHolderName:p.fullName,iban:null}));
    const txns=[2,3].map((cp,i)=>({__typename:'BankTransaction',id:i+1,bankAccountId:1,
      counterpartyAccount:String(1000000000+cp),counterpartyName:`QA Person ${cp}`,
      counterpartyNationalId:null,timestamp:'2026-11-01T10:00:00Z',amount:100,type:'credit',
      description:null,category:null,channel:null,runningBalance:100,currency:'MNT',
      flagStatus:'NORMAL',counterpartyOffender:cp===2}));
    await page.route('**/*',async route=>{
      let op;
      if(route.request().method()==='POST'){try{op=route.request().postDataJSON();}catch{}}
      if(!op?.query)return route.continue();
      assert(Buffer.byteLength(route.request().postData())<700000,'Each request must fit the preview proxy');
      if(/\bmutation\b/.test(op.query))mutations.push(op.operationName);
      let data;
      switch(op.operationName){
        case 'Me':data={me:{__typename:'User',id:1,username:'qa',rank:null,fullName:'QA',role:'ADMIN',active:true}};break;
        case 'ActiveCase':data={activeCase:active,caseFiles:cases};break;
        case 'SetActiveCase':active=cases.find(c=>c.id===op.variables.caseFileId);data={setActiveCase:active};break;
        case 'LinkChart':data={suspects:people,suspectLinks:[]};break;
        case 'Transactions':data={bankAccounts:accounts,transactions:txns};break;
        case 'CallRecords':data={callRecords:[],suspects:people};break;
        case 'CaseGraphs':data={caseGraphs:[]};break;
        case 'CaseNoiseFilter':data={caseNoiseFilter:{minAmount:0,ignoredPairs:[],ignoredTxns:[],descRules:[]}};break;
        case 'NetworkFlow':data={networkFlow:{nodeLabels:[],nodeColors:[],sourceIndices:[],targetIndices:[],values:[],linkColors:[]}};break;
        case 'BeginReportGraphUpload':{
          const id=`mock-upload-${++uploads}`;staged.set(id,'');data={beginReportGraphUpload:id};break;
        }
        case 'AppendReportGraphUpload':{
          if(failChunk)return route.fulfill({json:{errors:[{message:'QA upload failed'}]}});
          const {uploadId,offset,chunk}=op.variables;
          assert.equal(staged.get(uploadId).length,offset);staged.set(uploadId,staged.get(uploadId)+chunk);
          data={appendReportGraphUpload:offset+chunk.length};break;
        }
        case 'ReleaseReportGraphUpload':staged.delete(op.variables.uploadId);data={releaseReportGraphUpload:true};break;
        case 'Reports':data={activeCase:active,accountAnalyses:[],directTransfers:[],caseRelations:{
          mutualRelations:0,txnCount:0,creditTotal:0,debitTotal:0,netTotal:0,relations:[]}};break;
        case 'ReportVerdictPdf':case 'ReportVerdictDocx':case 'ReportVerdictHtml':
          exports.push({operation:op.operationName,graph:op.variables.graph?.imageUploadId
            ? {...op.variables.graph,imageBase64:staged.get(op.variables.graph.imageUploadId)} : op.variables.graph});
          if(fail)return route.fulfill({json:{errors:[{message:'QA export failed'}]}});
          const field=op.operationName[0].toLowerCase()+op.operationName.slice(1);
          data={[field]:{filename:`QA.${op.operationName.slice(13).toLowerCase()}`,mimeType:'application/octet-stream',base64:Buffer.from('QA report').toString('base64')}};break;
        default:unexpected.push(op.operationName);return route.fulfill({json:{errors:[{message:'Unexpected mock operation'}]}});
      }
      return route.fulfill({json:{data}});
    });
    await page.goto(`${base}/linkchart`);
    const canvas=page.locator('canvas').first();await canvas.waitFor();
    // Zooming or panning the screen must not crop a report; export fits all
    // arranged nodes and leaves the saved node geometry exactly as it was.
    await canvas.hover();await page.mouse.wheel(-600,-600);
    await page.getByRole('button',{name:'Тайланд оруулах',exact:true}).click();
    await page.waitForURL('**/reports');
    const image=page.locator('.report-graph-preview');await image.waitFor();
    const pixels=await image.evaluate(async img=>{
      await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
      const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;
      let greenLeft=0,greenRight=0,red=0;
      for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
        const p=(y*c.width+x)*4;
        if(data[p+1]>160&&data[p]<80){if(x<c.width/3)greenLeft++;if(x>c.width*2/3)greenRight++;}
        if(data[p]>180&&data[p+1]<110)red++;
      }
      return {width:c.width,height:c.height,greenLeft,greenRight,red,opaque:data[3]};
    });
    assert.equal(pixels.width,3200);assert(pixels.height>=800&&pixels.height<=2400);
    assert(pixels.greenLeft>10&&pixels.greenRight>10&&pixels.red>10,'All arranged endpoints and offender ring must reach the image');
    assert.equal(pixels.opaque,255);
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('forensic.nodePositions:1'))),positions);
    assert(!page.url().includes('base64'));
    assert(!await page.evaluate(()=>JSON.stringify(localStorage).includes('iVBORw0KGgo')),'Image must remain an in-memory draft');
    async function download(name){
      const pending=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();await pending;
    }
    for(const name of ['ТАЙЛАН PDF','ТАЙЛАН WORD','ТАЙЛАН HTML'])await download(name);
    assert.equal(exports.length,3);
    assert(exports.every(e=>e.graph.caseFileId===1&&e.graph.imageBase64===exports[0].graph.imageBase64));
    assert(Buffer.from(exports[0].graph.imageBase64,'base64').subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')));
    fail=true;await page.getByRole('button',{name:'ТАЙЛАН PDF',exact:true}).click();
    await page.getByText('QA export failed',{exact:true}).waitFor();
    assert.equal(await image.count(),1,'Failure must retain the preview for retry');
    await page.locator('.modal-content').getByRole('button',{name:'ХААХ',exact:true}).click();fail=false;
    await download('ТАЙЛАН PDF');
    // Seed a valid noisy PNG draft to exercise lossless chunk transport above
    // the proxy's 1 MB limit, without changing the graph or any case evidence.
    await page.evaluate(async()=>{
      const moduleUrl=performance.getEntriesByType('resource').map(r=>r.name).find(n=>n.includes('/src/lib/reportGraph.ts'));
      const {reportGraphDraft}=await import(moduleUrl||'/src/lib/reportGraph.ts');
      const c=document.createElement('canvas');c.width=768;c.height=384;
      const ctx=c.getContext('2d'),pixels=ctx.createImageData(c.width,c.height);
      let seed=123456;
      for(let i=0;i<pixels.data.length;i++){seed=(seed*1664525+1013904223)>>>0;pixels.data[i]=i%4===3?255:seed>>>24;}
      ctx.putImageData(pixels,0,0);
      reportGraphDraft({...reportGraphDraft(),width:c.width,height:c.height,imageBase64:c.toDataURL('image/png').split(',')[1]});
    });
    await page.waitForFunction(()=>document.querySelector('.report-graph-preview')?.getAttribute('width')==='768');
    await download('ТАЙЛАН HTML');
    assert(exports.at(-1).graph.imageUploadId);assert(exports.at(-1).graph.imageBase64.length>640000);
    failChunk=true;await page.getByRole('button',{name:'ТАЙЛАН PDF',exact:true}).click();
    await page.getByText('QA upload failed',{exact:true}).waitFor();
    await page.locator('.modal-content').getByRole('button',{name:'ХААХ',exact:true}).click();
    failChunk=false;await download('ТАЙЛАН HTML');
    await page.waitForFunction(()=>!document.querySelector('button[disabled].btn-primary'));
    assert.equal(staged.size,0,'Successful and failed uploads must both release temporary buffers');
    // The attachment belongs to one case. Switching case cannot send it with
    // another case's report, even though it remains an unsaved tab draft.
    await page.locator('.app-header-select .select-trigger').click();
    await page.getByRole('option').filter({hasText:'QA-2'}).click();
    await image.waitFor({state:'detached'});
    await download('ТАЙЛАН HTML');assert.equal(exports.at(-1).graph,null);
    // Returning to its case allows explicit removal and old-format exports.
    await page.locator('.app-header-select .select-trigger').click();
    await page.getByRole('option').filter({hasText:'QA-1'}).click();await image.waitFor();
    await page.getByRole('button',{name:'Тайлангаас хасах',exact:true}).click();
    await image.waitFor({state:'detached'});await download('ТАЙЛАН HTML');assert.equal(exports.at(-1).graph,null);
    await page.getByRole('link',{name:'Зураглал сонгох',exact:true}).click();await canvas.waitFor();
    await page.getByRole('button',{name:'Тайланд оруулах',exact:true}).click();await image.waitFor();
    await page.reload();
    await page.getByRole('link',{name:'Зураглал сонгох',exact:true}).waitFor();assert.equal(await image.count(),0);
    assert(mutations.every(m=>['SetActiveCase','BeginReportGraphUpload','AppendReportGraphUpload','ReleaseReportGraphUpload'].includes(m)));
    assert.equal(mutations.filter(m=>m==='SetActiveCase').length,2);
    assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
    console.log('PASS: full-resolution full-scene canvas capture preserves layout, report preview and PDF/Word/HTML payloads, retry/removal, case isolation and transient-only image storage (mock GraphQL)');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
