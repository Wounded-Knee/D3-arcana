CREATE TABLE "annotation_ratifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annotation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"stance" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_annotations" ADD COLUMN "ratification_status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "call_annotations" ADD COLUMN "ratification_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "call_annotations" ADD COLUMN "ratification_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "annotation_ratifications" ADD CONSTRAINT "annotation_ratifications_annotation_id_call_annotations_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."call_annotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_ratifications" ADD CONSTRAINT "annotation_ratifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "annotation_ratifications_annotation_user_idx" ON "annotation_ratifications" USING btree ("annotation_id","user_id");--> statement-breakpoint
CREATE INDEX "annotation_ratifications_annotation_idx" ON "annotation_ratifications" USING btree ("annotation_id");