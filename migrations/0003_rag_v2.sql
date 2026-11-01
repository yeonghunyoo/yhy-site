CREATE TABLE `rag_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`section_id` text NOT NULL,
	`slug` text NOT NULL,
	`locale` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`section_id`) REFERENCES `rag_sections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rag_chunks_section_id_idx` ON `rag_chunks` (`section_id`);--> statement-breakpoint
CREATE TABLE `rag_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`locale` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`heading` text NOT NULL,
	`text` text NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rag_sections_slug_idx` ON `rag_sections` (`slug`);--> statement-breakpoint
-- 키워드 검색: 자식 청크 text(제목 접두어 포함)를 외부 콘텐츠로 쓰는 FTS5. trigram은 띄어쓰기로 안 갈리는 한국어도 부분 일치(3글자 이상)한다.
CREATE VIRTUAL TABLE `rag_chunks_fts` USING fts5(`text`, content='rag_chunks', content_rowid='rowid', tokenize='trigram');
--> statement-breakpoint
CREATE TRIGGER `rag_chunks_ai` AFTER INSERT ON `rag_chunks` BEGIN
  INSERT INTO `rag_chunks_fts`(rowid, `text`) VALUES (new.rowid, new.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER `rag_chunks_ad` AFTER DELETE ON `rag_chunks` BEGIN
  INSERT INTO `rag_chunks_fts`(`rag_chunks_fts`, rowid, `text`) VALUES ('delete', old.rowid, old.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER `rag_chunks_au` AFTER UPDATE ON `rag_chunks` BEGIN
  INSERT INTO `rag_chunks_fts`(`rag_chunks_fts`, rowid, `text`) VALUES ('delete', old.rowid, old.`text`);
  INSERT INTO `rag_chunks_fts`(rowid, `text`) VALUES (new.rowid, new.`text`);
END;
