CREATE TABLE "student_invitations" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"recipient_email" text NOT NULL,
	"language" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"delivery_state" text DEFAULT 'pending' NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "student_invitations_token_hash_valid" CHECK ("student_invitations"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "student_invitations_language_valid" CHECK ("student_invitations"."language" IN ('en', 'es')),
	CONSTRAINT "student_invitations_delivery_state_valid" CHECK ("student_invitations"."delivery_state" IN ('pending', 'sending', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "auth_user_id" text;--> statement-breakpoint
ALTER TABLE "student_invitations" ADD CONSTRAINT "student_invitations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_invitations" ADD CONSTRAINT "student_invitations_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_invitations_created_at_idx" ON "student_invitations" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_auth_user_id_auth_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_auth_user_id_unique" UNIQUE("auth_user_id");