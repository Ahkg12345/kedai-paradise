BEGIN;

CREATE OR REPLACE VIEW public.cashier_today_transaction_history
WITH (security_barrier = true)
AS
SELECT
  t.transaction_id,
  t.order_no,
  t.date,
  t.order_date,
  t.table_no,
  t.method,
  t.total,
  t.status,
  t.completed_at,
  t.duration_seconds,
  t.user_id,
  initcap(u.username) AS username,
  t.void_reason,
  t.voided_at
FROM public.transactions AS t
JOIN public.users AS u ON u.user_id = t.user_id
WHERE t.order_date = timezone('Asia/Jakarta', now())::date
  AND public.current_user_role() = 'cashier';

CREATE OR REPLACE VIEW public.admin_transaction_history
WITH (security_barrier = true)
AS
SELECT
  t.transaction_id,
  t.order_no,
  t.date,
  t.order_date,
  t.table_no,
  t.method,
  t.total,
  t.status,
  t.completed_at,
  t.duration_seconds,
  t.total_cost,
  t.gross_profit,
  t.user_id,
  initcap(u.username) AS username,
  t.void_reason,
  t.voided_at,
  t.voided_by,
  voider.username AS voided_by_username
FROM public.transactions AS t
JOIN public.users AS u ON u.user_id = t.user_id
LEFT JOIN public.users AS voider ON voider.user_id = t.voided_by
WHERE public.current_user_role() = 'admin';

REVOKE ALL ON public.cashier_today_transaction_history FROM PUBLIC, anon;
REVOKE ALL ON public.admin_transaction_history FROM PUBLIC, anon;
GRANT SELECT ON public.cashier_today_transaction_history TO authenticated;
GRANT SELECT ON public.admin_transaction_history TO authenticated;

CREATE OR REPLACE FUNCTION public.get_queue()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_user_id integer;
  v_order_date date := pg_catalog.timezone('Asia/Jakarta', pg_catalog.now())::date;
  v_active jsonb;
  v_completed jsonb;
