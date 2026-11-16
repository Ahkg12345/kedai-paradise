BEGIN;

CREATE OR REPLACE FUNCTION public.get_checkout_meta()
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
  v_next_order_no bigint;
  v_queue_count bigint;
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

  SELECT COALESCE(pg_catalog.max(t.order_no)::bigint, 0) + 1
    INTO v_next_order_no
    FROM public.transactions AS t
    WHERE t.order_date = v_order_date;

  SELECT pg_catalog.count(*)
    INTO v_queue_count
    FROM public.transactions AS t
    WHERE t.order_date = v_order_date AND t.status = 'processing';

  RETURN pg_catalog.jsonb_build_object(
    'order_date', v_order_date,
    'next_order_no', v_next_order_no,
    'queue_count', v_queue_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_order(p_transaction_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_user_id integer;
  v_transaction public.transactions%ROWTYPE;
  v_completed_at timestamptz;
  v_duration_seconds integer;
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

  IF p_transaction_id IS NULL OR p_transaction_id <= 0 THEN
    RAISE EXCEPTION 'Invalid transaction id' USING ERRCODE = '22023';
  END IF;

  SELECT t.*
    INTO v_transaction
    FROM public.transactions AS t
    WHERE t.transaction_id = p_transaction_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_transaction.status = 'completed' THEN
    RETURN pg_catalog.jsonb_build_object(
      'transaction_id', v_transaction.transaction_id,
      'status', v_transaction.status::text,
      'completed_at', v_transaction.completed_at,
      'duration_seconds', v_transaction.duration_seconds,
      'already_completed', true
    );
  END IF;

  IF v_transaction.status <> 'processing' THEN
    RAISE EXCEPTION 'Only processing orders can be completed' USING ERRCODE = '22023';
  END IF;

  v_completed_at := pg_catalog.clock_timestamp();
  v_duration_seconds := GREATEST(
    0,
    pg_catalog.floor(pg_catalog.date_part('epoch', v_completed_at - v_transaction.date))::integer
  );

  UPDATE public.transactions AS t
    SET status = 'completed',
        completed_at = v_completed_at,
        duration_seconds = v_duration_seconds
    WHERE t.transaction_id = p_transaction_id;

  RETURN pg_catalog.jsonb_build_object(
    'transaction_id', p_transaction_id,
    'status', 'completed',
    'completed_at', v_completed_at,
    'duration_seconds', v_duration_seconds,
    'already_completed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_checkout_token() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_checkout(uuid, text, text, integer, jsonb) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_checkout_meta() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_order_receipt(integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.complete_order(integer) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.get_checkout_token() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_checkout(uuid, text, text, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_checkout_meta() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_receipt(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order(integer) TO authenticated;

COMMIT;
