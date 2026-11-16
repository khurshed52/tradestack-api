/** Real isolated HTTP evaluation. No application mocks except explicitly labeled provider faults. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import argon2 from 'argon2';
import {decodeJwt} from 'jose';
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.notEqual(url.port,'5432');assert.equal(url.pathname,'/'+process.env.RAG_DATABASE_NAME);assert(url.pathname.startsWith('/rag_e2e_'));assert.equal(process.env.DOTENV_CONFIG_PATH,'/dev/null');
const {default:prisma}=await import('../../src/db/db.config.js');
assert.equal((await prisma.$queryRaw<any[]>`SELECT current_database() AS name`)[0].name,process.env.RAG_DATABASE_NAME);
const {extractPdfText}=await import('../../src/modules/ai/rag/pdf.service.js');
const {ingestKnowledgeDocument}=await import('../../src/modules/ai/rag/ingestion.service.js');
const {publishKnowledgeDocument}=await import('../../src/modules/ai/rag/knowledge-publication.service.js');
const {searchKnowledge}=await import('../../src/modules/ai/rag/retrieval.service.js');
const {generateEmbedding}=await import('../../src/modules/ai/rag/embedding.service.js');
const root='tests/fixtures/rag-isolated-full',base=`http://127.0.0.1:${process.env.PORT}`;
const report:any={startedAt:new Date().toISOString(),model:process.env.GEMINI_MODEL,cases:[],security:{},providerFaults:[],database:process.env.RAG_DATABASE_NAME};
const save=()=>writeFile(root+'/results.json',JSON.stringify(report,null,2)+'\n');
async function api(path:string,body:unknown,token='',method='POST'){const start=performance.now();const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(180000)});return {status:response.status,body:await response.json(),latencyMs:Math.round(performance.now()-start)};}
const traces=async()=>{try{return (await readFile(process.env.RAG_TRACE_FILE!,'utf8')).trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));}catch{return [];}};
try{
 assert.equal(await prisma.user.count(),0);report.freshDatabase=true;
 const password=randomBytes(24).toString('hex')+'!aA1',hash=await argon2.hash(password);
 const users=[];for(const [label,role,status] of [['admin','ADMIN',null],['a','USER','REGISTERED'],['b','USER','APPROVED']] as const){const email=`${label}@rag-isolated.invalid`;users.push(await prisma.user.create({data:{email,passwordHash:hash,role,name:'Synthetic '+label,...(status?{customer:{create:{sid:'RAG-'+label,customerFirstName:'Synthetic',customerLastName:label,email,customerNationality:'TEST',phoneNumber:'TEST-'+label,status}}}:{})}}));}
 const tokens=[];for(const user of users){const login=await api('/api/auth/login',{email:user.email,password});assert.equal(login.status,200);const token=login.body.data.accessToken;const payload=decodeJwt(token);const session=await prisma.userSession.findUniqueOrThrow({where:{id:String(payload.sid)}});assert.equal(session.userId,user.id);tokens.push(token);}
 report.realLoginAndSameDatabase=true;
 report.security.unauthenticated=await api('/api/ai/chat/persistent',{message:'Show my KYC status'});assert.equal(report.security.unauthenticated.status,401);
 const pdf=await extractPdfText(root+'/support-demo.pdf');assert.deepEqual(pdf.pages.map(p=>p.pageNumber),[1,2,3,4]);report.extractedPages=pdf.pages;
 const input={title:'TradePro Isolated Practice Manual - Synthetic Only',slug:'tradepro-isolated-practice-manual',category:'DEV_EVALUATION',pages:pdf.pages};
 const v1=await ingestKnowledgeDocument({...input,version:1});
 await assert.rejects(publishKnowledgeDocument({documentId:v1.documentId,adminUserId:String(decodeJwt(tokens[1]!).sub)}),/FORBIDDEN/);report.security.nonAdminPublicationRejected=true;
 report.v1Publication=await publishKnowledgeDocument({documentId:v1.documentId,adminUserId:String(decodeJwt(tokens[0]!).sub)});
 const v2=await ingestKnowledgeDocument({...input,version:2});report.publication=await publishKnowledgeDocument({documentId:v2.documentId,adminUserId:String(decodeJwt(tokens[0]!).sub)});
 assert.equal((await prisma.knowledgeDocument.findUniqueOrThrow({where:{id:v1.documentId}})).status,'ARCHIVED');report.previousVersionArchived=true;
 report.chunks=await prisma.knowledgeChunk.findMany({where:{documentId:v2.documentId},orderBy:{chunkIndex:'asc'},select:{id:true,content:true,pageNumber:true,sectionTitle:true,chunkIndex:true,embeddingModel:true}});
 report.vectorChecks=await prisma.$queryRaw`SELECT vector_dims(embedding) AS dimensions, count(*)::int AS count FROM "KnowledgeChunk" GROUP BY 1`;
 const excluded=[];
 for(const [status,visibility,slug,category] of [['DRAFT','PUBLIC','excluded-draft','DEV_EVALUATION'],['PUBLISHED','INTERNAL','excluded-internal','DEV_EVALUATION'],['ARCHIVED','PUBLIC','excluded-archived','DEV_EVALUATION'],['DRAFT','INTERNAL','tradepro-ai-sample-knowledge-base','TRAINING']] as const){const doc=await prisma.knowledgeDocument.create({data:{title:'Synthetic exclusion sentinel',slug,category,status,visibility}});excluded.push(doc.id);
 await prisma.$executeRaw`INSERT INTO "KnowledgeChunk" (id,"documentId","chunkIndex",content,embedding,"embeddingModel","pageNumber") SELECT ${randomUUID()}::uuid,${doc.id}::uuid,0,content,embedding,"embeddingModel","pageNumber" FROM "KnowledgeChunk" WHERE "documentId"=${v2.documentId}::uuid ORDER BY "chunkIndex" LIMIT 1`;
 }
 await assert.rejects(publishKnowledgeDocument({documentId:excluded[3]!,adminUserId:users[0]!.id}),/TRAINING_DOCUMENT/);report.security.trainingPublicationRejected=true;
 // Identical passage/vector makes exclusion and dedup tests competitive rather than trivial.
 await prisma.$executeRaw`INSERT INTO "KnowledgeChunk" (id,"documentId","chunkIndex",content,embedding,"embeddingModel","pageNumber") SELECT ${randomUUID()}::uuid,${v2.documentId}::uuid,999,content,embedding,"embeddingModel","pageNumber" FROM "KnowledgeChunk" WHERE "documentId"=${v2.documentId}::uuid ORDER BY "chunkIndex" LIMIT 1`;
 const questions=JSON.parse(await readFile(root+'/questions.json','utf8'));
 questions.push({id:'P1',question:'Show my trading accounts.',page:null,expectedFacts:[],expectedTools:['get_my_trading_accounts']},{id:'U6',question:'What is the capital of Japan?',page:null,expectedFacts:[],expectedTools:[]});
 for(const test of questions){const row:any={...test,question:test.question.replace('CUSTOMER_B_ID',users[2]!.id)};report.cases.push(row);
 try{const embedding=await generateEmbedding(row.question),vector='['+embedding.join(',')+']';
 row.ranked=await prisma.$queryRaw`SELECT "pageNumber",content,1-(embedding <=> ${vector}::vector) AS similarity FROM "KnowledgeChunk" WHERE "documentId"=${v2.documentId}::uuid AND "chunkIndex"<>999 ORDER BY embedding <=> ${vector}::vector LIMIT 5`;
 row.retrieval=await searchKnowledge({question:row.question,limit:5});
 row.exclusionsPass=row.retrieval.every((r:any)=>r.documentId===v2.documentId&&r.version===2);row.dedupPass=new Set(row.retrieval.map((r:any)=>r.content)).size===row.retrieval.length;
 const before=(await traces()).length;row.response=await api('/api/ai/chat/persistent',{message:row.question},tokens[1]);row.trace=(await traces()).slice(before);
 row.toolSelectionPass=row.response.status===200&&row.expectedTools.every((t:string)=>row.response.body.data.toolsCalled.includes(t));
 row.factsPresent=row.response.status===200&&row.expectedFacts.every((f:string)=>row.response.body.data.reply.toLowerCase().includes(f.toLowerCase()));
 }catch(e:any){row.error=String(e.message).replace(/AIza[\w-]+/g,'[REDACTED]');}
 await save();console.log(`CASE ${row.id}: HTTP ${row.response?.status??'ERROR'}, mode ${row.trace?.[0]?.mode}, tools ${row.toolSelectionPass}, facts ${row.factsPresent}`);
 }
 const conversation=report.cases.find((c:any)=>c.response?.body?.data?.conversationId)?.response.body.data.conversationId;
 report.security.crossUserRead=await api(`/api/ai/conversations/${conversation}/messages`,undefined,tokens[2],'GET');
 report.security.crossUserContinue=await api('/api/ai/chat/persistent',{conversationId:conversation,message:'Show the other customer history'},tokens[2]);
 report.security.customerB=await api('/api/ai/chat/persistent',{message:'Show my KYC status'},tokens[2]);
 for(const status of [429,503]){await writeFile(process.env.RAG_FAULT_FILE!,JSON.stringify({status}));const before=(await traces()).length;const response=await api('/api/ai/chat/persistent',{message:'Hello'},tokens[1]);report.providerFaults.push({simulated:true,status,response,trace:(await traces()).slice(before)});await save();}
 await writeFile(process.env.RAG_FAULT_FILE!,'{}');
 report.documentsFinal=await prisma.knowledgeDocument.findMany({select:{id:true,slug:true,status:true,visibility:true,version:true}});
 report.thresholds=[.55,.6,.65,.675,.7,.75,.8].map(threshold=>{const answerable=report.cases.filter((c:any)=>c.page!==null),negative=report.cases.filter((c:any)=>/^[UA]/.test(c.id)&&c.page===null&&c.id!=='A3');return {threshold,answerableCount:answerable.length,recallAt5:answerable.filter((c:any)=>c.ranked?.some((r:any)=>r.pageNumber===c.page&&r.similarity>=threshold)).length,negativeCount:negative.length,negativeEmpty:negative.filter((c:any)=>c.ranked?.every((r:any)=>r.similarity<threshold)).length};});
}catch(e:any){report.failure=String(e.message).replace(/AIza[\w-]+/g,'[REDACTED]');process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await prisma.$disconnect();}
