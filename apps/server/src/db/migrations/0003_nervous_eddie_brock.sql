CREATE TABLE "event_consumptions" (
	"consumer" text NOT NULL,
	"event_id" uuid NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_consumptions_consumer_event_id_pk" PRIMARY KEY("consumer","event_id")
);
