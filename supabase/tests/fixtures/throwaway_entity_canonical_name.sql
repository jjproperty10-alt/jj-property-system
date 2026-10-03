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

-- Qualifying links for the seed rows. The migration refuses a row with no
-- such link. These objects exist only in this throwaway fixture.
-- entity_registry is linked through the documented property bridge.
-- entities is linked through a lifecycle foreign key. Live
-- lifecycle.service_engagements.entity_id points at lifecycle.entity_identity,
-- so this fixture table is not that live table.

CREATE TABLE public.property_definitions (
  property_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name text NOT NULL,
  operating_company_id uuid NOT NULL REFERENCES registry.companies (company_id)
);

INSERT INTO public.property_definitions (property_name, operating_company_id)
SELECT seed.canonical_name, company.company_id
FROM public.entity_registry AS seed
CROSS JOIN registry.companies AS company
WHERE company.status = 'active';

CREATE TABLE registry.property_external_identities (
  mapping_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  external_id text NOT NULL,
  canonical_property_id uuid,
  mapping_status text NOT NULL DEFAULT 'approved',
  CONSTRAINT property_ext_ident_unique UNIQUE (source_system, external_id)
);

INSERT INTO registry.property_external_identities (
  source_system,
  external_id,
  canonical_property_id,
  mapping_status
)
SELECT
  'app.entity_registry',
  entity_row.id::text,
  definition.property_id,
  'approved'
FROM public.entity_registry AS entity_row
JOIN public.property_definitions AS definition
  ON definition.property_name = entity_row.canonical_name;

CREATE TABLE lifecycle.entity_company_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.entities (id),
  operating_company_id uuid NOT NULL REFERENCES registry.companies (company_id)
);

INSERT INTO lifecycle.entity_company_link (entity_id, operating_company_id)
SELECT entity_row.id, company.company_id
FROM public.entities AS entity_row
CROSS JOIN registry.companies AS company
WHERE company.status = 'active';
