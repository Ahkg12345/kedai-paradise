import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
const provisioningMarker = 'kedai-paradise-admin'
const internalEmailDomain = 'kedaiparadise.local'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
}

type StaffRole = 'admin' | 'cashier'
type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'USERNAME_TAKEN'
  | 'STAFF_NOT_FOUND'
  | 'CANNOT_DEACTIVATE_SELF'
  | 'LAST_ACTIVE_ADMIN'
  | 'CURRENT_PASSWORD_INVALID'
  | 'PASSWORD_TOO_SHORT'
  | 'PROFILE_SAVED_AUTH_SYNC_FAILED'
  | 'SERVER_ERROR'

type RequestBody = {
  action?: unknown
  name?: unknown
  username?: unknown
  role?: unknown
  password?: unknown
  user_id?: unknown
  status?: unknown
  current_password?: unknown
  new_password?: unknown
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function fail(code: ErrorCode, status = 400) {
  return jsonResponse({ ok: false, code }, status)
}

function trimmedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const result = value.trim()
  return result.length > 0 && result.length <= maxLength ? result : null
}

function isRole(value: unknown): value is StaffRole {
  return value === 'admin' || value === 'cashier'
}

function isPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128
}

function isOptionalPassword(value: unknown): value is string | undefined {
  return value === undefined || value === '' || isPassword(value)
}

function isUsername(value: unknown): value is string {
  return typeof value === 'string' && value === value.toLowerCase() && /^[a-z0-9_]{3,30}$/.test(value)
}

async function activeProfile(adminClient: ReturnType<typeof createClient>, authId: string) {
  return adminClient.from('users')
    .select('user_id, auth_id, username, name, role, status')
    .eq('auth_id', authId)
    .maybeSingle()
}

async function isAdmin(callerClient: ReturnType<typeof createClient>) {
  const { data, error } = await callerClient.rpc('current_user_role')
  if (error) {
    console.error('[admin-users] Failed to read caller role', error)
    return false
  }
  return data === 'admin'
}

async function createStaff(
  body: RequestBody,
  adminClient: ReturnType<typeof createClient>,
  callerClient: ReturnType<typeof createClient>,
) {
  const name = trimmedString(body.name, 100)
  const username = body.username
  if (!name || !isUsername(username) || !isRole(body.role) || !isPassword(body.password)) {
    return fail(body.password && typeof body.password === 'string' && body.password.length < 8 ? 'PASSWORD_TOO_SHORT' : 'INVALID_INPUT')
  }

  const { data: existingProfile, error: lookupError } = await adminClient
    .from('users')
    .select('user_id')
    .eq('username', username)
    .maybeSingle()
  if (lookupError) {
    console.error('[admin-users] Failed to check username', lookupError)
    return fail('SERVER_ERROR', 500)
  }
  if (existingProfile) return fail('USERNAME_TAKEN', 409)

  const { data: authResult, error: createError } = await adminClient.auth.admin.createUser({
    email: `${username}@${internalEmailDomain}`,
    password: body.password,
    email_confirm: true,
    app_metadata: {
      role: body.role,
      username,
      name,
      provisioned_by: provisioningMarker,
    },
  })
  if (createError || !authResult.user) {
    if (createError?.code === 'email_exists' || createError?.status === 422) return fail('USERNAME_TAKEN', 409)
    console.error('[admin-users] Failed to create auth identity', createError)
    return fail('SERVER_ERROR', 500)
  }

  const { error: profileError } = await callerClient.rpc('admin_create_staff_profile', {
    p_auth_id: authResult.user.id,
    p_username: username,
    p_name: name,
    p_role: body.role,
  })

  if (profileError) {
    await adminClient.auth.admin.deleteUser(authResult.user.id)
    if (profileError.code === '23505') return fail('USERNAME_TAKEN', 409)
    console.error('[admin-users] Failed to create staff profile', profileError)
    return fail('SERVER_ERROR', 500)
  }

  return jsonResponse({ ok: true })
}

