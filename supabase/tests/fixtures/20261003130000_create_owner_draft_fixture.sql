-- Throwaway-only fixture for 20261003130000 (create_owner_draft company).
-- Load AFTER:
--   1. supabase/tests/fixtures/throwaway_company_base.sql
--   2. supabase/tests/fixtures/throwaway_slice_a_preconditions.sql
--   3. supabase/migrations/20260930220000_client_entity_company_isolation.sql
--      (the real Slice A file, unmodified)
-- NEVER run against a Supabase project.
--
-- This file does not recreate Slice A. It records that Slice A has been
-- applied (schema_migrations version 20260930220000), then adds the property
-- and association tables create_owner_draft needs, and installs the live
-- function body (md5(prosrc) 6539a074de7e8bf4c85045c6f115f575).
-- lifecycle.entity_identity already has operating_company_id from Slice A.

CREATE TABLE public.property_definitions (
  property_name text PRIMARY KEY,
  property_id uuid NOT NULL,
  operating_company_id uuid NOT NULL REFERENCES registry.companies (company_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX property_definitions_property_id_unique ON public.property_definitions USING btree (property_id);

CREATE TABLE lifecycle.jj_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  relationship_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text,
  effective_from date,
  effective_to date,
  verification_status text NOT NULL DEFAULT 'unknown'::text,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jj_relationships_entity_fk FOREIGN KEY (entity_id) REFERENCES lifecycle.entity_identity(id),
  CONSTRAINT jj_relationships_date_order_check CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to >= effective_from))),
  CONSTRAINT jj_relationships_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'closed'::text]))),
  CONSTRAINT jj_relationships_type_check CHECK ((relationship_type = ANY (ARRAY['managed_client'::text, 'investor'::text, 'deal_partner'::text, 'internal_partner'::text, 'private_client'::text]))),
  CONSTRAINT jj_relationships_verification_check CHECK ((verification_status = ANY (ARRAY['verified'::text, 'pending_verification'::text, 'unknown'::text])))
);

CREATE TABLE lifecycle.entity_property_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  property_id uuid NOT NULL,
  association_source text NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text,
  effective_from date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT epa_entity_fk FOREIGN KEY (entity_id) REFERENCES lifecycle.entity_identity(id),
  CONSTRAINT epa_property_fk FOREIGN KEY (property_id) REFERENCES public.property_definitions(property_id),
  CONSTRAINT epa_source_check CHECK ((association_source = ANY (ARRAY['wizard'::text, 'ownership'::text, 'service_engagement'::text, 'deal_participation'::text, 'management_relationship'::text]))),
  CONSTRAINT epa_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'inactive'::text])))
);

REVOKE ALL ON TABLE public.property_definitions, lifecycle.jj_relationships, lifecycle.entity_property_associations FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.property_definitions (property_name, property_id, operating_company_id) VALUES
  ('Throwaway A1', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000000a'),
  ('Throwaway A2', '00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-00000000000a');

-- create_owner_draft exactly as live on Production today.
CREATE OR REPLACE FUNCTION lifecycle.create_owner_draft(p_canonical_name text, p_entity_type text DEFAULT 'external'::text, p_contact_email text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_preferred_language text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_entity_legal_name text DEFAULT NULL::text, p_internal_notes text DEFAULT NULL::text, p_relationship_type text DEFAULT 'managed_client'::text, p_effective_from date DEFAULT NULL::date, p_relationship_notes text DEFAULT NULL::text, p_property_ids uuid[] DEFAULT '{}'::uuid[], p_created_by text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lifecycle', 'public'
AS $function$
DECLARE
  v_entity_id UUID;
  v_prop_id   UUID;
BEGIN
  INSERT INTO lifecycle.entity_identity (
    canonical_name, entity_type, aliases, status,
    contact_email, contact_phone, preferred_language,
    country, entity_legal_name, internal_notes
  ) VALUES (
    p_canonical_name, p_entity_type, '{}', 'active',
    p_contact_email, p_contact_phone, p_preferred_language,
    p_country, p_entity_legal_name, p_internal_notes
  )
  RETURNING id INTO v_entity_id;

  INSERT INTO lifecycle.jj_relationships (
    entity_id, relationship_type, status, effective_from,
    verification_status, notes, created_by
  ) VALUES (
    v_entity_id, p_relationship_type, 'draft', p_effective_from,
    'unknown', p_relationship_notes, p_created_by
  );

  IF array_length(p_property_ids, 1) IS NOT NULL THEN
    FOREACH v_prop_id IN ARRAY p_property_ids
    LOOP
      INSERT INTO lifecycle.entity_property_associations (
        entity_id, property_id, association_source,
        status, effective_from, notes
      ) VALUES (
        v_entity_id, v_prop_id, 'wizard',
        'draft', p_effective_from, NULL
      );
    END LOOP;
  END IF;

  RETURN v_entity_id;
END;
$function$;
REVOKE ALL ON FUNCTION lifecycle.create_owner_draft(text, text, text, text, text, text, text, text, text, date, text, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lifecycle.create_owner_draft(text, text, text, text, text, text, text, text, text, date, text, uuid[], text) TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260930220000', 'client_entity_company_isolation');
