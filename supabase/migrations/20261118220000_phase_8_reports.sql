BEGIN;

CREATE OR REPLACE FUNCTION public.admin_sales_report_summary(
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_revenue bigint;
  v_cost bigint;
  v_gross_profit bigint;
  v_net_profit bigint;
  v_order_count bigint;
  v_cash_total bigint;
  v_qris_total bigint;
  v_void_count bigint;
  v_void_total bigint;
  v_manual_income bigint;
  v_manual_expense bigint;
  v_pools jsonb;
  v_cash_balance bigint;
  v_business_name text;
BEGIN
  IF (SELECT public.current_user_role()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Invalid report period' USING ERRCODE = '22023';
  END IF;

  v_start := p_start_date::timestamp without time zone AT TIME ZONE 'Asia/Jakarta';
  v_end := (p_end_date + 1)::timestamp without time zone AT TIME ZONE 'Asia/Jakarta';

  WITH scoped AS MATERIALIZED (
    SELECT t.transaction_id, t.method::text AS method, t.total, t.total_cost,
           t.gross_profit, t.alloc_restock, t.alloc_operating, t.alloc_profit
    FROM public.transactions AS t
    WHERE t.order_date BETWEEN p_start_date AND p_end_date
      AND t.status <> 'void'
  ), manual AS MATERIALIZED (
    SELECT f.type::text AS type, f.pool::text AS pool, f.amount
    FROM public.finance AS f
    WHERE f.date >= v_start AND f.date < v_end
  )
  SELECT
    COALESCE(sum(s.total), 0),
    COALESCE(sum(s.total_cost), 0),
    COALESCE(sum(s.gross_profit), 0),
    COALESCE(sum(s.alloc_profit), 0),
    count(s.transaction_id),
    COALESCE(sum(s.total) FILTER (WHERE s.method = 'cash'), 0),
    COALESCE(sum(s.total) FILTER (WHERE s.method = 'qris'), 0)
  INTO v_revenue, v_cost, v_gross_profit, v_net_profit, v_order_count, v_cash_total, v_qris_total
  FROM scoped AS s;

  SELECT count(*), COALESCE(sum(t.total), 0)
  INTO v_void_count, v_void_total
  FROM public.transactions AS t
  WHERE t.order_date BETWEEN p_start_date AND p_end_date
    AND t.status = 'void';

  WITH manual AS MATERIALIZED (
    SELECT f.type::text AS type, f.pool::text AS pool, f.amount
    FROM public.finance AS f
    WHERE f.date >= v_start AND f.date < v_end
  )
  SELECT
    COALESCE(sum(m.amount) FILTER (WHERE m.type = 'income'), 0),
    COALESCE(sum(m.amount) FILTER (WHERE m.type = 'expense'), 0)
  INTO v_manual_income, v_manual_expense
  FROM manual AS m;

  WITH scoped AS MATERIALIZED (
    SELECT t.alloc_restock, t.alloc_operating, t.alloc_profit
    FROM public.transactions AS t
    WHERE t.order_date BETWEEN p_start_date AND p_end_date
      AND t.status <> 'void'
  ), manual AS MATERIALIZED (
    SELECT f.type::text AS type, f.pool::text AS pool, f.amount
    FROM public.finance AS f
    WHERE f.date >= v_start AND f.date < v_end
  ), pools AS (
    SELECT p.pool,
      CASE p.pool
        WHEN 'restock' THEN COALESCE((SELECT sum(s.alloc_restock) FROM scoped AS s), 0)
        WHEN 'operating' THEN COALESCE((SELECT sum(s.alloc_operating) FROM scoped AS s), 0)
        ELSE COALESCE((SELECT sum(s.alloc_profit) FROM scoped AS s), 0)
      END AS sales_allocation,
      COALESCE((SELECT sum(m.amount) FROM manual AS m WHERE m.type = 'income' AND m.pool = p.pool), 0) AS manual_income,
      COALESCE((SELECT sum(m.amount) FROM manual AS m WHERE m.type = 'expense' AND m.pool = p.pool), 0) AS manual_expense
    FROM (VALUES ('restock'::text), ('operating'::text), ('profit'::text)) AS p(pool)
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'pool', p.pool,
      'sales_allocation', p.sales_allocation,
      'manual_income', p.manual_income,
      'manual_expense', p.manual_expense,
      'balance', p.sales_allocation + p.manual_income - p.manual_expense
    ) ORDER BY CASE p.pool WHEN 'restock' THEN 1 WHEN 'operating' THEN 2 ELSE 3 END), '[]'::jsonb),
    COALESCE(sum(p.sales_allocation + p.manual_income - p.manual_expense), 0)
  INTO v_pools, v_cash_balance
  FROM pools AS p;

  SELECT s.business_name INTO v_business_name
  FROM public.settings AS s
  WHERE s.settings_id = 1;

  RETURN jsonb_build_object(
    'revenue', v_revenue,
    'total_cost', v_cost,
    'gross_profit', v_gross_profit,
    'net_profit', v_net_profit,
    'gross_margin_pct', CASE WHEN v_revenue = 0 THEN 0 ELSE round(v_gross_profit * 100.0 / v_revenue, 1) END,
    'net_margin_pct', CASE WHEN v_revenue = 0 THEN 0 ELSE round(v_net_profit * 100.0 / v_revenue, 1) END,
    'order_count', v_order_count,
    'cash_total', v_cash_total,
    'qris_total', v_qris_total,
    'void_count', v_void_count,
    'void_total', v_void_total,
    'manual_income', v_manual_income,
    'manual_expense', v_manual_expense,
    'cash_balance', v_cash_balance,
    'reconciliation_matches', v_cash_balance = v_revenue + v_manual_income - v_manual_expense,
    'pools', v_pools,
    'business_name', COALESCE(v_business_name, 'Kedai Paradise')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_sales_report_daily(
  p_start_date date,
  p_end_date date,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_sort_key text DEFAULT 'date',
  p_sort_direction text DEFAULT 'desc'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows jsonb;
  v_count bigint;
BEGIN
  IF (SELECT public.current_user_role()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date
    OR p_page IS NULL OR p_page < 1
    OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 50
    OR p_sort_key NOT IN ('date', 'orders', 'revenue', 'cost', 'gross_profit', 'net_profit')
    OR p_sort_direction NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Invalid report filters' USING ERRCODE = '22023';
  END IF;

  WITH days AS (
    SELECT generated_at::date AS report_date
    FROM pg_catalog.generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') AS generated_at
  ), daily_sales AS (
    SELECT t.order_date AS report_date,
      count(*) AS order_count,
      COALESCE(sum(t.total), 0) AS revenue,
      COALESCE(sum(t.total_cost), 0) AS total_cost,
      COALESCE(sum(t.gross_profit), 0) AS gross_profit,
      COALESCE(sum(t.alloc_profit), 0) AS net_profit
    FROM public.transactions AS t
    WHERE t.order_date BETWEEN p_start_date AND p_end_date
      AND t.status <> 'void'
    GROUP BY t.order_date
  ), daily_rows AS (
    SELECT d.report_date,
      COALESCE(s.order_count, 0) AS order_count,
      COALESCE(s.revenue, 0) AS revenue,
      COALESCE(s.total_cost, 0) AS total_cost,
      COALESCE(s.gross_profit, 0) AS gross_profit,
      COALESCE(s.net_profit, 0) AS net_profit
    FROM days AS d
    LEFT JOIN daily_sales AS s USING (report_date)
  ), ranked AS (
    SELECT r.*,
      row_number() OVER (ORDER BY
        CASE WHEN p_sort_key = 'date' AND p_sort_direction = 'asc' THEN r.report_date END ASC,
        CASE WHEN p_sort_key = 'orders' AND p_sort_direction = 'asc' THEN r.order_count END ASC,
        CASE WHEN p_sort_key = 'revenue' AND p_sort_direction = 'asc' THEN r.revenue END ASC,
        CASE WHEN p_sort_key = 'cost' AND p_sort_direction = 'asc' THEN r.total_cost END ASC,
        CASE WHEN p_sort_key = 'gross_profit' AND p_sort_direction = 'asc' THEN r.gross_profit END ASC,
        CASE WHEN p_sort_key = 'net_profit' AND p_sort_direction = 'asc' THEN r.net_profit END ASC,
        CASE WHEN p_sort_key = 'date' AND p_sort_direction = 'desc' THEN r.report_date END DESC,
        CASE WHEN p_sort_key = 'orders' AND p_sort_direction = 'desc' THEN r.order_count END DESC,
        CASE WHEN p_sort_key = 'revenue' AND p_sort_direction = 'desc' THEN r.revenue END DESC,
        CASE WHEN p_sort_key = 'cost' AND p_sort_direction = 'desc' THEN r.total_cost END DESC,
        CASE WHEN p_sort_key = 'gross_profit' AND p_sort_direction = 'desc' THEN r.gross_profit END DESC,
        CASE WHEN p_sort_key = 'net_profit' AND p_sort_direction = 'desc' THEN r.net_profit END DESC,
        r.report_date DESC
      ) AS sort_order
    FROM daily_rows AS r
  ), page_rows AS (
    SELECT * FROM ranked
    WHERE sort_order > (p_page::bigint - 1) * p_page_size
      AND sort_order <= p_page::bigint * p_page_size
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'report_date', p.report_date,
      'order_count', p.order_count,
      'revenue', p.revenue,
      'total_cost', p.total_cost,
      'gross_profit', p.gross_profit,
      'net_profit', p.net_profit
    ) ORDER BY p.sort_order) FROM page_rows AS p), '[]'::jsonb),
    (SELECT count(*) FROM daily_rows)
  INTO v_rows, v_count;

  RETURN jsonb_build_object('rows', v_rows, 'count', v_count, 'page', p_page, 'page_size', p_page_size);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_menu_performance(
  p_start_date date,
  p_end_date date,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_sort_key text DEFAULT 'name',
  p_sort_direction text DEFAULT 'asc'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows jsonb;
  v_count bigint;
  v_total_portions bigint;
  v_total_base bigint;
  v_total_options bigint;
  v_total_revenue bigint;
  v_total_gross_profit bigint;
BEGIN
  IF (SELECT public.current_user_role()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date
    OR p_page IS NULL OR p_page < 1
    OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 50
    OR p_sort_key NOT IN ('name', 'portions', 'base_sales', 'option_sales', 'revenue', 'gross_profit')
    OR p_sort_direction NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Invalid performance filters' USING ERRCODE = '22023';
  END IF;

  WITH sold AS (
    SELECT o.menu_id,
      sum(o.quantity)::bigint AS portions,
      sum(o.price::bigint * o.quantity)::bigint AS base_sales,
      sum(o.modifier_price::bigint * o.quantity)::bigint AS option_sales,
      sum(o.subtotal)::bigint AS revenue,
      sum(o.subtotal::bigint - (o.cost_price::bigint + o.modifier_cost::bigint) * o.quantity)::bigint AS gross_profit
    FROM public.orders AS o
    JOIN public.transactions AS t ON t.transaction_id = o.transaction_id
    WHERE t.order_date BETWEEN p_start_date AND p_end_date
      AND t.status <> 'void'
    GROUP BY o.menu_id
  ), modifier_revenue AS (
    SELECT o.menu_id, oi.modifier_name,
      sum(oi.price::bigint * o.quantity)::bigint AS revenue
    FROM public.orders AS o
    JOIN public.transactions AS t ON t.transaction_id = o.transaction_id
    JOIN public.order_item_modifiers AS oi ON oi.order_id = o.order_id
    WHERE t.order_date BETWEEN p_start_date AND p_end_date
      AND t.status <> 'void'
    GROUP BY o.menu_id, oi.modifier_name
  ), top_modifiers AS (
    SELECT mr.menu_id, mr.modifier_name, mr.revenue,
      row_number() OVER (PARTITION BY mr.menu_id ORDER BY mr.revenue DESC, mr.modifier_name ASC) AS rank
    FROM modifier_revenue AS mr
    WHERE mr.revenue > 0
  ), menu_rows AS (
    SELECT m.menu_id, m.name, m.category,
      s.portions, s.base_sales, s.option_sales, s.revenue, s.gross_profit,
      CASE WHEN s.revenue = 0 THEN 0 ELSE round(s.gross_profit * 100.0 / s.revenue, 1) END AS margin_pct,
      tm.modifier_name AS top_modifier_name,
      COALESCE(tm.revenue, 0) AS top_modifier_revenue
    FROM sold AS s
    JOIN public.menu AS m ON m.menu_id = s.menu_id
    LEFT JOIN top_modifiers AS tm ON tm.menu_id = s.menu_id AND tm.rank = 1
  ), ranked AS (
    SELECT mr.*,
      row_number() OVER (ORDER BY
        CASE WHEN p_sort_key = 'name' AND p_sort_direction = 'asc' THEN mr.name END ASC,
        CASE WHEN p_sort_key = 'portions' AND p_sort_direction = 'asc' THEN mr.portions END ASC,
        CASE WHEN p_sort_key = 'base_sales' AND p_sort_direction = 'asc' THEN mr.base_sales END ASC,
        CASE WHEN p_sort_key = 'option_sales' AND p_sort_direction = 'asc' THEN mr.option_sales END ASC,
        CASE WHEN p_sort_key = 'revenue' AND p_sort_direction = 'asc' THEN mr.revenue END ASC,
        CASE WHEN p_sort_key = 'gross_profit' AND p_sort_direction = 'asc' THEN mr.gross_profit END ASC,
        CASE WHEN p_sort_key = 'name' AND p_sort_direction = 'desc' THEN mr.name END DESC,
        CASE WHEN p_sort_key = 'portions' AND p_sort_direction = 'desc' THEN mr.portions END DESC,
        CASE WHEN p_sort_key = 'base_sales' AND p_sort_direction = 'desc' THEN mr.base_sales END DESC,
        CASE WHEN p_sort_key = 'option_sales' AND p_sort_direction = 'desc' THEN mr.option_sales END DESC,
        CASE WHEN p_sort_key = 'revenue' AND p_sort_direction = 'desc' THEN mr.revenue END DESC,
        CASE WHEN p_sort_key = 'gross_profit' AND p_sort_direction = 'desc' THEN mr.gross_profit END DESC,
        mr.menu_id ASC
      ) AS sort_order
    FROM menu_rows AS mr
  ), page_rows AS (
    SELECT * FROM ranked
    WHERE sort_order > (p_page::bigint - 1) * p_page_size
      AND sort_order <= p_page::bigint * p_page_size
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'menu_id', p.menu_id,
      'name', p.name,
      'category', p.category,
      'portions', p.portions,
      'base_sales', p.base_sales,
      'option_sales', p.option_sales,
      'revenue', p.revenue,
      'gross_profit', p.gross_profit,
      'margin_pct', p.margin_pct,
      'top_modifier_name', p.top_modifier_name,
      'top_modifier_revenue', p.top_modifier_revenue
    ) ORDER BY p.sort_order) FROM page_rows AS p), '[]'::jsonb),
    (SELECT count(*) FROM menu_rows),
    COALESCE((SELECT sum(mr.portions) FROM menu_rows AS mr), 0),
    COALESCE((SELECT sum(mr.base_sales) FROM menu_rows AS mr), 0),
    COALESCE((SELECT sum(mr.option_sales) FROM menu_rows AS mr), 0),
    COALESCE((SELECT sum(mr.revenue) FROM menu_rows AS mr), 0),
    COALESCE((SELECT sum(mr.gross_profit) FROM menu_rows AS mr), 0)
  INTO v_rows, v_count, v_total_portions, v_total_base, v_total_options, v_total_revenue, v_total_gross_profit;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'count', v_count,
    'page', p_page,
    'page_size', p_page_size,
    'totals', jsonb_build_object(
      'portions', v_total_portions,
      'base_sales', v_total_base,
      'option_sales', v_total_options,
      'revenue', v_total_revenue,
      'gross_profit', v_total_gross_profit,
      'base_share_pct', CASE WHEN v_total_revenue = 0 THEN 0 ELSE round(v_total_base * 100.0 / v_total_revenue, 1) END,
      'option_share_pct', CASE WHEN v_total_revenue = 0 THEN 0 ELSE round(v_total_options * 100.0 / v_total_revenue, 1) END,
      'margin_pct', CASE WHEN v_total_revenue = 0 THEN 0 ELSE round(v_total_gross_profit * 100.0 / v_total_revenue, 1) END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sales_report_summary(date, date) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.admin_sales_report_daily(date, date, integer, integer, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.admin_menu_performance(date, date, integer, integer, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_sales_report_summary(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sales_report_daily(date, date, integer, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_menu_performance(date, date, integer, integer, text, text) TO authenticated;

COMMIT;
