import {collaboratorError} from './lib/collaborators'
import {latestChecklist,type ChecklistReference} from './pilot/checklistReference'
import { useEffect, useRef, useState } from 'react'
import ReportFields from './ReportFields'
import OperatorDashboard from './OperatorDashboard'
import Icon from './OperatorIcon'
import PilotGate from './pilot/PilotGate'
import {toRecords,type PilotSession} from './pilot/service'
import { teams, teamRegion } from './lib/teams'
import { DemoOperationsRepository, type Operation, type OperationRecord, type OperationalStatus } from './lib/operations'
const repository = new DemoOperationsRepository()
export default function App() {
  return import.meta.env.VITE_PCIF_MODE==='pilot'?<PilotGate>{session=><OperationsApp remote={session}/>}</PilotGate>:<OperationsApp/>
}
export function OperationsApp({remote}:{remote?:PilotSession}) {
  const [status,setStatus] = useState<OperationalStatus>(remote?.snapshot.status??'Pendente')
  const [beforeMaintenance,setBeforeMaintenance] = useState<OperationalStatus>('Pendente')
  const submitting = useRef(false)
  const [team,setTeam] = useState(remote?.snapshot.profile.team??'GAR 01')
  const [review,setReview] = useState(false)
  const [signedIn, setSignedIn] = useState(Boolean(remote))
  const [operation, setOperation] = useState<Operation | null>(null)
  const [records, setRecords] = useState<OperationRecord[]>(remote?toRecords(remote.snapshot):[])
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [reference,setReference]=useState<ChecklistReference>()
  const [checklistState,setChecklistState]=useState<'ready'|'loading'|'error'>('ready')
  const [dailyChecked,setDailyChecked]=useState(false)
  const openGeneration=useRef(0)
  useEffect(()=>()=>{openGeneration.current++},[])
  async function openOperation(kind:Operation){
    const epoch=++openGeneration.current
    setOperation(kind);setReview(false);setDailyChecked(false);setNotice('');setReference(undefined)
    if(kind!=='CHECKLIST'){setChecklistState('ready');return}
    if(!remote){
      const previous=records.find(r=>r.kind==='CHECKLIST'&&r.team===team)
      setReference(previous?{id:previous.id,createdAt:previous.createdAt,fields:previous.fields}:undefined)
      setChecklistState('ready');return
    }
    setChecklistState('loading')
    try{
      const fresh=await remote.refresh()
      if(epoch!==openGeneration.current)return
      if(fresh.profile.team!==remote.snapshot.profile.team||fresh.profile.environment!==remote.snapshot.profile.environment)throw Error('Perfil de equipe incompatível. Entre novamente.')
      setReference(latestChecklist(fresh));setChecklistState('ready')
    }catch{
      if(epoch!==openGeneration.current)return
      setChecklistState('error');setNotice('Não foi possível consultar o checklist anterior. Verifique a conexão e tente novamente. Nenhuma resposta foi reutilizada.')
    }
  }

  useEffect(()=>{if(!remote)return;setTeam(remote.snapshot.profile.team);setStatus(remote.snapshot.status);setBeforeMaintenance(remote.snapshot.beforeMaintenance??'Pendente');setRecords(toRecords(remote.snapshot))},[remote?.snapshot])
  const identity=remote?.snapshot.profile??teamRegion(team)
  async function exit(){openGeneration.current++;if(remote){try{await remote.logout()}catch(e){setNotice((e as Error).message)}return}setSignedIn(false);setOperation(null);setRecords([]);setStatus('Pendente');setBeforeMaintenance('Pendente');setReview(false);setNotice('')}
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!operation || submitting.current || (operation==='CHECKLIST'&&checklistState!=='ready')) return
    if(operation==='CHECKLIST'&&review&&!dailyChecked){setNotice('Confirme que conferiu os equipamentos hoje antes de enviar.');return}
    const data = new FormData(event.currentTarget)
    if(operation==='ATIVAÇÃO'){
      const people = [0,1,2].map(i=>String(data.get(`person.${i}`)??''))
      const error = people.map((_,i)=>collaboratorError(people,i)).find(Boolean)
      if(error){setNotice(error);setReview(false);return}
    }
    if (!review) { setDailyChecked(false);setReview(true); setNotice(operation==='CHECKLIST'?'Revise as 33 respostas e confirme que conferiu os equipamentos hoje.':remote?'Revise os dados preenchidos e confirme a gravação.':'Revise os dados preenchidos e confirme o envio fictício.'); return }
    submitting.current = true
    setSaving(true)
    try {
      const detail = operation === 'MANUTENÇÃO' ? (status === 'Em manutenção' ? 'Finalizar manutenção' : 'Iniciar manutenção') : operation === 'DESATIVAÇÃO' ? String(data.get('detail')) : 'Relatório demonstrativo'
      const fields = Object.fromEntries(Array.from(data.entries(), ([key,value])=>[key,String(value)]))
      if(remote){
        const fields=Object.fromEntries(Array.from(data.entries(),([key,value])=>[key,String(value)]))
        await remote.submit(operation,fields,String(data.get('notes')??'').trim())
        setReview(false);setOperation(null);setNotice(operation==='MANUTENÇÃO'?`${team} — ${status==='Em manutenção'?'Manutenção finalizada com sucesso!':'Manutenção iniciada com sucesso!'} Gravação confirmada no piloto.`:'Gravação confirmada no Supabase de homologação.')
        return
      }
      const record = await repository.save({kind:operation,team,...teamRegion(team),notes:String(data.get('notes') ?? '').trim(),detail,fields})
      if (operation === 'MANUTENÇÃO') {
        if (status === 'Em manutenção') setStatus(beforeMaintenance)
        else {setBeforeMaintenance(status);setStatus('Em manutenção')}
      } else if (operation === 'DESATIVAÇÃO') {setStatus('OFF');setBeforeMaintenance('OFF')}
      else if (operation === 'ATIVAÇÃO' && status !== 'Em manutenção') setStatus('Ativa')
      setReview(false); setRecords(current => [record,...current]); setOperation(null); setNotice(operation==='MANUTENÇÃO' ? `${team} — ${status==='Em manutenção'?'Manutenção finalizada com sucesso!':'Manutenção iniciada com sucesso!'} Nenhum dado foi enviado.` : 'Registro fictício salvo nesta sessão. Nenhum dado foi enviado.')
    } catch (e) { setNotice(remote?(e as Error).message:'Não foi possível salvar. Tente novamente.');if(remote)setReview(false);setDailyChecked(false) } finally { submitting.current = false; setSaving(false) }
  }
  if (signedIn && !operation) return <OperatorDashboard team={team} status={status} records={records} notice={notice}
    onOpen={kind=>void openOperation(kind)}
    onExit={()=>void exit()} pilot={Boolean(remote)} onPassword={remote?.changePassword} identity={identity} operationalDate={remote?.snapshot.operationalDate}/>
  return <div className={signedIn ? 'shell' : 'shell shell--login'}>{!signedIn && <picture className="access-background" aria-hidden="true"><source media="(max-height:600px)" srcSet="/login/sector-background-small.webp"/><img src="/login/sector-background.webp" alt="" fetchPriority="high" decoding="async"/></picture>}<header><div className="brand">PCIF <span>ATIVAÇÃO E CHECKLIST</span></div><span className="badge">{remote?'PILOTO ISOLADO':'DEMONSTRAÇÃO'}</span></header><main>
    {!signedIn ? <section className="login"><p className="eyebrow">GESTÃO EM CAMPO</p><h1>Pronto para<br/>a próxima operação.</h1><p className="intro">Ativação, inspeção e manutenção em um só lugar.</p><form onSubmit={e=>{e.preventDefault();setSignedIn(true)}}><h2>Acessar demonstração</h2><p>Use os dados fictícios abaixo. Não informe credenciais reais.</p><label>Equipe<select value={team} onChange={e=>setTeam(e.target.value)}>{teams.map(t=><option key={t}>{t}</option>)}</select></label><p>Entrada fictícia, sem senha e sem autenticação real nesta etapa.</p><button className="primary" type="submit">Entrar na demonstração <span aria-hidden="true">→</span></button></form><p className="footnote">Ambiente independente · Sem conexão com produção</p></section> : <>
    <div className="welcome"><div><p className="eyebrow">ÁREA DO OPERADOR</p><h1>{operation ?? team}</h1></div><button className="text-button" onClick={()=>void exit()}>Sair</button></div>
    <p>{identity.state} · {identity.region}</p><p>Estado operacional: <strong>{status}</strong> ({remote?'piloto':'demo'})</p><p role="status" className="notice">{notice || (remote?'Piloto isolado. Os dados são gravados somente após confirmação do servidor.':'Modo demonstrativo. Os registros são descartados ao sair ou recarregar.')}</p>
    {operation ? <section className="panel"><button className="text-button" onClick={()=>{openGeneration.current++;setOperation(null);setReview(false);setDailyChecked(false);setNotice('')}}>← Voltar às operações</button><h2>Novo registro de {operation.toLocaleLowerCase('pt-BR')}</h2><form data-pwa-block-update onSubmit={save} onChange={()=>{setReview(false);setDailyChecked(false)}}><label>Estado<input value={identity.state} readOnly/></label><label>Regional<input value={identity.region} readOnly/></label><label>Equipe<input value={team} readOnly/></label>{operation==='MANUTENÇÃO' && <section className={`maintenance-highlight ${status==='Em manutenção'?'is-finishing':''}`} aria-label="Ação de manutenção"><Icon name={status==='Em manutenção'?'check':'tool'}/><p className="maintenance-action-state">Estado atual: <strong>{status}</strong></p><h3>{status==='Em manutenção'?'Finalizar manutenção':'Iniciar manutenção'}</h3><p>{status==='Em manutenção'?'A confirmação encerra a manutenção e retorna ao estado anterior apropriado, sem presumir reparos ou ativar a equipe.':'A confirmação coloca a equipe em manutenção. O estado anterior será preservado para a finalização.'}</p></section>}{operation==='DESATIVAÇÃO' && <label>Motivo da desativação<select name="detail"><option>Fim da operação</option><option>Necessidade de manutenção</option></select></label>}{operation==='CHECKLIST'&&checklistState==='loading'&&<p role="status">Consultando o último checklist desta equipe…</p>}
{operation==='CHECKLIST'&&checklistState==='error'&&<button type="button" onClick={()=>void openOperation('CHECKLIST')}>Tentar consultar novamente</button>}
{(operation!=='CHECKLIST'||checklistState==='ready')&&<>
{operation==='CHECKLIST'&&<aside className="notice" aria-label="Referência do checklist">{reference?<p>Respostas anteriores de {team}, registradas em <time dateTime={reference.createdAt}>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(reference.createdAt))}</time> (horário de São Paulo). São apenas referência: confira os 33 equipamentos hoje e altere o que for necessário.</p>:<p>Nenhum checklist anterior desta equipe neste ambiente. Preencha os 33 itens.</p>}</aside>}
<ReportFields key={operation==='CHECKLIST'?reference?.id??'empty-checklist':operation} kind={operation} pilot={Boolean(remote)} onCollaboratorsChange={()=>setReview(false)} initialFields={operation==='CHECKLIST'?reference?.fields:undefined}/>
</>}
{operation==='CHECKLIST'&&review&&<label className="checklist-confirmation"><input type="checkbox" required checked={dailyChecked} onChange={e=>{e.stopPropagation();setDailyChecked(e.target.checked)}}/>Confirmo que conferi os 33 equipamentos hoje e revisei as respostas antes deste envio.</label>}<label>Observações<textarea name="notes" rows={3} maxLength={2000} placeholder="Descreva uma observação fictícia"/></label><button className={`primary ${operation==='MANUTENÇÃO'?`maintenance-submit ${status==='Em manutenção'?'is-finishing':''}`:''}`} disabled={saving||(operation==='CHECKLIST'&&checklistState!=='ready')}>{saving?'Salvando…':review?(operation==='MANUTENÇÃO'?(status==='Em manutenção'?'Confirmar finalização de manutenção':'Confirmar início de manutenção'):operation==='DESATIVAÇÃO'?'Confirmar desativação':(remote?'Confirmar gravação':'Confirmar envio fictício')):operation==='MANUTENÇÃO'?(status==='Em manutenção'?'Revisar finalização da manutenção':'Revisar início da manutenção'):(remote?'Revisar registro':'Revisar registro fictício')}</button></form></section> : null}
    </>}
    </main><footer>PCIF · Aplicativo de operações <span>{remote?'Piloto isolado':'Versão inicial / demo'}</span></footer></div>
}
