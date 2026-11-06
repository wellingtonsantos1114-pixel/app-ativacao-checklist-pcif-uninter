import {act,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const mock=vi.hoisted(()=>({needed:false,update:vi.fn(),registered:undefined as undefined|((url:string,r:ServiceWorkerRegistration)=>void)}))
vi.mock('virtual:pwa-register/react',()=>({useRegisterSW:(options:{onRegisteredSW:typeof mock.registered})=>{mock.registered=options.onRegisteredSW;return {needRefresh:[mock.needed,vi.fn()],updateServiceWorker:mock.update}}}))
vi.mock('./pwaUpdateSafety',()=>({isOnlyAppWindow:vi.fn().mockResolvedValue(true)}))
import AppUpdateNotice from './AppUpdateNotice'
import {isOnlyAppWindow} from './pwaUpdateSafety'
beforeEach(()=>{vi.mocked(isOnlyAppWindow).mockResolvedValue(true)})
afterEach(()=>{mock.needed=false;vi.clearAllMocks();vi.restoreAllMocks()})
it('exibe versão e não recarrega nem solicita atualização automaticamente',()=>{
 render(<AppUpdateNotice/>);expect(screen.getByText(/Versão do aplicativo:/)).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Atualizar aplicativo'})).not.toBeInTheDocument();expect(mock.update).not.toHaveBeenCalled()
})
it('nova versão aguarda confirmação explícita e permite preservar formulário',async()=>{
 mock.needed=true;vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);mock.update.mockResolvedValue(undefined)
 const user=userEvent.setup();render(<AppUpdateNotice/>);
 expect(screen.getByRole('status')).toHaveTextContent('Conclua os registros pendentes')
 await user.click(screen.getByRole('button',{name:'Atualizar aplicativo'}));expect(mock.update).not.toHaveBeenCalled()
 await user.click(screen.getByRole('button',{name:'Atualizar aplicativo'}));await waitFor(()=>expect(mock.update).toHaveBeenCalledExactlyOnceWith(true))
})
it('falha de atualização preserva a tela e oferece nova tentativa sem expor resposta bruta',async()=>{
 mock.needed=true;vi.spyOn(window,'confirm').mockReturnValue(true);mock.update.mockRejectedValue(Error('private gateway response'))
 const user=userEvent.setup();render(<AppUpdateNotice/>);await user.click(screen.getByRole('button',{name:'Atualizar aplicativo'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Verifique a conexão')
 expect(screen.getByRole('button',{name:'Atualizar aplicativo'})).toBeEnabled()
 expect(screen.queryByText('private gateway response')).not.toBeInTheDocument()
})
it('verifica SW ao registrar, voltar ao app e reconectar; remove listeners ao desmontar',async()=>{
 const update=vi.fn().mockResolvedValue(undefined),{unmount}=render(<AppUpdateNotice/>);
 await act(async()=>{mock.registered?.('/sw.js',{update} as unknown as ServiceWorkerRegistration)})
 expect(update).toHaveBeenCalledTimes(1)
 await act(async()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'))})
 expect(update).toHaveBeenCalledTimes(3)
 unmount();window.dispatchEvent(new Event('focus'));expect(update).toHaveBeenCalledTimes(3)
})

it('bloqueia atualização com formulário operacional aberto e preserva seus campos',async()=>{
 mock.needed=true
 const user=userEvent.setup()
 const {rerender}=render(<><form data-pwa-block-update><input aria-label="Observação pendente" defaultValue="Conferindo"/></form><AppUpdateNotice/></>)
 await waitFor(()=>expect(screen.getByRole('button',{name:'Atualizar aplicativo'})).toBeDisabled())
 await user.type(screen.getByLabelText('Observação pendente'),' equipamentos')
 expect(screen.getByLabelText('Observação pendente')).toHaveValue('Conferindo equipamentos')
 expect(mock.update).not.toHaveBeenCalled()
 rerender(<AppUpdateNotice/>)
 await waitFor(()=>expect(screen.getByRole('button',{name:'Atualizar aplicativo'})).toBeEnabled())
})
it('bloqueia também login ou senha já editados',async()=>{
 mock.needed=true
 const user=userEvent.setup();render(<><form><input aria-label="Senha" type="password"/></form><AppUpdateNotice/></>)
 await user.type(screen.getByLabelText('Senha'),'teste')
 expect(screen.getByRole('button',{name:'Atualizar aplicativo'})).toBeDisabled()
 expect(mock.update).not.toHaveBeenCalled()
})
