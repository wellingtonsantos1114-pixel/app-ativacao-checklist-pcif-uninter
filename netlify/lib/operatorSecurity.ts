import {publicSupabaseConfig} from '../../src/pilot/publicConfig'
export function reply(status:number,data:unknown){return new Response(JSON.stringify(data),{status,headers:{'Cache-Control':'no-store, private','Content-Type':'application/json','X-Content-Type-Options':'nosniff'}})}
export function config(){
 const c=publicSupabaseConfig(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY)
 if(process.env.PCIF_PILOT_ENABLED!=='true'||!c)throw Error('configuration');return c
}
export function sameOrigin(r:Request){return !r.headers.get('Origin')||r.headers.get('Origin')===new URL(r.url).origin}
export async function body(r:Request){const reader=r.body?.getReader();if(!reader)throw Error('body');let size=0,text='';const decoder=new TextDecoder();while(true){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>4096){await reader.cancel();throw Error('body')}text+=decoder.decode(v.value,{stream:true})}return JSON.parse(text+decoder.decode())}
export async function api(path:string,method:string,data?:unknown,token?:string){const c=config();return fetch(`${c.url}${path}`,{method,headers:{apikey:c.key,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(12000)})}
export function operatorEmail(team:string){
 if(!/^(GAR (0[1-9]|1[0-9]|2[0-3])|GAC 0[1-8])$/.test(team))throw Error('team')
 const domain=process.env.PCIF_OPERATOR_EMAIL_DOMAIN
 if(!domain||!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain))throw Error('domain')
 return `${team.toLowerCase().replace(' ','')}@${domain}`
}
export async function profile(token:string){const r=await api('/rest/v1/rpc/pcif_ops_profile','POST',{},token);if(!r.ok)throw Error('profile');const data=await r.json();if(data.environment!=='pilot')throw Error('environment');return data}
export function bearer(r:Request){const h=r.headers.get('Authorization')||'';return /^Bearer [A-Za-z0-9_.-]+$/.test(h)?h.slice(7):''}
export function strongPassword(p:unknown):p is string{return typeof p==='string'&&p.length>=12&&p.length<=128&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/[0-9]/.test(p)&&/[^A-Za-z0-9\s]/.test(p)}

// Privilegiada somente nesta chamada fixa do backend; nunca exportada ao browser.
export function passwordAdminKey(){
 const key=process.env.PCIF_PASSWORD_ADMIN_KEY
 if(!key)throw Error('password-admin-configuration')
 if(key.startsWith('sb_secret_'))return key
 try{if(JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='service_role')return key}catch{/* Sem valores no erro. */}
 throw Error('password-admin-configuration')
}
export async function completeInitialPassword(userId:string){
 const key=passwordAdminKey(),c=config()
 const response=await fetch(`${c.url}/rest/v1/rpc/pcif_ops_complete_password_change`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(!key.startsWith('sb_secret_')?{Authorization:`Bearer ${key}`}:{})},body:JSON.stringify({p_user_id:userId}),signal:AbortSignal.timeout(12000)})
 if(!response.ok||await response.json()!==true)throw Error('password-completion')
}
