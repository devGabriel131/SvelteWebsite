LOCK TABLE students, bootcamp_accounts IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bootcamp_accounts b JOIN students s ON s.id = b.student_id
    WHERE s.auth_user_id IS NOT NULL AND s.auth_user_id <> b.user_id
  ) OR EXISTS (
    SELECT 1 FROM students s JOIN bootcamp_accounts b ON b.user_id = s.auth_user_id
    WHERE s.id <> b.student_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Conflicting student account links. Resolve associations before rerunning migrations.';
  END IF;
END;
$$;
--> statement-breakpoint
ALTER TABLE bootcamp_accounts RENAME TO student_accounts;
--> statement-breakpoint
ALTER TABLE student_accounts RENAME CONSTRAINT bootcamp_accounts_pkey TO student_accounts_pkey;
--> statement-breakpoint
ALTER TABLE student_accounts RENAME CONSTRAINT bootcamp_accounts_student_id_unique TO student_accounts_student_id_unique;
--> statement-breakpoint
ALTER TABLE student_accounts RENAME CONSTRAINT bootcamp_accounts_user_id_auth_user_id_fk TO student_accounts_user_id_auth_user_id_fk;
--> statement-breakpoint
ALTER TABLE student_accounts RENAME CONSTRAINT bootcamp_accounts_student_id_students_id_fk TO student_accounts_student_id_students_id_fk;
--> statement-breakpoint
ALTER TABLE student_accounts RENAME CONSTRAINT bootcamp_accounts_linked_by_auth_user_id_fk TO student_accounts_linked_by_auth_user_id_fk;
--> statement-breakpoint
ALTER TABLE student_accounts ALTER COLUMN linked_by DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE student_accounts ALTER COLUMN created_at DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE student_accounts ADD CONSTRAINT student_accounts_link_provenance CHECK ((linked_by IS NULL) = (created_at IS NULL));
--> statement-breakpoint
INSERT INTO student_accounts (user_id, student_id, linked_by, created_at)
SELECT s.auth_user_id, s.id, NULL, NULL
FROM students s
WHERE s.auth_user_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM student_accounts a WHERE a.user_id = s.auth_user_id AND a.student_id = s.id
);
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM students s WHERE s.auth_user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM student_accounts a WHERE a.user_id = s.auth_user_id AND a.student_id = s.id
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Conflicting student account links. Resolve associations before rerunning migrations.';
  END IF;
END;
$$;
--> statement-breakpoint
ALTER TABLE students DROP CONSTRAINT students_auth_user_id_auth_user_id_fk;
--> statement-breakpoint
ALTER TABLE students DROP CONSTRAINT students_auth_user_id_unique;
--> statement-breakpoint
ALTER TABLE students DROP COLUMN auth_user_id;
