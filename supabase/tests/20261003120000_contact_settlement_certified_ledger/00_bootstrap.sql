-- Local-only stub of the Production objects read by public.v_contact_settlement.
-- Column lists/types match Production information_schema (captured 2026-10-03).
-- v_certified_ledger_transactions body = migration 20260917090000.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE TABLE public.transactions (id uuid primary key, date date, property_id uuid, property_name text, category text, subcategory text, description text, payer text, payee text, amount_eur numeric(12,2), client_charge numeric(12,2), notes text, k_note text, created_at timestamptz, updated_at timestamptz, is_deleted bool default false, deleted_by text, deleted_at timestamp, review_status text);
CREATE TABLE public.transaction_exclusions (id uuid primary key default gen_random_uuid(), transaction_id uuid, duplicate_of uuid, reason text, source_batch text, excluded_by text, created_at timestamptz default now(), is_active bool default true);
CREATE TABLE public.contacts (id uuid primary key, name text, type text, phone text, email text, notes text, created_at timestamptz, is_deleted bool default false);
CREATE TABLE public.contact_properties (id uuid primary key default gen_random_uuid(), contact_id uuid, property_name text, relationship_role text, confirmation_status text, notes text, created_at timestamptz, is_deleted bool default false);
CREATE TABLE public.settlement_allocation (id uuid primary key default gen_random_uuid(), transaction_id uuid, contact_id uuid, allocated_amount numeric, allocation_reason text, evidence_source text, allocation_batch_id uuid, voided_at timestamptz, voided_reason text, created_at timestamptz, created_by text);
CREATE VIEW public.v_certified_ledger_transactions WITH (security_invoker = true) AS
SELECT t.* FROM public.transactions t WHERE COALESCE(t.is_deleted, false) = false AND (t.review_status = 'active' OR t.review_status IS NULL)
 AND NOT EXISTS (SELECT 1 FROM public.transaction_exclusions te WHERE te.transaction_id = t.id AND te.is_active = true);
REVOKE ALL ON public.v_certified_ledger_transactions FROM PUBLIC; GRANT ALL ON public.v_certified_ledger_transactions TO service_role;
