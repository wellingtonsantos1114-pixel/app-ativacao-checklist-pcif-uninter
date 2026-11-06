import {render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {expect,it,vi} from 'vitest'
import {OperationsApp} from '../App'
import type {PilotSession,PilotSnapshot} from './service'
const snapshot:PilotSnapshot={profile:{team:'GAR 23',state:'Minas Gerais',region:'Minas Gerais',environment:'pilot',mustChangePassword:false},status:'Pendente',revision:0,beforeMaintenance:null,reports:[],operationalDate:'2026-10-18'}
it('mantém formulário e observações após falha, sem anunciar sucesso antes da gravação',async()=>{
 const user=userEvent.setup();let fail!:(e:Error)=>void
 const submit=vi.fn(()=>new Promise<void>((_,reject)=>{fail=reject}));const remote:PilotSession={snapshot,refresh:vi.fn(async()=>snapshot),submit,logout:vi.fn(),changePassword:vi.fn()}
 render(<OperationsApp remote={remote}/>);await user.click(screen.getByRole('button',{name:'03 MANUTENÇÃO'}));await user.type(screen.getByLabelText('Observações'),'Teste fictício de conexão')
 await user.click(screen.getByRole('button',{name:'Revisar início da manutenção'}));await user.click(screen.getByRole('button',{name:'Confirmar início de manutenção'}))
 expect(screen.getByRole('button',{name:'Salvando…'})).toBeDisabled();expect(screen.queryByText(/Gravação confirmada/)).not.toBeInTheDocument()
 fail(Error('Gravação não confirmada. Tente novamente.'));await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Gravação não confirmada'))
 expect(screen.getByLabelText('Observações')).toHaveValue('Teste fictício de conexão');expect(screen.getByRole('button',{name:'Revisar início da manutenção'})).toBeInTheDocument()
})
it('histórico remoto usa perfil/horário do servidor e indicadores apenas do dia operacional',()=>{
 const remote:PilotSession={snapshot:{...snapshot,reports:[{id:'old',team_id:'GAR 23',kind:'activation',environment:'pilot',created_at:'2026-10-17T14:00:00Z',operational_date:'2026-10-17',payload:{fields:{},notes:'Registro antigo fictício'}}]},refresh:vi.fn(async()=>snapshot),submit:vi.fn(),logout:vi.fn(),changePassword:vi.fn()}
 render(<OperationsApp remote={remote}/>);expect(screen.getByRole('region',{name:'Status dos relatórios'})).toHaveTextContent('Ativação: Pendente');expect(screen.getByText('ATIVAÇÃO · GAR 23')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Alterar senha'})).toBeInTheDocument()
})

it('preserva colaboradores após falha, exige nova revisão ao selecionar e envia grafia oficial',async()=>{
 const user=userEvent.setup()
 const submit=vi.fn().mockRejectedValueOnce(Error('Gravação não confirmada')).mockResolvedValueOnce(undefined)
 const remote:PilotSession={snapshot,refresh:vi.fn(async()=>snapshot),submit,logout:vi.fn(),changePassword:vi.fn()}
 render(<OperationsApp remote={remote}/>);await user.click(screen.getByRole('button',{name:'01 ATIVAÇÃO'}))
 await user.type(screen.getByLabelText('Líder / Condutor'),'custodio');await user.click(screen.getByText('ABEL CUSTÓDIO EXEMPLO',{exact:true}))
 await user.type(screen.getByLabelText('Auxiliar 1'),'aaron matheus');await user.click(screen.getByText('AARON MATHEUS EXEMPLO SILVA',{exact:true}))
 for(const [label,value] of [['Placa do veículo','TEST123'],['Projeto de Centralização','Projeto teste'],['Município de atuação','Município teste']])await user.type(screen.getByLabelText(label),value)
 for(const label of ['Kit de combate a incêndios','Tablet','Comunicação via rádio'])await user.selectOptions(screen.getByLabelText(label),'Operante')
 await user.click(screen.getByRole('button',{name:'Revisar registro'}))
 expect(screen.getByRole('button',{name:'Confirmar gravação'})).toBeInTheDocument()
 await user.click(screen.getByLabelText('Auxiliar 2'));await user.click(screen.getByText('ACÁCIO FERREIRA EXEMPLO',{exact:true}))
 expect(screen.getByRole('button',{name:'Revisar registro'})).toBeInTheDocument()
 await user.click(screen.getByRole('button',{name:'Revisar registro'}));await user.click(screen.getByRole('button',{name:'Confirmar gravação'}))
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Gravação não confirmada'))
 expect(screen.getByLabelText('Líder / Condutor')).toHaveValue('ABEL CUSTÓDIO EXEMPLO')
 expect(screen.getByLabelText('Auxiliar 1')).toHaveValue('AARON MATHEUS EXEMPLO SILVA')
 expect(screen.getByLabelText('Auxiliar 2')).toHaveValue('ACÁCIO FERREIRA EXEMPLO')
 await user.click(screen.getByRole('button',{name:'Revisar registro'}));await user.click(screen.getByRole('button',{name:'Confirmar gravação'}))
 expect(submit).toHaveBeenLastCalledWith('ATIVAÇÃO',expect.objectContaining({'person.0':'ABEL CUSTÓDIO EXEMPLO','person.1':'AARON MATHEUS EXEMPLO SILVA','person.2':'ACÁCIO FERREIRA EXEMPLO'}),'')
 expect(await screen.findByRole('status')).toHaveTextContent('Gravação confirmada')
},30000)
