import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import argon2 from 'argon2';
import { decodeJwt } from 'jose';
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'localhost');assert.equal(url.pathname,'/trading');assert.equal(process.env.RAG_CONFIRMED_TEST_DATABASE,'true');
const {default:prisma}=await import('../../src/db/db.config.js');
const {shouldRequireKnowledgeSearch}=await import('../../src/modules/ai/rag/rag-routing.service.js');
const path='tests/fixtures/rag-transfer-http/results.json';const report=JSON.parse(await readFile(path,'utf8'));
let sessionId:string|undefined;
try {
 const user=await prisma.user.findUniqueOrThrow({where:{id:report.testUserId},select:{email:true,name:true}});
 assert(user.email.startsWith('rag-transfer-')&&user.email.endsWith('@example.invalid')&&user.name==='Synthetic RAG transfer test');
 // Rotate only this harness-created account's ephemeral test credential; never print/store it.
 const password=randomBytes(18).toString('base64url')+'!aA1';
 await prisma.user.update({where:{id:report.testUserId},data:{passwordHash:await argon2.hash(password)}});
 const login=await fetch('http://localhost:3001/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password})});assert.equal(login.status,200);
 const data=await login.json() as any;const token=data.data.accessToken;sessionId=String(decodeJwt(token).sid);
 const session=await prisma.userSession.findUniqueOrThrow({where:{id:sessionId}});assert.equal(session.userId,report.testUserId);
 report.httpFollowup??=[];
 for(const [id,message] of [
 ['transfer-auto','Where is Transfer rehearsal, which tab comes next, and what support reference goes with this synthetic walkthrough?'],
 ['transfer-auto-qualified','In the TradePro demo, where is Transfer rehearsal and which tab should I choose next?'],
 ['private-kyc','What is my KYC status?'],
 ['private-accounts','Show my trading accounts, account balances, and recent transactions.'],
 ]) {
  if(report.httpFollowup.some((x:any)=>x.id===id))continue;
  await new Promise(r=>setTimeout(r,6000));const started=performance.now();
  const r=await fetch('http://localhost:3001/api/ai/chat/persistent',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({message}),signal:AbortSignal.timeout(180000)});
  const body=await r.json() as any;
  const entry:any={id,question:message,routingExpectedFromCurrentCode:shouldRequireKnowledgeSearch(message!)?'ANY':'AUTO',status:r.status,body,latencyMs:Math.round(performance.now()-started)};
  if(body.data?.conversationId){const conv=await prisma.aiConversation.findUniqueOrThrow({where:{id:body.data.conversationId},select:{userId:true}});entry.conversationOwnedByTestUser=conv.userId===report.testUserId;}
  report.httpFollowup.push(entry);await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(`FOLLOWUP ${id} ${r.status}`);
 }
}finally{
 if(sessionId)await prisma.userSession.updateMany({where:{id:sessionId,userId:report.testUserId},data:{revokedAt:new Date()}});
 report.followupSessionRevoked=!!sessionId;await writeFile(path,JSON.stringify(report,null,2)+'\n');await prisma.$disconnect();
}
