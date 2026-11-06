import {createClient,type SupabaseClient} from '@supabase/supabase-js'
import {publicSupabaseConfig} from './publicConfig'
import type {Operation,OperationRecord,OperationalStatus} from '../lib/operations'
export interface PilotProfile {team:string;state:string;region:string;environment:'pilot';mustChangePassword:boolean}
export interface Report {id:string;team_revision?:number;team_id:string;kind:'activation'|'checklist'|'maintenance_enter'|'maintenance_exit'|'deactivation';payload:{fields:Record<string,string>;notes:string};created_at:string;operational_date:string;environment:string}
export interface PilotSnapshot {profile:PilotProfile;status:OperationalStatus;beforeMaintenance:OperationalStatus|null;revision:number;reports:Report[];operationalDate:string}
const labels:Record<Report['kind'],Operation>={activation:'ATIVAÇÃO',checklist:'CHECKLIST',maintenance_enter:'MANUTENÇÃO',maintenance_exit:'MANUTENÇÃO',deactivation:'DESATIVAÇÃO'}
export function toRecords(snapshot:PilotSnapshot):OperationRecord[]{return snapshot.reports.map(r=>({id:r.id,kind:labels[r.kind],team:r.team_id,state:snapshot.profile.state,region:snapshot.profile.region,createdAt:r.created_at,operationalDate:r.operational_date,notes:r.payload.notes,fields:r.payload.fields,detail:r.kind==='maintenance_enter'?'Iniciar manutenção':r.kind==='maintenance_exit'?'Finalizar manutenção':r.kind==='deactivation'?r.payload.fields.detail:'Relatório gravado'}))}
export function assertPilot(profile:PilotProfile){if(profile.environment!=='pilot')throw Error('Acesso bloqueado: este aplicativo está limitado ao piloto isolado.')}
export function pilotClient(){
 const config=publicSupabaseConfig(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
 if(!config)throw Error('Configure o Supabase de homologação para habilitar o piloto.')
 return createClient(config.url,config.key,{global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})},auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}})
}
export class PilotAccessError extends Error {}
export async function readProfile(client:SupabaseClient):Promise<PilotProfile>{const {data,error}=await client.rpc('pcif_ops_profile');if(error){if(error.code==='42501'||error.code==='PGRST301')throw new PilotAccessError('Sessão inválida ou equipe não autorizada. Entre novamente.');throw Error('Não foi possível verificar a sessão. Verifique a conexão.')};assertPilot(data);return data}
export async function readSnapshot(client:SupabaseClient):Promise<PilotSnapshot>{const {data,error}=await client.rpc('pcif_ops_snapshot');if(error)throw Error('Não foi possível recuperar os registros do piloto.');assertPilot(data.profile);return data}
export class PilotWriter {
 private pending?:{signature:string;id:string}
 constructor(private client:SupabaseClient,private snapshot:()=>PilotSnapshot,private publish:(data:PilotSnapshot)=>void){}
 async submit(kind:Operation,fields:Record<string,string>,notes:string){
  const snapshot=this.snapshot();assertPilot(snapshot.profile)
  const type=kind==='ATIVAÇÃO'?'activation':kind==='CHECKLIST'?'checklist':kind==='DESATIVAÇÃO'?'deactivation':snapshot.status==='Em manutenção'?'maintenance_exit':'maintenance_enter'
  const payload={fields,notes},signature=JSON.stringify({type,payload})
  // Mantém a chave após timeout: uma resposta perdida não gera um segundo evento.
  if(this.pending?.signature!==signature)this.pending={signature,id:crypto.randomUUID()}
  const {data,error}=await this.client.rpc('pcif_ops_submit',{p_request_id:this.pending.id,p_kind:type,p_payload:payload,p_expected_revision:snapshot.revision})
  if(error){
   if(error.code==='40001'){this.pending=undefined;this.publish(await readSnapshot(this.client));throw Error('O estado mudou em outra sessão. Revise os dados atualizados antes de confirmar.')}
   throw Error(error.code==='42501'?'Acesso negado ou sessão expirada. Entre novamente.':`Gravação não confirmada. Os dados foram mantidos para nova tentativa. ${error.code==='P0001'?error.message:'Verifique a conexão.'}`)
  }
  assertPilot(data.snapshot.profile);this.publish(data.snapshot);this.pending=undefined
 }
}
export interface PilotSession {snapshot:PilotSnapshot;refresh:()=>Promise<PilotSnapshot>;submit:(kind:Operation,fields:Record<string,string>,notes:string)=>Promise<void>;logout:()=>Promise<void>;changePassword:()=>void}
