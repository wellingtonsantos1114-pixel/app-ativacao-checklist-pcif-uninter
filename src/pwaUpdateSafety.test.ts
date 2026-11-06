import {expect,it,vi,afterEach} from 'vitest'
import {MessageChannel as NodeMessageChannel} from 'node:worker_threads'
import {isOnlyAppWindow} from './pwaUpdateSafety'
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
it('recusa atualização sem worker ativo',async()=>{
 expect(await isOnlyAppWindow()).toBe(false)
})
it.each([true,false])('respeita verificação de outras janelas: %s',async safe=>{
 vi.stubGlobal('MessageChannel',NodeMessageChannel)
 vi.stubGlobal('navigator',{serviceWorker:{controller:{postMessage:(_data:unknown,ports:MessagePort[])=>ports[0].postMessage({safe})}}})
 expect(await isOnlyAppWindow()).toBe(safe)
})
it('recusa atualização quando o worker anterior não implementa a verificação',async()=>{
 vi.useFakeTimers();vi.stubGlobal('MessageChannel',NodeMessageChannel)
 vi.stubGlobal('navigator',{serviceWorker:{controller:{postMessage:vi.fn()}}})
 const result=isOnlyAppWindow();await vi.advanceTimersByTimeAsync(2000)
 expect(await result).toBe(false)
})
