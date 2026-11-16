SELECT format_type(a.atttypid, a.atttypmod) AS embedding_type
FROM pg_attribute a
WHERE a.attrelid = 'public."KnowledgeChunk"'::regclass
  AND a.attname = 'embedding';
