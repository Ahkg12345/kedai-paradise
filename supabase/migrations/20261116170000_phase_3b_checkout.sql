BEGIN;

CREATE OR REPLACE FUNCTION public.get_checkout_token()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id integer;
  v_token uuid;
BEGIN
  IF COALESCE((SELECT public.current_user_role()), '') NOT IN ('admin', 'cashier') THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT u.user_id
    INTO v_user_id
    FROM public.users AS u
    WHERE u.auth_id = auth.uid() AND u.status = true;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active staff account required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.checkout_tokens (user_id)
  VALUES (v_user_id)
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_checkout(
  p_token uuid,
  p_table_no text,
  p_method text,
  p_paid integer,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_user_id integer;
  v_token public.checkout_tokens%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_order_date date;
  v_order_no integer;
  v_transaction_id integer;
  v_table_count integer;
  v_method public.payment_method;
  v_paid integer;
  v_change integer;
  v_operating_percent numeric(5, 2);
  v_line jsonb;
  v_menu public.menu%ROWTYPE;
  v_menu_id integer;
  v_quantity integer;
  v_product_quantity integer;
  v_total_quantity integer := 0;
  v_menu_quantities jsonb := '{}'::jsonb;
  v_modifier_ids integer[];
  v_modifier_count integer;
  v_valid_modifier_count integer;
  v_modifier_price bigint;
  v_modifier_cost bigint;
  v_modifier_snapshots jsonb;
  v_line_subtotal bigint;
  v_line_cost bigint;
  v_total bigint := 0;
  v_total_cost bigint := 0;
  v_gross_profit bigint;
  v_alloc_operating bigint;
  v_alloc_profit bigint;
  v_cart jsonb := '[]'::jsonb;
  v_order_id integer;
  v_max_integer constant bigint := 2147483647;
BEGIN
  v_role := public.current_user_role();
  IF COALESCE(v_role, '') NOT IN ('admin', 'cashier') THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT u.user_id
    INTO v_user_id
    FROM public.users AS u
    WHERE u.auth_id = auth.uid() AND u.status = true;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active staff account required' USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL OR p_method IS NULL OR p_method NOT IN ('cash', 'qris') OR p_table_no IS NULL THEN
    RAISE EXCEPTION 'Invalid checkout parameters' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Checkout items must be an array' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_array_length(p_items) < 1 OR pg_catalog.jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'Checkout must contain between 1 and 100 item lines' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_token
    FROM public.checkout_tokens AS ct
    WHERE ct.token = p_token AND ct.user_id = v_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout token is invalid' USING ERRCODE = '22023';
  END IF;

  IF v_token.used_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'transaction_id', v_token.transaction_id,
      'order_no', (SELECT t.order_no FROM public.transactions AS t WHERE t.transaction_id = v_token.transaction_id),
      'already_processed', true
    );
  END IF;

  IF p_table_no = 'TA' THEN
    NULL;
  ELSIF p_table_no !~ '^[1-9][0-9]{0,5}$' THEN
    RAISE EXCEPTION 'Invalid table number' USING ERRCODE = '22023';
  END IF;

  SELECT s.table_count, s.operating_percent
    INTO v_table_count, v_operating_percent
    FROM public.settings AS s
    WHERE s.settings_id = 1
    FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store settings are unavailable' USING ERRCODE = 'P0002';
  END IF;
  IF p_table_no <> 'TA' AND p_table_no::integer > v_table_count THEN
    RAISE EXCEPTION 'Invalid table number' USING ERRCODE = '22023';
  END IF;

  v_method := p_method::public.payment_method;

  FOR v_line IN
    SELECT item.value
    FROM pg_catalog.jsonb_array_elements(p_items) AS item(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_line) IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(v_line -> 'menu_id') IS DISTINCT FROM 'number'
      OR (v_line ->> 'menu_id') !~ '^[1-9][0-9]{0,8}$'
      OR pg_catalog.jsonb_typeof(v_line -> 'quantity') IS DISTINCT FROM 'number'
      OR (v_line ->> 'quantity') !~ '^[1-9][0-9]{0,5}$'
      OR pg_catalog.jsonb_typeof(v_line -> 'modifier_ids') IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION 'Invalid checkout item' USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_array_length(v_line -> 'modifier_ids') > 50 THEN
      RAISE EXCEPTION 'Too many modifiers selected' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(v_line -> 'modifier_ids') AS selected(value)
      WHERE pg_catalog.jsonb_typeof(selected.value) IS DISTINCT FROM 'number'
        OR selected.value::text !~ '^[1-9][0-9]{0,8}$'
    ) THEN
      RAISE EXCEPTION 'Invalid modifier selection' USING ERRCODE = '22023';
    END IF;
    IF v_line ? 'note' AND pg_catalog.jsonb_typeof(v_line -> 'note') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'Invalid order note' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(v_line ->> 'note', ''))) > 50 THEN
      RAISE EXCEPTION 'Order note is too long' USING ERRCODE = '22023';
    END IF;

    v_menu_id := (v_line ->> 'menu_id')::integer;
    v_quantity := (v_line ->> 'quantity')::integer;
    v_total_quantity := v_total_quantity + v_quantity;
    IF v_total_quantity > 999 THEN
      RAISE EXCEPTION 'Order quantity exceeds the allowed limit' USING ERRCODE = '22023';
    END IF;

    v_product_quantity := COALESCE((v_menu_quantities ->> v_menu_id::text)::integer, 0) + v_quantity;
    IF v_product_quantity > 999 THEN
      RAISE EXCEPTION 'Item quantity exceeds the allowed limit' USING ERRCODE = '22023';
    END IF;
    v_menu_quantities := pg_catalog.jsonb_set(
      v_menu_quantities,
      ARRAY[v_menu_id::text],
      pg_catalog.to_jsonb(v_product_quantity),
      true
    );

    SELECT m.*
      INTO v_menu
      FROM public.menu AS m
      WHERE m.menu_id = v_menu_id AND m.status = true AND m.available = true
      FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A menu item is unavailable' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(pg_catalog.array_agg((selected.value::text)::integer), ARRAY[]::integer[])
      INTO v_modifier_ids
      FROM pg_catalog.jsonb_array_elements(v_line -> 'modifier_ids') AS selected(value);

    SELECT pg_catalog.count(DISTINCT selected.modifier_id)
      INTO v_modifier_count
      FROM pg_catalog.unnest(v_modifier_ids) AS selected(modifier_id);
    IF v_modifier_count <> pg_catalog.cardinality(v_modifier_ids) THEN
      RAISE EXCEPTION 'A modifier may only be selected once' USING ERRCODE = '22023';
    END IF;

    PERFORM g.group_id
      FROM public.menu_modifier_groups AS g
      WHERE g.menu_id = v_menu_id
      ORDER BY g.group_id
      FOR SHARE;

    PERFORM i.modifier_id
      FROM public.menu_modifier_items AS i
      WHERE i.modifier_id = ANY(v_modifier_ids)
      ORDER BY i.modifier_id
      FOR SHARE;

    SELECT pg_catalog.count(*)
      INTO v_valid_modifier_count
      FROM pg_catalog.unnest(v_modifier_ids) AS selected(modifier_id)
      JOIN public.menu_modifier_items AS i ON i.modifier_id = selected.modifier_id
      JOIN public.menu_modifier_groups AS g ON g.group_id = i.group_id
      WHERE g.menu_id = v_menu_id AND i.available = true;
    IF v_valid_modifier_count <> pg_catalog.cardinality(v_modifier_ids) THEN
      RAISE EXCEPTION 'A selected modifier is unavailable or invalid' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.menu_modifier_groups AS g
      WHERE g.menu_id = v_menu_id
        AND (
          (g.is_required AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.unnest(v_modifier_ids) AS selected(modifier_id)
            JOIN public.menu_modifier_items AS i ON i.modifier_id = selected.modifier_id
            WHERE i.group_id = g.group_id
          ))
          OR (g.type = 'single' AND (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.unnest(v_modifier_ids) AS selected(modifier_id)
            JOIN public.menu_modifier_items AS i ON i.modifier_id = selected.modifier_id
            WHERE i.group_id = g.group_id
          ) > 1)
        )
    ) THEN
      RAISE EXCEPTION 'Modifier group requirements are not satisfied' USING ERRCODE = '22023';
    END IF;

    SELECT
      COALESCE(pg_catalog.sum(i.extra_price), 0)::bigint,
      COALESCE(pg_catalog.sum(i.extra_cost), 0)::bigint,
      COALESCE(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('name', i.name, 'price', i.extra_price, 'cost_price', i.extra_cost)
          ORDER BY i.modifier_id
        ),
        '[]'::jsonb
      )
      INTO v_modifier_price, v_modifier_cost, v_modifier_snapshots
      FROM pg_catalog.unnest(v_modifier_ids) AS selected(modifier_id)
      JOIN public.menu_modifier_items AS i ON i.modifier_id = selected.modifier_id
      JOIN public.menu_modifier_groups AS g ON g.group_id = i.group_id
      WHERE g.menu_id = v_menu_id;

    v_line_subtotal := (v_menu.price::bigint + v_modifier_price) * v_quantity;
    v_line_cost := (v_menu.cost_price::bigint + v_modifier_cost) * v_quantity;
    IF v_line_subtotal > v_max_integer OR v_line_cost > v_max_integer THEN
      RAISE EXCEPTION 'Order item total exceeds the allowed range' USING ERRCODE = '22023';
    END IF;

    v_total := v_total + v_line_subtotal;
    v_total_cost := v_total_cost + v_line_cost;
    IF v_total > v_max_integer OR v_total_cost > v_max_integer THEN
      RAISE EXCEPTION 'Order total exceeds the allowed range' USING ERRCODE = '22023';
    END IF;

    v_cart := v_cart || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'menu_id', v_menu.menu_id,
      'quantity', v_quantity,
      'price', v_menu.price,
      'cost_price', v_menu.cost_price,
      'modifier_price', v_modifier_price,
      'modifier_cost', v_modifier_cost,
      'subtotal', v_line_subtotal,
      'note', NULLIF(pg_catalog.btrim(COALESCE(v_line ->> 'note', '')), ''),
      'modifiers', v_modifier_snapshots
    ));
  END LOOP;

  IF p_method = 'cash' THEN
    IF p_paid IS NULL OR p_paid < v_total THEN
      RAISE EXCEPTION 'Cash received must cover the order total' USING ERRCODE = '22023';
    END IF;
    v_paid := p_paid;
    v_change := (p_paid::bigint - v_total)::integer;
  ELSE
    v_paid := v_total::integer;
    v_change := 0;
  END IF;

  v_gross_profit := v_total - v_total_cost;
  v_alloc_operating := pg_catalog.round((v_operating_percent::numeric / 100) * v_gross_profit);
  v_alloc_profit := v_gross_profit - v_alloc_operating;
  IF v_gross_profit < -v_max_integer OR v_gross_profit > v_max_integer THEN
    RAISE EXCEPTION 'Order profit exceeds the allowed range' USING ERRCODE = '22023';
  END IF;

  v_order_date := pg_catalog.timezone('Asia/Jakarta', v_now)::date;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kedai-paradise-order:' || v_order_date::text, 0));

  SELECT COALESCE(pg_catalog.max(t.order_no), 0) + 1
    INTO v_order_no
    FROM public.transactions AS t
    WHERE t.order_date = v_order_date;

  IF v_order_no > v_max_integer THEN
    RAISE EXCEPTION 'Daily order number exceeds the allowed range' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.transactions (
    order_no, date, order_date, table_no, method, total, paid, change_due, status,
    total_cost, gross_profit, alloc_restock, alloc_operating, alloc_profit, user_id
  ) VALUES (
    v_order_no, v_now, v_order_date, p_table_no, v_method, v_total::integer, v_paid, v_change, 'processing',
    v_total_cost::integer, v_gross_profit::integer, v_total_cost::integer,
    v_alloc_operating::integer, v_alloc_profit::integer, v_user_id
  ) RETURNING transaction_id INTO v_transaction_id;

  FOR v_line IN
    SELECT item.value
    FROM pg_catalog.jsonb_array_elements(v_cart) AS item(value)
  LOOP
    INSERT INTO public.orders (
      transaction_id, menu_id, quantity, price, cost_price, modifier_price, modifier_cost, subtotal, note
    ) VALUES (
      v_transaction_id,
      (v_line ->> 'menu_id')::integer,
      (v_line ->> 'quantity')::integer,
      (v_line ->> 'price')::integer,
      (v_line ->> 'cost_price')::integer,
      (v_line ->> 'modifier_price')::integer,
      (v_line ->> 'modifier_cost')::integer,
      (v_line ->> 'subtotal')::integer,
      v_line ->> 'note'
    ) RETURNING order_id INTO v_order_id;

    INSERT INTO public.order_item_modifiers (order_id, modifier_name, price, cost_price)
    SELECT
      v_order_id,
      modifier.value ->> 'name',
      (modifier.value ->> 'price')::integer,
      (modifier.value ->> 'cost_price')::integer
    FROM pg_catalog.jsonb_array_elements(v_line -> 'modifiers') AS modifier(value);
  END LOOP;

  UPDATE public.checkout_tokens AS ct
    SET used_at = v_now, transaction_id = v_transaction_id
    WHERE ct.token = p_token AND ct.user_id = v_user_id;

  RETURN pg_catalog.jsonb_build_object(
    'transaction_id', v_transaction_id,
    'order_no', v_order_no,
    'already_processed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_order_receipt(p_transaction_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_transaction jsonb;
  v_orders jsonb;
  v_settings jsonb;
BEGIN
  v_role := public.current_user_role();
  IF COALESCE(v_role, '') NOT IN ('admin', 'cashier') THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_transaction_id IS NULL OR p_transaction_id <= 0 THEN
    RAISE EXCEPTION 'Invalid transaction id' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
      'transaction_id', t.transaction_id,
      'order_no', t.order_no,
      'date', t.date,
      'table_no', t.table_no,
      'method', t.method::text,
      'total', t.total,
      'paid', t.paid,
      'change_due', t.change_due,
      'status', t.status::text,
      'username', pg_catalog.initcap(u.username)
    )
    INTO v_transaction
    FROM public.transactions AS t
    JOIN public.users AS u ON u.user_id = t.user_id
    WHERE t.transaction_id = p_transaction_id
      AND (v_role = 'admin' OR t.order_date = pg_catalog.timezone('Asia/Jakarta', now())::date);

  IF v_transaction IS NULL THEN
    RAISE EXCEPTION 'Receipt not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'order_id', o.order_id,
          'quantity', o.quantity,
          'name', m.name,
          'price', o.price,
          'modifier_price', o.modifier_price,
          'subtotal', o.subtotal,
          'modifiers', COALESCE((
            SELECT pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object('name', m2.modifier_name, 'price', m2.price)
              ORDER BY m2.order_modifier_id
            )
            FROM public.order_item_modifiers AS m2
            WHERE m2.order_id = o.order_id
          ), '[]'::jsonb)
        ) ORDER BY o.order_id
      ),
      '[]'::jsonb
    )
    INTO v_orders
    FROM public.orders AS o
    JOIN public.menu AS m ON m.menu_id = o.menu_id
    WHERE o.transaction_id = p_transaction_id;

  SELECT pg_catalog.jsonb_build_object(
      'business_name', s.business_name,
      'business_address', s.business_address,
      'receipt_footer', s.receipt_footer
    )
    INTO v_settings
    FROM public.settings AS s
    WHERE s.settings_id = 1;

  RETURN pg_catalog.jsonb_build_object(
    'transaction', v_transaction,
    'orders', v_orders,
    'settings', v_settings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_checkout_token() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_checkout(uuid, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_order_receipt(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_checkout_token() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_checkout(uuid, text, text, integer, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_order_receipt(integer) TO authenticated, service_role;

COMMIT;
