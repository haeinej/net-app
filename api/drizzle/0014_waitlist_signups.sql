CREATE TABLE IF NOT EXISTS "waitlist_signups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "source" text DEFAULT 'website' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_signups_email_unique"
ON "waitlist_signups" ("email");
