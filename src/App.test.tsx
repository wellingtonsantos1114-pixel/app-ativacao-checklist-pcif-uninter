import { render,screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe,it,expect } from 'vitest'
import App from './App'
import {teams,teamRegion} from './lib/teams'
import {cargoItems,vehicleItems} from './lib/checklist'
describe('Demonstração independente',()=>{
 it('oferece 31 equipes e cadastro regional',()=>{expect(teams).toHaveLength(31);expect(new Set(teams).size).toBe(31);expect(teamRegion('GAR 21').state).toBe('Paraná');expect(teamRegion('GAC 07').state).toBe('Minas Gerais')})
 it('abre operações na ordem solicitada e encerra sessão',async()=>{const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole('button',{name:/Entrar na demonstração/}));expect(screen.getByRole('navigation')).toHaveTextContent(/ATIVAÇÃO.*CHECKLIST.*MANUTENÇÃO.*DESATIVAÇÃO/);await user.click(screen.getByRole('button',{name:'Sair'}));expect(screen.getByRole('button',{name:/Entrar na demonstração/})).toBeInTheDocument()})
 it('não preenche respostas do checklist e exige descrição de falha',async()=>{const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole('button',{name:/Entrar na demonstração/}));await user.click(screen.getByRole('button',{name:/02 CHECKLIST/}));const conditions=screen.getAllByLabelText('Condição');expect(conditions).toHaveLength(33);expect(conditions.every(item=>(item as HTMLSelectElement).value==='')).toBe(true);await user.selectOptions(conditions[0],'Não conforme');expect(screen.getByLabelText('Descrição do problema')).toBeRequired();expect(vehicleItems).toHaveLength(13);expect(cargoItems).toHaveLength(20)})
 it('exige revisão antes de registrar desativação e mantém histórico',async()=>{const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole('button',{name:/Entrar na demonstração/}));await user.click(screen.getByRole('button',{name:/04 DESATIVAÇÃO/}));await user.click(screen.getByRole('button',{name:/Revisar (registro fictício|início da manutenção|finalização da manutenção)/}));expect(screen.getByRole('button',{name:'Confirmar desativação'})).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Confirmar desativação'}));expect(await screen.findByText(/DESATIVAÇÃO · GAR 01/)).toBeInTheDocument()})
})

