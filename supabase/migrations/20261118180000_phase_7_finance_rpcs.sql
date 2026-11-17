BEGIN;

CREATE INDEX IF NOT EXISTS finance_date_id_idx ON public.finance (date DESC, finance_id DESC);

CREATE OR REPLACE FUNCTION public.admin_finance_list(
  p_start_date date,
  p_end_date date,
  p_type text DEFAULT 'all',
  p_pool text DEFAULT 'all',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
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
  v_rows jsonb;
  v_count bigint;
  v_expense bigint;
  v_income bigint;
  v_categories jsonb;
BEGIN
  IF (SELECT public.current_user_role()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date
    OR p_type NOT IN ('all', 'income', 'expense')
    OR p_pool NOT IN ('all', 'restock', 'operating', 'profit')
    OR p_page IS NULL OR p_page < 1
    OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 50 THEN
    RAISE EXCEPTION 'Invalid finance filters' USING ERRCODE = '22023';
  END IF;

  v_start := p_start_date::timestamp without time zone AT TIME ZONE 'Asia/Jakarta';
  v_end := (p_end_date + 1)::timestamp without time zone AT TIME ZONE 'Asia/Jakarta';

  WITH filtered AS MATERIALIZED (
    SELECT f.finance_id, f.date, f.type::text AS type, f.category, f.pool::text AS pool,
           f.amount, f.description, f.user_id, u.username
    FROM public.finance AS f
    JOIN public.users AS u ON u.user_id = f.user_id
    WHERE f.date >= v_start AND f.date < v_end
      AND (p_type = 'all' OR f.type::text = p_type)
      AND (p_pool = 'all' OR f.pool::text = p_pool)
  ), page_rows AS (
    SELECT * FROM filtered
    ORDER BY date DESC, finance_id DESC
    OFFSET ((p_page - 1) * p_page_size)
    LIMIT p_page_size
  )
  SELECT
    COALESCE((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY date DESC, finance_id DESC) FROM page_rows), '[]'::jsonb),
    (SELECT count(*) FROM filtered),
    COALESCE((SELECT sum(amount) FROM filtered WHERE type = 'expense'), 0),
    COALESCE((SELECT sum(amount) FROM filtered WHERE type = 'income'), 0)
  INTO v_rows, v_count, v_expense, v_income;

  SELECT COALESCE(jsonb_agg(category ORDER BY category), '[]'::jsonb)
  INTO v_categories
  FROM (SELECT DISTINCT category FROM public.finance ORDER BY category) AS category_options;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'count', v_count,
    'total_expense', v_expense,
    'total_income', v_income,
    'net', v_income - v_expense,
    'categories', v_categories
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_finance_create(
  p_date timestamptz,
  p_type public.finance_type,
  p_category text,
  p_pool public.finance_pool,
  p_amount integer,
  p_description text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id integer;
  v_finance_id integer;
  v_category text := btrim(COALESCE(p_category, ''));
  v_description text := NULLIF(btrim(COALESCE(p_description, '')), '');
BEGIN
  IF (SELECT public.current_user_role()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_date IS NULL OR p_date > pg_catalog.now()
    OR p_type IS NULL OR p_pool IS NULL
    OR char_length(v_category) NOT BETWEEN 1 AND 100
    OR p_amount IS NULL OR p_amount <= 0
    OR char_length(COALESCE(v_description, '')) > 200 THEN
    RAISE EXCEPTION 'Invalid finance fields' USING ERRCODE = '22023';
  END IF;

  SELECT u.user_id INTO v_user_id
  FROM public.users AS u
  WHERE u.auth_id = auth.uid() AND u.status = true;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.finance (date, type, category, pool, amount, description, user_id)
  VALUES (p_date, p_type, v_category, p_pool, p_amount, v_description, v_user_id)
  RETURNING finance_id INTO v_finance_id;

  RETURN v_finance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_finance_update(
  p_finance_id integer,
  p_date timestamptz,
  p_type public.finance_type,
  p_category text,
  p_pool public.finance_pool,
  p_amount integer,
  p_description text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_finance_id integer;
  v_category text := btrim(COALESCE(p_category, ''));
  v_description text := NULLIF(btrim(COALESCE(p_description, '')), '');
BEGIN
  IF (SELECT public.current_user_role()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_finance_id IS NULL OR p_date IS NULL OR p_date > pg_catalog.now()
    OR p_type IS NULL OR p_pool IS NULL
    OR char_length(v_category) NOT BETWEEN 1 AND 100
    OR p_amount IS NULL OR p_amount <= 0
    OR char_length(COALESCE(v_description, '')) > 200 THEN
    RAISE EXCEPTION 'Invalid finance fields' USING ERRCODE = '22023';
  END IF;

  UPDATE public.finance AS f
  SET date = p_date, type = p_type, category = v_category, pool = p_pool,
      amount = p_amount, description = v_description
  WHERE f.finance_id = p_finance_id
  RETURNING f.finance_id INTO v_finance_id;

  IF v_finance_id IS NULL THEN
    RAISE EXCEPTION 'Finance record not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_finance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_finance_delete(p_finance_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT public.current_user_role()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_finance_id IS NULL THEN
    RAISE EXCEPTION 'Invalid finance id' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.finance AS f WHERE f.finance_id = p_finance_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance record not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_finance_list(date, date, text, text, integer, integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.admin_finance_create(timestamptz, public.finance_type, text, public.finance_pool, integer, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.admin_finance_update(integer, timestamptz, public.finance_type, text, public.finance_pool, integer, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.admin_finance_delete(integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_finance_list(date, date, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finance_create(timestamptz, public.finance_type, text, public.finance_pool, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finance_update(integer, timestamptz, public.finance_type, text, public.finance_pool, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finance_delete(integer) TO authenticated;

COMMIT;
