import {isOnlyAppWindow} from './pwaUpdateSafety'
import {useEffect,useRef,useState} from 'react'
import {useRegisterSW} from 'virtual:pwa-register/react'
export default function AppUpdateNotice(){
 const registration=useRef<ServiceWorkerRegistration|undefined>(undefined)
 const changedForms=useRef(new WeakSet<HTMLFormElement>())
 const [blocked,setBlocked]=useState(false)
 useEffect(()=>{
  const check=()=>setBlocked(Boolean(document.querySelector('[data-pwa-block-update]'))||Array.from(document.forms).some(form=>changedForms.current.has(form)))
  const edit=(event:Event)=>{const form=(event.target as HTMLInputElement).form;if(form)changedForms.current.add(form);check()}
  const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true})
  document.addEventListener('input',edit);document.addEventListener('change',edit);check()
  return()=>{observer.disconnect();document.removeEventListener('input',edit);document.removeEventListener('change',edit)}
 },[])
 const [updating,setUpdating]=useState(false),[error,setError]=useState('')
 const {needRefresh:[needRefresh],updateServiceWorker}=useRegisterSW({
  onRegisteredSW(_url,r){registration.current=r;void r?.update().catch(()=>{/* Repetir quando houver conexão. */})}
 })
 useEffect(()=>{
  const check=()=>{if(document.visibilityState!=='hidden')void registration.current?.update().catch(()=>{/* Repetir ao retornar à rede. */})}
  const timer=setInterval(check,60_000)
  window.addEventListener('focus',check);window.addEventListener('online',check);document.addEventListener('visibilitychange',check)
  return()=>{clearInterval(timer);window.removeEventListener('focus',check);window.removeEventListener('online',check);document.removeEventListener('visibilitychange',check)}
 },[])
 async function update(){
  if(updating||blocked)return
  if(!await isOnlyAppWindow()){setError('Feche as outras abas ou janelas deste aplicativo e tente novamente. Se necessário, feche e reabra o aplicativo após concluir os registros.');return}
  if(document.querySelector('[data-pwa-block-update]')||Array.from(document.forms).some(form=>changedForms.current.has(form)))return
  if(!window.confirm('Atualizar recarrega o aplicativo e encerra a sessão. Confirme que seus registros foram enviados. Deseja atualizar agora?'))return
  setUpdating(true);setError('')
  try{await updateServiceWorker(true)}catch{setError('Não foi possível atualizar. Verifique a conexão e tente novamente.')}finally{setUpdating(false)}
 }
 return <><small className="app-version">Versão do aplicativo: {__PCIF_BUILD_SHA__}</small>{needRefresh&&<section className="app-update" aria-label="Atualização do aplicativo"><p role="status">Nova versão disponível. Conclua os registros pendentes antes de atualizar.</p><button type="button" disabled={updating||blocked} onClick={()=>void update()}>{updating?'Atualizando…':'Atualizar aplicativo'}</button>{blocked&&<p>Atualização bloqueada durante o preenchimento. Envie o registro ou saia do formulário antes de atualizar.</p>}{error&&<p role="alert">{error}</p>}</section>}</>
}
