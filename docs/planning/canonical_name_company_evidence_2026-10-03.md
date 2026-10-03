# Canonical-name company evidence — 2026-10-03

DRAFT, for Yossi, before any backfill. This note is not a canonical rule and it does not apply a migration.

`supabase/migrations/20261003140000_canonical_name_unique_per_company.sql` will set `operating_company_id` on every existing row of `public.entity_registry` and `public.entities` to the sole active company. That write stays blocked until the evidence below is reviewed. Applying the backfill still requires Yossi's explicit approval. The migration banner says so.

Do not run the SQL in this file against a Supabase project from an agent session. It is a read-only script for a reviewer to run. It was checked only on disposable local Postgres, using the throwaway fixture for this migration.

## What would prove a row belongs to JJ Property 10

Three facts, and only the second one is per-row proof.

1. **Sole company.** `registry.companies` has one row, that row is active, and its `canonical_name` is `JJ Property 10`. That is the only company the backfill is allowed to assign. The migration resolves it with `access.resolve_verified_operating_company(NULL, false)` and an exactly-one-active-company check. It does not look the company up by name. The sole row does not, by itself, prove that any entity row belongs to that company.

2. **Linked.** A row of `public.entity_registry` or `public.entities` is linked when either of these is true.
   - A single-column foreign key connects that row to a row in `public.property_definitions`, `public.contacts`, or any table in schema `lifecycle`, the other table has `operating_company_id uuid`, and the linked row's `operating_company_id` is the sole active company. The foreign key may point from the entity row to the company-carrying row, or from the company-carrying row to the entity row.
   - For `public.entity_registry` only: `registry.property_external_identities` has a row with `source_system = 'app.entity_registry'`, `mapping_status = 'approved'`, `external_id` equal to that entity's primary-key text (compared case-insensitively), and `canonical_property_id` equal to `public.property_definitions.property_id`, and that property row's `operating_company_id` is the sole active company. The bridge is defined in `supabase/migrations/20260815_001_agent3_property_identity_bridge.sql`.

3. **No evidence.** Any existing row with no link in (2). The backfill raises `BLOCKED_BY_EVIDENCE` before any `UPDATE` if this class is not empty, unless every such row is named in the approved id list below.

Name equality is not a link. A row whose `canonical_name` equals `public.property_definitions.property_name` after `lower(btrim(...))` stays in **no evidence** unless a foreign key or the bridge also matches. The script reports that subset as `name_match_inside_no_evidence`.

A lifecycle `entity_id` counts only when the catalog foreign key points at `public.entity_registry` or `public.entities`. In `supabase/migrations/20260713122206_m8_lifecycle_001_schema.sql`, `lifecycle.partner_entry`, `lifecycle.capital_event`, and `lifecycle.ownership_period` reference `lifecycle.entity_identity(id)`. Those references are not links to the two public tables. `lifecycle.property_acquisition`, `lifecycle.service_engagements`, and `lifecycle.management_fee_configs` gained `operating_company_id` in `supabase/migrations/20260926140000_property_children_operating_company_id.sql`. `public.property_definitions.operating_company_id` was added in `supabase/migrations/20260925120000_properties_operating_company_id.sql`. `public.contacts` in `supabase/schema.sql` has no `operating_company_id`, and no migration in this repo adds one. A contacts link counts only when the database the reviewer is connected to actually has that column. The script reads `pg_catalog` of that database. It does not trust this paragraph over the catalog.

Rows that cannot be identified are not backfilled. Each table must have one uuid primary-key column. Otherwise the script reports `unreadable_key` and the migration raises `BLOCKED_BY_EVIDENCE`.

## Approved id list

The list is optional and separate. This migration does not create it and does not insert into it.

Relation: `access.canonical_name_backfill_approved_ids`

| column | type |
|---|---|
| `source_table` | `text` — `entity_registry` or `entities`, no schema prefix |
| `row_id` | `uuid` — that table's primary key |

- Absent, or present and empty: no row is approved. Every no-evidence row blocks the backfill.
- Present with those two column types: a no-evidence row is allowed only when its `(source_table, row_id)` is in the list. Any no-evidence row that is not listed still raises `BLOCKED_BY_EVIDENCE`.
- Present with any other type for those columns: the migration raises `BLOCKED_BY_EVIDENCE` and does not update, including when every entity row is linked.

## Read-only counts

One transaction. The only result is the last `SELECT`. `evidence_subject` + `evidence_class` are the classes. `row_count` is the count. `note` says how the migration treats that class.

`no_evidence_without_approval` is the count that blocks the backfill when `list_shape` is `absent` or `ok`. When `list_shape` is `rejected`, the migration blocks even if that count is 0.

