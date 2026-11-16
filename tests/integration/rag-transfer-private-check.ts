import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'localhost');assert.equal(url.pathname,'/trading');assert.equal(process.env.RAG_CONFIRMED_TEST_DATABASE,'true');
const {default:prisma}=await import('../../src/db/db.config.js');
const {executeAiTool}=await import('../../src/modules/ai/tools/tool-executor.js');
const path='tests/fixtures/rag-transfer-http/results.json';const report=JSON.parse(await readFile(path,'utf8'));
try {
 const user=await prisma.user.findUniqueOrThrow({where:{id:report.testUserId},select:{email:true,name:true}});
 assert(user.email.startsWith('rag-transfer-')&&user.email.endsWith('@example.invalid')&&user.name==='Synthetic RAG transfer test');
 report.privateServiceChecks=[];
 for(const tool of ['get_my_kyc_status','get_my_trading_accounts','get_my_account_balances','get_my_fund_transactions']) {
  await assert.rejects(executeAiTool(tool,{}),/AI_AUTH_REQUIRED/);
  try {report.privateServiceChecks.push({tool,result:await executeAiTool(tool,{}, {userId:report.testUserId}),unauthenticatedRejected:true});}
  catch(e){report.privateServiceChecks.push({tool,error:e instanceof Error?e.message:'Unknown'});}
 }
} finally {await writeFile(path,JSON.stringify(report,null,2)+'\n');await prisma.$disconnect();}
