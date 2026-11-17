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
    'categories', v_categories
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_menu(
  p_menu_id integer,
  p_name text,
  p_category text,
  p_price integer,
  p_cost_price integer,
  p_photo text,
  p_available boolean,
  p_status boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
  v_category text := btrim(COALESCE(p_category, ''));
  v_menu_id integer;
BEGIN
  IF (SELECT public.current_user_role()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF v_name = '' OR char_length(v_name) > 100
    OR v_category = '' OR char_length(v_category) > 30
    OR p_price IS NULL OR p_price < 0
    OR p_cost_price IS NULL OR p_cost_price < 0
    OR p_available IS NULL OR p_status IS NULL THEN
    RAISE EXCEPTION 'Invalid menu fields' USING ERRCODE = '22023';
  END IF;

  IF p_photo IS NOT NULL THEN
    IF char_length(p_photo) > 100 OR p_photo !~ '^menu/[A-Za-z0-9._-]+$'
      OR NOT EXISTS (SELECT 1 FROM storage.objects AS o WHERE o.bucket_id = 'menu' AND o.name = p_photo) THEN
      RAISE EXCEPTION 'Menu photo is invalid or has not been uploaded' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_menu_id IS NULL THEN
    INSERT INTO public.menu (name, category, price, cost_price, photo, available, status)
    VALUES (v_name, v_category, p_price, p_cost_price, p_photo, p_available, p_status)
    RETURNING menu_id INTO v_menu_id;
  ELSE
    UPDATE public.menu
    SET name = v_name,
        category = v_category,
        price = p_price,
        cost_price = p_cost_price,
        photo = p_photo,
        available = p_available,
        status = p_status
    WHERE menu_id = p_menu_id
    RETURNING menu_id INTO v_menu_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN v_menu_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_menu(p_menu_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT public.current_user_role()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_menu_id IS NULL OR p_menu_id <= 0 THEN
    RAISE EXCEPTION 'Invalid menu item' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.menu WHERE menu_id = p_menu_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE menu_id = p_menu_id) THEN
    RAISE EXCEPTION 'Menu yang pernah terjual tidak dapat dihapus. Nonaktifkan menu ini.' USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.menu WHERE menu_id = p_menu_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_menu_modifiers(p_menu_id integer, p_groups jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group jsonb;
  v_item jsonb;
  v_group_id integer;
  v_item_id integer;
  v_requested_group_ids integer[] := ARRAY[]::integer[];
  v_requested_item_ids integer[] := ARRAY[]::integer[];
  v_saved_item_ids integer[];
  v_duplicate boolean;
BEGIN
  IF (SELECT public.current_user_role()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_menu_id IS NULL OR p_menu_id <= 0 OR jsonb_typeof(p_groups) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_groups) > 5 THEN
    RAISE EXCEPTION 'Invalid modifier groups' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.menu WHERE menu_id = p_menu_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) <> count(DISTINCT value ->> 'id') INTO v_duplicate
  FROM jsonb_array_elements(p_groups)
  WHERE value ->> 'id' IS NOT NULL;
  IF v_duplicate THEN
    RAISE EXCEPTION 'Duplicate modifier group identifiers' USING ERRCODE = '22023';
  END IF;

  FOR v_group IN SELECT value FROM jsonb_array_elements(p_groups)
  LOOP
    IF jsonb_typeof(v_group) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_group -> 'name') IS DISTINCT FROM 'string'
      OR btrim(v_group ->> 'name') = '' OR char_length(btrim(v_group ->> 'name')) > 50
      OR v_group ->> 'type' NOT IN ('single', 'multiple')
      OR jsonb_typeof(v_group -> 'is_required') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(v_group -> 'items') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_group -> 'items') > 10 THEN
      RAISE EXCEPTION 'Invalid modifier group fields' USING ERRCODE = '22023';
    END IF;

    IF v_group ->> 'id' IS NOT NULL THEN
      IF jsonb_typeof(v_group -> 'id') IS DISTINCT FROM 'number' OR (v_group ->> 'id') !~ '^[1-9][0-9]*$' THEN
        RAISE EXCEPTION 'Invalid modifier group identifier' USING ERRCODE = '22023';
      END IF;
      v_group_id := (v_group ->> 'id')::integer;
      IF NOT EXISTS (
        SELECT 1 FROM public.menu_modifier_groups AS g
        WHERE g.group_id = v_group_id AND g.menu_id = p_menu_id
      ) THEN
        RAISE EXCEPTION 'Modifier group does not belong to this menu' USING ERRCODE = '22023';
      END IF;
      v_requested_group_ids := array_append(v_requested_group_ids, v_group_id);
    ELSIF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_group -> 'items') AS item(value)
      WHERE item.value ->> 'id' IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'A new modifier group cannot contain existing item identifiers' USING ERRCODE = '22023';
    END IF;

    SELECT count(*) <> count(DISTINCT item.value ->> 'id') INTO v_duplicate
    FROM jsonb_array_elements(v_group -> 'items') AS item(value)
    WHERE item.value ->> 'id' IS NOT NULL;
    IF v_duplicate THEN
      RAISE EXCEPTION 'Duplicate modifier item identifiers' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_group -> 'items')
    LOOP
      IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
        OR jsonb_typeof(v_item -> 'name') IS DISTINCT FROM 'string'
        OR btrim(v_item ->> 'name') = '' OR char_length(btrim(v_item ->> 'name')) > 50
        OR jsonb_typeof(v_item -> 'extra_price') IS DISTINCT FROM 'number'
        OR (v_item ->> 'extra_price') !~ '^[0-9]+$'
        OR jsonb_typeof(v_item -> 'extra_cost') IS DISTINCT FROM 'number'
        OR (v_item ->> 'extra_cost') !~ '^[0-9]+$'
        OR jsonb_typeof(v_item -> 'available') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'Invalid modifier item fields' USING ERRCODE = '22023';
      END IF;

      IF v_item ->> 'id' IS NOT NULL THEN
        IF v_group ->> 'id' IS NULL
          OR jsonb_typeof(v_item -> 'id') IS DISTINCT FROM 'number'
          OR (v_item ->> 'id') !~ '^[1-9][0-9]*$' THEN
          RAISE EXCEPTION 'Invalid modifier item identifier' USING ERRCODE = '22023';
        END IF;
        v_item_id := (v_item ->> 'id')::integer;
        IF NOT EXISTS (
          SELECT 1 FROM public.menu_modifier_items AS i
          WHERE i.modifier_id = v_item_id AND i.group_id = (v_group ->> 'id')::integer
        ) THEN
          RAISE EXCEPTION 'Modifier item does not belong to this group' USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  DELETE FROM public.menu_modifier_groups AS g
  WHERE g.menu_id = p_menu_id AND NOT (g.group_id = ANY(v_requested_group_ids));

  FOR v_group IN SELECT value FROM jsonb_array_elements(p_groups)
  LOOP
    IF v_group ->> 'id' IS NULL THEN
      INSERT INTO public.menu_modifier_groups (menu_id, name, type, is_required)
      VALUES (p_menu_id, btrim(v_group ->> 'name'), (v_group ->> 'type')::public.modifier_group_type, (v_group ->> 'is_required')::boolean)
      RETURNING group_id INTO v_group_id;
    ELSE
      v_group_id := (v_group ->> 'id')::integer;
      UPDATE public.menu_modifier_groups
      SET name = btrim(v_group ->> 'name'),
          type = (v_group ->> 'type')::public.modifier_group_type,
          is_required = (v_group ->> 'is_required')::boolean
      WHERE group_id = v_group_id AND menu_id = p_menu_id;
    END IF;

    v_requested_item_ids := ARRAY[]::integer[];
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_group -> 'items')
    LOOP
      IF v_item ->> 'id' IS NOT NULL THEN
        v_requested_item_ids := array_append(v_requested_item_ids, (v_item ->> 'id')::integer);
      END IF;
    END LOOP;

    DELETE FROM public.menu_modifier_items AS i
    WHERE i.group_id = v_group_id AND NOT (i.modifier_id = ANY(v_requested_item_ids));

    v_saved_item_ids := ARRAY[]::integer[];
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_group -> 'items')
    LOOP
      IF v_item ->> 'id' IS NULL THEN
        INSERT INTO public.menu_modifier_items (group_id, name, extra_price, extra_cost, available)
        VALUES (v_group_id, btrim(v_item ->> 'name'), (v_item ->> 'extra_price')::integer, (v_item ->> 'extra_cost')::integer, (v_item ->> 'available')::boolean)
        RETURNING modifier_id INTO v_item_id;
      ELSE
        v_item_id := (v_item ->> 'id')::integer;
        UPDATE public.menu_modifier_items
        SET name = btrim(v_item ->> 'name'),
            extra_price = (v_item ->> 'extra_price')::integer,
            extra_cost = (v_item ->> 'extra_cost')::integer,
            available = (v_item ->> 'available')::boolean
        WHERE modifier_id = v_item_id AND group_id = v_group_id;
      END IF;
      v_saved_item_ids := array_append(v_saved_item_ids, v_item_id);
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_menu_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_save_menu(integer, text, text, integer, integer, text, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_menu(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_save_menu_modifiers(integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_menu_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_menu(integer, text, text, integer, integer, text, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_menu(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_menu_modifiers(integer, jsonb) TO authenticated, service_role;

COMMIT;
