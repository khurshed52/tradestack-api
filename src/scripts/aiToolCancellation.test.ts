import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({search:vi.fn()}));
vi.mock('../db/db.config.js',()=>({default:{}}));
vi.mock('../modules/ai/rag/retrieval.service.js',()=>({searchKnowledge:m.search}));
import {executeAiTool} from '../modules/ai/tools/tool-executor.js';
beforeEach(()=>{vi.clearAllMocks();});
it('propagates client cancellation through executor to RAG retrieval',async()=>{const controller=new AbortController();let received:AbortSignal|undefined;m.search.mockImplementation((_input,signal)=>{received=signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)));});const pending=executeAiTool('search_platform_knowledge',{question:'valid query'},{signal:controller.signal});controller.abort(new Error('client left'));await expect(pending).rejects.toThrow('client left');expect(received?.aborted).toBe(true);});
it('rejects model-provided ownership arguments before retrieval',async()=>{await expect(executeAiTool('search_platform_knowledge',{question:'valid',userId:'someone-else'})).rejects.toThrow();expect(m.search).not.toHaveBeenCalled();});
it.each(['get_my_kyc_status','get_my_trading_accounts','get_my_account_balances','get_my_fund_transactions'])('requires backend identity for %s',async(name)=>{await expect(executeAiTool(name,{})).rejects.toThrow('AI_AUTH_REQUIRED');});
