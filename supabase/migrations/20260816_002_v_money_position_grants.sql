-- Financial data: server/service-role boundary only (consumed via getMoneyPosition service).
-- Wiring Agent (2026-08-16).
REVOKE ALL ON public.v_money_position FROM anon;
REVOKE ALL ON public.v_money_position FROM authenticated;
GRANT SELECT ON public.v_money_position TO service_role;
