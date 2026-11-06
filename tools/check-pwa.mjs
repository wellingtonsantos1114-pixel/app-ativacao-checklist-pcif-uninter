import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import vm from 'node:vm'
const manifest=JSON.parse(readFileSync('dist/manifest.webmanifest','utf8'))
assert.equal(manifest.name,'Ativação e Checklist');assert.equal(manifest.short_name,'Ativação e Checklist')
assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/')
for(const icon of [...manifest.icons,{src:'/icons/apple-touch-icon.png',sizes:'180x180'}]){
 const file=readFileSync('dist'+icon.src)
 assert.equal(file.subarray(1,4).toString(),'PNG')
 assert.equal(`${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`,icon.sizes)
}
assert(manifest.icons.some(icon=>icon.purpose==='maskable'))
const sw=readFileSync('dist/sw.js','utf8')
assert(!sw.includes('NavigationRoute'));assert(!sw.includes('registerRoute('));assert(!sw.includes('clientsClaim('))
const urls=[...sw.matchAll(/url:"([^"]+)"/g)].map(match=>match[1])
assert(urls.length>0)
for(const url of urls){assert(/^(assets\/[^/]+\.(js|css)|icons\/[^/]+\.png|login\/[^/]+\.webp|operator\/[^/]+\.svg|manifest\.webmanifest)$/.test(url),url);assert(existsSync('dist/'+url))}
assert(sw.includes('importScripts("/pwa-guard.js")'))
let listener
const source=readFileSync('public/pwa-guard.js','utf8')
for(const count of [1,2]){
 const clients=Array.from({length:count},(_,i)=>({id:String(i)}))
 vm.runInNewContext(source,{self:{addEventListener:(_type,fn)=>{listener=fn},clients:{matchAll:async()=>clients}}})
 let task,result
 listener({data:{type:'PCIF_CHECK_SINGLE_WINDOW'},source:{id:'0'},ports:[{postMessage:value=>{result=value.safe}}],waitUntil:value=>{task=value}})
 await task;assert.equal(result,count===1)
}
console.log('PWA: manifest, dimensões PNG, cache estático sem navegação/backend e proteção multi-janela aprovados.')
