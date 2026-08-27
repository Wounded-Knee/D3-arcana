import { sql } from "drizzle-orm";
import {
    customType,
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    primaryKey,
    uniqueIndex,
    uuid,
  } from "drizzle-orm/pg-core";

  const bytea = customType<{ data: Buffer; driverData: Buffer }>({
    dataType() {
      return "bytea";
    },
  });
  
  export const eventConsumptions = pgTable(
    "event_consumptions",
    {
      consumer: text("consumer").notNull(),
  
      eventId: uuid("event_id").notNull(),
  
      processedAt: timestamp("processed_at", {
        withTimezone: true,
      }).defaultNow().notNull(),
    },
    (table) => [
      primaryKey({
        columns: [table.consumer, table.eventId],
      }),
    ],
  );
  
  export const outboxEvents = pgTable("outbox_events", {
    id: uuid("id").defaultRandom().primaryKey(),
  
    type: text("type").notNull(),
  
    aggregateType: text("aggregate_type").notNull(),
  
    aggregateId: uuid("aggregate_id").notNull(),
  
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, {
        onDelete: "cascade",
      }),
  
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
  
    payload: jsonb("payload").notNull(),
    
    claimedAt: timestamp("claimed_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  
    publishedAt: timestamp("published_at", {
      withTimezone: true,
    }),
  });

  export const users = pgTable("users", {
    id: uuid("id").defaultRandom().primaryKey(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  });

  export const userPreferences = pgTable("user_preferences", {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, {
        onDelete: "cascade",
      }),
    timelineOrientation: text("timeline_orientation").notNull().default("horizontal"),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  });
  
  export const conversations = pgTable("conversations", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  });
  
  export const conversationMembers = pgTable(
    "conversation_members",
    {
      conversationId: uuid("conversation_id")
        .notNull()
        .references(() => conversations.id, {
          onDelete: "cascade",
        }),
  
      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, {
          onDelete: "cascade",
        }),
  
      joinedAt: timestamp("joined_at", {
        withTimezone: true,
      }).defaultNow().notNull(),
    },
    (table) => [
      primaryKey({
        columns: [table.conversationId, table.userId],
      }),
    ],
  );
  
  export const messages = pgTable("messages", {
    id: uuid("id").defaultRandom().primaryKey(),
  
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, {
        onDelete: "cascade",
      }),
  
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
  
    content: text("content").notNull(),
  
    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  
    editedAt: timestamp("edited_at", {
      withTimezone: true,
    }),
  
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
    }),
  });

  export const calls = pgTable(
    "calls",
    {
      id: uuid("id").defaultRandom().primaryKey(),

      conversationId: uuid("conversation_id")
        .notNull()
        .references(() => conversations.id, {
          onDelete: "cascade",
        }),

      startedBy: uuid("started_by")
        .notNull()
        .references(() => users.id),

      status: text("status").notNull(),

      mediaMode: text("media_mode").notNull(),

      startedAt: timestamp("started_at", {
        withTimezone: true,
      }).defaultNow().notNull(),

      endedAt: timestamp("ended_at", {
        withTimezone: true,
      }),
    },
    (table) => [
      uniqueIndex("calls_one_active_per_conversation_idx")
        .on(table.conversationId)
        .where(sql`${table.status} = 'active'`),
    ],
  );

  export const callParticipants = pgTable(
    "call_participants",
    {
      callId: uuid("call_id")
        .notNull()
        .references(() => calls.id, {
          onDelete: "cascade",
        }),

      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, {
          onDelete: "cascade",
        }),

      role: text("role").notNull(),

      joinedAt: timestamp("joined_at", {
        withTimezone: true,
      }).defaultNow().notNull(),

      leftAt: timestamp("left_at", {
        withTimezone: true,
      }),
    },
    (table) => [
      primaryKey({
        columns: [table.callId, table.userId],
      }),
    ],
  );

  export const callParticipantSessions = pgTable(
    "call_participant_sessions",
    {
      id: uuid("id").defaultRandom().primaryKey(),

      callId: uuid("call_id")
        .notNull()
        .references(() => calls.id, {
          onDelete: "cascade",
        }),

      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, {
          onDelete: "cascade",
        }),

      joinedAt: timestamp("joined_at", {
        withTimezone: true,
      }).defaultNow().notNull(),

      leftAt: timestamp("left_at", {
        withTimezone: true,
      }),
    },
    (table) => [
      index("call_participant_sessions_call_user_joined_idx").on(
        table.callId,
        table.userId,
        table.joinedAt,
      ),
    ],
  );

  export const callWaveformChunks = pgTable(
    "call_waveform_chunks",
    {
      callId: uuid("call_id")
        .notNull()
        .references(() => calls.id, {
          onDelete: "cascade",
        }),

      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, {
          onDelete: "cascade",
        }),

      startOffsetMs: integer("start_offset_ms").notNull(),

      sampleRateHz: integer("sample_rate_hz").notNull(),

      amplitudes: bytea("amplitudes").notNull(),
    },
    (table) => [
      primaryKey({
        columns: [table.callId, table.userId, table.startOffsetMs],
      }),
    ],
  );

  export const callRecordings = pgTable(
    "call_recordings",
    {
      id: uuid("id").defaultRandom().primaryKey(),

      callId: uuid("call_id")
        .notNull()
        .references(() => calls.id, {
          onDelete: "cascade",
        }),

      conversationId: uuid("conversation_id")
        .notNull()
        .references(() => conversations.id, {
          onDelete: "cascade",
        }),

      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, {
          onDelete: "cascade",
        }),

      callOffsetMs: integer("call_offset_ms").notNull(),

      status: text("status").notNull(),

      objectKey: text("object_key").notNull(),

      contentType: text("content_type").notNull(),

      format: text("format").notNull(),

      providerEgressId: text("provider_egress_id"),

      providerTrackSid: text("provider_track_sid").notNull(),

      durationMs: integer("duration_ms"),

      sizeBytes: integer("size_bytes"),

      startedAt: timestamp("started_at", {
        withTimezone: true,
      }).defaultNow().notNull(),

      endedAt: timestamp("ended_at", {
        withTimezone: true,
      }),

      error: text("error"),
    },
    (table) => [
      uniqueIndex("call_recordings_one_active_per_track_idx")
        .on(table.callId, table.providerTrackSid)
        .where(sql`${table.status} IN ('starting', 'recording')`),
      index("call_recordings_call_user_offset_idx").on(
        table.callId,
        table.userId,
        table.callOffsetMs,
      ),
    ],
  );

  export const callRecordingFragments = pgTable(
    "call_recording_fragments",
    {
      id: uuid("id").defaultRandom().primaryKey(),

      recordingId: uuid("recording_id")
        .notNull()
        .references(() => callRecordings.id, {
          onDelete: "cascade",
        }),

      callId: uuid("call_id")
        .notNull()
        .references(() => calls.id, {
          onDelete: "cascade",
        }),

      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, {
          onDelete: "cascade",
        }),

      callOffsetMs: integer("call_offset_ms").notNull(),

      durationMs: integer("duration_ms").notNull(),

      objectKey: text("object_key").notNull(),

      sizeBytes: integer("size_bytes").notNull(),
    },
    (table) => [
      index("call_recording_fragments_call_offset_idx").on(
        table.callId,
        table.callOffsetMs,
      ),
      index("call_recording_fragments_recording_offset_idx").on(
        table.recordingId,
        table.callOffsetMs,
      ),
    ],
  );

  export const annotationProfiles = pgTable("annotation_profiles", {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    icon: text("icon").notNull(),
    sortOrder: integer("sort_order").notNull(),
  }, (table) => [
    uniqueIndex("annotation_profiles_key_idx").on(table.key),
  ]);

  export const callSelections = pgTable(
    "call_selections",
    {
      id: uuid("id").defaultRandom().primaryKey(),

      callId: uuid("call_id")
        .notNull()
        .references(() => calls.id, {
          onDelete: "cascade",
        }),

      conversationId: uuid("conversation_id")
        .notNull()
        .references(() => conversations.id, {
          onDelete: "cascade",
        }),

      createdBy: uuid("created_by")
        .notNull()
        .references(() => users.id),

      startOffsetMs: integer("start_offset_ms").notNull(),

      endOffsetMs: integer("end_offset_ms").notNull(),

      userId: uuid("user_id").references(() => users.id),

      createdAt: timestamp("created_at", {
        withTimezone: true,
      }).defaultNow().notNull(),

      updatedAt: timestamp("updated_at", {
        withTimezone: true,
      }).defaultNow().notNull(),
    },
    (table) => [
      index("call_selections_call_offset_idx").on(
        table.callId,
        table.startOffsetMs,
      ),
    ],
  );

  export const callAnnotations = pgTable(
    "call_annotations",
    {
      id: uuid("id").defaultRandom().primaryKey(),

      callId: uuid("call_id")
        .notNull()
        .references(() => calls.id, {
          onDelete: "cascade",
        }),

      conversationId: uuid("conversation_id")
        .notNull()
        .references(() => conversations.id, {
          onDelete: "cascade",
        }),

      createdBy: uuid("created_by")
        .notNull()
        .references(() => users.id),

      profileId: uuid("profile_id")
        .notNull()
        .references(() => annotationProfiles.id),

      note: text("note"),

      startOffsetMs: integer("start_offset_ms").notNull(),

      endOffsetMs: integer("end_offset_ms").notNull(),

      userId: uuid("user_id").references(() => users.id),

      selectionId: uuid("selection_id").references(() => callSelections.id, {
        onDelete: "set null",
      }),

      createdAt: timestamp("created_at", {
        withTimezone: true,
      }).defaultNow().notNull(),

      updatedAt: timestamp("updated_at", {
        withTimezone: true,
      }).defaultNow().notNull(),

      ratificationStatus: text("ratification_status")
        .notNull()
        .default("open"),

      ratificationDecidedAt: timestamp("ratification_decided_at", {
        withTimezone: true,
      }),

      ratificationSnapshot: jsonb("ratification_snapshot").$type<{
        modelKey: string;
        for: number;
        against: number;
        totalUserCount: number;
      }>(),
    },
    (table) => [
      uniqueIndex("call_annotations_selection_id_idx").on(table.selectionId),
      index("call_annotations_call_offset_idx").on(
        table.callId,
        table.startOffsetMs,
      ),
    ],
  );

  export const annotationRatifications = pgTable(
    "annotation_ratifications",
    {
      id: uuid("id").defaultRandom().primaryKey(),

      annotationId: uuid("annotation_id")
        .notNull()
        .references(() => callAnnotations.id, {
          onDelete: "cascade",
        }),

      userId: uuid("user_id")
        .notNull()
        .references(() => users.id),

      stance: text("stance").notNull(),

      createdAt: timestamp("created_at", {
        withTimezone: true,
      }).defaultNow().notNull(),

      updatedAt: timestamp("updated_at", {
        withTimezone: true,
      }).defaultNow().notNull(),
    },
    (table) => [
      uniqueIndex("annotation_ratifications_annotation_user_idx").on(
        table.annotationId,
        table.userId,
      ),
      index("annotation_ratifications_annotation_idx").on(table.annotationId),
    ],
  );