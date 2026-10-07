CREATE TABLE "student_subject_scores" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"ar" integer NOT NULL,
	"pc" integer NOT NULL,
	"wk" integer NOT NULL,
	"mk" integer NOT NULL,
	"is_fixture" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_subject_scores_fixture_only" CHECK ("student_subject_scores"."is_fixture" = true),
	CONSTRAINT "student_subject_scores_ar_range" CHECK ("student_subject_scores"."ar" BETWEEN 0 AND 100),
	CONSTRAINT "student_subject_scores_pc_range" CHECK ("student_subject_scores"."pc" BETWEEN 0 AND 100),
	CONSTRAINT "student_subject_scores_wk_range" CHECK ("student_subject_scores"."wk" BETWEEN 0 AND 100),
	CONSTRAINT "student_subject_scores_mk_range" CHECK ("student_subject_scores"."mk" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "student_subject_scores" ADD CONSTRAINT "student_subject_scores_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;