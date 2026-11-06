import { createClient } from '@supabase/supabase-js'
// Ponto de extensão explícito. Não é importado pela aplicação demo e não cria contas.
export function createFutureSupabaseClient(url: string, publishableKey: string) {
  if (!url || !publishableKey) throw new Error('Configure a URL e a chave pública do ambiente de homologação.')
  return createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
}
