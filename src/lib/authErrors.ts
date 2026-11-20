/** Traduz mensagens de erro do Supabase Auth (sempre em inglês) para português.
 * Nunca expõe a mensagem técnica original ao usuário — cai num texto genérico seguro. */
export function translateAuthError(message: string | undefined | null): string {
  const m = (message ?? '').toLowerCase()

  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'
  if (m.includes('already registered') || m.includes('already exists')) return 'Este e-mail já está cadastrado.'
  if (m.includes('password should be at least') || m.includes('password is too short'))
    return 'A senha deve ter no mínimo 6 caracteres.'
  if (m.includes('should be different from the old password'))
    return 'A nova senha deve ser diferente da senha atual.'
  if (m.includes('email rate limit') || m.includes('rate limit exceeded'))
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'
  if (m.includes('security purposes') && m.includes('seconds'))
    return 'Por segurança, aguarde um pouco antes de tentar novamente.'
  if (m.includes('email') && m.includes('invalid')) return 'Endereço de e-mail inválido.'
  if (m.includes('user not found')) return 'Não encontramos uma conta com esse e-mail.'
  if (m.includes('token') && (m.includes('expired') || m.includes('invalid')))
    return 'Este link expirou ou já foi usado. Solicite um novo.'
  if (m.includes('network') || m.includes('fetch failed') || m.includes('failed to fetch'))
    return 'Não foi possível conectar. Verifique sua internet e tente novamente.'
  if (!m) return 'Não foi possível concluir. Tente novamente.'

  return 'Não foi possível concluir. Tente novamente em alguns instantes.'
}
