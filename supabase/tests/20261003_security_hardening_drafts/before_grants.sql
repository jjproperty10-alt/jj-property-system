DO $before$
DECLARE
  name text;
  tables text[] := ARRAY[
    'accounting_rules', 'airbnb_reservations', 'alerts', 'business_cases',
    'business_event_sources', 'business_events', 'case_audit_log',
    'case_completeness_gaps', 'case_entities', 'case_relationships',
    'case_workflow_state', 'category_subcategories', 'contact_opening_balance_history',
    'contact_opening_balances', 'contact_properties', 'contacts', 'custody_positions',
    'data_quality_backup_20260610', 'entities', 'entity_aliases', 'entity_registry',
    'freeze_v1_ceo_kpis', 'freeze_v1_ceo_summary', 'freeze_v1_settlement', 'ownership',
    'partnership_capital', 'partnership_ownership', 'payer_aliases', 'pending_queue',
    'property_definitions', 'property_name_aliases', 'property_owners',
    'property_ownership', 'property_reporting_map', 'renovation_projects',
    'settlement_temporal_transitions', 'tamir_redisson_backup_20260610',
    'transaction_business_metadata', 'transaction_corrections', 'transaction_exclusions',
    'transactions_backup_20260609', 'transactions_deletion_backup', 'user_profiles',
    'user_roles'
  ];
BEGIN
  IF array_length(tables, 1) <> 44 THEN
    RAISE EXCEPTION 'before grant list drifted';
  END IF;
  FOREACH name IN ARRAY tables LOOP
    IF NOT has_table_privilege('anon', format('public.%I', name), 'INSERT')
       OR NOT has_table_privilege('anon', format('public.%I', name), 'TRUNCATE')
       OR NOT has_table_privilege('anon', format('public.%I', name), 'MAINTAIN')
       OR NOT has_table_privilege('authenticated', format('public.%I', name), 'TRUNCATE')
    THEN
      RAISE EXCEPTION 'before: expected live anon/authenticated grants missing on %', name;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('anon', 'public.v_ceo_summary', 'INSERT') THEN
    RAISE EXCEPTION 'before: anon INSERT missing on a listed view';
  END IF;
END
$before$;
