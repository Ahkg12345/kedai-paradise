import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
const genericFailure = 'Username atau password salah'
const lockoutMessage = 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.'
const serverFailure = 'Terjadi kesalahan. Silakan coba lagi.'
const provisioningMarker = 'kedai-paradise-admin'

function lockoutResponse(seconds: number) {
  const retryAfterSeconds = Math.max(1, Number(seconds) || 1)
  return jsonResponse(
    { ok: false, message: lockoutMessage, retryAfterSeconds },
    429,
    { 'Retry-After': String(retryAfterSeconds) },
  )
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
}

function jsonResponse(payload: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  })
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]
  const value = forwarded?.trim()
  return value && value.length <= 45 && /^[0-9a-fA-F:.]+$/.test(value) ? value : 'unknown'
}

function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const username = value.trim().toLowerCase()
  return /^[a-z0-9_]{3,30}$/.test(username) ? username : null
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, message: 'Metode tidak didukung.' }, 405, { Allow: 'POST, OPTIONS' })
  }

  if (!supabaseUrl || !serviceRoleKey || !publishableKey) {
    console.error('[auth-login] Required Supabase environment is missing')
    return jsonResponse({ ok: false, message: serverFailure }, 500)
  }

  let body: { username?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ ok: false, message: genericFailure }, 400)
  }

  const username = normalizeUsername(body.username)
  const password = typeof body.password === 'string' ? body.password : ''
  if (!username || password.length === 0 || password.length > 1024) {
    return jsonResponse({ ok: false, message: genericFailure }, 401)
  }

  const ipAddress = clientIp(request)
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: lockData, error: lockError } = await adminClient.rpc('check_login_lock', {
    p_username: username,
    p_ip_address: ipAddress,
  })
  if (lockError) {
    console.error('[auth-login] Failed to check login lock', lockError)
    return jsonResponse({ ok: false, message: serverFailure }, 500)
  }

  const lock = Array.isArray(lockData) ? lockData[0] : lockData
  if (lock?.is_locked) {
    return lockoutResponse(lock.retry_after_seconds)
  }

  const { data: profile, error: profileError } = await adminClient
    .from('users')
    .select('auth_id, username, name, role, status')
    .eq('username', username)
    .maybeSingle()

  if (profileError) {
    console.error('[auth-login] Failed to load user profile', profileError)
    return jsonResponse({ ok: false, message: serverFailure }, 500)
  }

  const recordFailure = async () => {
    const { error } = await adminClient.rpc('record_login_failure', {
      p_username: username,
      p_ip_address: ipAddress,
    })
    if (error) {
      console.error('[auth-login] Failed to record login failure', error)
      return jsonResponse({ ok: false, message: serverFailure }, 500)
    }

    const { data: updatedLockData, error: updatedLockError } = await adminClient.rpc('check_login_lock', {
      p_username: username,
      p_ip_address: ipAddress,
    })
    if (updatedLockError) {
      console.error('[auth-login] Failed to recheck login lock', updatedLockError)
      return jsonResponse({ ok: false, message: serverFailure }, 500)
    }

    const updatedLock = Array.isArray(updatedLockData) ? updatedLockData[0] : updatedLockData
    if (updatedLock?.is_locked) {
      return lockoutResponse(updatedLock.retry_after_seconds)
    }

    return jsonResponse({ ok: false, message: genericFailure }, 401)
  }

  if (!profile || !profile.status) {
    return await recordFailure()
  }

  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email: `${username}@kedaiparadise.local`,
    password,
  })

  if (authError) {
    if (authError.status !== 400 && authError.status !== 401) {
      console.error('[auth-login] Supabase Auth sign-in failed', authError)
      return jsonResponse({ ok: false, message: serverFailure }, 500)
    }

    return await recordFailure()
  }

  if (!authData.session || authData.user.id !== profile.auth_id) {
    console.error('[auth-login] Auth user and staff profile do not match')
    return jsonResponse({ ok: false, message: serverFailure }, 500)
  }

  const { error: clearError } = await adminClient.rpc('clear_login_attempts', {
    p_username: username,
    p_ip_address: ipAddress,
  })
  if (clearError) {
    await authClient.auth.signOut()
    console.error('[auth-login] Failed to clear login attempts', clearError)
    return jsonResponse({ ok: false, message: serverFailure }, 500)
  }

  return jsonResponse({
    ok: true,
    user: {
      username: profile.username,
      name: profile.name,
      role: profile.role,
    },
    session: {
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
    },
    appMetadata: {
      username: profile.username,
      name: profile.name,
      role: profile.role,
      provisioned_by: provisioningMarker,
    },
  })
})
