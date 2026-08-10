-- Rollback: Liora Anafotia 101 → 201 (UUID-scoped)
-- REVERSES migration 20260807_001 ONLY for the exact records it changed.
--
-- WARNING: Liora Anafotia 101 is a canonical property. After this migration
-- runs, legitimate future activity may accumulate under 101.
--
-- This rollback targets ONLY the exact records changed by the forward migration.
-- It will NOT revert any future 101 data created after the migration.
--
-- PROPERTY DEFINITIONS ROLLBACK IS NON-AUTOMATIC.
-- See comments at step 5 below.

BEGIN;

-- 1. Transaction — exact UUID only
UPDATE public.transactions
SET    property_name = 'Liora Anafotia 201',
       updated_at    = now()
WHERE  id = '4858487a-3e40-4826-9c83-b7de1c815b08'
  AND  property_name = 'Liora Anafotia 101';

-- 2. Management relationship — exact UUID only
UPDATE lifecycle.management_relationship
SET    property_name = 'Liora Anafotia 201'
WHERE  id = 'c0ec01aa-d566-4371-854e-415b059bad68'
  AND  property_name = 'Liora Anafotia 101';

-- 3. Property definitions — insert old parent for FK
INSERT INTO public.property_definitions (property_name, property_type)
SELECT 'Liora Anafotia 201', property_type
FROM   public.property_definitions
WHERE  property_name = 'Liora Anafotia 101'
ON CONFLICT (property_name) DO NOTHING;

-- 4. Property owners — exact UUIDs only
UPDATE public.property_owners
SET    property_name = 'Liora Anafotia 201'
WHERE  id IN (
         '574a8a51-e700-4b89-8a56-9c487bc85835',
         'f8ccdcb6-e1c1-4c22-a22a-fbcc681427b0'
       )
  AND  property_name = 'Liora Anafotia 101';

-- 5. Property definitions — NON-AUTOMATIC
--    DO NOT automatically delete 'Liora Anafotia 101' from property_definitions.
--    101 is a canonical property. After the forward migration, new transactions,
--    property_owners rows, or management_relationships may reference it.
--    Deleting it would break FK constraints or orphan legitimate data.
--
--    MANUAL PRECONDITION CHECKS REQUIRED before removing 101:
--      SELECT count(*) FROM public.transactions WHERE property_name = 'Liora Anafotia 101';
--      SELECT count(*) FROM public.property_owners WHERE property_name = 'Liora Anafotia 101';
--      SELECT count(*) FROM lifecycle.management_relationship WHERE property_name = 'Liora Anafotia 101';
--
--    Only if ALL return 0:
--      DELETE FROM public.property_definitions WHERE property_name = 'Liora Anafotia 101';

COMMIT;
