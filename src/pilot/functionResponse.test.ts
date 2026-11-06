// @vitest-environment node
import {it,expect} from 'vitest'
import {readFunctionResponse} from './functionResponse'
it.each([401,403])('HTML da proteção Netlify vira orientação sem expor conteúdo (HTTP %s)',async status=>{
 const response=new Response('<!DOCTYPE html><secret>hidden</secret>',{status,headers:{'Content-Type':'text/html'}})
 await expect(readFunctionResponse(response)).rejects.toThrow('proteção de acesso do Netlify')
 expect(response.bodyUsed).toBe(false)
})
it.each([200,404,502])('HTML de fallback/Function ausente não é interpretado como JSON (HTTP %s)',async status=>{
 const response=new Response('<!DOCTYPE html>',{status,headers:{'Content-Type':'text/html'}})
 await expect(readFunctionResponse(response)).rejects.toThrow(status===404?'publicação das Netlify Functions':'página em vez de JSON')
 expect(response.bodyUsed).toBe(false)
})
it('preserva erros JSON legítimos de autenticação e retorno da troca voluntária',async()=>{
 expect((await readFunctionResponse(Response.json({error:'Equipe ou senha inválida.'},{status:401}))).error).toBe('Equipe ou senha inválida.')
 expect((await readFunctionResponse(Response.json({changed:true})))).toMatchObject({changed:true})
})
it('recusa JSON malformado ou formato inesperado',async()=>{
 await expect(readFunctionResponse(new Response('<html>',{headers:{'Content-Type':'application/json'}}))).rejects.toThrow('Resposta inválida')
 await expect(readFunctionResponse(Response.json([]))).rejects.toThrow('Resposta inválida')
})
