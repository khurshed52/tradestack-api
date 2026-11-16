"""Deterministic evidence/metadata checks; substantive answer safety is reviewed separately."""
from pathlib import Path
import json,re,statistics
root=Path(__file__).parent
r=json.loads((root/'results.json').read_text())
rows=[]
for c in r['cases']:
 run=c.get('recovery') if c.get('recovery',{}).get('chat') else c
 chat=run.get('chat',{}); reply=chat.get('reply',''); evidence={}
 for call in run.get('trace',[]):
  for response in call.get('toolResponses',[]):
   if response.get('name')=='search_platform_knowledge':
    for s in response.get('response',{}).get('result',{}).get('sources',[]): evidence[s['chunkId']]=s
 cited=[int(p) for p in re.findall(r'\bpage\s+(\d+)\b',reply,re.I)]
 sources=chat.get('ragRetrievedSources',[])
 metadata=all(s['chunkId'] in evidence and all(s.get(k)==evidence[s['chunkId']].get(k) for k in ['documentId','title','version','pageNumber']) for s in sources)
 expected=c['page']
 rows.append(dict(id=c['id'],mode=c.get('initialMode'),retrievalPass=None if expected is None else any(s['pageNumber']==expected for s in c.get('retrieval',[])),
 toolSelectionPass=bool(chat) and all(t in chat.get('toolsCalled',[]) for t in c['expectedTools']), expectedFactsInReply=None if expected is None else all(f.lower() in reply.lower() for f in c['expectedFacts']),
 expectedFactsInActualEvidence=None if expected is None else all(any(f.lower() in s['content'].lower() for s in evidence.values()) for f in c['expectedFacts']),
 expectedPageCited=None if expected is None else expected in cited,
 titleCited='TradePro Demo Support - Development Fixture' in reply,
 citedPagesSupported=all(any(s['pageNumber']==p for s in evidence.values()) for p in cited),
 metadataMatchesActualEvidence=metadata,metadataPresent=bool(sources),
 chatMs=run.get('chatMs'),initialChatError=c.get('chatError'),recovered=run is not c,apiErrors=sum('error' in x for x in c.get('trace',[]))+sum('error' in x for x in c.get('recovery',{}).get('trace',[])),chatError=run.get('chatError'),
 reply=reply,actualEvidencePages=sorted({s['pageNumber'] for s in evidence.values()})))
lat=[x['chatMs'] for x in rows if x.get('chatMs') is not None]
summary=dict(initialChatFailures=sum(bool(c.get('chatError')) for c in r['cases']),completed=len(rows),rows=rows,thresholds=r.get('thresholds'),latencyMs=dict(min=min(lat),median=statistics.median(lat),max=max(lat)),apiFailures=sum(x['apiErrors'] for x in rows),finalChatFailures=sum(bool(x['chatError']) for x in rows))
(root/'evaluation.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
