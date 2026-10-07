ALTER TABLE "students" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
UPDATE students SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END;
--> statement-breakpoint
CREATE FUNCTION sync_student_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Preserve NOT NULL enforcement for explicitly invalid legacy writes.
  IF NEW.is_active IS NULL OR NEW.status IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' AND NOT NEW.is_active THEN NEW.status := 'inactive'; END IF;
  ELSIF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END;
  END IF;
  NEW.is_active := NEW.status = 'active';
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER students_sync_status BEFORE INSERT OR UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION sync_student_status();
--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_status_valid" CHECK ("students"."status" IN ('active', 'inactive', 'invited'));
--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_status_active_consistent" CHECK ("students"."is_active" = ("students"."status" = 'active'));
