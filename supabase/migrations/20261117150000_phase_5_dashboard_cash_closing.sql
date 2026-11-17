BEGIN;

CREATE INDEX IF NOT EXISTS transactions_dashboard_date_method_status_idx
  ON public.transactions (order_date, method, status);

CREATE OR REPLACE FUNCTION public.get_cashier_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := pg_catalog.timezone('Asia/Jakarta', pg_catalog.now())::date;
  v_user_id integer;
  v_total_orders integer;
  v_processing_orders integer;
BEGIN
  IF COALESCE(public.current_user_role(), '') <> 'cashier' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT u.user_id INTO v_user_id
  FROM public.users AS u
  WHERE u.auth_id = auth.uid() AND u.status = true;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active staff account required' USING ERRCODE = '42501';
  END IF;

  SELECT
    count(*) FILTER (WHERE t.status <> 'void')::integer,
    count(*) FILTER (WHERE t.status = 'processing')::integer
  INTO v_total_orders, v_processing_orders
  FROM public.transactions AS t
  WHERE t.order_date = v_today;

  RETURN pg_catalog.jsonb_build_object(
    'date', v_today,
    'total_orders', COALESCE(v_total_orders, 0),
    'processing_orders', COALESCE(v_processing_orders, 0)
  );
END;
$$;

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
    pg_catalog.jsonb_build_object('date', d.order_date, 'revenue', COALESCE(s.revenue, 0))
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

