-- PROPOSAL ONLY. Do not apply. Do not edit
-- supabase/migrations/20260930220000_client_entity_company_isolation.sql.
--
-- Why this file exists
-- Slice A's trigger lifecycle.enforce_client_entity_company() always calls
-- access.resolve_verified_operating_company(NULL, false). That call raises
-- BLOCKED_BY_COMPANY_CONTEXT whenever more than one company is active. It
-- never reads access.internal_company_write_permit. So lifecycle.create_owner_draft
-- cannot write a verified second company even after
-- access.arm_internal_operating_company: the armed insert is rejected by the
-- trigger. Measured on local Postgres 17 with the real Slice A file
-- (matrix step 10_two_companies_property_b_blocked_by_real_slice_a).
--
-- What this draft would change
-- Replace only the trigger function. On INSERT, a non-null operating_company_id
-- (or parties.company_id) is checked with
-- resolve_verified_operating_company(requested, false), which already returns
-- an armed permit's company. If that call fails closed, fall back to
-- resolve_verified_operating_company(NULL, false), which is Slice A's current
-- sole-company rule. UPDATE of the company column stays blocked.
-- A direct insert of company B with no permit still fails. An armed
-- create_owner_draft for company B would succeed.
--
-- This file is not in supabase/migrations and has no version row. The owner
-- has not accepted it.

BEGIN;

DO $proposal_guard$
BEGIN
  IF to_regprocedure('lifecycle.enforce_client_entity_company()') IS NULL
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'lifecycle'
         AND proc.proname = 'enforce_client_entity_company'
         AND (
           length(proc.prosrc)
           - length(replace(proc.prosrc, 'access.resolve_verified_operating_company(NULL, false)', ''))
         ) / length('access.resolve_verified_operating_company(NULL, false)') >= 2
     ) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_PROPOSAL';
  END IF;
END
$proposal_guard$;

CREATE OR REPLACE FUNCTION lifecycle.enforce_client_entity_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $enforce$
DECLARE
  resolved uuid;
  requested uuid;
BEGIN
  IF TG_TABLE_NAME = 'parties' THEN
    IF TG_OP = 'UPDATE' AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    requested := NEW.company_id;
  ELSE
    IF TG_OP = 'UPDATE' AND NEW.operating_company_id IS NOT DISTINCT FROM OLD.operating_company_id THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
    END IF;
    requested := NEW.operating_company_id;
  END IF;

  IF requested IS NULL THEN
    requested := access.resolve_verified_operating_company(NULL, false);
    IF TG_TABLE_NAME = 'parties' THEN
      NEW.company_id := requested;
    ELSE
      NEW.operating_company_id := requested;
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    resolved := access.resolve_verified_operating_company(requested, false);
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM IS DISTINCT FROM 'BLOCKED_BY_COMPANY_CONTEXT' THEN
        RAISE;
      END IF;
      resolved := access.resolve_verified_operating_company(NULL, false);
  END;

  IF requested IS DISTINCT FROM resolved THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;
  RETURN NEW;
END;
$enforce$;

REVOKE ALL ON FUNCTION lifecycle.enforce_client_entity_company() FROM PUBLIC;
REVOKE ALL ON FUNCTION lifecycle.enforce_client_entity_company() FROM anon, authenticated, service_role;

COMMIT;
