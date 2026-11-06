// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import login from '../functions/operator-login'
import password from '../functions/operator-password'
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status})
const request=(data:unknown,token=false)=>new Request('https://pilot.example.invalid/.netlify/functions/operator-login',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer test.token'}:{})},body:JSON.stringify(data)})
let call:ReturnType<typeof vi.fn>
beforeEach(()=>{vi.stubEnv('PCIF_PILOT_ENABLED','true');vi.stubEnv('SUPABASE_URL','https://pilot.supabase.co');vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','sb_publishable_test');vi.stubEnv('PCIF_OPERATOR_EMAIL_DOMAIN','pcif-operators.invalid');call=vi.fn();vi.stubGlobal('fetch',call)})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
it('mapeia equipe no servidor e exige membership do piloto',async()=>{
 call.mockResolvedValueOnce(response({access_token:'token',refresh_token:'refresh'})).mockResolvedValueOnce(response({team:'GAR 23',environment:'pilot'}))
 const r=await login(request({team:'GAR 23',password:'test-only'}));expect(r.status).toBe(200)
 expect(JSON.parse(call.mock.calls[0][1].body)).toEqual({email:'gar23@pcif-operators.invalid',password:'test-only'})
 expect(await r.json()).toEqual({access_token:'token',refresh_token:'refresh'})
})
it('equipe inválida, origem cruzada e piloto desabilitado falham sem login válido',async()=>{
 expect((await login(request({team:'GAR 99',password:'x'}))).status).toBe(401);expect(call).not.toHaveBeenCalled()
 const r=request({team:'GAR 01',password:'x'});r.headers.set('Origin','https://attacker.invalid');expect((await login(r)).status).toBe(403)
 vi.stubEnv('PCIF_PILOT_ENABLED','false');expect((await login(request({team:'GAR 01',password:'x'}))).status).toBe(503)
})
it('login fora do piloto é revogado e não entrega tokens',async()=>{
 call.mockResolvedValueOnce(response({access_token:'token'})).mockResolvedValueOnce(response({team:'GAR 01',environment:'production'})).mockResolvedValueOnce(response({}))
 const r=await login(request({team:'GAR 01',password:'x'}));expect(r.status).toBe(503);expect(await r.text()).not.toContain('token');expect(call.mock.calls[2][0]).toContain('logout')
})
it('troca senha verifica identidade, senha atual e revogação global',async()=>{
 call.mockResolvedValueOnce(response({environment:'pilot'})).mockResolvedValueOnce(response({id:'user-1',email:'gar01@pcif-operators.invalid'})).mockResolvedValueOnce(response({access_token:'temporary',user:{id:'user-1'}})).mockResolvedValueOnce(response({})).mockResolvedValueOnce(response({}))
 const r=await password(request({currentPassword:'old',newPassword:'New-Test-Password-2026!',confirmation:'New-Test-Password-2026!'},true));expect(r.status).toBe(200);expect(await r.json()).toEqual({changed:true});expect(call.mock.calls[4][0]).toContain('scope=global')
})
it('recusa troca sem sessão e informa revogação não confirmada',async()=>{
 expect((await password(request({}))).status).toBe(401)
 call.mockResolvedValueOnce(response({environment:'pilot'})).mockResolvedValueOnce(response({id:'u',email:'u@example.invalid'})).mockResolvedValueOnce(response({access_token:'temporary',user:{id:'u'}})).mockResolvedValueOnce(response({})).mockResolvedValueOnce(response({},500)).mockResolvedValueOnce(response({}))
 const r=await password(request({currentPassword:'old',newPassword:'New-Test-Password-2026!',confirmation:'New-Test-Password-2026!'},true));expect(r.status).toBe(502);expect((await r.json()).changed).toBe(true)
})

it('liberação da senha inicial usa chamada privada fixa após senha diferente e revogação',async()=>{
 vi.stubEnv('PCIF_PASSWORD_ADMIN_KEY','sb_secret_local_test_only')
 call.mockResolvedValueOnce(response({environment:'pilot',mustChangePassword:true})).mockResolvedValueOnce(response({id:'u',email:'u@example.invalid'})).mockResolvedValueOnce(response({access_token:'temporary',user:{id:'u'}})).mockResolvedValueOnce(response({})).mockResolvedValueOnce(response({})).mockResolvedValueOnce(response(true))
 const r=await password(request({currentPassword:'old',newPassword:'New-Test-Password-2026!',confirmation:'New-Test-Password-2026!'},true));expect(r.status).toBe(200)
 expect(call.mock.calls[5][0]).toContain('/rpc/pcif_ops_complete_password_change');expect(JSON.parse(call.mock.calls[5][1].body)).toEqual({p_user_id:'u'});expect(call.mock.calls[5][1].headers.apikey).toBe('sb_secret_local_test_only')
 expect(await r.text()).not.toContain('sb_secret')
})
it('sem configuração privada a troca inicial falha antes de alterar senha',async()=>{
 vi.stubEnv('PCIF_PASSWORD_ADMIN_KEY','')
 call.mockResolvedValueOnce(response({environment:'pilot',mustChangePassword:true}))
 const r=await password(request({currentPassword:'old',newPassword:'New-Test-Password-2026!',confirmation:'New-Test-Password-2026!'},true));expect(r.status).toBe(503);expect(call).toHaveBeenCalledTimes(1)
})
