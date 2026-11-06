import Icon, { type IconName } from './OperatorIcon'
import { operations, type Operation, type OperationRecord, type OperationalStatus } from './lib/operations'
import { teamRegion } from './lib/teams'
import './operator.css'
const cards: {icon:IconName;theme:string;subtitle:string;description:string;decoration:IconName}[] = [
 {icon:'shield',theme:'activation',subtitle:'Iniciar uma nova operação',description:'Registre a saída da equipe com todos os equipamentos operacionais.',decoration:'shield'},
 {icon:'clipboard',theme:'checklist',subtitle:'Verificar condições do equipamento',description:'Confirme as condições da VTR, rádios, HT, KIT e demais itens.',decoration:'radio'},
 {icon:'tool',theme:'maintenance',subtitle:'Registrar cuidados e reparos',description:'Controle o início e a finalização da manutenção da equipe.',decoration:'tool'},
 {icon:'power',theme:'deactivation',subtitle:'Encerrar a operação com segurança',description:'Registre o retorno da equipe e o encerramento da operação.',decoration:'power'},
]
export const statusTone:Record<OperationalStatus,string>={'Pendente':'pending','Ativa':'active','Em manutenção':'maintenance','OFF':'off'}
export default function OperatorDashboard({team,status,records,notice,onOpen,onExit,pilot=false,onPassword,identity,operationalDate}:{team:string;status:OperationalStatus;records:OperationRecord[];notice:string;onOpen:(kind:Operation)=>void;onExit:()=>void;pilot?:boolean;onPassword?:()=>void;identity?:{state:string;region:string};operationalDate?:string}) {
 const {state,region}=identity??teamRegion(team)
 const [prefix,number]=team.split(' ')
 const activation=records.some(record=>record.kind==='ATIVAÇÃO'&&(!pilot||record.operationalDate===operationalDate))
 const checklist=records.some(record=>record.kind==='CHECKLIST'&&(!pilot||record.operationalDate===operationalDate))
 return <div className="operator-shell"><main className="operator-main">
  <header className="operator-header">
   <button className="operator-back" aria-label="Sair" onClick={onExit}><Icon name="back"/>Voltar</button>
   <div className="operator-identity"><p className="operator-eyebrow">ÁREA DO OPERADOR</p><h1 aria-label={team}>{prefix} <span>{number}</span></h1><div className="operator-underline"/><p className="operator-location"><Icon name="pin"/>{state} · {region}</p></div>
   <div className="operator-wordmark" aria-label="PCIF — Ativação e Checklist"><strong>PCIF</strong><span>ATIVAÇÃO E CHECKLIST</span><small>{pilot?'PILOTO ISOLADO':'AMBIENTE DEMONSTRATIVO'}</small>{onPassword&&<button type="button" className="text-button" onClick={onPassword}>Alterar senha</button>}</div>
  </header>
  <section className={`operator-state tone-${statusTone[status]}`} aria-label="Estado operacional"><div>Estado operacional: <strong data-testid="operational-status"><Icon name={status==='Ativa'?'check':status==='Em manutenção'?'tool':status==='OFF'?'power':'clock'}/>{status}</strong><span className="state-demo">({pilot?'piloto':'demo'})</span></div><p>{pilot?'Piloto isolado. Registros confirmados pelo servidor de homologação.':'Modo demonstrativo. Os registros são descartados ao sair ou recarregar.'}</p></section>
  {notice && <p className="operator-feedback" role="status">{notice}</p>}
  <p className="operator-prompt">Selecione a operação que deseja registrar.</p>
  <nav className="operator-cards" aria-label="Operações">{operations.map((kind,index)=>{
   const card=cards[index]
   return <button key={kind} className={`operator-card card-${card.theme}`} aria-label={`${String(index+1).padStart(2,'0')} ${kind}`} onClick={()=>onOpen(kind)}>
    <span className="card-number">0{index+1}</span><span className="card-emblem"><Icon name={card.icon}/></span>
    <span className="card-title"><strong>{kind}</strong><span>{card.subtitle}</span></span>
    <span className="card-description">{card.description}</span><span className="card-art" aria-hidden="true"><Icon name={card.decoration}/></span><span className="card-arrow"><Icon name="arrow"/></span>
   </button>
  })}</nav>
  <section className="operator-summary" aria-label="Status dos relatórios"><h2><Icon name="grid"/>Status atual da equipe</h2><p className={activation?'report-done':'report-pending'}><Icon name={activation?'check':'clock'}/>Ativação: <strong>{activation?'Concluída':'Pendente'}</strong></p><p className={checklist?'report-done':'report-pending'}><Icon name={checklist?'check':'clock'}/>Checklist: <strong>{checklist?'Concluído':'Pendente'}</strong></p></section>
  <section className="operator-history" aria-labelledby="session-title"><h2 id="session-title"><Icon name="document"/>Registros desta sessão <span aria-label={`${records.length} registros`}>{records.length.toString().padStart(2,'0')}</span></h2>
   {records.length===0?<div className="operator-empty"><Icon name="document"/><p>Nenhum registro ainda.<br/>Escolha uma operação para começar.</p></div>:<ol>{records.map(record=><li key={record.id}><Icon name="document"/><div><strong>{record.kind} · {record.team}</strong><p>{record.state} · {record.region} · {record.detail}</p>{record.notes&&<p className="record-notes">{record.notes}</p>}</div></li>)}</ol>}
  </section>
  <footer className="operator-footer">PCIF · Aplicativo de operações<span>{pilot?'Piloto isolado · Dados em homologação':'Versão demonstrativa · Dados temporários'}</span></footer>
 </main></div>
}
