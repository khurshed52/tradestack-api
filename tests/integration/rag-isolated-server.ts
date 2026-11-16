import assert from 'node:assert/strict';
import {appendFile,readFile} from 'node:fs/promises';
import pg from 'pg';
const url=new URL(process.env.DATABASE_URL!);
assert.equal(url.hostname,'127.0.0.1');assert.notEqual(url.port,'5432');assert.equal(url.pathname,'/'+process.env.RAG_DATABASE_NAME);assert(url.pathname.startsWith('/rag_e2e_'));assert.notEqual(process.env.PORT,'3001');
const db=new pg.Client({connectionString:url.href});await db.connect();assert.equal((await db.query('SELECT current_database() AS name')).rows[0].name,process.env.RAG_DATABASE_NAME);await db.end();
const {getGeminiClient}=await import('../../src/config/gemini.js');
const client=getGeminiClient(), original=client.models.generateContent.bind(client.models);
let previous=0;
client.models.generateContent=async(params)=>{
 const pacingMs=Math.max(0,6500-(Date.now()-previous));await new Promise(r=>setTimeout(r,pacingMs));previous=Date.now();
 const contents:any=params.contents;
 const entry:any={at:new Date().toISOString(),mode:params.config?.toolConfig?.functionCallingConfig?.mode,pacingMs,toolResponses:JSON.parse(JSON.stringify((Array.isArray(contents)?contents:[]).flatMap((c:any)=>c.parts??[]).filter((p:any)=>p.functionResponse).map((p:any)=>p.functionResponse)))};
 const start=performance.now();
 try{let fault;try{fault=JSON.parse(await readFile(process.env.RAG_FAULT_FILE!,'utf8'));}catch{}if(fault?.status){entry.simulated=true;throw Object.assign(new Error('TEST_PROVIDER_PRIVATE_CANARY'),{status:fault.status});}
 const response=await original(params);entry.functionCalls=response.functionCalls??[];entry.usage=response.usageMetadata;return response;
 }catch(e:any){entry.error={status:e.status,message:String(e.message).replace(/AIza[\w-]+/g,'[REDACTED]')};throw e;}
 finally{entry.latencyMs=Math.round(performance.now()-start);await appendFile(process.env.RAG_TRACE_FILE!,JSON.stringify(entry)+'\n');}
};
await import('../../src/server.js');
