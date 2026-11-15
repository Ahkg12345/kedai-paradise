import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.ADMIN_PASSWORD

if (!supabaseUrl || !serviceRoleKey || !password) {
  throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ADMIN_PASSWORD before provisioning admins.')
}

if (password.length < 8) {
  throw new Error('ADMIN_PASSWORD must contain at least 8 characters.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const admins = [
  { username: 'fajar', name: 'Bapak Fajar' },
  { username: 'fitri', name: 'Ibu Fitri' },
]

for (const admin of admins) {
  const { data: existing, error: lookupError } = await supabase
    .from('users')
    .select('user_id')
    .eq('username', admin.username)
    .maybeSingle()

  if (lookupError) throw lookupError
  if (existing) {
    console.log(`Skipped existing admin profile: ${admin.username}`)
    continue
  }

  const { data: authData, error: createError } = await supabase.auth.admin.createUser({
    email: `${admin.username}@kedaiparadise.local`,
    password,
    email_confirm: true,
    app_metadata: {
      username: admin.username,
      name: admin.name,
      role: 'admin',
      provisioned_by: 'kedai-paradise-admin',
    },
  })

  if (createError) throw createError
  if (!authData.user) throw new Error(`Supabase did not return an auth user for ${admin.username}.`)

  const { error: profileError } = await supabase.from('users').insert({
    auth_id: authData.user.id,
    username: admin.username,
    name: admin.name,
    role: 'admin',
    status: true,
  })

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id)
    throw profileError
  }

  console.log(`Created admin account: ${admin.username}`)
}
