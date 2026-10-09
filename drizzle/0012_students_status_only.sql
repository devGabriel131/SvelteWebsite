LOCK TABLE students IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM students WHERE is_active IS DISTINCT FROM (status = 'active')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Inconsistent student lifecycle state. Resolve rows before rerunning migrations.';
  END IF;
END;
$$;
--> statement-breakpoint
DROP TRIGGER students_sync_status ON students;
--> statement-breakpoint
DROP FUNCTION sync_student_status();
--> statement-breakpoint
ALTER TABLE students DROP CONSTRAINT students_status_active_consistent;
--> statement-breakpoint
ALTER TABLE students DROP COLUMN is_active;
