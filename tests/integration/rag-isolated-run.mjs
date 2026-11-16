/** Disposable integration launcher. Never inherits application configuration. */
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,openSync,closeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import net from 'node:net';
import {parse} from 'dotenv';
import pg from 'pg';
const root='tests/fixtures/rag-isolated-full';
const id=Date.now()+'_'+randomBytes(3).toString('hex');
const db='rag_e2e_'+id, names=['rag-pg-'+id,'rag-redis-'+id];
const temp=mkdtempSync(join(tmpdir(),'rag-isolated-'));
const report={database:db,containers:names,startedAt:new Date().toISOString(),cleanup:{}};
let server,logfd;
const docker=(args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(args,env){await new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{env,stdio:'inherit'});p.on('exit',c=>c===0?resolve():reject(new Error('Child exit '+c)));p.on('error',reject);});}
try{
 const config=parse(readFileSync('.env'));
 if(!config.GEMINI_API_KEY)throw new Error('Approved Gemini key unavailable');
 const password=randomBytes(24).toString('hex');
 docker(['run','-d','--rm','--name',names[0],'-e','POSTGRES_DB='+db,'-e','POSTGRES_PASSWORD='+password,'-p','127.0.0.1::5432','pgvector/pgvector:pg17']);
 docker(['run','-d','--rm','--name',names[1],'-p','127.0.0.1::6379','redis:8-alpine']);
 const port=Number(docker(['port',names[0],'5432/tcp']).split(':').at(-1));
 const redisPort=Number(docker(['port',names[1],'6379/tcp']).split(':').at(-1));
 if(!port||port===5432)throw new Error('Unsafe database port');
 const databaseUrl=`postgresql://postgres:${password}@127.0.0.1:${port}/${db}`;
 for(let i=0;i<30;i++){try{docker(['exec',names[0],'pg_isready','-U','postgres','-d',db]);break;}catch{await sleep(500);}}
 let identity;
 for(let attempt=0;attempt<60;attempt++){const client=new pg.Client({connectionString:databaseUrl});try{await client.connect();identity=(await client.query('SELECT current_database() AS database, inet_server_port() AS server_port, version()')).rows[0];break;}catch{await sleep(500);}finally{await client.end().catch(()=>{});}}
 if(!identity)throw new Error('Disposable database TCP readiness failed');
 if(identity.database!==db)throw new Error('Database identity mismatch');
 report.databaseVerification={host:'127.0.0.1',hostPort:port,...identity};
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const httpPort=socket.address().port;await new Promise(r=>socket.close(r));
 if(httpPort===3001)throw new Error('Unsafe HTTP port');report.httpPort=httpPort;
 const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:temp,DOTENV_CONFIG_PATH:'/dev/null',NODE_ENV:'development',DATABASE_URL:databaseUrl,DIRECT_URL:databaseUrl,REDIS_URL:`redis://127.0.0.1:${redisPort}`,BULLMQ_REDIS_URL:`redis://127.0.0.1:${redisPort}`,PORT:String(httpPort),FRONTEND_URL:`http://127.0.0.1:${httpPort}`,ENABLE_EMAIL_WORKER:'false',ENABLE_MARKET_PRICE_UPDATES:'false',COINPAYMENTS_ENABLED:'false',STRIPE_SECRET_KEY:'sk_test_isolated_dummy',SENDGRID_API_KEY:'SG.isolated.invalid',SENDGRID_FROM_EMAIL:'test@example.invalid',JWT_ACCESS_SECRET:randomBytes(48).toString('hex'),OTP_HASH_SECRET:randomBytes(48).toString('hex'),PASSWORD_RESET_SECRET:randomBytes(48).toString('hex'),JWT_ISSUER:'rag-isolated',JWT_AUDIENCE:'rag-isolated',GEMINI_API_KEY:config.GEMINI_API_KEY,GEMINI_MODEL:config.GEMINI_MODEL||'gemini-2.5-flash',RAG_DATABASE_NAME:db,RAG_TRACE_FILE:join(temp,'trace.jsonl'),RAG_FAULT_FILE:join(temp,'fault.json')};
 writeFileSync(root+'/environment.json',JSON.stringify({...env,DATABASE_URL:`postgresql://postgres:[REDACTED]@127.0.0.1:${port}/${db}`,DIRECT_URL:'same disposable direct connection',GEMINI_API_KEY:'[REDACTED]',JWT_ACCESS_SECRET:'[REDACTED]',OTP_HASH_SECRET:'[REDACTED]',PASSWORD_RESET_SECRET:'[REDACTED]'},null,2));
 await run(['node_modules/prisma/build/index.js','migrate','deploy'],env);report.migrations='passed';
 logfd=openSync(join(temp,'backend.log'),'w');
 server=spawn(process.execPath,['--import','tsx','tests/integration/rag-isolated-server.ts'],{env,stdio:['ignore',logfd,logfd]});
 let ready=false;for(let i=0;i<80;i++){if(server.exitCode!==null)break;try{const r=await fetch(`http://127.0.0.1:${httpPort}/customer`);if(r.status===200){ready=true;break;}}catch{}await sleep(500);}
 if(!ready)throw new Error('Isolated backend failed readiness');report.serverReady=true;
 await run(['--import','tsx','tests/integration/rag-isolated-evaluate.ts'],env);
}catch(e){report.failure=String(e.message).replace(/postgresql:\/\/[^\s]+/g,'[REDACTED]');process.exitCode=1;}
finally{
 if(server&&server.exitCode===null){server.kill('SIGTERM');for(let i=0;i<20&&server.exitCode===null;i++)await sleep(250);if(server.exitCode===null)server.kill('SIGKILL');}
 if(logfd!==undefined)closeSync(logfd);
 for(const name of names){try{docker(['rm','-f',name]);report.cleanup[name]='removed';}catch{report.cleanup[name]='not present or removal failed';}}
 for(const [file,target] of [['trace.jsonl','trace.jsonl'],['backend.log','backend.log']]){try{const content=readFileSync(join(temp,file),'utf8').replace(/AIza[\w-]+/g,'[REDACTED]').replace(/postgresql:\/\/[^\s]+/g,'[REDACTED]');writeFileSync(root+'/'+target,content);}catch{}}
 rmSync(temp,{recursive:true,force:true});report.cleanup.temporarySecrets='removed';report.cleanup.backendExit=server?.exitCode??server?.signalCode??'not started';report.finishedAt=new Date().toISOString();writeFileSync(root+'/run.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
