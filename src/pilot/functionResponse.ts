// Não propagar HTML de gateways/proteção do deploy nem conteúdo bruto para logs ou UI.
type FunctionReply={error?:string;access_token?:string;refresh_token?:string;changed?:boolean}
export async function readFunctionResponse(response:Response):Promise<FunctionReply>{
 const contentType=response.headers.get('Content-Type')||''
 if(!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|\s*$)/i.test(contentType)){
  if(response.status===401||response.status===403)throw Error('O acesso ao aplicativo foi bloqueado pela hospedagem. Peça ao administrador para conferir a proteção de acesso do Netlify.')
  if(response.status===404)throw Error('Serviço de autenticação não encontrado. Peça ao administrador para conferir a publicação das Netlify Functions.')
  throw Error('O serviço de autenticação retornou uma página em vez de JSON. Peça ao administrador para conferir as Netlify Functions e os redirecionamentos do deploy.')
 }
 let data:unknown
 try{data=await response.json()}catch{throw Error('Resposta inválida do serviço de autenticação. Tente novamente; se persistir, procure o administrador.')}
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Resposta inválida do serviço de autenticação.')
 const fields=data as Record<string,unknown>
 return {error:typeof fields.error==='string'?fields.error:undefined,access_token:typeof fields.access_token==='string'?fields.access_token:undefined,refresh_token:typeof fields.refresh_token==='string'?fields.refresh_token:undefined,changed:fields.changed===true}
}
