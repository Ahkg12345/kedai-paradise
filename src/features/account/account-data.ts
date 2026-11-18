import { id } from '@/lib/i18n/id'
import { readFunctionFailure } from '@/lib/function-error'
import { supabase } from '@/lib/supabase/client'

const functionMessages: Record<string, string> = {
  UNAUTHENTICATED: id.myAccount.errors.unauthenticated,
  FORBIDDEN: id.myAccount.errors.unauthenticated,
  INVALID_INPUT: id.myAccount.errors.invalid,
  CURRENT_PASSWORD_INVALID: id.myAccount.errors.currentPassword,
  PASSWORD_TOO_SHORT: id.myAccount.errors.passwordLength,
  SERVER_ERROR: id.myAccount.errors.generic,
}

export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; code?: string }>('admin-users', {
    body: {
      action: 'change_own_password',
      current_password: currentPassword,
      new_password: newPassword,
    },
  })

  if (error) throw new Error(await readFunctionFailure(error, functionMessages, id.myAccount.errors.generic))
  if (!data?.ok) throw new Error(functionMessages[data?.code ?? ''] ?? id.myAccount.errors.generic)
}
