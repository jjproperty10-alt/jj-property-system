-- Agent 3 — Canonical Property Identity Bridge (ADDITIVE, non-destructive)
-- Authorization: Yossi V1 Audit Decisions H.1 + H.4 + H.5 (2026-08-15)
-- Canonical property authority: public.property_definitions.property_id
--
-- SAFETY CONTRACT:
--   * Creates NEW registry objects only. No ALTER/DROP/UPDATE/DELETE on any existing table, view, or row.
--   * Does NOT touch transactions.property_id (Decision H.6 — legacy public.properties UUID space; left untouched).
--   * Hostaway listing identity remains owned by pms.property_mappings (Agent 1); referenced read-only, never duplicated.
--   * Idempotent: safe to re-run (IF NOT EXISTS / OR REPLACE / ON CONFLICT DO NOTHING).

------------------------------------------------------------------------------
-- 1. Bridge table
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registry.property_external_identities (
  mapping_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL DEFAULT '10f6e9b3-c5b9-4d95-a318-48f20f89477f',
  source_system         text NOT NULL,          -- app.properties | app.entity_registry | ledger.property_name
  external_entity_type  text NOT NULL,          -- property | property_name | listing
  external_id           text NOT NULL,          -- legacy uuid (as text) or raw property name
  canonical_property_id uuid REFERENCES public.property_definitions(property_id),
  canonical_name        text,
  mapping_status        text NOT NULL DEFAULT 'approved',  -- approved | proposed | conflict
  confidence            numeric NOT NULL DEFAULT 1.0,
  match_method          text,                   -- exact_name_match | approved_alias | unresolved
  audit                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_ext_ident_unique UNIQUE (source_system, external_id),
  CONSTRAINT property_ext_ident_approved_has_canonical
    CHECK (mapping_status <> 'approved' OR canonical_property_id IS NOT NULL)
);

COMMENT ON TABLE registry.property_external_identities IS
 'Agent 3 property identity bridge. Maps legacy/external property representations (public.properties.id, entity_registry.id, raw property names/aliases) to the canonical public.property_definitions.property_id. Additive; never rewrites source data. Hostaway listing identity remains owned by pms.property_mappings (Agent 1), referenced read-only, not duplicated.';

ALTER TABLE registry.property_external_identities ENABLE ROW LEVEL SECURITY;
-- deny-all: no permissive policies (mirrors registry.external_identities). Access via SECURITY DEFINER resolver / service_role only.

