BEGIN;

REVOKE ALL ON public.cashier_today_transaction_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_transaction_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cashier_today_transaction_history TO authenticated;
GRANT SELECT ON public.admin_transaction_history TO authenticated;

REVOKE ALL ON FUNCTION public.get_queue() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_order_history_details(integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_history_summary(date, date, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.void_order(integer, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_history_details(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_history_summary(date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_order(integer, text) TO authenticated;

COMMIT;
