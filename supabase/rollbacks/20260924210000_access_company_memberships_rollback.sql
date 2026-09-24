-- Immediate rollback for 20260924210000_access_company_memberships.
-- Run only before a later phase depends on access.
-- Aborts if access contains anything other than the reviewed Phase 1 objects.
-- Drops only the reviewed objects, in reverse order. Does not delete a company or an auth user.

BEGIN;

DO $rollback$
DECLARE
  unexpected text;
BEGIN
  IF to_regnamespace('access') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: access schema is absent';
  END IF;

  SELECT string_agg(label, ', ' ORDER BY label)
    INTO unexpected
  FROM (
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS label
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'access'
      AND p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' NOT IN (
        'grant_company_membership(target_company_id uuid, target_user_id uuid, target_role text)',
        'is_company_admin(target_company_id uuid)',
        'is_company_member(target_company_id uuid)',
        'reject_membership_identity_change()'
      )
    UNION ALL
    SELECT c.relkind::text || ':' || c.relname
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'access'
      AND c.relname NOT IN (
        'company_memberships',
        'company_memberships_pkey',
        'company_memberships_user_id_idx',
        'company_memberships_one_per_user_company'
      )
    UNION ALL
    SELECT 'policy:' || policyname
    FROM pg_policies
    WHERE schemaname = 'access'
      AND policyname IS DISTINCT FROM 'read_own_active_company_membership'
    UNION ALL
    SELECT 'trigger:' || t.tgname
    FROM pg_trigger AS t
    JOIN pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'access'
      AND NOT t.tgisinternal
      AND t.tgname IS DISTINCT FROM 'company_memberships_identity_immutable'
    UNION ALL
    SELECT 'type:' || typ.typname
    FROM pg_type AS typ
    JOIN pg_namespace AS n ON n.oid = typ.typnamespace
    WHERE n.nspname = 'access'
      AND typ.typname NOT IN ('company_memberships', '_company_memberships')
  ) AS found;

  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: unexpected access objects: %', unexpected;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_depend AS d
    JOIN pg_class AS referenced ON referenced.oid = d.refobjid
    JOIN pg_namespace AS referenced_ns ON referenced_ns.oid = referenced.relnamespace
    LEFT JOIN pg_class AS dependent_rel
      ON d.classid = 'pg_class'::regclass AND dependent_rel.oid = d.objid
    LEFT JOIN pg_namespace AS dependent_ns ON dependent_ns.oid = dependent_rel.relnamespace
    LEFT JOIN pg_proc AS dependent_fn
      ON d.classid = 'pg_proc'::regclass AND dependent_fn.oid = d.objid
    LEFT JOIN pg_namespace AS dependent_fn_ns ON dependent_fn_ns.oid = dependent_fn.pronamespace
    WHERE d.refclassid = 'pg_class'::regclass
      AND referenced_ns.nspname = 'access'
      AND d.deptype = 'n'
      AND coalesce(dependent_ns.nspname, dependent_fn_ns.nspname) IS NOT NULL
      AND coalesce(dependent_ns.nspname, dependent_fn_ns.nspname) NOT IN (
        'access', 'pg_catalog', 'pg_toast', 'information_schema'
      )
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: unexpected dependency on access';
  END IF;
END
$rollback$;

DROP POLICY read_own_active_company_membership ON access.company_memberships;
DROP TRIGGER company_memberships_identity_immutable ON access.company_memberships;
DROP FUNCTION access.grant_company_membership(uuid, uuid, text);
DROP FUNCTION access.is_company_admin(uuid);
DROP FUNCTION access.is_company_member(uuid);
DROP FUNCTION access.reject_membership_identity_change();
ALTER TABLE access.company_memberships DROP CONSTRAINT company_memberships_one_per_user_company;
ALTER TABLE access.company_memberships DROP CONSTRAINT company_memberships_pkey;
DROP INDEX access.company_memberships_user_id_idx;
DROP TABLE access.company_memberships;
DROP SCHEMA access;

COMMIT;
