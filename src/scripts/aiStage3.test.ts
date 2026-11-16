import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({generate:vi.fn(),stream:vi.fn(),tool:vi.fn()}));
vi.mock('../db/db.config.js',()=>({default:{}}));
vi.mock('../config/gemini.js',()=>({getGeminiClient:()=>({models:{generateContent:m.generate,generateContentStream:m.stream}})}));
vi.mock('../modules/ai/tools/tool-executor.js',()=>({executeAiTool:m.tool}));
import {generateAiResponseWithTools,retryGeminiRequest} from '../modules/ai/ai-tool-selection.service.js';
import {parseAnswerEvidence,evidenceMatchesReply} from '../modules/ai/rag/answer-evidence.js';
const json=(value:unknown)=>({text:JSON.stringify(value),usageMetadata:{promptTokenCount:1,candidatesTokenCount:1,totalTokenCount:2}});
const call={name:'search_platform_knowledge',args:{question:'approved guidance'},id:'call-1'};
const toolCall=()=>({functionCalls:[call],candidates:[{content:{role:'model',parts:[{functionCall:call}]}}]});
const source={documentId:'doc',chunkId:'chunk',title:'Approved guide',version:2,pageNumber:3,content:'Open the support panel.',sourceUrl:null,similarity:.9};
function setupRag(){m.generate.mockResolvedValueOnce(json({toolNames:[call.name]})).mockResolvedValueOnce(toolCall());m.tool.mockResolvedValue({status:'KNOWLEDGE_FOUND',sources:[source]});}
async function* answerStream(){yield {text:'{"answer":"Open '};yield {text:'the support panel.","category":"PLATFORM_POLICY","requiresLiveData":false}',usageMetadata:{promptTokenCount:1,candidatesTokenCount:1,totalTokenCount:2}};}
beforeEach(()=>{vi.clearAllMocks();m.generate.mockReset();m.stream.mockReset();m.tool.mockReset();m.stream.mockImplementation(async()=>answerStream());});
afterEach(()=>vi.useRealTimers());
it.each(['', '{"chunkIds":["chunk"', '{"chunkIds":"chunk"}', '{"chunkIds":["chunk"],"extra":true}'])('fails closed on malformed attribution %s',raw=>expect(parseAnswerEvidence(raw)).toEqual([]));
it('accepts complete fenced attribution and deduplicates',()=>expect(parseAnswerEvidence('```json\n{"chunkIds":["a","a"]}\n```')).toEqual(['a']));
it('withholds RAG deltas until whole-answer verification finishes',async()=>{setupRag();let chunks='';m.generate.mockImplementationOnce(()=>{expect(chunks).toBe('');return Promise.resolve(json({supported:true,chunkIds:['chunk']}));});const result=await generateAiResponseWithTools('procedure',[],null,'user',text=>{chunks+=text;});expect(result.answerSources).toEqual([{type:'KNOWLEDGE_DOCUMENT',documentId:'doc',chunkId:'chunk',title:'Approved guide',version:2,pageNumber:3,sourceUrl:null}]);expect(chunks).toBe(result.reply);expect(m.generate).toHaveBeenCalledTimes(3);expect(m.stream).toHaveBeenCalledTimes(1);});
it('malformed citation JSON returns a safe final answer without fabricated citations',async()=>{setupRag();m.generate.mockResolvedValueOnce({text:'{"chunkIds":["chunk"'});const result=await generateAiResponseWithTools('procedure',[],null,'user',()=>{});expect(result.reply).toContain("couldn't find approved");expect(result.answerSources).toEqual([{type:'NO_VERIFIED_SOURCE'}]);});
it('does not call Gemini again or emit unverified answer text when evidence is absent',async()=>{setupRag();m.tool.mockResolvedValue({status:'NO_APPROVED_KNOWLEDGE',sources:[]});let text='';const result=await generateAiResponseWithTools('policy',[],null,'user',s=>{text+=s;});expect(text).toBe(result.reply);expect(text).toContain("couldn't find approved");expect(m.generate).toHaveBeenCalledTimes(2);expect(m.stream).not.toHaveBeenCalled();});
it('cancellation reaches the planner and prevents retries or tool work',async()=>{const controller=new AbortController();m.generate.mockImplementation(({config})=>new Promise((_resolve,reject)=>config.abortSignal.addEventListener('abort',()=>reject(config.abortSignal.reason))));const pending=generateAiResponseWithTools('test',[],null,'user',()=>{},controller.signal);controller.abort(new Error('client disconnected'));await expect(pending).rejects.toThrow('client disconnected');expect(m.tool).not.toHaveBeenCalled();expect(m.generate).toHaveBeenCalledTimes(1);});
it('cancels retry backoff without another provider attempt',async()=>{const controller=new AbortController();const operation=vi.fn().mockRejectedValue({status:429});const pending=retryGeminiRequest(operation,controller.signal);await Promise.resolve();controller.abort();await expect(pending).rejects.toThrow();expect(operation).toHaveBeenCalledTimes(1);});
it.each([429,503])('retries %i three times then fails',async(status)=>{vi.useFakeTimers();const operation=vi.fn().mockRejectedValue(Object.assign(new Error('unavailable'),{status}));const pending=retryGeminiRequest(operation);const assertion=expect(pending).rejects.toThrow('unavailable');await vi.runAllTimersAsync();await assertion;expect(operation).toHaveBeenCalledTimes(3);});
it('rejects a planner-selected unauthorized tool before execution',async()=>{m.generate.mockResolvedValueOnce(json({toolNames:['delete_customer']}));await expect(generateAiResponseWithTools('test')).rejects.toThrow('AI_PLANNER_UNAUTHORIZED_TOOL');expect(m.tool).not.toHaveBeenCalled();});
it('enforces per-round tool call budget',async()=>{m.generate.mockResolvedValueOnce(json({toolNames:[call.name]})).mockResolvedValueOnce({functionCalls:[call,call,call,call]});await expect(generateAiResponseWithTools('test')).rejects.toThrow('AI_TOO_MANY_TOOL_CALLS');expect(m.tool).not.toHaveBeenCalled();});
it('recovers a truncated structured stream through the existing formatting path',async()=>{m.generate.mockResolvedValueOnce(json({toolNames:[]})).mockResolvedValueOnce(json({answer:'Hello',category:'OTHER',requiresLiveData:false}));m.stream.mockImplementation(async()=> (async function*(){yield {text:'{"answer":"Hello","category":'};})());const result=await generateAiResponseWithTools('Hello',[],null,'user',()=>{});expect(result.reply).toBe('Hello');expect(m.generate).toHaveBeenCalledTimes(2);});
it('never retries a partially delivered stream',async()=>{m.generate.mockResolvedValueOnce(json({toolNames:[]}));m.stream.mockImplementation(async()=> (async function*(){yield {text:'{"answer":"Hello'};throw Object.assign(new Error('stream unavailable'),{status:503});})());await expect(generateAiResponseWithTools('Hello',[],null,'user',()=>{})).rejects.toThrow('stream unavailable');expect(m.stream).toHaveBeenCalledTimes(1);expect(m.generate).toHaveBeenCalledTimes(1);});

