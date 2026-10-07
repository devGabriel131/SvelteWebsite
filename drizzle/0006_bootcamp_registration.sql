CREATE TABLE "bootcamp_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"linked_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bootcamp_accounts_student_id_unique" UNIQUE("student_id")
);
--> statement-breakpoint
CREATE TABLE "bootcamp_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"language" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"pdf" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"backup_status" text DEFAULT 'pending' NOT NULL,
	"drive_file_id" text,
	"backup_attempts" integer DEFAULT 0 NOT NULL,
	"backup_lease_until" timestamp with time zone,
	"backup_error" text,
	"backed_up_at" timestamp with time zone,
	CONSTRAINT "bootcamp_documents_drive_file_id_unique" UNIQUE("drive_file_id"),
	CONSTRAINT "bootcamp_document_kind" CHECK ("bootcamp_documents"."kind" IN ('waiver', 'letter')),
	CONSTRAINT "bootcamp_document_language" CHECK ("bootcamp_documents"."language" IN ('en', 'es')),
	CONSTRAINT "bootcamp_document_bytes" CHECK (octet_length("bootcamp_documents"."pdf") BETWEEN 1 AND 10485760),
	CONSTRAINT "bootcamp_document_backup_status" CHECK ("bootcamp_documents"."backup_status" IN ('pending', 'uploading', 'saved', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "bootcamp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"venue" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"arrival_at" timestamp with time zone NOT NULL,
	"registration_closes_at" timestamp with time zone NOT NULL,
	"legal" jsonb NOT NULL,
	"legal_approved" boolean DEFAULT false NOT NULL,
	"approved_by" text,
	"registration_open" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bootcamp_event_dates" CHECK ("bootcamp_events"."ends_at" > "bootcamp_events"."starts_at" AND "bootcamp_events"."arrival_at" <= "bootcamp_events"."starts_at" AND "bootcamp_events"."registration_closes_at" <= "bootcamp_events"."starts_at"),
	CONSTRAINT "bootcamp_event_approval" CHECK (NOT "bootcamp_events"."registration_open" OR ("bootcamp_events"."legal_approved" AND "bootcamp_events"."approved_by" IS NOT NULL)),
	CONSTRAINT "bootcamp_event_revision" CHECK ("bootcamp_events"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "bootcamp_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'creating' NOT NULL,
	"reference" text,
	"authorization_token" text,
	"transaction_id" text,
	"authorization_started" boolean DEFAULT false NOT NULL,
	"reconcile_requested" boolean DEFAULT true NOT NULL,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bootcamp_payments_reference_unique" UNIQUE("reference"),
	CONSTRAINT "bootcamp_payments_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "bootcamp_payment_amount" CHECK ("bootcamp_payments"."amount_cents" IN (1500, 3000)),
	CONSTRAINT "bootcamp_payment_status" CHECK ("bootcamp_payments"."status" IN ('creating', 'pending', 'uncertain', 'completed', 'cancelled', 'refunded')),
	CONSTRAINT "bootcamp_payment_receipt" CHECK ("bootcamp_payments"."status" NOT IN ('completed', 'refunded') OR "bootcamp_payments"."transaction_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "bootcamp_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"waiver" jsonb,
	"letter_choice" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bootcamp_accounts" ADD CONSTRAINT "bootcamp_accounts_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_accounts" ADD CONSTRAINT "bootcamp_accounts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_accounts" ADD CONSTRAINT "bootcamp_accounts_linked_by_auth_user_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_documents" ADD CONSTRAINT "bootcamp_documents_registration_id_bootcamp_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."bootcamp_registrations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_events" ADD CONSTRAINT "bootcamp_events_approved_by_auth_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_events" ADD CONSTRAINT "bootcamp_events_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_payments" ADD CONSTRAINT "bootcamp_payments_registration_id_bootcamp_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."bootcamp_registrations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_registrations" ADD CONSTRAINT "bootcamp_registrations_event_id_bootcamp_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."bootcamp_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_registrations" ADD CONSTRAINT "bootcamp_registrations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bootcamp_document_registration_kind" ON "bootcamp_documents" USING btree ("registration_id","kind");--> statement-breakpoint
CREATE INDEX "bootcamp_document_backup_queue" ON "bootcamp_documents" USING btree ("backup_status","backup_lease_until");--> statement-breakpoint
CREATE UNIQUE INDEX "bootcamp_payment_active_registration" ON "bootcamp_payments" USING btree ("registration_id") WHERE "bootcamp_payments"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "bootcamp_payment_reconciliation_queue" ON "bootcamp_payments" USING btree ("next_check_at","lease_until");--> statement-breakpoint
CREATE UNIQUE INDEX "bootcamp_registration_student_event" ON "bootcamp_registrations" USING btree ("event_id","student_id");
--> statement-breakpoint
-- Keep completed evidence immutable while allowing backup bookkeeping to advance.
CREATE FUNCTION bootcamp_protect_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW.registration_id, NEW.kind, NEW.language, NEW.snapshot, NEW.pdf, NEW.sha256, NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id, OLD.registration_id, OLD.kind, OLD.language, OLD.snapshot, OLD.pdf, OLD.sha256, OLD.created_at) THEN
    RAISE EXCEPTION 'Completed bootcamp documents are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bootcamp_document_immutable BEFORE UPDATE ON bootcamp_documents
FOR EACH ROW EXECUTE FUNCTION bootcamp_protect_document();
--> statement-breakpoint
CREATE FUNCTION bootcamp_protect_registration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW.event_id, NEW.student_id) IS DISTINCT FROM ROW(OLD.id, OLD.event_id, OLD.student_id)
     OR (OLD.waiver IS NOT NULL AND NEW.waiver IS DISTINCT FROM OLD.waiver)
     OR (OLD.letter_choice IS NOT NULL AND NEW.letter_choice IS DISTINCT FROM OLD.letter_choice) THEN
    RAISE EXCEPTION 'Bootcamp registration evidence and associations are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bootcamp_registration_immutable BEFORE UPDATE ON bootcamp_registrations
FOR EACH ROW EXECUTE FUNCTION bootcamp_protect_registration();
--> statement-breakpoint
CREATE FUNCTION bootcamp_protect_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW.registration_id, NEW.amount_cents) IS DISTINCT FROM ROW(OLD.id, OLD.registration_id, OLD.amount_cents)
     OR (OLD.reference IS NOT NULL AND NEW.reference IS DISTINCT FROM OLD.reference)
     OR (OLD.transaction_id IS NOT NULL AND NEW.transaction_id IS DISTINCT FROM OLD.transaction_id)
     OR (OLD.authorization_started AND NOT NEW.authorization_started) THEN
    RAISE EXCEPTION 'Bootcamp payment associations and receipts are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bootcamp_payment_immutable BEFORE UPDATE ON bootcamp_payments
FOR EACH ROW EXECUTE FUNCTION bootcamp_protect_payment();