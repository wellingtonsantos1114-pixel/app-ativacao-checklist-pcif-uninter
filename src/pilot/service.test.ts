import {describe,it,expect,vi} from 'vitest'
import type {SupabaseClient} from '@supabase/supabase-js'
import {PilotWriter,toRecords,assertPilot,type PilotSnapshot} from './service'
const snapshot: PilotSnapshot={profile:{team:'GAR 23',state:'Minas Gerais',region:'Minas Gerais',environment:'pilot',mustChangePassword:false},status:'Pendente',revision:0,beforeMaintenance:null,reports:[],operationalDate:'2026-10-18'}
describe('gravação real opt-in',()=>{
 it('timeout preserva request_id e só publica sucesso após resposta confirmada',async()=>{
  const rpc=vi.fn().mockResolvedValueOnce({data:null,error:{message:'offline'}}).mockResolvedValueOnce({data:{reportId:'confirmed',snapshot:{...snapshot,status:'Em manutenção',revision:1}},error:null})
  const publish=vi.fn(),writer=new PilotWriter({rpc} as unknown as SupabaseClient,()=>snapshot,publish)
  await expect(writer.submit('MANUTENÇÃO',{},'Teste')).rejects.toThrow('Gravação não confirmada');expect(publish).not.toHaveBeenCalled()
  await writer.submit('MANUTENÇÃO',{},'Teste');expect(publish).toHaveBeenCalledOnce()
  expect(rpc.mock.calls[0][1].p_request_id).toBe(rpc.mock.calls[1][1].p_request_id)
  expect(rpc.mock.calls[0][1]).not.toHaveProperty('team_id');expect(rpc.mock.calls[0][1]).not.toHaveProperty('environment')
 })
 it('mudança de payload gera nova chave e revisão concorrente exige revisão humana',async()=>{
  const rpc=vi.fn().mockResolvedValueOnce({error:{message:'offline'}}).mockResolvedValueOnce({error:{code:'40001'}}).mockResolvedValueOnce({data:{...snapshot,revision:1},error:null})
  const publish=vi.fn(),writer=new PilotWriter({rpc} as unknown as SupabaseClient,()=>snapshot,publish)
  await expect(writer.submit('MANUTENÇÃO',{},'Primeira observação')).rejects.toThrow()
  await expect(writer.submit('MANUTENÇÃO',{},'Outra observação')).rejects.toThrow('Revise')
  expect(rpc.mock.calls[0][1].p_request_id).not.toBe(rpc.mock.calls[1][1].p_request_id);expect(publish).toHaveBeenCalledWith({...snapshot,revision:1})
 })
 it('mantém identidade e horário do servidor e bloqueia perfis de produção',()=>{
  expect(()=>assertPilot({...snapshot.profile,environment:'production'} as any)).toThrow('limitado ao piloto')
  const rows=toRecords({...snapshot,reports:[{id:'saved',team_id:'GAR 23',environment:'pilot',kind:'checklist',created_at:'2026-10-18T14:00:00Z',operational_date:'2026-10-18',payload:{fields:{'vehicle.0.answer':'Não conforme'},notes:'Fictício'}}]})
  expect(rows[0]).toMatchObject({id:'saved',team:'GAR 23',kind:'CHECKLIST',operationalDate:'2026-10-18',createdAt:'2026-10-18T14:00:00Z'})
 })
})
