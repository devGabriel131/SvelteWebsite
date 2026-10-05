CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"date_of_birth" date,
	"gender" text,
	"class_type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_first_name_nonblank" CHECK ("students"."first_name" ~ '[^[:space:]]'),
	CONSTRAINT "students_last_name_nonblank" CHECK ("students"."last_name" ~ '[^[:space:]]'),
	CONSTRAINT "students_email_format" CHECK ("students"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
	CONSTRAINT "students_date_of_birth_valid" CHECK ("students"."date_of_birth" IS NULL OR (isfinite("students"."date_of_birth") AND "students"."date_of_birth" <= CURRENT_DATE)),
	CONSTRAINT "students_gender_valid" CHECK ("students"."gender" IN ('male', 'female')),
	CONSTRAINT "students_class_type_valid" CHECK ("students"."class_type" IN ('basic', 'regular'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "students_email_normalized_unique" ON "students" USING btree (lower(btrim("email")));