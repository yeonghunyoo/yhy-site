CREATE TABLE `chat_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`ip_hash` text,
	`locale` text NOT NULL,
	`question` text NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chat_logs_created_at_idx` ON `chat_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `rag_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`locale` text NOT NULL,
	`heading` text NOT NULL,
	`text` text NOT NULL,
	`vector_id` text
);
--> statement-breakpoint
CREATE INDEX `rag_chunks_slug_idx` ON `rag_chunks` (`slug`);--> statement-breakpoint
-- 키워드 검색: rag_chunks를 외부 콘텐츠로 쓰는 FTS5. trigram은 한국어처럼 띄어쓰기로 안 갈리는 말도 부분 일치(3글자 이상)한다.
CREATE VIRTUAL TABLE `rag_chunks_fts` USING fts5(`heading`, `text`, content='rag_chunks', content_rowid='rowid', tokenize='trigram');
--> statement-breakpoint
CREATE TRIGGER `rag_chunks_ai` AFTER INSERT ON `rag_chunks` BEGIN
  INSERT INTO `rag_chunks_fts`(rowid, `heading`, `text`) VALUES (new.rowid, new.`heading`, new.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER `rag_chunks_ad` AFTER DELETE ON `rag_chunks` BEGIN
  INSERT INTO `rag_chunks_fts`(`rag_chunks_fts`, rowid, `heading`, `text`) VALUES ('delete', old.rowid, old.`heading`, old.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER `rag_chunks_au` AFTER UPDATE ON `rag_chunks` BEGIN
  INSERT INTO `rag_chunks_fts`(`rag_chunks_fts`, rowid, `heading`, `text`) VALUES ('delete', old.rowid, old.`heading`, old.`text`);
  INSERT INTO `rag_chunks_fts`(rowid, `heading`, `text`) VALUES (new.rowid, new.`heading`, new.`text`);
END;
