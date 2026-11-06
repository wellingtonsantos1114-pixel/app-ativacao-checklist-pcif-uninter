import { useId, useRef, useState } from 'react'
import { collaboratorError, findCollaborators } from './lib/collaborators'
import './collaborators.css'
const labels = ['Líder / Condutor', 'Auxiliar 1', 'Auxiliar 2']
export default function CollaboratorFields({initialFields = {}, onSelectionChange}: {initialFields?: Record<string,string>; onSelectionChange?: () => void}) {
 const [values, setValues] = useState(() => labels.map((_, i) => initialFields[`person.${i}`] ?? ''))
 const [open, setOpen] = useState<number | null>(null)
 const [active, setActive] = useState(-1)
 const [touched, setTouched] = useState<boolean[]>([])
 const inputs = useRef<(HTMLInputElement | null)[]>([])
 const id = useId()
 function change(index: number, value: string) {
  const next = values.map((old, i) => i === index ? value : old)
  setValues(next)
  inputs.current.forEach((input, i) => input?.setCustomValidity(collaboratorError(next, i)))
  setActive(-1)
 }
 function select(index: number, value: string) {
  change(index, value)
  setOpen(null)
  onSelectionChange?.()
 }
 return <>{labels.map((label, index) => {
  const error = collaboratorError(values, index)
  const suggestions = findCollaborators(values[index], values.filter((_, i) => i !== index))
  const expanded = open === index
  return <div className="collaborator-field" key={label}>
   <label htmlFor={`${id}-${index}`}>{label}</label>
   <input id={`${id}-${index}`} name={`person.${index}`} ref={input => {inputs.current[index] = input; input?.setCustomValidity(error)}}
    role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? `${id}-list-${index}` : undefined}
    aria-activedescendant={expanded && active >= 0 ? `${id}-option-${index}-${active}` : undefined}
    aria-describedby={touched[index] && error ? `${id}-error-${index}` : undefined} aria-invalid={touched[index] && !!error}
    autoComplete="off" required={index < 2} value={values[index]} placeholder="Buscar colaborador"
    onFocus={() => {setOpen(index); setActive(-1)}} onChange={event => {change(index, event.target.value); setOpen(index)}}
    onInvalid={() => setTouched(old => {const next = [...old]; next[index] = true; return next})}
    onBlur={() => {setOpen(null); setTouched(old => {const next = [...old]; next[index] = true; return next})}}
    onKeyDown={event => {
     if (event.key === 'Escape') {event.preventDefault(); setOpen(null); setActive(-1)}
     if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault(); setOpen(index); setActive(old => suggestions.length ? Math.max(0, Math.min(suggestions.length - 1, old + (event.key === 'ArrowDown' ? 1 : -1))) : -1)}
     if (event.key === 'Enter' && expanded && active >= 0) {event.preventDefault(); select(index, suggestions[active])}
    }}/>
   {expanded && <ul className="collaborator-options" id={`${id}-list-${index}`} role="listbox" aria-label={`Sugestões para ${label}`}>
    {suggestions.map((name, i) => <li role="option" aria-selected={active === i} id={`${id}-option-${index}-${i}`} key={name}
     onPointerDown={event => event.preventDefault()} onMouseDown={event => event.preventDefault()} onClick={() => select(index, name)}>{name}</li>)}
    {!suggestions.length && <li role="presentation">Nenhum colaborador disponível para esta busca.</li>}
   </ul>}
   {touched[index] && error && <small id={`${id}-error-${index}`} role="alert">{error}</small>}
  </div>
 })}</>
}
