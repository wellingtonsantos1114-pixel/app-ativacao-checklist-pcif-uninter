import {readFunctionResponse} from './functionResponse'
import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react'
import {pilotClient,readProfile,readSnapshot,PilotWriter,PilotAccessError,type PilotProfile,type PilotSnapshot,type PilotSession} from './service'
import {teams} from '../lib/teams'
export default function PilotGate({children}:{children:(session:PilotSession)=>React.ReactNode}){
 const [client]=useState(pilotClient)
 const [profile,setProfile]=useState<PilotProfile>(),[snapshot,setSnapshot]=useState<PilotSnapshot>()
 const generation=useRef(0)
 const current=useRef<PilotSnapshot|undefined>(undefined);current.current=snapshot
 const [team,setTeam]=useState('GAR 01'),[password,setPassword]=useState(''),[next,setNext]=useState(''),[confirmation,setConfirmation]=useState('')
 const [changing,setChanging]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const writer=useMemo(()=>{const epoch=generation.current;return new PilotWriter(client,()=>{if(!current.current||generation.current!==epoch)throw Error('Sessão indisponível');return current.current},value=>{if(generation.current===epoch)setSnapshot(value)})},[client,profile?.team])
 useEffect(()=>{
  let alive=true
  const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{if(!session&&alive){generation.current++;setProfile(undefined);setSnapshot(undefined);setChanging(false)}})
  // Validação periódica limita a exposição após revogação; nenhuma sessão é persistida.
  const check=async()=>{if(!current.current)return;const epoch=generation.current;try{await readProfile(client)}catch(e){if(alive&&generation.current===epoch&&e instanceof PilotAccessError){generation.current++;setProfile(undefined);setSnapshot(undefined);setError('Sessão expirada ou acesso revogado. Entre novamente.')}}}
  const timer=setInterval(()=>void check(),30000);window.addEventListener('focus',check);window.addEventListener('online',check)
  return()=>{alive=false;subscription.unsubscribe();clearInterval(timer);window.removeEventListener('focus',check);window.removeEventListener('online',check);void client.auth.stopAutoRefresh()}
 },[client])
 async function login(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');const epoch=++generation.current;try{
  const response=await fetch('/.netlify/functions/operator-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({team,password}),cache:'no-store',signal:AbortSignal.timeout(15000)})
  const data=await readFunctionResponse(response);if(!response.ok)throw Error(data.error||'Não foi possível entrar.')
  if(!data.access_token||!data.refresh_token)throw Error('Resposta incompleta do serviço de autenticação.')
  const {error}=await client.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});if(error)throw Error('Não foi possível estabelecer a sessão.')
  const p=await readProfile(client);if(generation.current!==epoch)return;setProfile(p)
  if(!p.mustChangePassword){const data=await readSnapshot(client);if(generation.current===epoch)setSnapshot(data)}
 }catch(e){setError((e as Error).message)}finally{setPassword('');setBusy(false)}}
 async function change(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');try{
  const {data:{session}}=await client.auth.getSession();if(!session)throw Error('Entre novamente.')
  const response=await fetch('/.netlify/functions/operator-password',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({currentPassword:password,newPassword:next,confirmation}),cache:'no-store',signal:AbortSignal.timeout(15000)})
  const data=await readFunctionResponse(response);if(!data.changed)throw Error(data.error||'Não foi possível alterar a senha.')
  setProfile(undefined);setSnapshot(undefined);setChanging(false);await client.auth.signOut({scope:'local'});setError(response.ok?'Senha alterada. Entre novamente com a nova senha.':data.error||'Não foi possível confirmar a alteração. Procure o administrador.')
 }catch(e){setError((e as Error).message)}finally{setPassword('');setNext('');setConfirmation('');setBusy(false)}}
 if(snapshot&&profile&&snapshot.profile.team===profile.team&&!changing)return children({snapshot,refresh:async()=>{const epoch=generation.current;const data=await readSnapshot(client);if(epoch!==generation.current||data.profile.team!==profile.team||data.profile.environment!==profile.environment)throw Error('Sessão alterada. Entre novamente.');setSnapshot(data);return data},submit:(...args)=>writer.submit(...args),logout:async()=>{const {error}=await client.auth.signOut({scope:'local'});if(error)throw Error('Não foi possível confirmar o encerramento da sessão. Tente novamente.');generation.current++;setSnapshot(undefined);setProfile(undefined)},changePassword:()=>setChanging(true)})
 const passwordScreen=profile?.mustChangePassword||changing
 return <div className="shell shell--login"><picture className="access-background" aria-hidden="true"><source media="(max-height:600px)" srcSet="/login/sector-background-small.webp"/><img src="/login/sector-background.webp" alt="" fetchPriority="high"/></picture><header><div className="brand">PCIF <span>ATIVAÇÃO E CHECKLIST</span></div><span className="badge">PILOTO ISOLADO</span></header><main><section className="login"><p className="eyebrow">GESTÃO EM CAMPO</p><h1>{passwordScreen?'Alterar senha':'Acessar piloto'}</h1><p className="intro">Homologação · Somente dados fictícios</p><form onSubmit={passwordScreen?change:login}>
  {passwordScreen?<p>{profile?.mustChangePassword?'Troque a senha inicial antes de enviar ou consultar operações.':'Confirme a senha atual para alterá-la.'}</p>:<label>Equipe<select value={team} onChange={e=>setTeam(e.target.value)}>{teams.map(t=><option key={t}>{t}</option>)}</select></label>}
  <label>{passwordScreen?'Senha atual':'Senha'}<input type="password" autoComplete={passwordScreen?'current-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} required maxLength={128}/></label>
  {passwordScreen&&<><p>Nova senha: 12 a 128 caracteres, com maiúscula, minúscula, número e símbolo.</p><label>Nova senha<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={next} onChange={e=>setNext(e.target.value)}/></label><label>Confirmar nova senha<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label></>}
  {error&&<p role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Aguarde…':passwordScreen?'Alterar senha e entrar novamente':'Entrar no piloto'}</button>
  {profile?.mustChangePassword&&<button type="button" className="text-button" disabled={busy} onClick={async()=>{const {error}=await client.auth.signOut({scope:'local'});if(error)setError('Não foi possível encerrar a sessão.');else{generation.current++;setProfile(undefined);setSnapshot(undefined)}}}>Sair</button>}
  {changing&&!profile?.mustChangePassword&&<button type="button" className="text-button" onClick={()=>{setChanging(false);setError('');setPassword('');setNext('');setConfirmation('')}}>Cancelar</button>}
 </form><p className="footnote">Sem persistência de credenciais neste dispositivo.</p></section></main></div>
}
