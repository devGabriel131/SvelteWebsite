-- The migrator applies this migration transactionally. Lock before inspecting legacy rows.
LOCK TABLE "bootcamp_events" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
UPDATE "bootcamp_events" SET "registration_open" = false, "updated_at" = now()
WHERE "registration_open" AND "registration_closes_at" <= now();
--> statement-breakpoint
DO $$ BEGIN
	IF (SELECT count(*) FROM "bootcamp_events" WHERE "registration_open") > 1 THEN
		RAISE EXCEPTION 'Multiple bootcamp events have registration open. Close all but one and rerun migrations.';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "bootcamp_events" DROP CONSTRAINT "bootcamp_event_approval";--> statement-breakpoint
ALTER TABLE "bootcamp_events" DROP CONSTRAINT "bootcamp_events_approved_by_auth_user_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "bootcamp_event_single_open" ON "bootcamp_events" USING btree ("registration_open") WHERE "bootcamp_events"."registration_open";--> statement-breakpoint
ALTER TABLE "bootcamp_events" DROP COLUMN "legal_approved";--> statement-breakpoint
ALTER TABLE "bootcamp_events" DROP COLUMN "approved_by";