```sql
BEGIN READ ONLY;

WITH sole_expr AS (
  SELECT $sole$(SELECT company_row.company_id FROM registry.companies AS company_row WHERE company_row.status = 'active' AND (SELECT count(*) FROM registry.companies AS active_company WHERE active_company.status = 'active') = 1)$sole$ AS expr
),
entity_key AS (
  SELECT relation.relname AS source_table, column_attr.attname AS key_column
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  JOIN pg_constraint AS primary_key
    ON primary_key.conrelid = relation.oid
   AND primary_key.contype = 'p'
   AND cardinality(primary_key.conkey) = 1
  JOIN pg_attribute AS column_attr
    ON column_attr.attrelid = relation.oid
   AND column_attr.attnum = primary_key.conkey[1]
   AND NOT column_attr.attisdropped
   AND column_attr.atttypid = 'uuid'::regtype
  WHERE namespace.nspname = 'public'
    AND relation.relname IN ('entity_registry', 'entities')
),
fk_predicate AS (
  SELECT
    CASE
      WHEN src_namespace.nspname = 'public' AND src_relation.relname IN ('entity_registry', 'entities')
        THEN src_relation.relname
      ELSE dst_relation.relname
    END AS source_table,
    format(
      'EXISTS (SELECT 1 FROM %I.%I AS carrier_row WHERE carrier_row.%I IS NOT DISTINCT FROM entity_row.%I AND carrier_row.operating_company_id IS NOT DISTINCT FROM %s)',
      CASE
        WHEN src_namespace.nspname = 'public' AND src_relation.relname IN ('entity_registry', 'entities')
          THEN dst_namespace.nspname
        ELSE src_namespace.nspname
      END,
      CASE
        WHEN src_namespace.nspname = 'public' AND src_relation.relname IN ('entity_registry', 'entities')
          THEN dst_relation.relname
        ELSE src_relation.relname
      END,
      CASE
        WHEN src_namespace.nspname = 'public' AND src_relation.relname IN ('entity_registry', 'entities')
          THEN dst_column.attname
        ELSE src_column.attname
      END,
      CASE
        WHEN src_namespace.nspname = 'public' AND src_relation.relname IN ('entity_registry', 'entities')
          THEN src_column.attname
        ELSE dst_column.attname
      END,
      (SELECT expr FROM sole_expr)
    ) AS predicate
  FROM pg_constraint AS fk
  JOIN pg_class AS src_relation ON src_relation.oid = fk.conrelid
  JOIN pg_namespace AS src_namespace ON src_namespace.oid = src_relation.relnamespace
  JOIN pg_class AS dst_relation ON dst_relation.oid = fk.confrelid
  JOIN pg_namespace AS dst_namespace ON dst_namespace.oid = dst_relation.relnamespace
  JOIN pg_attribute AS src_column
    ON src_column.attrelid = src_relation.oid
   AND src_column.attnum = fk.conkey[1]
   AND NOT src_column.attisdropped
  JOIN pg_attribute AS dst_column
    ON dst_column.attrelid = dst_relation.oid
   AND dst_column.attnum = fk.confkey[1]
   AND NOT dst_column.attisdropped
  WHERE fk.contype = 'f'
    AND cardinality(fk.conkey) = 1
    AND cardinality(fk.confkey) = 1
    AND src_relation.relkind IN ('r', 'p')
    AND dst_relation.relkind IN ('r', 'p')
    AND (
      (
        src_namespace.nspname = 'public'
        AND src_relation.relname IN ('entity_registry', 'entities')
        AND (
          (dst_namespace.nspname = 'public' AND dst_relation.relname IN ('property_definitions', 'contacts'))
          OR dst_namespace.nspname = 'lifecycle'
        )
        AND EXISTS (
          SELECT 1
          FROM pg_attribute AS company_column
          WHERE company_column.attrelid = dst_relation.oid
            AND company_column.attname = 'operating_company_id'
            AND company_column.attnum > 0
            AND NOT company_column.attisdropped
            AND company_column.atttypid = 'uuid'::regtype
        )
      )
      OR (
        dst_namespace.nspname = 'public'
        AND dst_relation.relname IN ('entity_registry', 'entities')
        AND (
          (src_namespace.nspname = 'public' AND src_relation.relname IN ('property_definitions', 'contacts'))
          OR src_namespace.nspname = 'lifecycle'
        )
        AND EXISTS (
          SELECT 1
          FROM pg_attribute AS company_column
          WHERE company_column.attrelid = src_relation.oid
            AND company_column.attname = 'operating_company_id'
            AND company_column.attnum > 0
            AND NOT company_column.attisdropped
            AND company_column.atttypid = 'uuid'::regtype
        )
      )
    )
),
bridge_predicate AS (
  SELECT
    entity_key.source_table,
    format(
      $bridge$EXISTS (SELECT 1 FROM registry.property_external_identities AS bridge JOIN public.property_definitions AS definition ON definition.property_id = bridge.canonical_property_id WHERE bridge.source_system = 'app.entity_registry' AND bridge.mapping_status = 'approved' AND bridge.canonical_property_id IS NOT NULL AND lower(bridge.external_id) = lower(entity_row.%I::text) AND definition.operating_company_id IS NOT DISTINCT FROM %s)$bridge$,
      entity_key.key_column,
      (SELECT expr FROM sole_expr)
    ) AS predicate
  FROM entity_key
  WHERE entity_key.source_table = 'entity_registry'
    AND to_regclass('registry.property_external_identities') IS NOT NULL
    AND to_regclass('public.property_definitions') IS NOT NULL
    AND (
      SELECT count(*)
      FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'registry'
        AND relation.relname = 'property_external_identities'
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND (
          (attribute.attname = 'source_system' AND attribute.atttypid = 'text'::regtype)
          OR (attribute.attname = 'external_id' AND attribute.atttypid = 'text'::regtype)
          OR (attribute.attname = 'mapping_status' AND attribute.atttypid = 'text'::regtype)
          OR (attribute.attname = 'canonical_property_id' AND attribute.atttypid = 'uuid'::regtype)
        )
    ) = 4
    AND (
      SELECT count(*)
      FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'property_definitions'
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND (
          (attribute.attname = 'property_id' AND attribute.atttypid = 'uuid'::regtype)
          OR (attribute.attname = 'operating_company_id' AND attribute.atttypid = 'uuid'::regtype)
        )
    ) = 2
),
name_expr AS (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'property_definitions'
        AND attribute.attname = 'property_name'
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND attribute.atttypid IN ('text'::regtype, 'character varying'::regtype)
    )
    THEN $name$EXISTS (SELECT 1 FROM public.property_definitions AS definition WHERE lower(btrim(definition.property_name)) = lower(btrim(entity_row.canonical_name)))$name$
    ELSE 'FALSE'
  END AS expr
),
folded AS (
  SELECT
    entity_key.source_table,
    entity_key.key_column,
    COALESCE(string_agg(predicate.predicate, ' OR '), 'FALSE') AS linked_sql,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM pg_attribute AS attribute
        JOIN pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = entity_key.source_table
          AND attribute.attname = 'canonical_name'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND attribute.atttypid IN ('text'::regtype, 'character varying'::regtype)
      )
      THEN (SELECT expr FROM name_expr)
      ELSE 'FALSE'
    END AS name_sql
  FROM entity_key
  LEFT JOIN (
    SELECT source_table, predicate FROM fk_predicate
    UNION ALL
    SELECT source_table, predicate FROM bridge_predicate
  ) AS predicate USING (source_table)
  GROUP BY entity_key.source_table, entity_key.key_column
),
arms AS (
  SELECT format(
    'SELECT %L::text AS source_table, entity_row.%I AS row_id, (%s) AS linked, (%s) AS name_match FROM public.%I AS entity_row',
    source_table,
    key_column,
    linked_sql,
    name_sql,
    source_table
  ) AS arm
  FROM folded
),
list_state AS (
  SELECT CASE
    WHEN to_regclass('access.canonical_name_backfill_approved_ids') IS NULL THEN 'absent'
    WHEN (
      SELECT count(*)
      FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'access'
        AND relation.relname = 'canonical_name_backfill_approved_ids'
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND (
          (attribute.attname = 'source_table' AND attribute.atttypid = 'text'::regtype)
          OR (attribute.attname = 'row_id' AND attribute.atttypid = 'uuid'::regtype)
        )
    ) = 2 THEN 'ok'
    ELSE 'rejected'
  END AS state
),
generated AS (
  SELECT CASE
    WHEN (SELECT count(*) FROM arms) = 0 THEN
      'SELECT NULL::text AS source_table, NULL::text AS evidence_class, NULL::bigint AS row_count WHERE false'
    ELSE
      'WITH classified AS ('
      || (SELECT string_agg(arm, ' UNION ALL ') FROM arms)
      || ') SELECT classified.source_table, CASE WHEN classified.linked THEN ''linked'' ELSE ''no_evidence'' END AS evidence_class, count(*)::bigint AS row_count FROM classified GROUP BY 1, 2'
      || ' UNION ALL SELECT classified.source_table, ''name_match_inside_no_evidence'', count(*)::bigint FROM classified WHERE NOT classified.linked AND classified.name_match GROUP BY 1'
      || CASE
        WHEN (SELECT state FROM list_state) = 'ok' THEN
          ' UNION ALL SELECT classified.source_table, ''no_evidence_without_approval'', count(*)::bigint FROM classified WHERE NOT classified.linked AND NOT EXISTS (SELECT 1 FROM access.canonical_name_backfill_approved_ids AS approved WHERE approved.source_table = classified.source_table AND approved.row_id = classified.row_id) GROUP BY 1'
        ELSE ''
      END
  END AS query_text
),
scanned AS (
  SELECT
    (xpath('//source_table/text()', row_node))[1]::text AS source_table,
    (xpath('//evidence_class/text()', row_node))[1]::text AS evidence_class,
    (xpath('//row_count/text()', row_node))[1]::text::bigint AS row_count
  FROM generated
  CROSS JOIN LATERAL unnest(
    xpath('//row', query_to_xml(generated.query_text, false, false, ''))
  ) AS extracted(row_node)
  WHERE (xpath('//source_table/text()', row_node))[1] IS NOT NULL
),
scaffold AS (
  SELECT subject.source_table, class.evidence_class
  FROM (VALUES ('entity_registry'::text), ('entities'::text)) AS subject(source_table)
  CROSS JOIN (
    VALUES
      ('linked'::text),
      ('no_evidence'::text),
      ('name_match_inside_no_evidence'::text),
      ('no_evidence_without_approval'::text)
  ) AS class(evidence_class)
  WHERE EXISTS (
    SELECT 1
    FROM entity_key
    WHERE entity_key.source_table = subject.source_table
  )
),
class_rows AS (
  SELECT
    scaffold.source_table AS evidence_subject,
    scaffold.evidence_class,
    CASE
      WHEN scaffold.evidence_class = 'no_evidence_without_approval'
       AND (SELECT state FROM list_state) <> 'ok'
        THEN COALESCE((
          SELECT scanned.row_count
          FROM scanned
          WHERE scanned.source_table = scaffold.source_table
            AND scanned.evidence_class = 'no_evidence'
        ), 0)
      ELSE COALESCE((
        SELECT scanned.row_count
        FROM scanned
        WHERE scanned.source_table = scaffold.source_table
          AND scanned.evidence_class = scaffold.evidence_class
      ), 0)
    END AS row_count,
    CASE scaffold.evidence_class
      WHEN 'linked' THEN
        'foreign key or approved app.entity_registry bridge to a row whose operating_company_id is the sole active company'
      WHEN 'no_evidence' THEN
        'no qualifying link'
      WHEN 'name_match_inside_no_evidence' THEN
        'name equality with property_definitions.property_name; not a link; these rows stay in no_evidence'
      WHEN 'no_evidence_without_approval' THEN
        CASE (SELECT state FROM list_state)
          WHEN 'absent' THEN 'approved id list is absent; the migration approves nothing'
          WHEN 'rejected' THEN 'approved id list shape is not source_table text and row_id uuid; the migration raises BLOCKED_BY_EVIDENCE even when this count is 0'
          ELSE 'rows in no_evidence whose id is not in access.canonical_name_backfill_approved_ids; the migration raises BLOCKED_BY_EVIDENCE when this count is not 0'
        END
      ELSE ''
    END AS note
  FROM scaffold
)
SELECT evidence_subject, evidence_class, row_count, note
FROM (
  SELECT
    'registry.companies'::text AS evidence_subject,
    'sole_company'::text AS evidence_class,
    count(*)::bigint AS row_count,
    CASE
      WHEN count(*) = 1
       AND count(*) FILTER (WHERE status = 'active') = 1
       AND bool_and(canonical_name = 'JJ Property 10')
        THEN 'sole row is active and its canonical_name is JJ Property 10'
      ELSE 'active=' || (count(*) FILTER (WHERE status = 'active'))::text
        || ' names=' || COALESCE(string_agg(canonical_name || ':' || status, ', ' ORDER BY canonical_name), 'none')
    END AS note
  FROM registry.companies
  UNION ALL
  SELECT
    'access.canonical_name_backfill_approved_ids'::text,
    'list_shape'::text,
    CASE (SELECT state FROM list_state) WHEN 'ok' THEN 1 ELSE 0 END::bigint,
    CASE (SELECT state FROM list_state)
      WHEN 'ok' THEN 'source_table text and row_id uuid are present; this migration does not create or fill the list'
      WHEN 'absent' THEN 'list is absent; the migration approves nothing'
      ELSE 'list shape is rejected; the migration raises BLOCKED_BY_EVIDENCE'
    END
  UNION ALL
  SELECT evidence_subject, evidence_class, row_count, note
  FROM class_rows
  UNION ALL
  SELECT
    subject.source_table,
    'unreadable_key'::text,
    NULL::bigint,
    'primary key is not one uuid column; the migration raises BLOCKED_BY_EVIDENCE'
  FROM (VALUES ('entity_registry'::text), ('entities'::text)) AS subject(source_table)
  WHERE NOT EXISTS (
    SELECT 1
    FROM entity_key
    WHERE entity_key.source_table = subject.source_table
  )
) AS evidence
ORDER BY evidence_subject, evidence_class;

ROLLBACK;
```
