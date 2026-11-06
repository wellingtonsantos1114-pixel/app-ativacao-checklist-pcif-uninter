import {fireEvent, render, screen, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'
import CollaboratorFields from './CollaboratorFields'
import {collaborators, collaboratorError, findCollaborators, normalizeName} from './lib/collaborators'
import {DemoOperationsRepository} from './lib/operations'
import {toRecords, type PilotSnapshot} from './pilot/service'

describe('Lista oficial de colaboradores', () => {
 it('contém 40 nomes fictícios sem duplicidades exatas ou normalizadas', () => {
  expect(collaborators).toHaveLength(40)
  expect(new Set(collaborators).size).toBe(40)
  expect(new Set(collaborators.map(normalizeName)).size).toBe(40)
  expect(collaborators[0]).toBe('AARON MATHEUS EXEMPLO SILVA')
  expect(collaborators.at(-1)).toBe('ZULEICA EXEMPLO TESTE')
 })
 it('busca qualquer trecho, sem diferenciar acentos ou caixa, mantendo grafia', () => {
  expect(findCollaborators('custodio')).toEqual(['ABEL CUSTÓDIO EXEMPLO'])
  expect(findCollaborators('CUSTÓDIO')).toEqual(findCollaborators('custodio'))
  expect(findCollaborators('bulhoes')).toEqual(['WALTER BULHÕES EXEMPLO'])
  expect(findCollaborators('theus')).toContain('AARON MATHEUS EXEMPLO SILVA')
  expect(findCollaborators('inexistente')).toEqual([])
 })
 it('valida obrigatórios, lista oficial, opcional e duplicidade', () => {
  expect(collaboratorError(['','',''],0)).toBeTruthy()
  expect(collaboratorError(['','',''],1)).toBeTruthy()
  expect(collaboratorError(['','',''],2)).toBe('')
  expect(collaboratorError(['Pessoa Fictícia Alfa','',''],0)).toBeTruthy()
  expect(collaboratorError([collaborators[0],collaborators[0],''],1)).toMatch(/diferentes/)
  expect(collaboratorError([collaborators[0],collaborators[1],''],0)).toBe('')
 })
})

describe('Seleção de colaboradores', {timeout: 30000}, () => {
 it('consulta a lista completa nos três campos, seleciona por toque e exclui escolhas de outras funções', async () => {
  const user = userEvent.setup()
  render(<CollaboratorFields/>)
  const fields = screen.getAllByRole('combobox')
  for (const field of fields) {
   await user.click(field)
   expect(screen.getAllByRole('option', {hidden:true})).toHaveLength(40)
  }
  await user.click(fields[0]); await user.type(fields[0],'custodio')
  const option = screen.getByText('ABEL CUSTÓDIO EXEMPLO', {exact:true})
  fireEvent.pointerDown(option, {pointerType:'touch'}); await user.click(option)
  expect(fields[0]).toHaveValue('ABEL CUSTÓDIO EXEMPLO')
  await user.click(fields[1]); expect(screen.queryByText('ABEL CUSTÓDIO EXEMPLO', {exact:true})).not.toBeInTheDocument()
  await user.type(fields[1],'AARON MATHEUS'); await user.keyboard('{ArrowDown}{Enter}')
  expect(fields[1]).toHaveValue(collaborators[0])
  await user.click(fields[2]); expect(screen.getAllByRole('option', {hidden:true})).toHaveLength(201)
  await user.click(fields[0]); await user.clear(fields[0]); await user.click(fields[2])
  expect(screen.getByText('ABEL CUSTÓDIO EXEMPLO', {exact:true})).toBeInTheDocument()
 })
 it('bloqueia nome livre e duplicado digitado e permite auxiliar 2 vazio', async () => {
  const user = userEvent.setup()
  const submit = vi.fn((e: React.FormEvent) => e.preventDefault())
  render(<form onSubmit={submit}><CollaboratorFields/><button>Salvar</button></form>)
  const fields = screen.getAllByRole('combobox')
  await user.type(fields[0], 'Não cadastrado'); await user.type(fields[1],collaborators[1]); await user.click(screen.getByText('Salvar'))
  expect(submit).not.toHaveBeenCalled()
  await user.clear(fields[0]); await user.type(fields[0],collaborators[1]); await user.click(screen.getByText('Salvar'))
  expect(submit).not.toHaveBeenCalled()
  await user.clear(fields[0]); await user.type(fields[0],collaborators[0]); await user.click(screen.getByText('Salvar'))
  expect(submit).toHaveBeenCalledTimes(1)
  await user.type(fields[2], 'inexistente'); await user.tab()
  expect(screen.getByRole('alert')).toHaveTextContent(/lista oficial/)
 })
 it('preserva nomes ao editar, renderizar e serializar os campos existentes', async () => {
  const initialFields = {'person.0':collaborators[0],'person.1':collaborators[1],'person.2':collaborators[2]}
  const {container, rerender} = render(<form><CollaboratorFields initialFields={initialFields}/></form>)
  const user = userEvent.setup()
  await user.clear(screen.getByLabelText('Auxiliar 2')); await user.type(screen.getByLabelText('Auxiliar 2'),'bulhoes')
  await user.click(screen.getByText('WALTER BULHÕES EXEMPLO', {exact:true}))
  rerender(<form><CollaboratorFields initialFields={initialFields}/></form>)
  const fields = Object.fromEntries(new FormData(container.querySelector('form')!)) as Record<string,string>
  expect(fields).toEqual({...initialFields,'person.2':'WALTER BULHÕES EXEMPLO'})
  const record = await new DemoOperationsRepository().save({kind:'ATIVAÇÃO',team:'GAR 01',state:'Paraná',region:'Paraná',notes:'',detail:'',fields})
  expect(record.fields).toEqual(fields)
  const snapshot = {profile:{state:'Paraná',region:'Paraná'}, reports:[{id:'saved',kind:'activation',team_id:'GAR 01',created_at:'2026-10-23',payload:{fields,notes:''}}]} as PilotSnapshot
  expect(toRecords(snapshot)[0].fields).toEqual(fields)
 })
 it('mantém nomes históricos para correção sem incluí-los nas sugestões oficiais', () => {
  render(<CollaboratorFields initialFields={{'person.0':'Nome legado'}}/>)
  expect(screen.getByLabelText('Líder / Condutor')).toHaveValue('Nome legado')
  expect((screen.getByLabelText('Líder / Condutor') as HTMLInputElement).checkValidity()).toBe(false)
  fireEvent.focus(screen.getByLabelText('Auxiliar 1'))
  expect(within(screen.getByRole('listbox')).queryByText('Nome legado')).not.toBeInTheDocument()
 })
})
