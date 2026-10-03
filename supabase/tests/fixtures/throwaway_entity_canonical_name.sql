-- Throwaway tables for the canonical-name-per-company matrix.
-- NEVER run against a Supabase project.
--
-- The unique indexes below are the expected pg_get_indexdef text guarded by
-- 20261003140000. That text is not in supabase/migrations. On Postgres 17 it is:
--   CREATE UNIQUE INDEX entity_registry_canonical_name_key
--     ON public.entity_registry USING btree (canonical_name)
--   CREATE UNIQUE INDEX entities_canonical_name_key
--     ON public.entities USING btree (canonical_name)
-- No expression, no collation clause, no partial predicate.
-- If live differs, the migration refuses; this fixture only exercises that guard.

CREATE TABLE public.entity_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  entity_type text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX entity_registry_canonical_name_key
  ON public.entity_registry USING btree (canonical_name);

CREATE TABLE public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL
);

CREATE UNIQUE INDEX entities_canonical_name_key
  ON public.entities USING btree (canonical_name);

INSERT INTO public.entity_registry (canonical_name, entity_type) VALUES
  ('Villa Mazotos', 'partnership_property'),
  ('JJ Office', 'jj_internal');

INSERT INTO public.entities (canonical_name) VALUES
  ('Villa Mazotos'),
  ('Avi');
