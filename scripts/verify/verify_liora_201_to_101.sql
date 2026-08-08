-- Verification: Liora 201→101 migration (UUID-scoped identity assertions)
-- Run after migration. Every assertion targets exact record IDs.

-- ===== ABSENCE: No '201' references remain =====

-- 1. No '201' in transactions
SELECT 'tx_no_201' AS check_name,
       count(*) AS should_be_zero
FROM   public.transactions
WHERE  property_name = 'Liora Anafotia 201';

-- 2. No '201' in management_relationship (column = property_name)
SELECT 'mgmt_rel_no_201' AS check_name,
       count(*) AS should_be_zero
FROM   lifecycle.management_relationship
WHERE  property_name = 'Liora Anafotia 201';

-- 3. No '201' in property_definitions
SELECT 'prop_def_no_201' AS check_name,
       count(*) AS should_be_zero
FROM   public.property_definitions
WHERE  property_name = 'Liora Anafotia 201';

-- 4. No '201' in property_owners
SELECT 'prop_owners_no_201' AS check_name,
       count(*) AS should_be_zero
FROM   public.property_owners
WHERE  property_name = 'Liora Anafotia 201';


-- ===== IDENTITY: Exact authorized records now show '101' =====

-- 5. Transaction — exact UUID exists with 101
SELECT 'tx_identity' AS check_name,
       CASE WHEN property_name = 'Liora Anafotia 101'
            THEN 'PASS' ELSE 'FAIL — ' || coalesce(property_name, 'NULL')
       END AS result
FROM   public.transactions
WHERE  id = '4858487a-3e40-4826-9c83-b7de1c815b08';

-- 6. Management relationship — exact UUID exists with 101
SELECT 'mgmt_rel_identity' AS check_name,
       CASE WHEN property_name = 'Liora Anafotia 101'
            THEN 'PASS' ELSE 'FAIL — ' || coalesce(property_name, 'NULL')
       END AS result
FROM   lifecycle.management_relationship
WHERE  id = 'c0ec01aa-d566-4371-854e-415b059bad68';

-- 7. Property owner (Jacob) — exact UUID exists with 101
SELECT 'owner_jacob_identity' AS check_name,
       CASE WHEN property_name = 'Liora Anafotia 101'
            THEN 'PASS' ELSE 'FAIL — ' || coalesce(property_name, 'NULL')
       END AS result
FROM   public.property_owners
WHERE  id = '574a8a51-e700-4b89-8a56-9c487bc85835';

-- 8. Property owner (Yossi) — exact UUID exists with 101
SELECT 'owner_yossi_identity' AS check_name,
       CASE WHEN property_name = 'Liora Anafotia 101'
            THEN 'PASS' ELSE 'FAIL — ' || coalesce(property_name, 'NULL')
       END AS result
FROM   public.property_owners
WHERE  id = 'f8ccdcb6-e1c1-4c22-a22a-fbcc681427b0';

-- 9. Property definition — 101 exists as PK
SELECT 'prop_def_identity' AS check_name,
       CASE WHEN count(*) = 1
            THEN 'PASS' ELSE 'FAIL — count=' || count(*)::text
       END AS result
FROM   public.property_definitions
WHERE  property_name = 'Liora Anafotia 101';
