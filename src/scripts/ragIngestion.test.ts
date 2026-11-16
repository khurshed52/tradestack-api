import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ find:vi.fn(), create:vi.fn(), write:vi.fn(), embed:vi.fn(), tx:vi.fn() }));
vi.mock('../db/db.config.js',()=>({default:{knowledgeDocument:{findUnique:mocks.find},$transaction:mocks.tx}}));
vi.mock('../modules/ai/rag/embedding.service.js',()=>({EMBEDDING_MODEL:'gemini-embedding-2',EMBEDDING_DIMENSIONS:768,generateEmbedding:mocks.embed}));
import { ingestKnowledgeDocument } from '../modules/ai/rag/ingestion.service.js';
beforeEach(()=>{
 vi.resetAllMocks(); mocks.find.mockResolvedValue(null); mocks.create.mockResolvedValue({id:'doc'});
 mocks.embed.mockResolvedValue(Array(768).fill(.01));
 mocks.tx.mockImplementation(async fn=>fn({knowledgeDocument:{create:mocks.create},$executeRaw:mocks.write}));
});
const base={title:'Guide',slug:'guide',category:'KYC'};
it('keeps overlap on its source page and carries section metadata across pages',async()=>{
 await ingestKnowledgeDocument({...base,pages:[{pageNumber:1,content:'# Verification\n'+ 'Page one sentence. '.repeat(120)},{pageNumber:2,content:'Page two continuation.'},{pageNumber:3,content:'# Withdrawals\nOnly page three.'}]});
 const inserts=mocks.write.mock.calls.map(([,id,doc,index,page,section,content])=>({page,section,content}));
 expect(inserts.length).toBeGreaterThan(3);
 expect(inserts.filter(r=>r.page===1).every(r=>r.section==='Verification'&&!r.content.includes('Page two'))).toBe(true);
 expect(inserts.find(r=>r.page===2)).toMatchObject({section:'Verification',content:'Page two continuation.'});
 expect(inserts.find(r=>r.page===3)).toMatchObject({section:'Withdrawals'});
 expect(mocks.create.mock.calls[0]![0].data).toMatchObject({status:'DRAFT',visibility:'INTERNAL'});
});
it('rejects duplicate page numbers before embedding or writing',async()=>{
 await expect(ingestKnowledgeDocument({...base,pages:[{pageNumber:1,content:'a'},{pageNumber:1,content:'b'}]})).rejects.toThrow();
 expect(mocks.embed).not.toHaveBeenCalled(); expect(mocks.tx).not.toHaveBeenCalled();
});
it('does not write partial ingestion after embedding failure',async()=>{
 mocks.embed.mockRejectedValue(new Error('provider unavailable'));
 await expect(ingestKnowledgeDocument({...base,content:'Approved text.'})).rejects.toThrow('provider unavailable');
 expect(mocks.tx).not.toHaveBeenCalled();
});
it('preserves version conflict protection',async()=>{
 mocks.find.mockResolvedValue({contentHash:'different'});
 await expect(ingestKnowledgeDocument({...base,content:'Changed text.'})).rejects.toThrow('DOCUMENT_VERSION_CONFLICT');
 expect(mocks.embed).not.toHaveBeenCalled();
});
