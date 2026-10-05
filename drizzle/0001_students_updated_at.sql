CREATE FUNCTION public.set_student_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.updated_at = clock_timestamp();
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER students_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.set_student_updated_at();
