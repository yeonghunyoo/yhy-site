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
    // 답변에 쓰인 출처 slug 목록(JSON)
    sources: text('sources', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  },
  (table) => [index('chat_logs_created_at_idx').on(table.createdAt)],
);

/**
 * RAG 청크. `pnpm rag:build`가 채운다. 키워드 검색용 FTS5 가상 테이블(rag_chunks_fts, trigram)과
 * 동기 트리거는 마이그레이션 SQL에 직접 쓴다(Drizzle 스키마로 표현 불가).
 */
export const ragChunks = sqliteTable(
  'rag_chunks',
  {
    id: text('id').primaryKey(), // `{slug}#{locale}#{n}`
    slug: text('slug').notNull(), // about, stack, projects/{slug}
    locale: text('locale', { enum: ['ko', 'en'] }).notNull(),
    heading: text('heading').notNull(),
    text: text('text').notNull(),
    vectorId: text('vector_id'),
  },
  (table) => [index('rag_chunks_slug_idx').on(table.slug)],
);

export type RagChunk = typeof ragChunks.$inferSelect;
