CREATE TABLE "call_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"call_offset_ms" integer NOT NULL,
	"status" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"format" text NOT NULL,
	"provider_egress_id" text,
	"provider_track_sid" text NOT NULL,
	"duration_ms" integer,
	"size_bytes" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_recordings_one_active_per_track_idx" ON "call_recordings" USING btree ("call_id","provider_track_sid") WHERE "call_recordings"."status" IN ('starting', 'recording');--> statement-breakpoint
CREATE INDEX "call_recordings_call_user_offset_idx" ON "call_recordings" USING btree ("call_id","user_id","call_offset_ms");