it('retries a stream-opening 503 before any tokens are delivered',async()=>{vi.useFakeTimers();m.generate.mockResolvedValueOnce(json({toolNames:[]}));m.stream.mockRejectedValueOnce(Object.assign(new Error('busy'),{status:503})).mockImplementationOnce(async()=>answerStream());let text='';const pending=generateAiResponseWithTools('Hello',[],null,'user',s=>{text+=s;});await vi.advanceTimersByTimeAsync(1500);await pending;expect(m.stream).toHaveBeenCalledTimes(2);expect(text).toBe('Open the support panel.');});

it('retries the observed transport ETIMEDOUT before generating an answer',async()=>{vi.useFakeTimers();const operation=vi.fn().mockRejectedValueOnce(new TypeError('fetch failed',{cause:{code:'ETIMEDOUT'}})).mockResolvedValueOnce('ok');const pending=retryGeminiRequest(operation);await vi.advanceTimersByTimeAsync(1500);expect(await pending).toBe('ok');expect(operation).toHaveBeenCalledTimes(2);});
it('does not retry unknown application errors',async()=>{const operation=vi.fn().mockRejectedValue(new Error('validation failed'));await expect(retryGeminiRequest(operation)).rejects.toThrow('validation failed');expect(operation).toHaveBeenCalledTimes(1);});