CREATE OR REPLACE FUNCTION public.get_cash_closing_preview(p_closing_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id integer;
  v_today date := pg_catalog.timezone('Asia/Jakarta', pg_catalog.now())::date;
  v_cash_sales integer;
  v_qris_sales integer;
  v_void_count integer;
  v_void_value integer;
  v_processing_count integer;
  v_closing jsonb;
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
  IF p_closing_date IS NULL OR p_closing_date > v_today THEN
    RAISE EXCEPTION 'Tanggal tutup kasir tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT
    COALESCE(sum(t.total) FILTER (WHERE t.status <> 'void' AND t.method = 'cash'), 0)::integer,
    COALESCE(sum(t.total) FILTER (WHERE t.status <> 'void' AND t.method = 'qris'), 0)::integer,
    count(*) FILTER (WHERE t.status = 'void')::integer,
    COALESCE(sum(t.total) FILTER (WHERE t.status = 'void'), 0)::integer,
    count(*) FILTER (WHERE t.status = 'processing')::integer
  INTO v_cash_sales, v_qris_sales, v_void_count, v_void_value, v_processing_count
  FROM public.transactions AS t
  WHERE t.order_date = p_closing_date;

  SELECT pg_catalog.jsonb_build_object(
    'closing_id', c.closing_id,
    'opening_cash', c.opening_cash,
    'cash_out', c.cash_out,
    'counted_cash', c.counted_cash,
    'note', c.note,
    'created_at', c.created_at,
    'stale', c.cash_sales <> COALESCE(v_cash_sales, 0)
  ) INTO v_closing
  FROM public.cash_closings AS c
  WHERE c.closing_date = p_closing_date;

  RETURN pg_catalog.jsonb_build_object(
    'closing_date', p_closing_date,
    'cash_sales', COALESCE(v_cash_sales, 0),
    'qris_sales', COALESCE(v_qris_sales, 0),
    'void_count', COALESCE(v_void_count, 0),
    'void_value', COALESCE(v_void_value, 0),
    'processing_count', COALESCE(v_processing_count, 0),
    'closing', v_closing
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_cash_closing(
  p_closing_date date,
  p_opening_cash integer,
  p_cash_out integer,
  p_counted_cash integer,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id integer;
  v_today date := pg_catalog.timezone('Asia/Jakarta', pg_catalog.now())::date;
  v_cash_sales integer;
  v_expected_cash integer;
  v_difference integer;
  v_note text := pg_catalog.btrim(COALESCE(p_note, ''));
  v_closing_id integer;
  v_created_at timestamptz;
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
  IF p_closing_date IS NULL OR p_closing_date > v_today THEN
    RAISE EXCEPTION 'Tanggal tutup kasir tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_opening_cash IS NULL OR p_cash_out IS NULL OR p_counted_cash IS NULL
     OR p_opening_cash < 0 OR p_cash_out < 0 OR p_counted_cash < 0 THEN
    RAISE EXCEPTION 'Nominal kas tidak boleh negatif' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(v_note) > 255 THEN
    RAISE EXCEPTION 'Catatan selisih maksimal 255 karakter' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(t.total) FILTER (WHERE t.status <> 'void' AND t.method = 'cash'), 0)::integer
  INTO v_cash_sales
  FROM public.transactions AS t
  WHERE t.order_date = p_closing_date;

  v_expected_cash := p_opening_cash + v_cash_sales - p_cash_out;
  IF v_expected_cash < 0 THEN
    RAISE EXCEPTION 'Kas seharusnya di laci tidak boleh negatif' USING ERRCODE = '22023';
  END IF;
  v_difference := p_counted_cash - v_expected_cash;
  IF v_difference <> 0 AND v_note = '' THEN
    RAISE EXCEPTION 'Catatan selisih wajib diisi' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.cash_closings (
    closing_date, user_id, opening_cash, cash_sales, cash_out, expected_cash,
    counted_cash, difference, note, created_at
  ) VALUES (
    p_closing_date, v_user_id, p_opening_cash, v_cash_sales, p_cash_out, v_expected_cash,
    p_counted_cash, v_difference, NULLIF(v_note, ''), pg_catalog.clock_timestamp()
  )
  ON CONFLICT (closing_date) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    opening_cash = EXCLUDED.opening_cash,
    cash_sales = EXCLUDED.cash_sales,
    cash_out = EXCLUDED.cash_out,
    expected_cash = EXCLUDED.expected_cash,
    counted_cash = EXCLUDED.counted_cash,
    difference = EXCLUDED.difference,
    note = EXCLUDED.note,
    created_at = EXCLUDED.created_at
  RETURNING closing_id, created_at INTO v_closing_id, v_created_at;

  RETURN pg_catalog.jsonb_build_object(
    'closing_id', v_closing_id,
    'closing_date', p_closing_date,
    'opening_cash', p_opening_cash,
    'cash_sales', v_cash_sales,
    'cash_out', p_cash_out,
    'expected_cash', v_expected_cash,
    'counted_cash', p_counted_cash,
    'difference', v_difference,
    'note', NULLIF(v_note, ''),
    'username', (SELECT u.username FROM public.users AS u WHERE u.user_id = v_user_id),
    'created_at', v_created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cash_closing_history()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := public.current_user_role();
  v_user_id integer;
  v_today date := pg_catalog.timezone('Asia/Jakarta', pg_catalog.now())::date;
  v_rows jsonb;
BEGIN
  IF COALESCE(v_role, '') NOT IN ('admin', 'cashier') THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT u.user_id INTO v_user_id
  FROM public.users AS u
  WHERE u.auth_id = auth.uid() AND u.status = true;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active staff account required' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'admin' THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'closing_id', x.closing_id,
        'closing_date', x.closing_date,
        'username', x.username,
        'opening_cash', x.opening_cash,
        'cash_sales', x.cash_sales,
        'cash_out', x.cash_out,
        'expected_cash', x.expected_cash,
        'counted_cash', x.counted_cash,
        'difference', x.difference,
        'note', x.note,
        'created_at', x.created_at,
        'stale', x.stale
      ) ORDER BY x.closing_date DESC, x.closing_id DESC
    ), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT
        c.closing_id, c.closing_date, u.username, c.opening_cash, c.cash_sales,
        c.cash_out, c.expected_cash, c.counted_cash, c.difference, c.note, c.created_at,
        c.cash_sales <> COALESCE((
          SELECT sum(t.total)::integer
          FROM public.transactions AS t
          WHERE t.order_date = c.closing_date AND t.method = 'cash' AND t.status <> 'void'
        ), 0) AS stale
      FROM public.cash_closings AS c
      JOIN public.users AS u ON u.user_id = c.user_id
      WHERE c.closing_date BETWEEN v_today - 29 AND v_today
      ORDER BY c.closing_date DESC, c.closing_id DESC
      LIMIT 30
    ) AS x;
  ELSE
    SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'closing_date', x.closing_date,
        'expected_cash', x.expected_cash,
        'counted_cash', x.counted_cash,
        'difference', x.difference,
        'stale', x.stale
      ) ORDER BY x.closing_date DESC, x.closing_id DESC
    ), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT
        c.closing_id, c.closing_date, c.expected_cash, c.counted_cash, c.difference,
        c.cash_sales <> COALESCE((
          SELECT sum(t.total)::integer
          FROM public.transactions AS t
          WHERE t.order_date = c.closing_date AND t.method = 'cash' AND t.status <> 'void'
        ), 0) AS stale
      FROM public.cash_closings AS c
      WHERE c.closing_date BETWEEN v_today - 29 AND v_today
      ORDER BY c.closing_date DESC, c.closing_id DESC
      LIMIT 30
    ) AS x;
  END IF;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cash_closing_report(p_closing_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id integer;
  v_report jsonb;
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
  IF p_closing_id IS NULL OR p_closing_id <= 0 THEN
    RAISE EXCEPTION 'Laporan tutup kasir tidak ditemukan' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'business_name', s.business_name,
    'closing_id', c.closing_id,
    'closing_date', c.closing_date,
    'opening_cash', c.opening_cash,
    'cash_sales', c.cash_sales,
    'cash_out', c.cash_out,
    'expected_cash', c.expected_cash,
    'counted_cash', c.counted_cash,
    'difference', c.difference,
    'note', c.note,
    'username', u.username,
    'printed_at', pg_catalog.now()
  ) INTO v_report
  FROM public.cash_closings AS c
  JOIN public.users AS u ON u.user_id = c.user_id
  CROSS JOIN public.settings AS s
  WHERE c.closing_id = p_closing_id AND s.settings_id = 1;

  IF v_report IS NULL THEN
    RAISE EXCEPTION 'Laporan tutup kasir tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cashier_dashboard() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_executive_dashboard() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_cash_closing_preview(date) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.save_cash_closing(date, integer, integer, integer, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_cash_closing_history() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_cash_closing_report(integer) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.get_cashier_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_executive_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_closing_preview(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_cash_closing(date, integer, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_closing_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_closing_report(integer) TO authenticated;

COMMIT;
