import {render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {expect,it,vi} from 'vitest'
import {OperationsApp} from '../App'
import {vehicleItems,cargoItems} from '../lib/checklist'
import type {PilotSnapshot,PilotSession} from './service'
const profile={team:'GAR 03',state:'São Paulo',region:'Norte',environment:'pilot' as const,mustChangePassword:false}
const fields=Object.fromEntries([...vehicleItems.map((_,i)=>[`vehicle.${i}.answer`,'Conforme']),...cargoItems.flatMap((_,i)=>[[`cargo.${i}.answer`,'Conforme'],[`cargo.${i}.quantity`,'2']])])
const snapshot:PilotSnapshot={profile,status:'Pendente',beforeMaintenance:null,revision:7,operationalDate:'2026-10-19',reports:[{id:'last',team_id:'GAR 03',environment:'pilot',kind:'checklist',created_at:'2026-10-18T15:30:00Z',operational_date:'2026-10-18',payload:{fields,notes:'Observação anterior'}}]}
function session(patch:Partial<PilotSession>={}):PilotSession{return {snapshot,refresh:vi.fn(async()=>snapshot),submit:vi.fn(async()=>{}),logout:vi.fn(),changePassword:vi.fn(),...patch}}
it('reutiliza 33 respostas e quantidades; exige conferência hoje e conserva edição após falha',async()=>{
 const user=userEvent.setup(),submit=vi.fn().mockRejectedValueOnce(Error('Gravação não confirmada.')).mockResolvedValue(undefined),remote=session({submit})
 render(<OperationsApp remote={remote}/>);await user.click(screen.getByRole('button',{name:'02 CHECKLIST'}))
 await screen.findByRole('complementary',{name:'Referência do checklist'})
 expect(remote.refresh).toHaveBeenCalledTimes(1)
 expect(screen.getByText(/18\/10\/2026/)).toHaveTextContent('12:30')
 expect(screen.getAllByLabelText('Condição')).toHaveLength(33)
 expect(screen.getAllByLabelText('Condição').every(e=>(e as HTMLSelectElement).value==='Conforme')).toBe(true)
 expect(screen.getAllByLabelText('Quantidade encontrada').every(e=>(e as HTMLInputElement).value==='2')).toBe(true)
 expect(screen.getByLabelText('Observações')).toHaveValue('')
 await user.selectOptions(screen.getAllByLabelText('Condição')[0],'Não conforme')
 await user.type(screen.getByLabelText('Descrição do problema'),'Problema conferido hoje')
 await user.click(screen.getByRole('button',{name:'Revisar registro'}))
 await user.click(screen.getByRole('button',{name:'Confirmar gravação'}));expect(submit).not.toHaveBeenCalled()
 await user.click(screen.getByRole('checkbox',{name:/Confirmo que conferi/}));await user.click(screen.getByRole('button',{name:'Confirmar gravação'}))
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Gravação não confirmada'))
 expect(screen.getByLabelText('Descrição do problema')).toHaveValue('Problema conferido hoje')
 await user.click(screen.getByRole('button',{name:'Revisar registro'}))
 expect(screen.getByRole('checkbox')).not.toBeChecked()
 await user.click(screen.getByRole('checkbox'));await user.click(screen.getByRole('button',{name:'Confirmar gravação'}))
 await waitFor(()=>expect(submit).toHaveBeenCalledTimes(2))
 expect(submit.mock.calls[0]).toEqual(submit.mock.calls[1])
 expect(submit.mock.calls[0][1]['vehicle.0.answer']).toBe('Não conforme')
 expect(snapshot.reports[0].payload.fields['vehicle.0.answer']).toBe('Conforme')
 expect(await screen.findByRole('navigation')).toBeInTheDocument()
})
it('falha de leitura permite tentar novamente; ausência real deixa os 33 itens vazios',async()=>{
 const user=userEvent.setup(),empty={...snapshot,reports:[]},refresh=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(empty)
 render(<OperationsApp remote={session({refresh})}/>);await user.click(screen.getByRole('button',{name:'02 CHECKLIST'}))
 expect(await screen.findByRole('button',{name:'Tentar consultar novamente'})).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Revisar registro'})).toBeDisabled()
 expect(screen.queryAllByLabelText('Condição')).toHaveLength(0)
 await user.click(screen.getByRole('button',{name:'Tentar consultar novamente'}))
 await screen.findByText(/Nenhum checklist anterior/)
 expect(screen.getAllByLabelText('Condição').every(e=>(e as HTMLSelectElement).value==='')).toBe(true)
})
it('resposta tardia após voltar não reabre nem preenche outro formulário',async()=>{
 const user=userEvent.setup();let resolve!:(data:PilotSnapshot)=>void
 render(<OperationsApp remote={session({refresh:()=>new Promise(done=>{resolve=done})})}/>);
 await user.click(screen.getByRole('button',{name:'02 CHECKLIST'}));expect(screen.getByText(/Consultando o último checklist/)).toBeInTheDocument()
 await user.click(screen.getByRole('button',{name:'← Voltar às operações'}))
 await user.click(screen.getByRole('button',{name:'01 ATIVAÇÃO'}));resolve(snapshot)
 await waitFor(()=>expect(screen.getByLabelText('Placa do veículo')).toBeInTheDocument())
 expect(screen.queryByRole('complementary',{name:'Referência do checklist'})).not.toBeInTheDocument()
})
