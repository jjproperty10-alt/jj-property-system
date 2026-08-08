-- Migration: Liora Anafotia 201 → 101 (UUID-scoped)
-- Authorized by: Yossi (PR A — Liora display corrections)
-- Applied to production: 2026-08-05 (direct SQL)
-- This migration commits the change to the repository for reproducibility.
--
-- Context: "Liora Anafotia 201" was a data entry error. The correct
-- property name is "Liora Anafotia 101". This migration targets ONLY
-- the exact records identified and authorized:
--
--   Transaction:            4858487a-3e40-4826-9c83-b7de1c815b08 (1 row)
--   Management relationship: c0ec01aa-d566-4371-854e-415b059bad68 (1 row)
--   Property owners:        574a8a51-e700-4b89-8a56-9c487bc85835 (Jacob 50%)
--                           f8ccdcb6-e1c1-4c22-a22a-fbcc681427b0 (Yossi 50%)
--   Property definitions:   PK rename (INSERT new + DELETE old)
--
-- Idempotent: safe to run on a DB where the correction was already applied.
-- All WHERE clauses require both UUID AND old value — 0 rows on re-run.

BEGIN;

-- 1. Transaction — exact authorized UUID only
UPDATE public.transactions
SET    property_name = 'Liora Anafotia 101',
       updated_at    = now()
WHERE  id = '4858487a-3e40-4826-9c83-b7de1c815b08'
  AND  property_name = 'Liora Anafotia 201';

-- 2. Management relationship — exact authorized UUID only
--    Column is property_name (verified from information_schema)
UPDATE lifecycle.management_relationship
SET    property_name = 'Liora Anafotia 101'
WHERE  id = 'c0ec01aa-d566-4371-854e-415b059bad68'
  AND  property_name = 'Liora Anafotia 201';

-- 3. Property definitions — PK rename requires INSERT+DELETE
--    (property_name is PRIMARY KEY; property_owners FK has update_rule = NO ACTION)
--    ON CONFLICT = idempotent (0 rows if 101 already exists)
INSERT INTO public.property_definitions (property_name, property_type)
SELECT 'Liora Anafotia 101', property_type
FROM   public.property_definitions
WHERE  property_name = 'Liora Anafotia 201'
ON CONFLICT (property_name) DO NOTHING;

-- 4. Property owners — exact authorized UUIDs only
UPDATE public.property_owners
SET    property_name = 'Liora Anafotia 101'
WHERE  id IN (
         '574a8a51-e700-4b89-8a56-9c487bc85835',
         'f8ccdcb6-e1c1-4c22-a22a-fbcc681427b0'
       )
  AND  property_name = 'Liora Anafotia 201';

-- 5. Remove old PK row (safe: no FK children remain after step 4)
--    0 rows on re-run (201 no longer exists)
DELETE FROM public.property_definitions
WHERE  property_name = 'Liora Anafotia 201';

COMMIT;
