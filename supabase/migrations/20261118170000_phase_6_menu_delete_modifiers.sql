BEGIN;

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

  DELETE FROM public.menu_modifier_groups WHERE menu_id = p_menu_id;
  DELETE FROM public.menu WHERE menu_id = p_menu_id;
END;
$$;

COMMIT;
