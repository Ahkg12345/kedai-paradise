BEGIN;

ALTER TABLE public.menu_modifier_groups
  ADD COLUMN sort_order integer NOT NULL DEFAULT 1;

WITH ranked_groups AS (
  SELECT
    group_id,
    row_number() OVER (
      PARTITION BY menu_id
      ORDER BY
        CASE name
          WHEN 'Tingkat Pedas' THEN 0
          WHEN 'Toppings / Tambahan' THEN 1
          ELSE 2
        END,
        group_id
    )::integer AS sort_order
  FROM public.menu_modifier_groups
)
UPDATE public.menu_modifier_groups AS groups
SET sort_order = ranked_groups.sort_order
FROM ranked_groups
WHERE groups.group_id = ranked_groups.group_id;

CREATE OR REPLACE VIEW public.admin_menu_records WITH (security_barrier = true) AS
SELECT
  m.menu_id,
  m.code,
  m.name,
  m.category,
  m.price,
  m.cost_price,
  m.photo,
  m.available,
  m.status,
  (
    SELECT CASE
      WHEN o.metadata ->> 'size' ~ '^[0-9]+$' THEN (o.metadata ->> 'size')::bigint
      ELSE NULL
    END
    FROM storage.objects AS o
    WHERE o.bucket_id = 'menu'
      AND o.name = m.photo
    LIMIT 1
  ) AS photo_size
FROM public.menu AS m
WHERE (SELECT public.current_user_role()) = 'admin'::text;

CREATE OR REPLACE VIEW public.admin_modifier_groups WITH (security_barrier = true) AS
SELECT
  group_id,
  menu_id,
  name,
  type,
  is_required,
  sort_order
FROM public.menu_modifier_groups
WHERE (SELECT public.current_user_role()) = 'admin'::text;

GRANT SELECT ON public.admin_menu_records TO authenticated;
GRANT SELECT ON public.admin_modifier_groups TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_menu_modifiers(p_menu_id integer, p_groups jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group jsonb;
  v_group_row record;
  v_item jsonb;
  v_group_id integer;
  v_group_order integer;
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

  FOR v_group_row IN
    SELECT value, ordinality::integer AS position
    FROM jsonb_array_elements(p_groups) WITH ORDINALITY AS group_input(value, ordinality)
    ORDER BY ordinality
  LOOP
    v_group := v_group_row.value;
    v_group_order := v_group_row.position;

    IF v_group ->> 'id' IS NULL THEN
      INSERT INTO public.menu_modifier_groups (menu_id, name, type, is_required, sort_order)
      VALUES (p_menu_id, btrim(v_group ->> 'name'), (v_group ->> 'type')::public.modifier_group_type, (v_group ->> 'is_required')::boolean, v_group_order)
      RETURNING group_id INTO v_group_id;
    ELSE
      v_group_id := (v_group ->> 'id')::integer;
      UPDATE public.menu_modifier_groups
      SET name = btrim(v_group ->> 'name'),
          type = (v_group ->> 'type')::public.modifier_group_type,
          is_required = (v_group ->> 'is_required')::boolean,
          sort_order = v_group_order
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

COMMIT;
