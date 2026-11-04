CREATE TABLE "r2_gc" (
	"sha256" text NOT NULL,
	"owner" text NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	CONSTRAINT "r2_gc_sha256_owner_pk" PRIMARY KEY("sha256","owner")
);
--> statement-breakpoint
CREATE INDEX "r2_gc_due_idx" ON "r2_gc" USING btree ("due_at");