describe('Correções dos formulários',()=>{
 async function enter(team='GAR 01') {
  const user=userEvent.setup(); render(<App/>);
  await user.selectOptions(screen.getByLabelText('Equipe'),team);
  await user.click(screen.getByRole('button',{name:/Entrar na demonstração/}));return user
 }
 async function open(user:ReturnType<typeof userEvent.setup>,kind:string) {
  await user.click(screen.getByRole('button',{name:new RegExp(`^\\d{2} ${kind}$`)}))
 }
 async function confirm(user:ReturnType<typeof userEvent.setup>,name:string) {
  await user.click(screen.getByRole('button',{name:/Revisar (registro fictício|início da manutenção|finalização da manutenção)/}));
  await user.click(screen.getByRole('button',{name}));
 }
 it.each(['ATIVAÇÃO','CHECKLIST','MANUTENÇÃO','DESATIVAÇÃO'])('%s começa com a identificação somente leitura',async kind=>{
  const user=await enter('GAC 07');await open(user,kind);
  const inputs=screen.getAllByRole('textbox');
  expect(inputs.slice(0,3).map(input=>(input as HTMLInputElement).value)).toEqual(['Minas Gerais','Minas Gerais','GAC 07']);
  inputs.slice(0,3).forEach(input=>expect(input).toHaveAttribute('readonly'));
  expect(screen.queryByLabelText('Equipamento')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Local')).not.toBeInTheDocument();
  expect(screen.queryByText('Todos os itens conformes')).not.toBeInTheDocument();
 })
 it.each([['GAR 01','São Paulo','Norte'],['GAR 02','São Paulo','Noroeste'],['GAR 07','São Paulo','Centro'],['GAC 08','São Paulo','Sul'],['GAR 21','Paraná','Paraná'],['GAR 23','Minas Gerais','Minas Gerais']])('preenche %s com cadastro regional',async(team,state,region)=>{
  const user=await enter(team);await open(user,'DESATIVAÇÃO');
  expect(screen.getByLabelText('Estado')).toHaveValue(state);expect(screen.getByLabelText('Regional')).toHaveValue(region);expect(screen.getByLabelText('Equipe')).toHaveValue(team)
 })
 it('exige todas as avaliações e descrição para não conformidade',async()=>{
  const user=await enter();await open(user,'CHECKLIST');
  screen.getAllByLabelText('Condição').forEach(input=>{expect(input).toBeRequired();expect(input).toHaveValue('')});
  await user.click(screen.getByRole('button',{name:/Revisar (registro fictício|início da manutenção|finalização da manutenção)/}));
  expect(screen.queryByRole('button',{name:'Confirmar envio fictício'})).not.toBeInTheDocument();
  await user.selectOptions(screen.getAllByLabelText('Condição')[0],'Não conforme');expect(screen.getByLabelText('Descrição do problema')).toBeRequired()
 })
 it('inicia e finaliza manutenção com confirmação e restaura Pendente e OFF',async()=>{
  const user=await enter();await open(user,'MANUTENÇÃO');
  expect(screen.queryByRole('button',{name:'Confirmar início de manutenção'})).not.toBeInTheDocument();
  await confirm(user,'Confirmar início de manutenção');expect(screen.getByText('Em manutenção',{exact:true})).toBeInTheDocument();
  await open(user,'MANUTENÇÃO');expect(screen.getByText('Finalizar manutenção',{exact:true})).toBeInTheDocument();
  await confirm(user,'Confirmar finalização de manutenção');expect(screen.getByTestId('operational-status')).toHaveTextContent(/^Pendente$/);
  await open(user,'DESATIVAÇÃO');await confirm(user,'Confirmar desativação');expect(screen.getByText('OFF',{exact:true})).toBeInTheDocument();
  await open(user,'MANUTENÇÃO');await confirm(user,'Confirmar início de manutenção');await open(user,'MANUTENÇÃO');await confirm(user,'Confirmar finalização de manutenção');expect(screen.getByText('OFF',{exact:true})).toBeInTheDocument();
  expect(screen.getByRole('navigation')).toBeInTheDocument();
  expect(screen.getAllByText('MANUTENÇÃO · GAR 01')).toHaveLength(4)
 })
 it('cancelar revisão não altera estado e sair limpa a sessão',async()=>{
  const user=await enter();await open(user,'MANUTENÇÃO');await user.click(screen.getByRole('button',{name:/Revisar (registro fictício|início da manutenção|finalização da manutenção)/}));await user.click(screen.getByRole('button',{name:/Voltar às operações/}));expect(screen.getByTestId('operational-status')).toHaveTextContent(/^Pendente$/);
  await open(user,'DESATIVAÇÃO');await confirm(user,'Confirmar desativação');await user.click(screen.getByRole('button',{name:'Sair'}));await user.click(screen.getByRole('button',{name:/Entrar na demonstração/}));expect(screen.getByTestId('operational-status')).toHaveTextContent(/^Pendente$/);expect(screen.queryByText('DESATIVAÇÃO · GAR 01')).not.toBeInTheDocument()
 })
})

it('restaura Ativa após manutenção sem apagar a ativação',async()=>{
 const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole('button',{name:/Entrar na demonstração/}));
 await user.click(screen.getByRole('button',{name:'01 ATIVAÇÃO'}));
 for(const [label,value] of [['Líder / Condutor','AARON MATHEUS EXEMPLO SILVA'],['Auxiliar 1','ABEL CUSTÓDIO EXEMPLO'],['Placa do veículo','DEMO123'],['Projeto de Centralização','Projeto fictício'],['Município de atuação','Município fictício']]) await user.type(screen.getByLabelText(label),value);
 for(const label of ['Kit de combate a incêndios','Tablet','Comunicação via rádio']) await user.selectOptions(screen.getByLabelText(label),'Inoperante');
 await user.click(screen.getByRole('button',{name:/Revisar (registro fictício|início da manutenção|finalização da manutenção)/}));await user.click(screen.getByRole('button',{name:'Confirmar envio fictício'}));
 expect(screen.getByText('Ativa',{exact:true})).toBeInTheDocument();
 for(const action of ['Confirmar início de manutenção','Confirmar finalização de manutenção']) {
  await user.click(screen.getByRole('button',{name:'03 MANUTENÇÃO'}));await user.click(screen.getByRole('button',{name:/Revisar (registro fictício|início da manutenção|finalização da manutenção)/}));await user.click(screen.getByRole('button',{name:action}));
 }
 expect(screen.getByText('Ativa',{exact:true})).toBeInTheDocument();expect(screen.getByText('ATIVAÇÃO · GAR 01')).toBeInTheDocument()
})

