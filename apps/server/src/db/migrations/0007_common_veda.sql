CREATE TABLE "call_recording_fragments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recording_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"call_offset_ms" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"object_key" text NOT NULL,
	"size_bytes" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_recording_fragments" ADD CONSTRAINT "call_recording_fragments_recording_id_call_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."call_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recording_fragments" ADD CONSTRAINT "call_recording_fragments_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recording_fragments" ADD CONSTRAINT "call_recording_fragments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_recording_fragments_call_offset_idx" ON "call_recording_fragments" USING btree ("call_id","call_offset_ms");--> statement-breakpoint
CREATE INDEX "call_recording_fragments_recording_offset_idx" ON "call_recording_fragments" USING btree ("recording_id","call_offset_ms");