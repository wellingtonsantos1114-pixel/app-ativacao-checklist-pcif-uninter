/** Fail closed if the active worker cannot verify that no other window is open. */
export function isOnlyAppWindow(): Promise<boolean> {
 return new Promise(resolve=>{
  const worker=navigator.serviceWorker?.controller
  if(!worker){resolve(false);return}
  const channel=new MessageChannel()
  const finish=(safe:boolean)=>{clearTimeout(timer);channel.port1.close();resolve(safe)}
  const timer=setTimeout(()=>finish(false),2000)
  channel.port1.onmessage=event=>finish(event.data?.safe===true)
  worker.postMessage({type:'PCIF_CHECK_SINGLE_WINDOW'},[channel.port2])
 })
}
