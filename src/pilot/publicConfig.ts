export function publicSupabaseConfig(url?: string, key?: string) {
 if (!url || !key) return undefined;
 try {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname!=='/') return undefined;
  const publishable=key.startsWith('sb_publishable_');
  const legacyAnon=!publishable && JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';
  if(!publishable && !legacyAnon) return undefined;
  return {url:parsed.origin,key};
 } catch { return undefined; }
}
export function validateSupabaseBuild(url?: string, key?: string) {
 if(!url && !key)return;
 if(!publicSupabaseConfig(url,key))throw Error('Supabase: configure URL HTTPS e somente chave publishable/anon. Chaves secret/service_role não são permitidas no build.');
}
