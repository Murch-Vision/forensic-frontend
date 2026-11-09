// NODE_PATH=$(npm root -g) node tests/linkChartAnalysis.cjs
// Real page/canvas/Sankey. ALL GraphQL mocked; no live evidence writes.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport:{width:1800,height:1100}});
    const errors = [], unexpected = [], mutations = [];
    const staged=new Map(), uploadKinds=[], exports=[];let nextUpload=0;
    page.on('pageerror', e => errors.push(e.message));
    const initial = {'s:1':{x:-300,y:100},'s:2':{x:300,y:100}};
    await page.addInitScript(p => {
      localStorage.setItem('forensic.authToken','mock-session');
      if (!localStorage.getItem('forensic.nodePositions:1'))
        localStorage.setItem('forensic.nodePositions:1',JSON.stringify(p));
      const clear=CanvasRenderingContext2D.prototype.clearRect;
      const text=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.clearRect=function(...args){
        this.canvas.qaNodes=[]; this.canvas.qaLabels=[]; return clear.apply(this,args);
      };
      CanvasRenderingContext2D.prototype.fillText=function(label,x,y,...args){
        if(label==='👤'){
          const matrix=this.getTransform();
          (this.canvas.qaNodes??=[]).push({x,y,sx:matrix.a*x+matrix.e,sy:matrix.d*y+matrix.f});
        }
        if(/^((ХЭРЭГТЭН · )?QA Person)/.test(label)){
          const m=this.getTransform(),w=this.measureText(label).width*m.a;
          const h=Number(this.font.match(/([\d.]+)px/)?.[1]||0)*m.d;
          (this.canvas.qaLabels??=[]).push({text:label,x:m.a*x+m.e-w/2,y:m.d*y+m.f-h/2,w,h});
        }
        return text.call(this,label,x,y,...args);
      };
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
          uploadKinds.push(op.variables.kind);
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
    await page.goto(`${base}/linkchart?people=invalid`);
    const money=page.locator('#graph-money-flow'), shared=page.locator('#graph-shared-relations'), red=page.locator('#graph-red-relations');
    await money.locator('.sankey').waitFor();
    await shared.locator('canvas').waitFor();await red.locator('canvas').waitFor();
    assert.equal(await shared.locator('tbody tr').count(),1);
    assert((await shared.innerText()).includes('QA Person 03'));
    assert((await shared.innerText()).includes('QA Person 01 ↔ QA Person 02'));
    assert.equal(await red.locator('tbody tr').count(),3,'Two surviving money pairs and one owned-phone call');
    assert((await red.innerText()).includes('88000003'));
    assert((await red.innerText()).includes('ХЭРЭГТЭН'));
    const redDiagramBox=await red.locator('.graph-analysis-diagram').boundingBox();
    const redListBox=await red.locator('.graph-analysis-list').boundingBox();
    assert(redListBox.y>=redDiagramBox.y+redDiagramBox.height,
      'Offender circles use the full card width with the relation list underneath');
    assert.equal(await money.locator('tbody tr').count(),20);
    const values=await money.locator('.js-plotly-plot').evaluate(el=>el.data[0].link.value);
    assert.equal(values.reduce((s,v)=>s+v,0),Array.from({length:20},(_,i)=>325-i).reduce((s,v)=>s+v,0),
      'Diagram and list show the same flow page');
    assert(await money.locator('.graph-analysis-flow').evaluate(el=>el.scrollHeight>el.clientHeight),
      'Dense flow charts keep readable label spacing inside a bounded scroll pane');
    const pos = () => page.evaluate(()=>JSON.parse(localStorage.getItem('forensic.nodePositions:1')));
    const before=await pos();
    assert.equal(await page.getByRole('button',{name:'Хэрэгтний харилцааг харах',exact:true})
      .getAttribute('aria-pressed'),'false','Malformed people filter falls back to all');
    await page.getByRole('button',{name:'Хэрэгтний харилцааг харах',exact:true}).click();
    await page.waitForURL(url=>url.searchParams.get('people')==='offenders');
    await money.locator('.sankey').waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('#graph-red-relations tbody tr').length===2);
    assert.equal(await money.locator('tbody tr').count(),2,'Primary owners retain the two red money relationships');
    await page.waitForFunction(()=>document.querySelector('canvas')?.qaNodes?.length===3);
    const radialCenters=await page.locator('canvas').first().evaluate(canvas=>canvas.qaNodes.map(n=>[n.x,n.y]));
    assert(radialCenters.some(([x,y])=>x===640&&y===360),'Primary owner is pinned at its group center');
    assert(radialCenters.some(([x,y])=>x===640&&y===183),'Red contact is pinned on the owner-centered ring');
    for(const canvas of [page.locator('canvas').first(),red.locator('canvas')]){
      const labels=await canvas.evaluate(c=>({labels:c.qaLabels,width:c.clientWidth,height:c.clientHeight}));
      assert.equal(labels.labels.length,3,'All primary/red names are rendered');
      for(const [i,a] of labels.labels.entries()){
        assert(a.x>=0&&a.y>=0&&a.x+a.w<=labels.width&&a.y+a.h<=labels.height,'Name is inside the canvas');
        for(const b of labels.labels.slice(i+1))
          assert(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),'Rendered names must not overlap');
      }
    }
    assert.equal(await page.getByRole('button',{name:'Бүгдийг харах',exact:true}).getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'✥ Бөөгнүүлэх',exact:true}).first().click();
    assert.deepEqual(await page.locator('canvas').first().evaluate(canvas=>canvas.qaNodes.map(n=>[n.x,n.y])),
      radialCenters,'Clustering preserves the owner-centered offender circles');
    assert.deepEqual(await pos(),before,'Rearranging a red filter cannot overwrite the main layout');
    await page.reload();
    await page.getByRole('button',{name:'Бүгдийг харах',exact:true}).waitFor();
    await money.locator('.sankey').waitFor();
    assert.equal(await red.locator('tbody tr').count(),2);
    assert.deepEqual(await pos(),before);
    await page.getByRole('button',{name:'Бүгдийг харах',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('#graph-red-relations tbody tr').length===3);
    await money.locator('.sankey').waitFor();
    await page.goBack();
    await page.getByRole('button',{name:'Бүгдийг харах',exact:true}).waitFor();
    await page.getByRole('button',{name:'Бүгдийг харах',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('#graph-red-relations tbody tr').length===3);
    await money.locator('.sankey').waitFor();
    assert.equal(await red.locator('tbody tr').count(),3,'Leaving the filter restores the full contact list');
    assert.deepEqual(await pos(),before);
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
    await page.waitForFunction(()=>document.querySelectorAll('#graph-money-flow tbody tr').length===8);
    assert.equal(await money.locator('tbody').innerText(),second,'Paging survives reload');
    const secondValues=await money.locator('.js-plotly-plot').evaluate(el=>el.data[0].link.value);
    assert.equal(secondValues.reduce((s,v)=>s+v,0),25+200+Array.from({length:6},(_,i)=>300+i).reduce((s,v)=>s+v,0));
    await money.getByRole('button',{name:'Өмнөх',exact:true}).click();
    await page.goBack();
    assert.equal(new URL(page.url()).searchParams.get('flowPage'),'2','Paging supports browser Back');
    await page.setViewportSize({width:900,height:1000});
    await page.waitForFunction(()=>{
      const a=document.querySelector('#graph-shared-relations .graph-analysis-list').getBoundingClientRect();
      const b=document.querySelector('#graph-shared-relations .graph-analysis-diagram').getBoundingClientRect();
      return b.y>=a.bottom;
    });
    const stacked=await shared.evaluate(el=>{
      const a=el.querySelector('.graph-analysis-list').getBoundingClientRect();
      const b=el.querySelector('.graph-analysis-diagram').getBoundingClientRect();
      return b.y>=a.bottom;
    });
    assert(stacked,'Narrow screen stacks list and diagram');
    const toggle=page.getByRole('button',{name:/^Гүйлгээ ·/});
    await toggle.click();
    await money.getByText('Харагдаж буй мөнгөн урсгал алга',{exact:true}).waitFor();
    await shared.getByText('Харагдаж буй дундын харилцаа алга',{exact:true}).waitFor();
    assert.equal(await red.locator('tbody tr').count(),1,'Money visibility applies to red relationships too');
    await toggle.click();await money.locator('.sankey').waitFor();
    await page.evaluate(()=>{
      const encode=HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL=function(...args){
        const plot=[...document.body.children].find(el=>el.style?.left==='-10000px'&&el.data);
        if(plot) window.reportTraces=plot.data.map(t=>({labels:[...t.node.label],values:[...t.link.value]}));
        return encode.apply(this,args);
      };
    });
    const mainBefore=await pos();
    await page.getByRole('button',{name:'Тайланд оруулах',exact:true}).click();
    await page.waitForURL('**/reports');await page.locator('.report-analysis-preview').waitFor();
    assert.equal(await page.locator('.report-flow-image').count(),1,
      'Report captures ONE complete Sankey even when chart table page 2 is open');
    assert.equal(await page.locator('.report-analysis-preview table').count(),2,'Money has images only; relation lists remain');
    assert.equal(await page.locator('.report-analysis-preview table').nth(0).locator('tbody tr').count(),1);
    for(const section of await page.locator('.report-analysis-image').all()){
      assert(await section.evaluate(el=>!!el.nextElementSibling?.querySelector('table')),
        'Each relation list follows its diagram');
    }
    assert.equal(await page.locator('.report-analysis-image').count(),2,'Shared and red arranged scenes are captured');
    assert.deepEqual(await pos(),mainBefore);
    const traces=await page.evaluate(()=>window.reportTraces);
    assert.equal(traces.length,1);
    assert.equal(traces[0].values.length,28,'The actual image includes all filtered flows, beyond screen page 20');
    assert.equal(traces[0].values.reduce((s,n)=>s+n,0),25+200+Array.from({length:26},(_,i)=>300+i).reduce((s,v)=>s+v,0));
    assert.equal(traces[0].labels.filter(n=>n==='Илгээсэн · QA Person 01').length,1,
      'A sender appears once in the global diagram, rather than once in each page');
    const mixed=await page.evaluate(async()=>{
      const moduleUrl=performance.getEntriesByType('resource').map(r=>r.name).find(n=>n.includes('/src/components/kit.tsx'));
      const {exportSankeyPng}=await import(moduleUrl||'/src/components/kit.tsx');
      const chart=await exportSankeyPng({labels:['Илгээсэн · A','Хүлээн авсан · B'],source:[0],target:[1],value:[30]},
        {labels:['Тал А · C','Тал Б · D'],source:[0],target:[1],value:[40]});
      return {width:chart.width,height:chart.height,traces:window.reportTraces};
    });
    assert.equal(mixed.traces.length,2,'Unknown direction remains a distinct labelled area of the same image');
    assert.deepEqual(mixed.traces.map(t=>t.values),[[30],[40]]);
    assert(mixed.width===2000&&mixed.height>900);
    // Exercise analysis chunking independently of the main chart image.
    await page.evaluate(async()=>{
      const moduleUrl=performance.getEntriesByType('resource').map(r=>r.name).find(n=>n.includes('/src/lib/reportGraph.ts'));
      const {reportGraphDraft}=await import(moduleUrl||'/src/lib/reportGraph.ts');
      const c=document.createElement('canvas');c.width=1600;c.height=1600;
      const ctx=c.getContext('2d'),pixels=ctx.createImageData(c.width,c.height);let seed=123;
      for(let i=0;i<pixels.data.length;i++){seed=(seed*1664525+1013904223)>>>0;pixels.data[i]=i%4===3?255:seed>>>24;}
      ctx.putImageData(pixels,0,0);const draft=reportGraphDraft();
      reportGraphDraft({...draft,analysis:{...draft.analysis,shared:{...draft.analysis.shared,
        image:{imageBase64:c.toDataURL('image/png').split(',')[1],width:c.width,height:c.height}}}});
    });
    await page.waitForFunction(()=>document.querySelector('.report-analysis-image')?.getAttribute('width')==='1600');
    for(const name of ['ТАЙЛАН PDF','ТАЙЛАН WORD','ТАЙЛАН HTML']){
      const downloaded=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();await downloaded;
      await page.waitForFunction(()=>!document.querySelector('button[disabled].btn-primary'));
    }
    assert.equal(exports.length,3);
    assert(uploadKinds.includes('ANALYSIS'),'The large multi-image payload requests the analysis quota');
    assert(exports.every(e=>Buffer.byteLength(JSON.stringify(e.analysis))>8*1024*1024),
      'Reproduce an analysis above the old single-image upload limit');
    for(const e of exports){
      assert(e.graph.analysisUploadId,'Large analysis gets its own case-bound chunk transport');
      assert.equal(e.analysis.flowImages.length,1);
      assert(e.analysis.flowImages.every(image=>image.width===2000&&image.height>1000));
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
