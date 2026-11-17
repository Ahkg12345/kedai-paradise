BEGIN;

CREATE OR REPLACE FUNCTION public.get_executive_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := pg_catalog.timezone('Asia/Jakarta', pg_catalog.now())::date;
  v_user_id integer;
  v_revenue integer;
  v_gross_profit integer;
  v_transaction_count integer;
  v_processing_count integer;
  v_cash_sales integer;
  v_cash_balance integer;
  v_drawer_counted integer;
  v_average_order integer;
  v_closing_exists boolean := false;
  v_closing_username text;
  v_closing_at timestamptz;
  v_closing_expected integer;
  v_closing_counted integer;
  v_closing_difference integer;
  v_trend jsonb;
  v_top_items jsonb;
  v_top_items_revenue integer;
  v_top_items_portions integer;
  v_unavailable_count integer;
  v_unavailable_items jsonb;
  v_void_count integer;
  v_void_items jsonb;
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

  SELECT
    COALESCE(sum(t.total) FILTER (WHERE t.status <> 'void'), 0)::integer,
    COALESCE(sum(t.gross_profit) FILTER (WHERE t.status <> 'void'), 0)::integer,
    count(*) FILTER (WHERE t.status <> 'void')::integer,
    count(*) FILTER (WHERE t.status = 'processing')::integer,
    COALESCE(sum(t.total) FILTER (WHERE t.status <> 'void' AND t.method = 'cash'), 0)::integer
  INTO v_revenue, v_gross_profit, v_transaction_count, v_processing_count, v_cash_sales
  FROM public.transactions AS t
  WHERE t.order_date = v_today;

  v_average_order := CASE
    WHEN COALESCE(v_transaction_count, 0) = 0 THEN 0
    ELSE pg_catalog.round(v_revenue::numeric / v_transaction_count)::integer
  END;

  SELECT c.expected_cash, c.counted_cash, c.difference, c.created_at, u.username
  INTO v_closing_expected, v_closing_counted, v_closing_difference, v_closing_at, v_closing_username
  FROM public.cash_closings AS c
  JOIN public.users AS u ON u.user_id = c.user_id
  WHERE c.closing_date = v_today;
  v_closing_exists := FOUND;
  v_cash_balance := COALESCE(v_closing_expected, v_cash_sales, 0);
  v_drawer_counted := CASE WHEN v_closing_exists THEN v_closing_counted ELSE NULL END;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('date', v_today - d.day_offset, 'revenue', COALESCE(s.revenue, 0))
    ORDER BY d.day_offset DESC
  ), '[]'::jsonb)
  INTO v_trend
  FROM pg_catalog.generate_series(0, 6) AS d(day_offset)
  LEFT JOIN (
    SELECT t.order_date, sum(t.total)::integer AS revenue
    FROM public.transactions AS t
    WHERE t.order_date BETWEEN v_today - 6 AND v_today AND t.status <> 'void'
    GROUP BY t.order_date
  ) AS s ON s.order_date = v_today - d.day_offset;

  SELECT
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'rank', x.rank,
        'menu_id', x.menu_id,
        'name', x.name,
        'category', x.category,
        'portions', x.portions,
        'revenue', x.revenue
      ) ORDER BY x.rank
    ), '[]'::jsonb),
    COALESCE(sum(x.revenue), 0)::integer,
    COALESCE(sum(x.portions), 0)::integer
  INTO v_top_items, v_top_items_revenue, v_top_items_portions
  FROM (
    SELECT ranked.*
    FROM (
      SELECT
        pg_catalog.row_number() OVER (ORDER BY sum(o.quantity) DESC, sum(o.subtotal) DESC, m.menu_id)::integer AS rank,
        m.menu_id,
        m.name,
        m.category,
        sum(o.quantity)::integer AS portions,
        sum(o.subtotal)::integer AS revenue
      FROM public.orders AS o
      JOIN public.transactions AS t ON t.transaction_id = o.transaction_id
      JOIN public.menu AS m ON m.menu_id = o.menu_id
      WHERE t.order_date = v_today AND t.status <> 'void'
      GROUP BY m.menu_id, m.name, m.category
    ) AS ranked
    WHERE ranked.rank <= 5
  ) AS x;

  SELECT count(*)::integer
  INTO v_unavailable_count
  FROM public.menu AS m
  WHERE m.status = true AND m.available = false;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('menu_id', x.menu_id, 'name', x.name)
    ORDER BY x.name, x.menu_id
  ), '[]'::jsonb)
  INTO v_unavailable_items
  FROM (
    SELECT m.menu_id, m.name
    FROM public.menu AS m
    WHERE m.status = true AND m.available = false
    ORDER BY m.name, m.menu_id
    LIMIT 5
  ) AS x;

  SELECT count(*)::integer
  INTO v_void_count
  FROM public.transactions AS t
  WHERE t.order_date = v_today AND t.status = 'void';

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'transaction_id', x.transaction_id,
      'order_no', x.order_no,
      'total', x.total,
      'void_reason', x.void_reason,
      'voided_at', x.voided_at
    ) ORDER BY x.voided_at DESC, x.transaction_id DESC
  ), '[]'::jsonb)
  INTO v_void_items
  FROM (
    SELECT t.transaction_id, t.order_no, t.total, t.void_reason, t.voided_at
    FROM public.transactions AS t
    WHERE t.order_date = v_today AND t.status = 'void'
    ORDER BY t.voided_at DESC, t.transaction_id DESC
    LIMIT 3
  ) AS x;

  RETURN pg_catalog.jsonb_build_object(
    'date', v_today,
    'revenue', COALESCE(v_revenue, 0),
    'gross_profit', COALESCE(v_gross_profit, 0),
    'transaction_count', COALESCE(v_transaction_count, 0),
    'average_order', COALESCE(v_average_order, 0),
    'processing_count', COALESCE(v_processing_count, 0),
    'cash_balance', COALESCE(v_cash_balance, 0),
    'drawer_counted', v_drawer_counted,
    'trend', v_trend,
    'closing', pg_catalog.jsonb_build_object(
      'is_closed', v_closing_exists,
      'username', v_closing_username,
      'closed_at', v_closing_at,
      'expected_cash', v_closing_expected,
      'counted_cash', v_closing_counted,
      'difference', v_closing_difference
    ),
    'top_items', v_top_items,
    'top_items_revenue', COALESCE(v_top_items_revenue, 0),
    'top_items_portions', COALESCE(v_top_items_portions, 0),
    'unavailable_count', COALESCE(v_unavailable_count, 0),
    'unavailable_items', v_unavailable_items,
    'void_count', COALESCE(v_void_count, 0),
    'void_items', v_void_items,
    'operational_issue_count', COALESCE(v_unavailable_count, 0) + COALESCE(v_void_count, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_executive_dashboard() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_executive_dashboard() TO authenticated;

COMMIT;
