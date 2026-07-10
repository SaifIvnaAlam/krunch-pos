-- Backfill optional `email` on each employee object stored in branch roster JSON.
UPDATE "BranchEmployeeDirectory"
SET "employees" = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN jsonb_typeof(elem) = 'object' THEN
          elem || jsonb_build_object('email', COALESCE(elem->>'email', ''))
        ELSE elem
      END
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements("employees") AS elem
)
WHERE jsonb_typeof("employees") = 'array'
  AND jsonb_array_length("employees") > 0;
