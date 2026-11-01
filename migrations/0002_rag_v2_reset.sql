-- RAG v2(부모-자식 청크, docs/05-06-chat-rag.md): 기존 한 단계 청크와 FTS5를 지운다. 데이터는 rag:build로 다시 만든다.
DROP TRIGGER IF EXISTS `rag_chunks_ai`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `rag_chunks_ad`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `rag_chunks_au`;--> statement-breakpoint
DROP TABLE IF EXISTS `rag_chunks_fts`;--> statement-breakpoint
DROP TABLE `rag_chunks`;--> statement-breakpoint
ALTER TABLE `chat_logs` ADD `rewritten` text;--> statement-breakpoint
ALTER TABLE `chat_logs` ADD `retrieval` text DEFAULT '[]' NOT NULL;