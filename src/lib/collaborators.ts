import names from '../data/collaborators.json'
export const collaborators: readonly string[] = names
export const normalizeName = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim()
const registered = new Set(collaborators)
export function collaboratorError(values: readonly string[], index: number): string {
 const value = values[index] ?? ''
 if (!value) return index < 2 ? 'Selecione um colaborador cadastrado.' : ''
 if (!registered.has(value)) return 'Selecione um nome da lista oficial de colaboradores.'
 if (values.some((other, i) => i !== index && normalizeName(other) === normalizeName(value))) return 'Selecione colaboradores diferentes para cada função.'
 return ''
}
export function findCollaborators(query: string, excluded: readonly string[] = []): string[] {
 const unavailable = new Set(excluded.map(normalizeName))
 return collaborators.filter(name => normalizeName(name).includes(normalizeName(query)) && !unavailable.has(normalizeName(name)))
}
