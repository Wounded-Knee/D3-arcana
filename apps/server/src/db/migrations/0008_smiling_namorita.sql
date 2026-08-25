CREATE TABLE "annotation_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"note" text,
	"start_offset_ms" integer NOT NULL,
	"end_offset_ms" integer NOT NULL,
	"user_id" uuid,
	"selection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"start_offset_ms" integer NOT NULL,
	"end_offset_ms" integer NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_annotations" ADD CONSTRAINT "call_annotations_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_annotations" ADD CONSTRAINT "call_annotations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_annotations" ADD CONSTRAINT "call_annotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_annotations" ADD CONSTRAINT "call_annotations_profile_id_annotation_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."annotation_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_annotations" ADD CONSTRAINT "call_annotations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_annotations" ADD CONSTRAINT "call_annotations_selection_id_call_selections_id_fk" FOREIGN KEY ("selection_id") REFERENCES "public"."call_selections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_selections" ADD CONSTRAINT "call_selections_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_selections" ADD CONSTRAINT "call_selections_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_selections" ADD CONSTRAINT "call_selections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_selections" ADD CONSTRAINT "call_selections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "annotation_profiles_key_idx" ON "annotation_profiles" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "call_annotations_selection_id_idx" ON "call_annotations" USING btree ("selection_id");--> statement-breakpoint
CREATE INDEX "call_annotations_call_offset_idx" ON "call_annotations" USING btree ("call_id","start_offset_ms");--> statement-breakpoint
CREATE INDEX "call_selections_call_offset_idx" ON "call_selections" USING btree ("call_id","start_offset_ms");--> statement-breakpoint
INSERT INTO "annotation_profiles" ("id", "key", "name", "color", "icon", "sort_order") VALUES
	('11111111-1111-4111-8111-111111111111', 'decision', 'Decision', '#f59e0b', 'gavel', 1),
	('22222222-2222-4222-8222-222222222222', 'action', 'Action', '#38bdf8', 'flag', 2),
	('33333333-3333-4333-8333-333333333333', 'question', 'Question', '#c084fc', 'help-outline', 3),
	('44444444-4444-4444-8444-444444444444', 'agreement', 'Agreement', '#4ade80', 'check-circle', 4),
	('55555555-5555-4555-8555-555555555555', 'concern', 'Concern', '#fb7185', 'warning', 5),
	('66666666-6666-4666-8666-666666666666', 'highlight', 'Highlight', '#facc15', 'star', 6);