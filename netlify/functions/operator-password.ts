import {api,bearer,body,profile,reply,sameOrigin,strongPassword,passwordAdminKey,completeInitialPassword} from '../lib/operatorSecurity'
export default async function(request:Request){
 if(request.method!=='POST')return reply(405,{error:'Método não permitido.'})
 if(!sameOrigin(request))return reply(403,{error:'Acesso negado.'})
 let temporary='',changed=false
 try{
  const token=bearer(request);if(!token)return reply(401,{error:'Entre novamente.'})
  const membership=await profile(token)
  if(membership.mustChangePassword)passwordAdminKey()
  const identity=await api('/auth/v1/user','GET',undefined,token);if(!identity.ok)return reply(401,{error:'Sessão inválida.'})
  const user=await identity.json(),data=await body(request)
  if(typeof data.currentPassword!=='string'||!data.currentPassword||data.currentPassword.length>128||!strongPassword(data.newPassword)||data.newPassword!==data.confirmation||data.newPassword===data.currentPassword)return reply(400,{error:'Confira a senha atual e os requisitos da nova senha.'})
  const verified=await api('/auth/v1/token?grant_type=password','POST',{email:user.email,password:data.currentPassword})
  if(!verified.ok)return reply(400,{error:'Senha atual inválida ou serviço indisponível.'})
  const session=await verified.json();temporary=session.access_token
  if(session.user?.id!==user.id)return reply(403,{error:'Conta inválida.'})
  const updated=await api('/auth/v1/user','PUT',{password:data.newPassword},temporary)
  if(!updated.ok)return reply(400,{error:'Alteração recusada pelo Supabase.'})
  changed=true
  const revoked=await api('/auth/v1/logout?scope=global','POST',undefined,temporary)
  if(!revoked.ok)return reply(502,{changed:true,error:'Senha alterada, mas a revogação não foi confirmada. Solicite ao administrador a revogação global e entre novamente.'})
  temporary='';if(membership.mustChangePassword)await completeInitialPassword(user.id);return reply(200,{changed:true})
 }catch{return reply(503,{...(changed?{changed:true}:{}),error:changed?'Senha alterada, mas a liberação inicial não foi confirmada. Procure o administrador antes de operar.':'Não foi possível concluir a operação. Verifique o serviço.'})}
 finally{if(temporary)try{await api('/auth/v1/logout?scope=local','POST',undefined,temporary)}catch{/* Sem logs. */}}
}