it('never emits an unsupported draft even when a real source supports part of it',async()=>{
 setupRag();m.generate.mockResolvedValueOnce(json({supported:false,chunkIds:['chunk']}));
 m.stream.mockImplementation(async()=> (async function*(){yield {text:JSON.stringify({answer:'Withdrawals are free and instant.',category:'PLATFORM_POLICY',requiresLiveData:false})};})());
 const chunks:string[]=[];const result=await generateAiResponseWithTools('withdrawal fees',[],null,'user',s=>{chunks.push(s);});
 expect(chunks.join('')).toBe(result.reply);expect(result.reply).toContain("couldn't find approved");expect(chunks.join('')).not.toContain('free and instant');
 expect(result.answerSources).toEqual([{type:'NO_VERIFIED_SOURCE'}]);
});
it('rejects embedded PDF version conflicting with authoritative metadata',async()=>{
 setupRag();m.tool.mockResolvedValue({status:'KNOWLEDGE_FOUND',sources:[{...source,content:'Version 1. Open the support panel.'}]});
 m.stream.mockImplementation(async()=> (async function*(){yield {text:JSON.stringify({answer:'According to version 1, open the support panel.',category:'PLATFORM_POLICY',requiresLiveData:false})};})());
 m.generate.mockResolvedValueOnce(json({supported:true,chunkIds:['chunk']}));
 let chunks='';const result=await generateAiResponseWithTools('procedure',[],null,'user',s=>{chunks+=s;});
 expect(result.reply).toContain("couldn't find approved");expect(chunks).toBe(result.reply);
 const verification=m.generate.mock.calls.at(-1)![0];expect(JSON.parse(verification.contents).candidates[0]).toMatchObject({version:2,pageNumber:3});
});
it('rejects synthetic evidence generalized into actual policy even if the model approves',()=>{
 expect(evidenceMatchesReply('Open Funds for your withdrawal.',[{version:9,content:'FICTIONAL: Open Funds for a demo withdrawal.'}])).toBe(false);
 expect(evidenceMatchesReply('In this fictional exercise, open Funds.',[{version:9,content:'FICTIONAL: Open Funds for a demo withdrawal.'}])).toBe(true);
});
it('cancellation during verification never flushes a held answer',async()=>{
 setupRag();const controller=new AbortController();m.generate.mockImplementationOnce(async()=>{controller.abort(new Error('disconnected'));return json({supported:true,chunkIds:['chunk']});});
 const delta=vi.fn();await expect(generateAiResponseWithTools('procedure',[],null,'user',delta,controller.signal)).rejects.toThrow();expect(delta).not.toHaveBeenCalled();
});
it('invented citation ID fails the entire verification',async()=>{
 setupRag();m.generate.mockResolvedValueOnce(json({supported:true,chunkIds:['chunk','invented']}));
 const result=await generateAiResponseWithTools('procedure',[],null,'user',()=>{});expect(result.reply).toContain("couldn't find approved");
});
it('mixed private and knowledge answers cannot bypass policy verification',async()=>{
 const privateCall={name:'get_my_kyc_status',args:{},id:'private'};
 m.generate.mockResolvedValueOnce(json({toolNames:[call.name,privateCall.name]}))
  .mockResolvedValueOnce(toolCall())
  .mockResolvedValueOnce({functionCalls:[privateCall],candidates:[{content:{role:'model',parts:[{functionCall:privateCall}]}}]})
  .mockResolvedValueOnce(json({supported:false,chunkIds:['chunk']}));
 m.tool.mockResolvedValueOnce({status:'KNOWLEDGE_FOUND',sources:[source]}).mockResolvedValueOnce({status:'REGISTERED'});
 let chunks='';const result=await generateAiResponseWithTools('my status and policy',[],null,'trusted-user',s=>{chunks+=s;});
 expect(result.reply).toContain("couldn't find approved");expect(chunks).toBe(result.reply);
 expect(result.toolsCalled).toEqual([call.name,privateCall.name]);
 expect(result.answerSources).not.toContainEqual(expect.objectContaining({type:'KNOWLEDGE_DOCUMENT'}));
});
