import fs from 'node:fs';
const root='tests/fixtures/rag-stage3';
const median=xs=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
const phases={};
for(const phase of ['before','after-first','after']){
 const report=JSON.parse(fs.readFileSync(`${root}/${phase}/results.json`));
 const cases=report.cases.filter(c=>c.id<=6);
 const measured=cases.filter(c=>c.result);
 const rows=measured.map(c=>{const metrics=c.trace?.find(t=>t.kind==='GEMINI_USAGE')?.value;const rounds=c.trace?.filter(t=>t.kind==='AI_TOOL_ROUND'&&t.value.calls.includes('search_platform_knowledge'))??[];const attribution=c.trace?.filter(t=>t.stage==='attribution')??[];return {round:c.round,question:c.id,firstAnswerMs:c.firstAnswerMs,totalMs:c.totalMs,geminiRequests:c.trace?.filter(t=>t.kind==='generate'||t.kind==='stream').length,inputTokens:c.result.usage?.inputTokens,outputTokens:c.result.usage?.outputTokens,totalTokens:c.result.usage?.totalTokens,retrievalMs:metrics?.retrievalDurationMs??rounds.reduce((n,t)=>n+t.value.durationMs,0),attributionMs:attribution.reduce((n,t)=>n+t.durationMs,0),persisted:c.persisted};});
 phases[phase]={model:report.model,attempted:cases.length,completed:measured.length,failed:cases.filter(c=>!c.result).map(c=>({round:c.round,id:c.id,error:c.error??c.events?.find(e=>e.event==='error')?.data})),medians:Object.fromEntries(['firstAnswerMs','totalMs','geminiRequests','inputTokens','outputTokens','totalTokens','retrievalMs','attributionMs'].map(k=>[k,median(rows.map(r=>r[k]))])),rows,security:report.security,byQuestion:[1,2,3,4,5,6].map(id=>({id,attempts:cases.filter(c=>c.id===id).length,completed:rows.filter(c=>c.question===id).length,firstAnswerMs:median(rows.filter(c=>c.question===id).map(c=>c.firstAnswerMs)),totalMs:median(rows.filter(c=>c.question===id).map(c=>c.totalMs))}))};
}
fs.writeFileSync(`${root}/metrics.json`,JSON.stringify(phases,null,2));console.log(JSON.stringify(Object.fromEntries(Object.entries(phases).map(([k,v])=>[k,{attempted:v.attempted,completed:v.completed,medians:v.medians,failed:v.failed}])),null,2));
