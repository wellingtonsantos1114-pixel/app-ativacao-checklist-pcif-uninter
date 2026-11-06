export const teams = [
  ...Array.from({length:23},(_,i)=>`GAR ${String(i+1).padStart(2,'0')}`),
  ...Array.from({length:8},(_,i)=>`GAC ${String(i+1).padStart(2,'0')}`),
]
export function teamRegion(team:string) {
  if(team==='GAR 21') return {state:'Paraná',region:'Paraná'}
  if(['GAR 22','GAR 23','GAC 07'].includes(team)) return {state:'Minas Gerais',region:'Minas Gerais'}
  const north=['GAR 01','GAR 03','GAR 04','GAR 06','GAC 03']
  const northwest=['GAR 02','GAR 05','GAR 19','GAR 20','GAC 01','GAC 05']
  const center=['GAR 07','GAR 08','GAR 09','GAR 10','GAR 11','GAR 12','GAC 02','GAC 04']
  return {state:'São Paulo',region:north.includes(team)?'Norte':northwest.includes(team)?'Noroeste':center.includes(team)?'Centro':'Sul'}
}
