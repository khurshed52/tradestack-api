import fs from 'node:fs';
const root='tests/fixtures/rag-stage3';
const median=values=>{
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  return sorted.length ? (sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2 : null;
};
const metrics={};
for(const phase of ['after','after-fix']) {
  const report=JSON.parse(fs.readFileSync(`${root}/${phase}/results.json`));
  const cases=report.cases.filter(row=>row.id<=6);
  const completed=cases.filter(row=>row.result);
  const stages={};
  for(const row of completed) for(const call of row.trace??[]) {
    if(!['generate','stream'].includes(call.kind)) continue;
    const stage=call.kind==='stream'?'answer':call.stage==='tool-or-answer'?'tool-selection':call.stage;
    (stages[stage]??=[]).push(call);
  }
  metrics[phase]={
    attempted:cases.length,completed:completed.length,
    firstAnswerMedianMs:median(completed.map(row=>row.firstAnswerMs)),
    totalMedianMs:median(completed.map(row=>row.totalMs)),
    stages:Object.fromEntries(Object.entries(stages).map(([stage,calls])=>[stage,{
      attempts:calls.length,errors:calls.filter(call=>call.error).length,
      successfulAttemptMedianMs:median(calls.filter(call=>!call.error).map(call=>call.durationMs)),
    }])),
    allCases:report.cases.length,
    allCompleted:report.cases.filter(row=>row.result).length,
    streamFinalMatches:report.cases.filter(row=>row.result && row.events?.filter(event=>event.event==='chunk').map(event=>event.data.text).join('')===row.result.reply).length,
    persisted:report.cases.filter(row=>row.persisted===true).length,
    failures:report.cases.filter(row=>!row.result).map(row=>({round:row.round,id:row.id,error:row.error??row.events?.find(e=>e.event==='error')?.data})),
    security:report.security,
  };
}
fs.writeFileSync(`${root}/fix-metrics.json`,JSON.stringify(metrics,null,2));
console.log(JSON.stringify(metrics,null,2));
