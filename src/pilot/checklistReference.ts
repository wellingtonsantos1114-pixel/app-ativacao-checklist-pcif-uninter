import {cargoItems,vehicleItems} from '../lib/checklist'
import {assertPilot,type PilotSnapshot} from './service'
export interface ChecklistReference {id:string;createdAt:string;fields:Record<string,string>}
export function latestChecklist(snapshot:PilotSnapshot):ChecklistReference|undefined{
 assertPilot(snapshot.profile)
 const previous=snapshot.reports.filter(r=>r.kind==='checklist'&&r.team_id===snapshot.profile.team&&r.environment===snapshot.profile.environment)
  .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||(b.team_revision??0)-(a.team_revision??0)||b.id.localeCompare(a.id))[0]
 if(!previous)return
 if(!Number.isFinite(Date.parse(previous.created_at)))throw Error('Data do checklist anterior inválida. Procure o administrador.')
 const fields:Record<string,string>={}
 const ids=[...vehicleItems.map((_,i)=>`vehicle.${i}`),...cargoItems.map((_,i)=>`cargo.${i}`)]
 for(const id of ids){
  const answer=previous.payload.fields[`${id}.answer`]
  if(['Conforme','Não conforme','Não se aplica'].includes(answer))fields[`${id}.answer`]=answer
  const problem=previous.payload.fields[`${id}.problem`]
  if(answer==='Não conforme'&&typeof problem==='string')fields[`${id}.problem`]=problem.slice(0,2000)
  const quantity=previous.payload.fields[`${id}.quantity`]
  if(id.startsWith('cargo.')&&typeof quantity==='string'&&/^\d{1,6}$/.test(quantity))fields[`${id}.quantity`]=quantity
 }
 return {id:previous.id,createdAt:previous.created_at,fields}
}
