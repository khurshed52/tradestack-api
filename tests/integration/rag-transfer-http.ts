/** Explicitly authorized, confirmed test-only local trading DB + running chatbot. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import argon2 from 'argon2';
import { decodeJwt } from 'jose';
const url = new URL(process.env.DATABASE_URL ?? '');
assert(['localhost','127.0.0.1'].includes(url.hostname) && url.port==='5432' && url.pathname==='/trading');
assert.equal(process.env.RAG_CONFIRMED_TEST_DATABASE, 'true');
const { default: prisma } = await import('../../src/db/db.config.js');
const { extractPdfText } = await import('../../src/modules/ai/rag/pdf.service.js');
const { ingestKnowledgeDocument } = await import('../../src/modules/ai/rag/ingestion.service.js');
const { publishKnowledgeDocument } = await import('../../src/modules/ai/rag/knowledge-publication.service.js');
const { searchKnowledge } = await import('../../src/modules/ai/rag/retrieval.service.js');
const { shouldRequireKnowledgeSearch } = await import('../../src/modules/ai/rag/rag-routing.service.js');
const root='tests/fixtures/rag-transfer-http';
const report: any={startedAt:new Date().toISOString(),baseUrl:'http://localhost:3001',isolationBasis:'User confirmed test-only database and running checkout; verified live session linkage below',api:[]};
let sessionId: string|undefined;
let token='';
const safeError=(e:unknown)=>(e instanceof Error?e.message:String(e)).replace(/AIza[\w-]+/g,'[REDACTED]');
const save=()=>writeFile(`${root}/results.json`,JSON.stringify(report,null,2)+'\n');
const sampleSnapshot=()=>prisma.knowledgeDocument.findMany({where:{OR:[{category:'TRAINING'},{slug:'tradepro-ai-sample-knowledge-base'}]},select:{id:true,slug:true,version:true,status:true,visibility:true,updatedAt:true},orderBy:{id:'asc'}});
async function call(path:string,body:unknown,bearer=token) {
 const start=performance.now();
 const response=await fetch(report.baseUrl+path,{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
 const raw=await response.text();let json;try{json=JSON.parse(raw);}catch{json={nonJsonBody:raw.slice(0,1000)};}
 return {status:response.status,body:json,latencyMs:Math.round(performance.now()-start)};
}
try {
 report.database=await prisma.$queryRaw`SELECT current_database() AS database,inet_server_addr()::text AS address,inet_server_port() AS port`;
 report.countsBefore={users:await prisma.user.count(),customers:await prisma.customer.count()};
 const admin=await prisma.user.findUnique({where:{id:process.env.RAG_TEST_ADMIN_USER_ID!},select:{id:true,role:true,isActive:true}});
 assert(admin?.isActive && admin.role==='ADMIN','Configured admin must be active ADMIN');
 report.admin={role:admin.role,isActive:admin.isActive};
 report.trainingBefore=await sampleSnapshot();
 assert(report.trainingBefore.every((d:any)=>d.status==='DRAFT'&&d.visibility==='INTERNAL'),'Training state unexpected: STOP');
 report.publishedBefore=await prisma.knowledgeDocument.findMany({where:{status:'PUBLISHED'},select:{id:true,title:true,slug:true,version:true,visibility:true}});
 const suffix=randomUUID().slice(0,8);const email=`rag-transfer-${suffix}@example.invalid`;const password=randomBytes(18).toString('base64url')+'!aA1';
 const user=await prisma.user.create({data:{email,passwordHash:await argon2.hash(password),name:'Synthetic RAG transfer test',customer:{create:{sid:`RAG-XFER-${suffix}`,customerFirstName:'Synthetic',customerLastName:'Transfer test',email,customerNationality:'TEST',phoneNumber:`RAG-XFER-${suffix}`,status:'REGISTERED'}}}});
 report.testUserId=user.id;
 const login=await call('/api/auth/login',{email,password},'');
 assert.equal(login.status,200,'Real login must succeed before publication');
 token=login.body.data.accessToken;
 const payload=decodeJwt(token);sessionId=String(payload.sid);
 const storedSession=await prisma.userSession.findUnique({where:{id:sessionId},select:{userId:true,revokedAt:true}});
 assert.equal(storedSession?.userId,user.id,'API session must exist in this same database');assert.equal(storedSession?.revokedAt,null);
 report.login={...login,body:{...login.body,data:{...login.body.data,accessToken:'[REDACTED]'}}};
 report.sameDatabaseVerifiedByLoginSession=true;
 const pdf=await extractPdfText(`${root}/transfer-demo.pdf`);assert.deepEqual(pdf.pages.map(p=>p.pageNumber),[1,2]);report.extractedPages=pdf.pages;
 const fixture=await ingestKnowledgeDocument({title:'TradePro Synthetic Transfer Walkthrough - Development Only',slug:'tradepro-synthetic-transfer-orchid-611',category:'DEV_EVALUATION',version:1,pages:pdf.pages});
 report.fixture=fixture;
 await assert.rejects(publishKnowledgeDocument({documentId:fixture.documentId,adminUserId:user.id}),/FORBIDDEN/);
 report.publication=await publishKnowledgeDocument({documentId:fixture.documentId,adminUserId:admin.id});
 const cases=[
 ['transfer','In the synthetic TradePro transfer demo, what do I select after opening Funds, and what is its unique support reference?'],
 ['unrelated-password','How do I reset my account password?'],
 ['unrelated-kyc','What are the KYC document requirements?'],
 ['unrelated-geography','What is the capital of Japan?'],
 ['private','Show my KYC status, trading accounts, account balances, and recent transactions.'],
 ];
 for(const [id,question] of cases) {
  const row:any={id,question,routingExpectedFromCurrentCode:shouldRequireKnowledgeSearch(question!)?'ANY':'AUTO'};report.api.push(row);
  try {
   if(id!=='private')row.retrieval=await searchKnowledge({question:question!});
   row.response=await call('/api/ai/chat/persistent',{message:question});
   const data=row.response.body.data;
   const ids=(data?.ragRetrievedSources??[]).filter((s:any)=>s.documentId===fixture.documentId).map((s:any)=>s.chunkId);
   row.fixtureEvidenceFromReturnedChunkIds=await prisma.knowledgeChunk.findMany({where:{id:{in:ids},documentId:fixture.documentId},select:{id:true,pageNumber:true,content:true,document:{select:{title:true,version:true,status:true,visibility:true}}}});
   if(data?.conversationId){const conv=await prisma.aiConversation.findUnique({where:{id:data.conversationId},select:{userId:true}});row.conversationOwnedByTestUser=conv?.userId===user.id;}
  }catch(e){row.error=safeError(e);}
  await save();
  console.log(`HTTP CASE ${id}: ${row.response?.status??'ERROR'}`);
  await new Promise(resolve=>setTimeout(resolve,6000));
 }
 report.trainingAfter=await sampleSnapshot();assert.deepEqual(report.trainingAfter,report.trainingBefore);
 report.trainingUnchanged=true;
 report.countsAfter={users:await prisma.user.count(),customers:await prisma.customer.count()};
}catch(e){report.failure=safeError(e);process.exitCode=1;}
finally{
 if(sessionId){await prisma.userSession.updateMany({where:{id:sessionId,userId:report.testUserId},data:{revokedAt:new Date()}});report.testSessionRevoked=true;}
 report.finishedAt=new Date().toISOString();await save();await prisma.$disconnect();
}
