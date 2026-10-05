CREATE TABLE "game_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"game_type" text NOT NULL,
	"rules_version" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_attempts_id_game_type_unique" UNIQUE("id","game_type"),
	CONSTRAINT "game_attempts_game_type_valid" CHECK ("game_attempts"."game_type" IN ('speed_math', 'frequency')),
	CONSTRAINT "game_attempts_rules_version_nonblank" CHECK ("game_attempts"."rules_version" ~ '[^[:space:]]'),
	CONSTRAINT "game_attempts_started_at_finite" CHECK (isfinite("game_attempts"."started_at")),
	CONSTRAINT "game_attempts_ended_at_valid" CHECK ("game_attempts"."ended_at" IS NULL OR (isfinite("game_attempts"."ended_at") AND "game_attempts"."ended_at" >= "game_attempts"."started_at"))
);
--> statement-breakpoint
CREATE TABLE "speed_math_results" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"game_type" text DEFAULT 'speed_math' NOT NULL,
	"operation" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"correct_count" integer NOT NULL,
	"incorrect_count" integer NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "speed_math_results_game_type_valid" CHECK ("speed_math_results"."game_type" = 'speed_math'),
	CONSTRAINT "speed_math_results_operation_valid" CHECK ("speed_math_results"."operation" IN ('addition', 'subtraction', 'multiplication', 'division')),
	CONSTRAINT "speed_math_results_duration_valid" CHECK ("speed_math_results"."duration_minutes" IN (5, 10, 15)),
	CONSTRAINT "speed_math_results_counts_nonnegative" CHECK ("speed_math_results"."correct_count" >= 0 AND "speed_math_results"."incorrect_count" >= 0),
	CONSTRAINT "speed_math_results_verified_at_finite" CHECK ("speed_math_results"."verified_at" IS NULL OR isfinite("speed_math_results"."verified_at"))
);
--> statement-breakpoint
CREATE TABLE "vocabulary_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_pool_items" (
	"pool_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "vocabulary_pool_items_pool_id_item_id_pk" PRIMARY KEY("pool_id","item_id"),
	CONSTRAINT "vocabulary_pool_items_pool_rank_unique" UNIQUE("pool_id","rank"),
	CONSTRAINT "vocabulary_pool_items_rank_positive" CHECK ("vocabulary_pool_items"."rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "vocabulary_pools" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_pools_id_nonblank" CHECK ("vocabulary_pools"."id" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "vocabulary_responses" (
	"attempt_id" uuid NOT NULL,
	"card_position" integer NOT NULL,
	"pool_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_responses_attempt_id_card_position_pk" PRIMARY KEY("attempt_id","card_position"),
	CONSTRAINT "vocabulary_responses_card_position_valid" CHECK ("vocabulary_responses"."card_position" BETWEEN 1 AND 25),
	CONSTRAINT "vocabulary_responses_outcome_valid" CHECK ("vocabulary_responses"."outcome" IN ('correct', 'incorrect', 'skipped')),
	CONSTRAINT "vocabulary_responses_answered_at_finite" CHECK (isfinite("vocabulary_responses"."answered_at"))
);
--> statement-breakpoint
CREATE TABLE "vocabulary_rounds" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"game_type" text DEFAULT 'frequency' NOT NULL,
	"pool_id" text NOT NULL,
	CONSTRAINT "vocabulary_rounds_attempt_pool_unique" UNIQUE("attempt_id","pool_id"),
	CONSTRAINT "vocabulary_rounds_game_type_valid" CHECK ("vocabulary_rounds"."game_type" = 'frequency')
);
--> statement-breakpoint
ALTER TABLE "game_attempts" ADD CONSTRAINT "game_attempts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "speed_math_results" ADD CONSTRAINT "speed_math_results_attempt_game_fk" FOREIGN KEY ("attempt_id","game_type") REFERENCES "public"."game_attempts"("id","game_type") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vocabulary_pool_items" ADD CONSTRAINT "vocabulary_pool_items_pool_id_vocabulary_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."vocabulary_pools"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vocabulary_pool_items" ADD CONSTRAINT "vocabulary_pool_items_item_id_vocabulary_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."vocabulary_items"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vocabulary_responses" ADD CONSTRAINT "vocabulary_responses_round_pool_fk" FOREIGN KEY ("attempt_id","pool_id") REFERENCES "public"."vocabulary_rounds"("attempt_id","pool_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vocabulary_responses" ADD CONSTRAINT "vocabulary_responses_pool_item_fk" FOREIGN KEY ("pool_id","item_id") REFERENCES "public"."vocabulary_pool_items"("pool_id","item_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vocabulary_rounds" ADD CONSTRAINT "vocabulary_rounds_pool_id_vocabulary_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."vocabulary_pools"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vocabulary_rounds" ADD CONSTRAINT "vocabulary_rounds_attempt_game_fk" FOREIGN KEY ("attempt_id","game_type") REFERENCES "public"."game_attempts"("id","game_type") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "game_attempts_student_history_idx" ON "game_attempts" USING btree ("student_id","started_at");
--> statement-breakpoint
CREATE INDEX "vocabulary_pool_items_item_idx" ON "vocabulary_pool_items" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX "vocabulary_responses_pool_item_idx" ON "vocabulary_responses" USING btree ("pool_id","item_id");
--> statement-breakpoint
CREATE INDEX "vocabulary_rounds_pool_idx" ON "vocabulary_rounds" USING btree ("pool_id");
--> statement-breakpoint
CREATE VIEW "public"."student_word_progress" AS (
	SELECT attempt.student_id, response.item_id,
		count(*) FILTER (WHERE response.outcome = 'correct') AS correct_count,
		count(*) FILTER (WHERE response.outcome = 'incorrect') AS incorrect_count,
		count(*) FILTER (WHERE response.outcome = 'skipped') AS skipped_count,
		max(response.answered_at) AS last_practiced_at,
		(array_agg(response.outcome ORDER BY response.answered_at DESC,
			response.attempt_id DESC, response.card_position DESC))[1] AS last_outcome
	FROM public.vocabulary_responses AS response
	JOIN public.game_attempts AS attempt ON attempt.id = response.attempt_id
	GROUP BY attempt.student_id, response.item_id
);
--> statement-breakpoint
CREATE VIEW "public"."vocabulary_round_progress" AS (
	SELECT round.attempt_id, attempt.student_id, round.pool_id,
		count(response.attempt_id) AS response_count,
		count(*) FILTER (WHERE response.outcome = 'correct') AS correct_count,
		count(*) FILTER (WHERE response.outcome = 'incorrect') AS incorrect_count,
		count(*) FILTER (WHERE response.outcome = 'skipped') AS skipped_count,
		count(response.attempt_id) = 25 AS is_complete
	FROM public.vocabulary_rounds AS round
	JOIN public.game_attempts AS attempt ON attempt.id = round.attempt_id
	LEFT JOIN public.vocabulary_responses AS response ON response.attempt_id = round.attempt_id
	GROUP BY round.attempt_id, attempt.student_id, round.pool_id
);
--> statement-breakpoint
CREATE VIEW "public"."student_vocabulary_completeness" AS (
	WITH item_counts AS (
		SELECT student.id AS student_id, pool.id AS pool_id, membership.item_id,
			coalesce(progress.correct_count, 0::bigint) AS correct_count,
			coalesce(progress.incorrect_count, 0::bigint) AS incorrect_count,
			coalesce(progress.skipped_count, 0::bigint) AS skipped_count,
			min(coalesce(progress.correct_count, 0::bigint)) OVER (
				PARTITION BY student.id, pool.id
			) AS minimum_correct_count
		FROM public.students AS student
		CROSS JOIN public.vocabulary_pools AS pool
		LEFT JOIN public.vocabulary_pool_items AS membership ON membership.pool_id = pool.id
		LEFT JOIN public.student_word_progress AS progress
			ON progress.student_id = student.id AND progress.item_id = membership.item_id
	)
	SELECT student_id, pool_id, count(item_id) AS total_items,
		count(*) FILTER (WHERE correct_count + incorrect_count + skipped_count > 0) AS practiced_items,
		count(*) FILTER (WHERE correct_count > 0) AS successful_items,
		minimum_correct_count AS full_passes_completed,
		minimum_correct_count + 1 AS current_pass,
		count(*) FILTER (WHERE correct_count > minimum_correct_count) AS current_pass_completed_items
	FROM item_counts
	GROUP BY student_id, pool_id, minimum_correct_count
);
--> statement-breakpoint
CREATE VIEW "public"."speed_math_verified_bests" AS (
	WITH eligible AS (
		SELECT attempt.student_id, result.operation, result.duration_minutes, attempt.rules_version,
			attempt.id AS attempt_id, result.correct_count, result.incorrect_count,
			attempt.started_at, attempt.ended_at, result.verified_at,
			row_number() OVER (
				PARTITION BY attempt.student_id, result.operation, result.duration_minutes, attempt.rules_version
				ORDER BY result.correct_count DESC, result.incorrect_count ASC,
					attempt.ended_at ASC, attempt.id ASC
			) AS best_order
		FROM public.speed_math_results AS result
		JOIN public.game_attempts AS attempt ON attempt.id = result.attempt_id
		WHERE attempt.ended_at = attempt.started_at + make_interval(mins => result.duration_minutes)
			AND result.verified_at IS NOT NULL AND result.verified_at >= attempt.ended_at
	)
	SELECT student_id, operation, duration_minutes, rules_version, attempt_id,
		correct_count, incorrect_count, started_at, ended_at, verified_at
	FROM eligible WHERE best_order = 1
);
--> statement-breakpoint
CREATE VIEW "public"."speed_math_leaderboard_entries" AS (
	SELECT best.*,
		rank() OVER (
			PARTITION BY operation, duration_minutes, rules_version
			ORDER BY correct_count DESC, incorrect_count ASC
		) AS rank
	FROM public.speed_math_verified_bests AS best
);
