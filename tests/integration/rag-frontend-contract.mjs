// Read-only test of the actual frontend service. All HTTP is mocked.
// node --import tsx tests/integration/rag-frontend-contract.mjs /path/to/frontend
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=process.argv[2];
assert(root, 'Pass the frontend checkout path');
const {streamPersistentTradeProAiMessage}=await import(pathToFileURL(resolve(root,'services/tradepro-ai.service.ts')).href);
const originalFetch=globalThis.fetch;
const frame=(event,data)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const final={conversationId:'synthetic',reply:'Verified final answer',category:'PLATFORM_POLICY',requiresLiveData:false,answerSources:[{type:'NO_VERIFIED_SOURCE'}]};
try {
  let received='';
  globalThis.fetch=async()=>new Response(frame('chunk',{text:'Unsupported provisional draft'})+frame('done',{data:final}),{headers:{'content-type':'text/event-stream'}});
  const result=await streamPersistentTradeProAiMessage({message:'synthetic',onChunk:text=>{received+=text;}});
  assert.equal(received,'Unsupported provisional draft');
  assert.equal(result.reply,final.reply);
  globalThis.fetch=async()=>new Response(frame('chunk',{text:'incomplete'}),{headers:{'content-type':'text/event-stream'}});
  await assert.rejects(streamPersistentTradeProAiMessage({message:'synthetic'}),error=>error.code==='AI_STREAM_INTERRUPTED');
  const controller=new AbortController();controller.abort();
  globalThis.fetch=async(_url,options)=>{assert.equal(options.signal,controller.signal);options.signal.throwIfAborted();};
  await assert.rejects(streamPersistentTradeProAiMessage({message:'synthetic',signal:controller.signal}));
  console.log('PASS: final reply overrides provisional text; incomplete SSE rejected; cancellation propagated (3 checks).');
} finally { globalThis.fetch=originalFetch; }