------------------------------------------------------------------------------
-- 2. Fail-closed canonical property resolver
--    resolved | ambiguous | not_found. Exact normalized equality only. NO fuzzy matching.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION registry.resolve_property(p_input text)
RETURNS TABLE(status text, canonical_property_id uuid, canonical_name text, candidates text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, registry AS $fn$
DECLARE
  v_norm text := lower(btrim(p_input));
  v_is_uuid boolean := p_input ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_ids uuid[];
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text, NULL::text[]; RETURN;
  END IF;

  IF v_is_uuid THEN
    RETURN QUERY
      SELECT 'resolved'::text, pd.property_id, pd.property_name, NULL::text[]
      FROM public.property_definitions pd WHERE pd.property_id = p_input::uuid;
    IF FOUND THEN RETURN; END IF;

    RETURN QUERY
      SELECT 'resolved'::text, pd.property_id, pd.property_name, NULL::text[]
      FROM registry.property_external_identities b
      JOIN public.property_definitions pd ON pd.property_id = b.canonical_property_id
      WHERE b.external_id = p_input AND b.mapping_status = 'approved';
    IF FOUND THEN RETURN; END IF;

    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text, NULL::text[]; RETURN;
  END IF;

  SELECT array_agg(DISTINCT cid) INTO v_ids FROM (
    SELECT pd.property_id AS cid FROM public.property_definitions pd
      WHERE lower(btrim(pd.property_name)) = v_norm
    UNION
    SELECT b.canonical_property_id FROM registry.property_external_identities b
      WHERE b.mapping_status = 'approved' AND b.canonical_property_id IS NOT NULL
        AND lower(btrim(b.external_id)) = v_norm
  ) q WHERE cid IS NOT NULL;

  IF v_ids IS NULL OR array_length(v_ids,1) IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text, NULL::text[]; RETURN;
  ELSIF array_length(v_ids,1) = 1 THEN
    RETURN QUERY SELECT 'resolved'::text, v_ids[1],
      (SELECT property_name FROM public.property_definitions WHERE property_id = v_ids[1]), NULL::text[]; RETURN;
  ELSE
    RETURN QUERY SELECT 'ambiguous'::text, NULL::uuid, NULL::text,
      (SELECT array_agg(property_name ORDER BY property_name)
         FROM public.property_definitions WHERE property_id = ANY(v_ids)); RETURN;
  END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION registry.resolve_property(text) TO authenticated, service_role;

------------------------------------------------------------------------------
-- 3. Seed (idempotent). Deterministic name equality only.
------------------------------------------------------------------------------
-- 3.1 public.properties -> canonical propdef (exact normalized name match)
INSERT INTO registry.property_external_identities (source_system, external_entity_type, external_id, canonical_property_id, canonical_name, match_method, audit)
SELECT 'app.properties','property', p.id::text, pd.property_id, pd.property_name, 'exact_name_match',
       jsonb_build_object('agent','agent3','decision','H.1','basis','normalized name equality')
FROM public.properties p
JOIN public.property_definitions pd ON lower(btrim(p.name)) = lower(btrim(pd.property_name))
WHERE p.is_deleted IS NOT TRUE
ON CONFLICT (source_system, external_id) DO NOTHING;

-- 3.2 (H.5) legacy 'Tamir Redisson' properties row -> canonical 'Tamir Radisson'
INSERT INTO registry.property_external_identities (source_system, external_entity_type, external_id, canonical_property_id, canonical_name, match_method, audit)
SELECT 'app.properties','property', p.id::text, pd.property_id, pd.property_name, 'approved_alias',
       jsonb_build_object('agent','agent3','decision','H.5','basis','Tamir Redisson = legacy alias of Tamir Radisson (Yossi 2026-08-15)')
FROM public.properties p, public.property_definitions pd
WHERE lower(btrim(p.name)) = 'tamir redisson' AND pd.property_name = 'Tamir Radisson'
ON CONFLICT (source_system, external_id) DO NOTHING;

-- 3.3 (H.5) raw ledger name 'Tamir Redisson' -> 'Tamir Radisson'
INSERT INTO registry.property_external_identities (source_system, external_entity_type, external_id, canonical_property_id, canonical_name, match_method, audit)
SELECT 'ledger.property_name','property_name','Tamir Redisson', pd.property_id, pd.property_name, 'approved_alias',
       jsonb_build_object('agent','agent3','decision','H.5')
FROM public.property_definitions pd WHERE pd.property_name = 'Tamir Radisson'
ON CONFLICT (source_system, external_id) DO NOTHING;

-- 3.4 entity_registry property rows -> canonical propdef (by name)
INSERT INTO registry.property_external_identities (source_system, external_entity_type, external_id, canonical_property_id, canonical_name, match_method, audit)
SELECT 'app.entity_registry','property', er.id::text, pd.property_id, pd.property_name, 'exact_name_match',
       jsonb_build_object('agent','agent3','decision','H.1','entity_type',er.entity_type)
FROM public.entity_registry er
JOIN public.property_definitions pd ON lower(btrim(er.canonical_name)) = lower(btrim(pd.property_name))
WHERE er.entity_type LIKE '%propert%'
ON CONFLICT (source_system, external_id) DO NOTHING;

-- 3.5 property_name_aliases raw variants (non case-only) -> canonical propdef
INSERT INTO registry.property_external_identities (source_system, external_entity_type, external_id, canonical_property_id, canonical_name, match_method, audit)
SELECT 'ledger.property_name','property_name', pna.raw_name, pd.property_id, pd.property_name, 'exact_name_match',
       jsonb_build_object('agent','agent3','source','property_name_aliases')
FROM public.property_name_aliases pna
JOIN public.property_definitions pd ON lower(btrim(pna.canonical_name)) = lower(btrim(pd.property_name))
WHERE lower(btrim(pna.raw_name)) <> lower(btrim(pna.canonical_name))
ON CONFLICT (source_system, external_id) DO NOTHING;

-- 3.6 (H.4) record 'Liora Anafotia 201' as CONFLICT/UNKNOWN. DO NOT map to 101.
INSERT INTO registry.property_external_identities (source_system, external_entity_type, external_id, canonical_property_id, canonical_name, mapping_status, confidence, match_method, audit)
SELECT 'app.properties','property', p.id::text, NULL, NULL, 'conflict', 0, 'unresolved',
       jsonb_build_object('agent','agent3','decision','H.4','note','Liora Anafotia 201 vs 101 — CONFLICT/UNKNOWN. Do not merge without authoritative evidence.')
FROM public.properties p WHERE lower(btrim(p.name)) = 'liora anafotia 201'
ON CONFLICT (source_system, external_id) DO NOTHING;
