import { z } from 'zod'
import { id } from '@/lib/i18n/id'
import { supabase } from '@/lib/supabase/client'
import { readFunctionFailure } from '@/lib/function-error'

export type StaffRole = 'admin' | 'cashier'

export type StaffRecord = {
  user_id: number
  username: string
  name: string
  role: StaffRole
  status: boolean
}

export type CreateStaffPayload = {
  name: string
  username: string
  role: StaffRole
  password: string
}

export type UpdateStaffPayload = {
  user_id: number
  name: string
  role: StaffRole
  status: boolean
  password: string
}

const usernamePattern = /^[a-z0-9_]{3,30}$/
const nameSchema = z.string().trim().min(1, id.users.validation.nameRequired).max(100, id.users.validation.nameLength)
const usernameSchema = z.string().trim().regex(usernamePattern, id.users.validation.username)
const passwordSchema = z.string().min(8, id.users.validation.password)

const functionMessages: Record<string, string> = {
  UNAUTHENTICATED: id.users.errors.unauthenticated,
  FORBIDDEN: id.users.errors.forbidden,
  INVALID_INPUT: id.users.errors.invalid,
  USERNAME_TAKEN: id.users.errors.usernameTaken,
  STAFF_NOT_FOUND: id.users.errors.notFound,
  CANNOT_DEACTIVATE_SELF: id.users.errors.selfDeactivate,
  LAST_ACTIVE_ADMIN: id.users.errors.lastAdmin,
  PROFILE_SAVED_AUTH_SYNC_FAILED: id.users.errors.authSync,
  SERVER_ERROR: id.users.errors.generic,
}

function parseStaff(value: unknown): StaffRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(id.users.loadError)
  const row = value as Record<string, unknown>
  if (
    !Number.isSafeInteger(Number(row.user_id)) ||
    typeof row.username !== 'string' ||
    typeof row.name !== 'string' ||
    (row.role !== 'admin' && row.role !== 'cashier') ||
    typeof row.status !== 'boolean'
  ) {
    throw new Error(id.users.loadError)
  }

  return {
    user_id: Number(row.user_id),
    username: row.username,
    name: row.name,
    role: row.role,
    status: row.status,
  }
}

export async function fetchStaffDirectory(): Promise<StaffRecord[]> {
  const { data, error } = await supabase
    .from('admin_user_directory')
    .select('user_id, username, name, role, status')
    .order('user_id', { ascending: true })

  if (error) throw error
  return (data ?? []).map(parseStaff)
}

export async function createStaff(payload: CreateStaffPayload): Promise<void> {
  const nameResult = nameSchema.safeParse(payload.name)
  const usernameResult = usernameSchema.safeParse(payload.username)
  const passwordResult = passwordSchema.safeParse(payload.password)

  if (!nameResult.success) throw new Error(id.users.validation.nameRequired)
  if (!usernameResult.success) throw new Error(id.users.validation.username)
  if (!passwordResult.success) throw new Error(id.users.validation.password)
  if (payload.role !== 'admin' && payload.role !== 'cashier') throw new Error(id.users.validation.role)

  const { data, error } = await supabase.functions.invoke<{ ok: boolean; code?: string }>('admin-users', {
    body: {
      action: 'create',
      name: nameResult.data,
      username: usernameResult.data,
      role: payload.role,
      password: payload.password,
    },
  })

  if (error) throw new Error(await readFunctionFailure(error, functionMessages, id.users.errors.generic))
  if (!data?.ok) throw new Error(functionMessages[data?.code ?? ''] ?? id.users.errors.generic)
}

export async function updateStaff(payload: UpdateStaffPayload): Promise<void> {
  const nameResult = nameSchema.safeParse(payload.name)
  if (!nameResult.success) throw new Error(id.users.validation.nameRequired)
  if (!Number.isSafeInteger(payload.user_id) || payload.user_id < 1) throw new Error(id.users.errors.notFound)
  if (payload.role !== 'admin' && payload.role !== 'cashier') throw new Error(id.users.validation.role)
  if (payload.password && !passwordSchema.safeParse(payload.password).success) {
    throw new Error(id.users.validation.password)
  }

  const { data, error } = await supabase.functions.invoke<{ ok: boolean; code?: string }>('admin-users', {
    body: {
      action: 'update',
      user_id: payload.user_id,
      name: nameResult.data,
      role: payload.role,
      status: payload.status,
      ...(payload.password ? { password: payload.password } : {}),
    },
  })

  if (error) throw new Error(await readFunctionFailure(error, functionMessages, id.users.errors.generic))
  if (!data?.ok) throw new Error(functionMessages[data?.code ?? ''] ?? id.users.errors.generic)
}