async function updateStaff(
  body: RequestBody,
  actorAuthId: string,
  adminClient: ReturnType<typeof createClient>,
  callerClient: ReturnType<typeof createClient>,
) {
  const userId = Number(body.user_id)
  const name = trimmedString(body.name, 100)
  if (
    !Number.isSafeInteger(userId) || userId < 1 || !name || !isRole(body.role) ||
    typeof body.status !== 'boolean' || !isOptionalPassword(body.password)
  ) {
    return fail(typeof body.password === 'string' && body.password.length > 0 && body.password.length < 8 ? 'PASSWORD_TOO_SHORT' : 'INVALID_INPUT')
  }

  const { data: target, error: targetError } = await adminClient
    .from('users')
    .select('auth_id, username, name, role, status')
    .eq('user_id', userId)
    .maybeSingle()
  if (targetError) {
    console.error('[admin-users] Failed to read target profile', targetError)
    return fail('SERVER_ERROR', 500)
  }
  if (!target) return fail('STAFF_NOT_FOUND', 404)

  const { error: profileError } = await callerClient.rpc('admin_update_staff_profile', {
    p_user_id: userId,
    p_name: name,
    p_role: body.role,
    p_status: body.status,
  })
  if (profileError) {
    if (profileError.code === '42501' && target.auth_id === actorAuthId && !body.status) return fail('CANNOT_DEACTIVATE_SELF', 403)
    if (profileError.code === '23514') return fail('LAST_ACTIVE_ADMIN', 409)
    if (profileError.code === 'P0002') return fail('STAFF_NOT_FOUND', 404)
    console.error('[admin-users] Failed to update staff profile', profileError)
    return fail('SERVER_ERROR', 500)
  }

  const { data: authResult, error: authLookupError } = await adminClient.auth.admin.getUserById(target.auth_id)
  if (authLookupError || !authResult.user) {
    console.error('[admin-users] Profile saved but auth identity lookup failed', authLookupError)
    return fail('PROFILE_SAVED_AUTH_SYNC_FAILED', 500)
  }

  const appMetadata = {
    ...(authResult.user.app_metadata ?? {}),
    role: body.role,
    username: target.username,
    name,
    provisioned_by: provisioningMarker,
  }
  const authUpdate: { password?: string; app_metadata: Record<string, unknown> } = { app_metadata: appMetadata }
  if (typeof body.password === 'string' && body.password.length > 0) authUpdate.password = body.password

  const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(target.auth_id, authUpdate)
  if (authUpdateError) {
    console.error('[admin-users] Profile saved but auth identity update failed', authUpdateError)
    return fail('PROFILE_SAVED_AUTH_SYNC_FAILED', 500)
  }

  return jsonResponse({ ok: true })
}

async function changeOwnPassword(
  body: RequestBody,
  actorAuthId: string,
  actorEmail: string | undefined,
  adminClient: ReturnType<typeof createClient>,
) {
  if (!actorEmail || typeof body.current_password !== 'string' || body.current_password.length === 0 || !isPassword(body.new_password)) {
    return fail(typeof body.new_password === 'string' && body.new_password.length < 8 ? 'PASSWORD_TOO_SHORT' : 'INVALID_INPUT')
  }

  const verifyClient = createClient(supabaseUrl!, publishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: verificationError } = await verifyClient.auth.signInWithPassword({
    email: actorEmail,
    password: body.current_password,
  })
  if (verificationError) {
    if (verificationError.status === 400 || verificationError.status === 401) return fail('CURRENT_PASSWORD_INVALID', 401)
    console.error('[admin-users] Current password verification failed', verificationError)
    return fail('SERVER_ERROR', 500)
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(actorAuthId, {
    password: body.new_password,
  })
  if (updateError) {
    console.error('[admin-users] Failed to change own password', updateError)
    return fail('SERVER_ERROR', 500)
  }

  return jsonResponse({ ok: true })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ ok: false, code: 'INVALID_INPUT' }, 405)
  if (!supabaseUrl || !serviceRoleKey || !publishableKey) {
    console.error('[admin-users] Required Supabase environment is missing')
    return fail('SERVER_ERROR', 500)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return fail('UNAUTHENTICATED', 401)

  let body: RequestBody
  try {
    body = await request.json() as RequestBody
  } catch {
    return fail('INVALID_INPUT')
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const callerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: authData, error: authError } = await callerClient.auth.getUser()
  if (authError || !authData.user) return fail('UNAUTHENTICATED', 401)

  const { data: profile, error: profileError } = await activeProfile(adminClient, authData.user.id)
  if (profileError) {
    console.error('[admin-users] Failed to verify active profile', profileError)
    return fail('SERVER_ERROR', 500)
  }
  if (!profile?.status) return fail('UNAUTHENTICATED', 401)

  if (body.action === 'change_own_password') {
    return await changeOwnPassword(body, authData.user.id, authData.user.email, adminClient)
  }

  if (body.action !== 'create' && body.action !== 'update') return fail('INVALID_INPUT')
  if (!(await isAdmin(callerClient))) return fail('FORBIDDEN', 403)

  if (body.action === 'create') return await createStaff(body, adminClient, callerClient)
  return await updateStaff(body, authData.user.id, adminClient, callerClient)
})
