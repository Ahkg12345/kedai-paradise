BEGIN;

CREATE OR REPLACE FUNCTION public.admin_menu_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_categories jsonb;
BEGIN
  IF (SELECT public.current_user_role()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(category ORDER BY category), '[]'::jsonb)
  INTO v_categories
  FROM (SELECT DISTINCT m.category FROM public.menu AS m) AS categories;

  RETURN jsonb_build_object(
    'total_count', (SELECT count(*) FROM public.menu),
    'total_active', (SELECT count(*) FROM public.menu WHERE status = true),
    'avg_margin_pct', COALESCE((
      SELECT round(avg(CASE WHEN m.price = 0 THEN 0 ELSE (m.price - m.cost_price)::numeric * 100 / m.price END), 1)
      FROM public.menu AS m
      WHERE m.status = true
    ), 0),
    'critical_count', (SELECT count(*) FROM public.menu WHERE status = true AND available = false),
    'variant_count', (
      SELECT count(DISTINCT m.menu_id)
      FROM public.menu AS m
      JOIN public.menu_modifier_groups AS g ON g.menu_id = m.menu_id
      WHERE m.status = true
    ),
    'categories', v_categories,
    'deletable_menu_ids', COALESCE((
      SELECT jsonb_agg(m.menu_id ORDER BY m.menu_id)
      FROM public.menu AS m
      WHERE NOT EXISTS (SELECT 1 FROM public.orders AS o WHERE o.menu_id = m.menu_id)
    ), '[]'::jsonb)
  );
END;
$$;

COMMIT;
