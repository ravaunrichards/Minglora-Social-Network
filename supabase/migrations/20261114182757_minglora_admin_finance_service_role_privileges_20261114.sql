-- Enforce least-privilege service_role grants for Minglora company finance records.
-- Supabase default privileges can grant additional table operations even when a
-- preceding migration only explicitly granted SELECT/INSERT/UPDATE.
REVOKE ALL ON TABLE public.minglora_admin_service_providers FROM service_role;
REVOKE ALL ON TABLE public.minglora_admin_service_subscriptions FROM service_role;
REVOKE ALL ON TABLE public.minglora_admin_operating_budgets FROM service_role;
REVOKE ALL ON TABLE public.minglora_admin_operating_invoices FROM service_role;
REVOKE ALL ON TABLE public.minglora_admin_operating_expenses FROM service_role;
REVOKE ALL ON TABLE public.minglora_admin_finance_audit_events FROM service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.minglora_admin_service_providers TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.minglora_admin_service_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.minglora_admin_operating_budgets TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.minglora_admin_operating_invoices TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.minglora_admin_operating_expenses TO service_role;
GRANT SELECT, INSERT ON TABLE public.minglora_admin_finance_audit_events TO service_role;
