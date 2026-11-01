import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth-schema';

// 인증 테이블은 Better Auth CLI가 생성한다(src/db/auth-schema.ts, 직접 수정 금지).
// 다시 생성: npx auth@1.7.14 generate --config scripts/auth-schema.config.ts --output src/db/auth-schema.ts
export * from './auth-schema';

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const letters = sqliteTable(
  'letters',
  {
    id: text('id').primaryKey(),
    // 계정 삭제 시 NULL — 본문은 내 기록으로 남는다.
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    subject: text('subject'),
    body: text('body').notNull(),
    replyTo: text('reply_to'),
    // 답장 메일 언어
    locale: text('locale', { enum: ['ko', 'en'] }).notNull().default('ko'),
    status: text('status', { enum: ['sent', 'read', 'replied', 'failed'] })
      .notNull()
      .default('sent'),
    resendId: text('resend_id'),
    readAt: integer('read_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  },
  (table) => [
    index('letters_user_id_idx').on(table.userId),
    index('letters_created_at_idx').on(table.createdAt),
  ],
);

export const letterReplies = sqliteTable(
  'letter_replies',
  {
    id: text('id').primaryKey(),
    letterId: text('letter_id')
      .notNull()
      .references(() => letters.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    resendId: text('resend_id'),
    status: text('status', { enum: ['sent', 'failed'] }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  },
  (table) => [index('letter_replies_letter_id_idx').on(table.letterId)],
);

export type Letter = typeof letters.$inferSelect;
export type LetterReply = typeof letterReplies.$inferSelect;

// ---- 2차: 챗 + RAG (docs/05-06-chat-rag.md) ----

/** 질문 로그. 답변 본문은 저장하지 않고, IP는 해시만. 90일 지나면 지운다. */
export const chatLogs = sqliteTable(
  'chat_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    ipHash: text('ip_hash'),
    locale: text('locale', { enum: ['ko', 'en'] }).notNull(),
    question: text('question').notNull(),
    // 검색에 쓴 재작성 질문(두 번째 턴부터, 없으면 NULL)
    rewritten: text('rewritten'),
    // 답변에 쓰인 출처 slug 목록(JSON)
    sources: text('sources', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    // 프롬프트에 넣은 부모 섹션과 점수(JSON) — 튜닝용
    retrieval: text('retrieval', { mode: 'json' }).$type<RetrievalLog[]>().notNull().default(sql`'[]'`),
    // 가드레일 판정(injection / unsafe:S9 / self_harm:S11 / out_of_scope / output_blocked), 통과면 NULL
    flag: text('flag'),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  },
  (table) => [index('chat_logs_created_at_idx').on(table.createdAt)],
);

export type RetrievalLog = { id: string; slug: string; score: number };

/** RAG 부모 섹션 — 모델에 넣는 단위. `pnpm rag:build`가 채운다. id는 내용 해시. */
export const ragSections = sqliteTable(
  'rag_sections',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(), // about, stack, faq, projects/{slug}
    locale: text('locale', { enum: ['ko', 'en'] }).notNull(),
    kind: text('kind', { enum: ['doc', 'faq'] }).notNull(),
    title: text('title').notNull(), // 문서 제목
    heading: text('heading').notNull(), // 섹션 제목(FAQ는 질문)
    text: text('text').notNull(),
    position: integer('position').notNull(), // 문서 안 순서
  },
  (table) => [index('rag_sections_slug_idx').on(table.slug)],
);

/**
 * RAG 자식 청크 — 검색 단위. id는 내용 해시이자 Vectorize id. 키워드 검색용 FTS5 가상 테이블
 * (rag_chunks_fts, trigram)과 동기 트리거는 마이그레이션 SQL에 직접 쓴다(Drizzle 스키마로 표현 불가).
 */
export const ragChunks = sqliteTable(
  'rag_chunks',
  {
    id: text('id').primaryKey(),
    sectionId: text('section_id')
      .notNull()
      .references(() => ragSections.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    locale: text('locale', { enum: ['ko', 'en'] }).notNull(),
    kind: text('kind', { enum: ['doc', 'faq'] }).notNull(),
    text: text('text').notNull(), // `문서 제목 > 섹션 제목` 접두어 포함
  },
  (table) => [index('rag_chunks_section_id_idx').on(table.sectionId)],
);

export type RagSection = typeof ragSections.$inferSelect;
export type RagChunk = typeof ragChunks.$inferSelect;
