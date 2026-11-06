// @vitest-environment node
import {expect,it} from 'vitest'
import {latestChecklist} from './checklistReference'
import type {PilotSnapshot,Report} from './service'
const profile={team:'GAR 03',state:'São Paulo',region:'Norte',environment:'pilot' as const,mustChangePassword:false}
const snapshot:PilotSnapshot={profile,status:'Pendente',revision:0,beforeMaintenance:null,reports:[],operationalDate:'2026-10-19'}
function report(id:string,date:string,patch:Partial<Report>={}):Report{return {id,team_id:'GAR 03',environment:'pilot',kind:'checklist',created_at:date,operational_date:date.slice(0,10),payload:{fields:{'vehicle.0.answer':'Não conforme','vehicle.0.problem':'Farol queimado','cargo.0.quantity':'2','cargo.0.answer':'Conforme',notes:'Não reutilizar'},notes:'Anterior'},...patch}}
it('seleciona o último checklist próprio, mesmo fora de ordem, sem equipe ou ambiente cruzado',()=>{
 const result=latestChecklist({...snapshot,reports:[report('old','2026-10-16T12:00:00Z'),report('foreign','2026-10-19T12:00:00Z',{team_id:'GAR 04'}),report('production','2026-10-19T12:00:00Z',{environment:'production'}),report('activation','2026-10-19T12:00:00Z',{kind:'activation'}),report('latest','2026-10-18T12:00:00Z')]})
 expect(result?.id).toBe('latest');expect(result?.fields['vehicle.0.problem']).toBe('Farol queimado');expect(result?.fields['cargo.0.quantity']).toBe('2');expect(result?.fields.notes).toBeUndefined()
})
it('sem histórico próprio mantém vazio e não altera os dados anteriores',()=>{
 const before=report('foreign','2026-10-18T12:00:00Z',{team_id:'GAR 04'}),copy=JSON.stringify(before)
 expect(latestChecklist({...snapshot,reports:[before]})).toBeUndefined();expect(JSON.stringify(before)).toBe(copy)
 expect(latestChecklist(snapshot)).toBeUndefined()
})

it('desempata timestamps com precisão de milissegundo pela revisão do servidor',()=>{
 const result=latestChecklist({...snapshot,reports:[report('z-old','2026-10-18T12:00:00.123100Z',{team_revision:4}),report('a-new','2026-10-18T12:00:00.123900Z',{team_revision:5})]})
 expect(result?.id).toBe('a-new')
})