BEGIN
  v_role := public.current_user_role();
  IF COALESCE(v_role, '') NOT IN ('admin', 'cashier') THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT u.user_id INTO v_user_id
  FROM public.users AS u
  WHERE u.auth_id = auth.uid() AND u.status = true;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active staff account required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(q.ticket ORDER BY q.ordered_at, q.transaction_id), '[]'::jsonb)
  INTO v_active
  FROM (
    SELECT
      t.transaction_id,
      t.date AS ordered_at,
      pg_catalog.jsonb_build_object(
        'transaction_id', t.transaction_id,
        'order_no', t.order_no,
        'date', t.date,
        'table_no', t.table_no,
        'items', COALESCE((
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'order_id', o.order_id,
              'name', m.name,
              'quantity', o.quantity,
              'modifiers', COALESCE((
                SELECT pg_catalog.jsonb_agg(im.modifier_name ORDER BY im.order_modifier_id)
                FROM public.order_item_modifiers AS im
                WHERE im.order_id = o.order_id
              ), '[]'::jsonb),
              'note', o.note
            ) ORDER BY o.order_id
          )
          FROM public.orders AS o
          JOIN public.menu AS m ON m.menu_id = o.menu_id
          WHERE o.transaction_id = t.transaction_id
        ), '[]'::jsonb)
      ) AS ticket
    FROM public.transactions AS t
    WHERE t.order_date = v_order_date AND t.status = 'processing'
  ) AS q;

  SELECT COALESCE(pg_catalog.jsonb_agg(q.ticket ORDER BY q.ordered_at DESC, q.transaction_id DESC), '[]'::jsonb)
  INTO v_completed
  FROM (
    SELECT
      t.transaction_id,
      t.completed_at AS ordered_at,
      pg_catalog.jsonb_build_object(
        'transaction_id', t.transaction_id,
        'order_no', t.order_no,
        'table_no', t.table_no,
        'date', t.date,
        'completed_at', t.completed_at,
        'duration_seconds', t.duration_seconds,
        'username', pg_catalog.initcap(u.username)
      ) AS ticket
    FROM public.transactions AS t
    JOIN public.users AS u ON u.user_id = t.user_id
    WHERE t.order_date = v_order_date AND t.status = 'completed'
  ) AS q;

  RETURN pg_catalog.jsonb_build_object(
    'active', v_active,
    'completed', v_completed,
    'order_date', v_order_date
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_order_history_details(p_transaction_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_user_id integer;
  v_order_date date;
  v_items jsonb;
BEGIN
  v_role := public.current_user_role();
  IF COALESCE(v_role, '') NOT IN ('admin', 'cashier') THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT u.user_id INTO v_user_id
  FROM public.users AS u
  WHERE u.auth_id = auth.uid() AND u.status = true;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active staff account required' USING ERRCODE = '42501';
  END IF;
  IF p_transaction_id IS NULL OR p_transaction_id <= 0 THEN
    RAISE EXCEPTION 'Invalid transaction id' USING ERRCODE = '22023';
  END IF;

  SELECT t.order_date INTO v_order_date
  FROM public.transactions AS t
  WHERE t.transaction_id = p_transaction_id;
  IF NOT FOUND OR (v_role = 'cashier' AND v_order_date <> pg_catalog.timezone('Asia/Jakarta', pg_catalog.now())::date) THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'order_id', o.order_id,
      'name', m.name,
      'quantity', o.quantity,
      'subtotal', o.subtotal,
      'note', o.note,
      'modifiers', COALESCE((
        SELECT pg_catalog.jsonb_agg(im.modifier_name ORDER BY im.order_modifier_id)
        FROM public.order_item_modifiers AS im
        WHERE im.order_id = o.order_id
      ), '[]'::jsonb)
    ) ORDER BY o.order_id
  ), '[]'::jsonb)
  INTO v_items
  FROM public.orders AS o
  JOIN public.menu AS m ON m.menu_id = o.menu_id
  WHERE o.transaction_id = p_transaction_id;

  RETURN pg_catalog.jsonb_build_object('items', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_history_summary(
  p_start_date date,
  p_end_date date,
  p_method text DEFAULT 'all',
  p_status text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id integer;
  v_summary jsonb;
BEGIN
  IF COALESCE(public.current_user_role(), '') <> 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT u.user_id INTO v_user_id
  FROM public.users AS u
  WHERE u.auth_id = auth.uid() AND u.status = true;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active staff account required' USING ERRCODE = '42501';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Invalid date range' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_method, 'all') NOT IN ('all', 'cash', 'qris') THEN
    RAISE EXCEPTION 'Invalid payment method filter' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_status, 'all') NOT IN ('all', 'processing', 'completed', 'void') THEN
    RAISE EXCEPTION 'Invalid status filter' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'active_count', count(*) FILTER (WHERE t.status <> 'void'),
    'void_count', count(*) FILTER (WHERE t.status = 'void'),
    'void_value', COALESCE(sum(t.total) FILTER (WHERE t.status = 'void'), 0),
    'revenue', COALESCE(sum(t.total) FILTER (WHERE t.status <> 'void'), 0),
    'total_cost', COALESCE(sum(t.total_cost) FILTER (WHERE t.status <> 'void'), 0),
    'gross_profit', COALESCE(sum(t.gross_profit) FILTER (WHERE t.status <> 'void'), 0)
  ) INTO v_summary
  FROM public.transactions AS t
  WHERE t.order_date BETWEEN p_start_date AND p_end_date
    AND (COALESCE(p_method, 'all') = 'all' OR t.method::text = p_method)
    AND (COALESCE(p_status, 'all') = 'all' OR t.status::text = p_status);

  RETURN v_summary;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_order(p_transaction_id integer, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id integer;
  v_transaction public.transactions%ROWTYPE;
  v_reason text := pg_catalog.btrim(COALESCE(p_reason, ''));
  v_voided_at timestamptz;
BEGIN
  IF COALESCE(public.current_user_role(), '') <> 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT u.user_id INTO v_user_id
  FROM public.users AS u
  WHERE u.auth_id = auth.uid() AND u.status = true;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active staff account required' USING ERRCODE = '42501';
  END IF;
  IF p_transaction_id IS NULL OR p_transaction_id <= 0 THEN
    RAISE EXCEPTION 'Invalid transaction id' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(v_reason) < 3 OR pg_catalog.char_length(v_reason) > 255 THEN
    RAISE EXCEPTION 'Alasan pembatalan harus berisi 3 sampai 255 karakter' USING ERRCODE = '22023';
  END IF;

  SELECT t.* INTO v_transaction
  FROM public.transactions AS t
  WHERE t.transaction_id = p_transaction_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_transaction.status = 'void' THEN
    RAISE EXCEPTION 'Transaksi ini sudah dibatalkan' USING ERRCODE = '22023';
  END IF;

  v_voided_at := pg_catalog.clock_timestamp();
  UPDATE public.transactions AS t
  SET status = 'void',
      void_reason = v_reason,
      voided_at = v_voided_at,
      voided_by = v_user_id
  WHERE t.transaction_id = p_transaction_id;

  RETURN pg_catalog.jsonb_build_object(
    'transaction_id', p_transaction_id,
    'status', 'void',
    'voided_at', v_voided_at,
    'voided_by', v_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_queue() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_order_history_details(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_history_summary(date, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_order(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_history_details(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_history_summary(date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_order(integer, text) TO authenticated;

COMMIT;
