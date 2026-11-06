import {defineConfig} from 'vite'
// O ensaio não carrega arquivos .env nem injeta configuração VITE real.
export default defineConfig({envDir:false,envPrefix:'PCIF_LOCAL_ONLY_'})
