CREATE TYPE "public"."subscription_source" AS ENUM('manual', 'apple', 'google');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'grace', 'expired', 'canceled');--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" "subscription_source" NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"product_id" text,
	"external_id" text,
	"current_period_end" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_source_external_uq" ON "subscriptions" USING btree ("source","external_id");--> statement-breakpoint
-- 용량 모델 변경 (docs/decisions.md D-016): 개인 10GB, Space는 별도 용량 없이 소유자의 개인 용량에서 차감
UPDATE "libraries" SET "quota_bytes" = 10737418240 WHERE "type" = 'personal';--> statement-breakpoint
UPDATE "libraries" SET "quota_bytes" = 0 WHERE "type" = 'space';
