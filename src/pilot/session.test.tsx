import {act,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,expect,it,vi} from 'vitest'
const mock=vi.hoisted(()=>({rpc:vi.fn(),onAuthStateChange:vi.fn(),setSession:vi.fn(),signOut:vi.fn(),stopAutoRefresh:vi.fn(),profile:vi.fn(),snapshot:vi.fn()}))
vi.mock('./service',async original=>{const actual=await original<typeof import('./service')>();return {...actual,pilotClient:()=>({rpc:mock.rpc,auth:mock}),readProfile:mock.profile,readSnapshot:mock.snapshot}})
import PilotGate from './PilotGate'
const profile={team:'GAR 23',state:'Minas Gerais',region:'Minas Gerais',environment:'pilot',mustChangePassword:false}
const snapshot={profile,status:'Pendente',revision:0,beforeMaintenance:null,reports:[],operationalDate:'2026-10-18'}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks()})
it('resposta tardia de gravação não reabre dados após sair da sessão',async()=>{
 let listener:((event:string,session:null)=>void)|undefined,resolve!:(value:unknown)=>void
 mock.onAuthStateChange.mockImplementation(callback=>{listener=callback;return {data:{subscription:{unsubscribe:vi.fn()}}}})
 mock.setSession.mockResolvedValue({error:null});mock.profile.mockResolvedValue(profile);mock.snapshot.mockResolvedValue(snapshot)
 mock.signOut.mockImplementation(async()=>{listener?.('SIGNED_OUT',null);return {error:null}})
 mock.rpc.mockImplementation(()=>new Promise(done=>{resolve=done}))
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({access_token:'local-test',refresh_token:'local-test'}),{status:200,headers:{'Content-Type':'application/json'}})))
 const user=userEvent.setup();render(<PilotGate>{session=><><p>Dados privados do piloto</p><button onClick={()=>void session.submit('MANUTENÇÃO',{},'')}>Enviar operação</button><button onClick={()=>void session.logout()}>Sair do piloto</button></>}</PilotGate>)
 await user.type(screen.getByLabelText('Senha'),'Local-Test-Only');await user.click(screen.getByRole('button',{name:'Entrar no piloto'}));await screen.findByText('Dados privados do piloto')
 await user.click(screen.getByRole('button',{name:'Enviar operação'}));await user.click(screen.getByRole('button',{name:'Sair do piloto'}))
 expect(screen.queryByText('Dados privados do piloto')).not.toBeInTheDocument()
 await act(async()=>{resolve({data:{snapshot:{...snapshot,status:'Em manutenção',revision:1}},error:null})})
 await waitFor(()=>expect(screen.getByRole('button',{name:'Entrar no piloto'})).toBeInTheDocument());expect(screen.queryByText('Dados privados do piloto')).not.toBeInTheDocument()
})

it('GAR 03 acessa imediatamente e escolhe alterar senha voluntariamente',async()=>{
 const gar03={...profile,team:'GAR 03',state:'São Paulo',region:'Norte'}
 mock.onAuthStateChange.mockReturnValue({data:{subscription:{unsubscribe:vi.fn()}}})
 mock.setSession.mockResolvedValue({error:null});mock.profile.mockResolvedValue(gar03);mock.snapshot.mockResolvedValue({...snapshot,profile:gar03})
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({access_token:'local-test',refresh_token:'local-test'}),{status:200,headers:{'Content-Type':'application/json'}})))
 const user=userEvent.setup()
 render(<PilotGate>{session=><><p>Formulários GAR 03</p><button onClick={session.changePassword}>Alterar senha voluntariamente</button></>}</PilotGate>)
 await user.selectOptions(screen.getByLabelText('Equipe'),'GAR 03')
 await user.type(screen.getByLabelText('Senha'),'Local-Test-Only')
 await user.click(screen.getByRole('button',{name:'Entrar no piloto'}))
 expect(await screen.findByText('Formulários GAR 03')).toBeInTheDocument()
 expect(screen.queryByText('Troque a senha inicial antes de enviar ou consultar operações.')).not.toBeInTheDocument()
 await user.click(screen.getByRole('button',{name:'Alterar senha voluntariamente'}))
 expect(screen.getByText('Confirme a senha atual para alterá-la.')).toBeInTheDocument()
})

it('HTML da hospedagem no login apresenta orientação e não cria sessão',async()=>{
 mock.onAuthStateChange.mockReturnValue({data:{subscription:{unsubscribe:vi.fn()}}})
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('<!DOCTYPE html><title>Login Redirect</title>',{status:401,headers:{'Content-Type':'text/html'}})))
 const user=userEvent.setup();render(<PilotGate>{()=> <p>Área autenticada</p>}</PilotGate>)
 await user.selectOptions(screen.getByLabelText('Equipe'),'GAR 03')
 await user.type(screen.getByLabelText('Senha'),'Local-Test-Only')
 await user.click(screen.getByRole('button',{name:'Entrar no piloto'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('proteção de acesso do Netlify')
 expect(mock.setSession).not.toHaveBeenCalled()
 expect(screen.queryByText('Área autenticada')).not.toBeInTheDocument()
})
