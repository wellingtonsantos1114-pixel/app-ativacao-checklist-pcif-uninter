import {api,body,operatorEmail,profile,reply,sameOrigin} from '../lib/operatorSecurity'
export default async function(request:Request){
 if(request.method!=='POST')return reply(405,{error:'Método não permitido.'})
 if(!sameOrigin(request))return reply(403,{error:'Acesso negado.'})
 let token=''
 try{
  const data=await body(request)
  if(typeof data.team!=='string'||typeof data.password!=='string'||!data.password||data.password.length>128)return reply(401,{error:'Equipe ou senha inválida.'})
  let email:string;try{email=operatorEmail(data.team.trim().toUpperCase())}catch{return reply(401,{error:'Equipe ou senha inválida.'})}
  const response=await api('/auth/v1/token?grant_type=password','POST',{email,password:data.password})
  if(!response.ok)return reply(response.status===429?429:401,{error:response.status===429?'Muitas tentativas. Aguarde e tente novamente.':'Equipe ou senha inválida.'})
  const session=await response.json();token=session.access_token
  const p=await profile(token);if(p.team!==data.team.trim().toUpperCase())throw Error('team')
  token='';return reply(200,{access_token:session.access_token,refresh_token:session.refresh_token})
 }catch{return reply(503,{error:'Acesso indisponível ou equipe não autorizada no piloto.'})}
 finally{if(token)try{await api('/auth/v1/logout?scope=local','POST',undefined,token)}catch{/* Sem logs de credenciais. */}}
}
