CREATE TYPE "public"."entry_status" AS ENUM('received', 'transcribed', 'structured', 'in_review', 'needs_fix', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."failed_stage" AS ENUM('transcribe', 'structure', 'send_review');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"audio_url" text NOT NULL,
	"duration_sec" integer NOT NULL,
	"telegram_message_id" bigint NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"status" "entry_status" DEFAULT 'received' NOT NULL,
	"error_message" text,
	"failed_at_stage" "failed_stage",
	"raw_transcript" text,
	"title" text,
	"kalam_original" text,
	"kalam_roman" text,
	"kalam_english" text,
	"explanation_original" text,
	"explanation_english" text,
	"corrections" jsonb,
	"poet_id" uuid,
	"maqam_id" uuid,
	"review_token" text,
	"approved_at" timestamp,
	"published_at" timestamp,
	CONSTRAINT "entries_telegram_message_id_unique" UNIQUE("telegram_message_id"),
	CONSTRAINT "entries_review_token_unique" UNIQUE("review_token")
);
--> statement-breakpoint
CREATE TABLE "maqamat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_english" text NOT NULL,
	"name_original" text NOT NULL,
	"order_index" integer NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "maqamat_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "poets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_english" text NOT NULL,
	"name_original" text NOT NULL,
	"era" text NOT NULL,
	"bio" text NOT NULL,
	CONSTRAINT "poets_name_english_unique" UNIQUE("name_english")
);
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_poet_id_poets_id_fk" FOREIGN KEY ("poet_id") REFERENCES "public"."poets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_maqam_id_maqamat_id_fk" FOREIGN KEY ("maqam_id") REFERENCES "public"."maqamat"("id") ON DELETE no action ON UPDATE no action;