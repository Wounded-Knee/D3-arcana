CREATE TABLE "call_participant_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "call_waveform_chunks" (
	"call_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"start_offset_ms" integer NOT NULL,
	"sample_rate_hz" integer NOT NULL,
	"amplitudes" bytea NOT NULL,
	CONSTRAINT "call_waveform_chunks_call_id_user_id_start_offset_ms_pk" PRIMARY KEY("call_id","user_id","start_offset_ms")
);
--> statement-breakpoint
ALTER TABLE "call_participant_sessions" ADD CONSTRAINT "call_participant_sessions_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_participant_sessions" ADD CONSTRAINT "call_participant_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_waveform_chunks" ADD CONSTRAINT "call_waveform_chunks_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_waveform_chunks" ADD CONSTRAINT "call_waveform_chunks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_participant_sessions_call_user_joined_idx" ON "call_participant_sessions" USING btree ("call_id","user_id","joined_at");