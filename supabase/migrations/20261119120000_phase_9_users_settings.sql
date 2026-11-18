BEGIN;

REVOKE INSERT, UPDATE, DELETE
ON TABLE public.admin_user_directory, public.admin_settings, public.current_user_profile
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_user_directory, public.admin_settings, public.current_user_profile TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_staff_profile(
  p_auth_id uuid,
  p_username text,
  p_name text,
  p_role public.user_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE;
BEGIN
  IF (SELECT public.current_user_role()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_auth_id IS NULL
    OR p_username IS NULL
    OR p_username <> pg_catalog.lower(pg_catalog.btrim(p_username))
    OR p_username !~ '^[a-z0-9_]{3,30}$'
    OR p_name IS NULL
    OR pg_catalog.char_length(pg_catalog.btrim(p_name)) NOT BETWEEN 1 AND 100
    OR p_role IS NULL THEN
    RAISE EXCEPTION 'Invalid staff profile' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.users (auth_id, username, name, role, status)
  VALUES (p_auth_id, p_username, pg_catalog.btrim(p_name), p_role, true)
  RETURNING * INTO v_user;

  RETURN pg_catalog.jsonb_build_object(
    'user_id', v_user.user_id,
    'username', v_user.username,
    'name', v_user.name,
    'role', v_user.role::text,
    'status', v_user.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_staff_profile(
  p_user_id integer,
  p_name text,
  p_role public.user_role,
  p_status boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_active_admins integer;
BEGIN
  IF (SELECT public.current_user_role()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR p_user_id < 1
    OR p_name IS NULL
    OR pg_catalog.char_length(pg_catalog.btrim(p_name)) NOT BETWEEN 1 AND 100
    OR p_role IS NULL OR p_status IS NULL THEN
    RAISE EXCEPTION 'Invalid staff profile' USING ERRCODE = '22023';
  END IF;

  SELECT u.* INTO v_user
  FROM public.users AS u
  WHERE u.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_user.auth_id = auth.uid() AND NOT p_status THEN
    RAISE EXCEPTION 'Cannot deactivate own account' USING ERRCODE = '42501';
  END IF;

  IF v_user.status AND v_user.role = 'admin' AND (NOT p_status OR p_role <> 'admin') THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kedai-paradise-active-admins', 0));
    SELECT pg_catalog.count(*)::integer INTO v_active_admins
    FROM public.users AS u
    WHERE u.role = 'admin' AND u.status = true;
    IF v_active_admins <= 1 THEN
      RAISE EXCEPTION 'Cannot deactivate or demote the last active administrator' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.users AS u
  SET name = pg_catalog.btrim(p_name), role = p_role, status = p_status
  WHERE u.user_id = p_user_id
  RETURNING u.* INTO v_user;

  RETURN pg_catalog.jsonb_build_object(
    'user_id', v_user.user_id,
    'username', v_user.username,
    'name', v_user.name,
    'role', v_user.role::text,
    'status', v_user.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_settings(
  p_business_name text,
  p_business_address text,
  p_table_count integer,
  p_receipt_footer text,
  p_operating_percent numeric,
  p_qris_bank text,
  p_qris_owner_name text,
  p_qris_image text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.settings%ROWTYPE;
  v_business_name text := NULLIF(pg_catalog.btrim(p_business_name), '');
  v_business_address text := NULLIF(pg_catalog.btrim(p_business_address), '');
  v_receipt_footer text := NULLIF(pg_catalog.btrim(p_receipt_footer), '');
  v_qris_bank text := NULLIF(pg_catalog.btrim(p_qris_bank), '');
  v_qris_owner_name text := NULLIF(pg_catalog.btrim(p_qris_owner_name), '');
  v_qris_image text := NULLIF(pg_catalog.btrim(p_qris_image), '');
  v_highest_open_table integer;
BEGIN
  IF (SELECT public.current_user_role()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF v_business_name IS NULL OR pg_catalog.char_length(v_business_name) > 100
    OR COALESCE(pg_catalog.char_length(v_business_address), 0) > 200
    OR p_table_count IS NULL OR p_table_count < 1
    OR COALESCE(pg_catalog.char_length(v_receipt_footer), 0) > 200
    OR p_operating_percent IS NULL OR p_operating_percent < 0 OR p_operating_percent > 100
    OR p_operating_percent <> pg_catalog.round(p_operating_percent, 2)
    OR COALESCE(pg_catalog.char_length(v_qris_bank), 0) > 50
    OR COALESCE(pg_catalog.char_length(v_qris_owner_name), 0) > 100
    OR COALESCE(pg_catalog.char_length(v_qris_image), 0) > 100 THEN
    RAISE EXCEPTION 'Invalid settings' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.max(t.table_no::integer) INTO v_highest_open_table
  FROM public.transactions AS t
  WHERE t.status = 'processing'
    AND t.table_no ~ '^[0-9]{1,9}$';

  IF v_highest_open_table IS NOT NULL AND p_table_count < v_highest_open_table THEN
    RAISE EXCEPTION 'Table count is below a table currently used by a processing order' USING ERRCODE = '23514';
  END IF;

  SELECT s.* INTO v_settings
  FROM public.settings AS s
  WHERE s.settings_id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settings row not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.settings AS s
  SET business_name = v_business_name,
      business_address = v_business_address,
      table_count = p_table_count,
      receipt_footer = v_receipt_footer,
      operating_percent = p_operating_percent,
      qris_bank = v_qris_bank,
      qris_owner_name = v_qris_owner_name,
      qris_image = v_qris_image
  WHERE s.settings_id = 1
  RETURNING s.* INTO v_settings;

  RETURN pg_catalog.jsonb_build_object(
    'settings_id', v_settings.settings_id,
    'business_name', v_settings.business_name,
    'business_address', v_settings.business_address,
    'table_count', v_settings.table_count,
    'receipt_footer', v_settings.receipt_footer,
    'operating_percent', v_settings.operating_percent,
    'qris_bank', v_settings.qris_bank,
    'qris_owner_name', v_settings.qris_owner_name,
    'qris_image', v_settings.qris_image
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_staff_profile(uuid, text, text, public.user_role) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.admin_update_staff_profile(integer, text, public.user_role, boolean) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.admin_update_settings(text, text, integer, text, numeric, text, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_staff_profile(uuid, text, text, public.user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_staff_profile(integer, text, public.user_role, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_settings(text, text, integer, text, numeric, text, text, text) TO authenticated;

COMMIT;
