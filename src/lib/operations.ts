export const operations = ['ATIVAÇÃO', 'CHECKLIST', 'MANUTENÇÃO', 'DESATIVAÇÃO'] as const
export type Operation = typeof operations[number]
export type OperationalStatus = 'Pendente' | 'Ativa' | 'Em manutenção' | 'OFF'
export interface OperationRecord {
  id: string; kind: Operation; team: string; state: string; region: string;
  notes: string; detail: string; fields: Record<string, string>; createdAt: string; operationalDate?:string
}
export interface OperationsRepository { save(record: Omit<OperationRecord, 'id' | 'createdAt'>): Promise<OperationRecord> }
// Volátil de propósito: nenhum dado operacional ou credencial é persistido no navegador.
export class DemoOperationsRepository implements OperationsRepository {
  async save(record: Omit<OperationRecord, 'id' | 'createdAt'>): Promise<OperationRecord> {
    return { ...record, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
  }
}
