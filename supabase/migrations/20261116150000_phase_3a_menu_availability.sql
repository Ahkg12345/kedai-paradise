BEGIN;

CREATE OR REPLACE FUNCTION public.set_menu_available(p_menu_id integer, p_available boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT public.current_user_role()) NOT IN ('admin', 'cashier') THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_menu_id IS NULL OR p_menu_id <= 0 OR p_available IS NULL THEN
    RAISE EXCEPTION 'Invalid menu availability parameters' USING ERRCODE = '22023';
  END IF;

  UPDATE public.menu
  SET available = p_available
  WHERE menu_id = p_menu_id AND status = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_menu_available(integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_menu_available(integer, boolean) TO authenticated, service_role;

COMMIT;
