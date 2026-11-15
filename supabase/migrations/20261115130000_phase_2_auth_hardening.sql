BEGIN;

DROP POLICY IF EXISTS kp_menu_qris_read_authenticated ON storage.objects;
DROP POLICY IF EXISTS kp_menu_qris_read_staff ON storage.objects;
CREATE POLICY kp_menu_qris_read_staff ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id IN ('menu', 'qris')
  AND (SELECT public.current_user_role()) IN ('admin', 'cashier')
);

CREATE OR REPLACE FUNCTION public.enforce_admin_provisioned_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(NEW.raw_app_meta_data ->> 'provisioned_by', '') <> 'kedai-paradise-admin' THEN
    RAISE EXCEPTION 'Public sign-up is disabled. Users must be provisioned by an administrator.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_admin_provisioned_auth_user() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS kp_auth_users_admin_provisioning_only ON auth.users;
CREATE TRIGGER kp_auth_users_admin_provisioning_only
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.enforce_admin_provisioned_auth_user();

COMMIT;