it('usa os arquivos originais apenas no acesso e preserva a entrada demonstrativa',async()=>{
 const user=userEvent.setup();const {container}=render(<App/>);
 const picture=container.querySelector('picture.access-background')!;
 expect(picture).toHaveAttribute('aria-hidden','true');
 expect(picture.querySelector('source')).toHaveAttribute('srcset','/login/sector-background-small.webp');
 expect(picture.querySelector('img')).toHaveAttribute('src','/login/sector-background.webp');
 expect(picture.querySelector('img')).toHaveAttribute('alt','');
 await user.selectOptions(screen.getByLabelText('Equipe'),'GAC 07');await user.click(screen.getByRole('button',{name:/Entrar na demonstração/}));
 expect(container.querySelector('.access-background')).not.toBeInTheDocument();expect(container.querySelector('.shell--login')).not.toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'GAC 07'})).toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'Sair'}));expect(container.querySelector('.access-background')).toBeInTheDocument()
})

it('distingue visualmente manutenção, confirma com equipe e preserva observações',async()=>{
 const user=userEvent.setup();render(<App/>);await user.selectOptions(screen.getByLabelText('Equipe'),'GAR 23');await user.click(screen.getByRole('button',{name:/Entrar na demonstração/}));
 await user.click(screen.getByRole('button',{name:'03 MANUTENÇÃO'}));
 expect(screen.getByRole('region',{name:'Ação de manutenção'})).toHaveTextContent('Iniciar manutenção');
 await user.type(screen.getByLabelText('Observações'),'Verificação fictícia do kit');
 await user.click(screen.getByRole('button',{name:'Revisar início da manutenção'}));
 expect(screen.getByRole('button',{name:'Confirmar início de manutenção'})).toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'Confirmar início de manutenção'}));
 expect(screen.getByRole('status')).toHaveTextContent('GAR 23 — Manutenção iniciada com sucesso!');
 expect(screen.getByText('Verificação fictícia do kit')).toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'03 MANUTENÇÃO'}));
 expect(screen.getByRole('region',{name:'Ação de manutenção'})).toHaveTextContent('Finalizar manutenção');
 await user.click(screen.getByRole('button',{name:'Revisar finalização da manutenção'}));
 await user.click(screen.getByRole('button',{name:'Confirmar finalização de manutenção'}));
 expect(screen.getByRole('status')).toHaveTextContent('GAR 23 — Manutenção finalizada com sucesso!');
 expect(screen.getByTestId('operational-status')).toHaveTextContent(/^Pendente$/)
})

it('atualiza indicador de Checklist somente após revisar e confirmar as 33 respostas',async()=>{
 const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole('button',{name:/Entrar na demonstração/}));
 expect(screen.getByRole('region',{name:'Status dos relatórios'})).toHaveTextContent('Checklist: Pendente');
 await user.click(screen.getByRole('button',{name:'02 CHECKLIST'}));
 for(const select of screen.getAllByLabelText('Condição')) await user.selectOptions(select,'Conforme');
 for(const input of screen.getAllByLabelText('Quantidade encontrada')) await user.type(input,'1');
 await user.click(screen.getByRole('button',{name:'Revisar registro fictício'}));
 expect(screen.getByRole('button',{name:'Confirmar envio fictício'})).toBeInTheDocument();
 await user.click(screen.getByRole('checkbox',{name:/Confirmo que conferi/}));
 await user.click(screen.getByRole('button',{name:'Confirmar envio fictício'}));
 expect(screen.getByRole('region',{name:'Status dos relatórios'})).toHaveTextContent('Checklist: Concluído');
 expect(screen.getByRole('region',{name:'Status dos relatórios'})).toHaveTextContent('Ativação: Pendente');
 expect(screen.getByText('CHECKLIST · GAR 01')).toBeInTheDocument()
})
