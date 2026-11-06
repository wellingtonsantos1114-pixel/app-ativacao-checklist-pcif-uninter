# Login piloto: resposta HTML no endpoint de autenticação

## Evidência do site publicado

A inspeção sem credenciais em `https://ativacaopcif.netlify.app` retornou **HTTP 401**, `Content-Type: text/html`, título **Login Redirect**, e código de redirecionamento para **https://app.netlify.com/edge-access**. O mesmo ocorreu em `/`, `/manifest.webmanifest`, `/.netlify/functions/operator-login` e `/.netlify/functions/operator-password`.

Isso comprova uma barreira de acesso do Netlify anterior ao aplicativo para essas requisições. Não é a resposta dos handlers PCIF: ambos devolvem JSON com status 405 para GET. A barreira impede verificar externamente se as Functions estão presentes no deploy; portanto não foi possível afirmar que estão ausentes. Tampouco a resposta observada foi o index.html do React.

O frontend anterior chamava `response.json()` incondicionalmente. Ao receber HTML de proteção, fallback ou erro do gateway, exibia o SyntaxError `Unexpected token '<'`. A correção identifica o Content-Type antes de ler JSON, apresenta orientação específica para proteção/Function ausente e preserva erros JSON legítimos de autenticação. Não mostra nem registra o HTML bruto. Login só estabelece sessão quando recebe os dois tokens esperados. A troca voluntária utiliza a mesma leitura protegida.

O service worker também passa a excluir navegações `/.netlify/functions/*` do fallback SPA. Isso evita que abrir uma Function pelo navegador/PWA seja atendido com index.html offline. Não é a causa do HTTP 401 observado externamente, e não muda as chamadas POST.

## Conferência pelo navegador no Netlify (somente site do APP)

1. Abra o projeto correspondente a **ativacaopcif.netlify.app**, não o Painel Web original.
2. Em **Project configuration → Access & security → Visitor access / Password Protection**, confira os controles de senha, login da equipe Netlify/SSO e os contextos de deploy protegidos. Os nomes podem variar conforme o plano/UI.
3. Para permitir que operadores entrem pelo login PCIF, o deploy/domínio de homologação utilizado precisa estar acessível a esses visitantes. O administrador deve ajustar conscientemente a proteção do site/contexto, se aprovar essa disponibilização, ou disponibilizar aos operadores um método suportado de acesso à proteção. Não colocar senha de proteção, cookie ou bypass token no frontend. O login PCIF e as RLS permanecem ativos.
4. Em **Deploys**, confira o deploy publicado e o commit aprovado. A configuração deve usar `npm run build`, `dist`, Functions em `netlify/functions` e Node 24. Uma publicação manual somente de `dist` não inclui as Functions; use o build completo pelo repositório Git.
5. Confira no resumo de Functions do deploy as funções **operator-login** e **operator-password**. Ambas existem no código e foram empacotadas localmente com esbuild para Node 24; seus handlers retornaram 405 JSON em GET, sem acessar Supabase. Esse smoke test não substitui o empacotador/deploy do Netlify.
6. O `netlify.toml` preserva o fallback `/* → /index.html` sem `force=true`. Functions existentes são atendidas antes desse fallback. Não crie redirect forçado para index.html sobre `/.netlify/functions/*` e confira regras adicionais da UI/arquivos `_redirects`, se existirem.
7. Em Environment variables do contexto publicado, confirme valores públicos VITE de homologação e variáveis runtime das Functions: `PCIF_PILOT_ENABLED=true`, `SUPABASE_URL=https://exemploprojetoref000.supabase.co`, `SUPABASE_PUBLISHABLE_KEY` de homologação e `PCIF_OPERATOR_EMAIL_DOMAIN=pcif-operators.invalid`. Build usa `VITE_PCIF_MODE=pilot`, mesma URL e chave publishable/anon. Não publicar secret/service_role, Access Token ou senhas em VITE. A configuração de credenciais do Cloud Environment não configura o Netlify.
8. Após revisão, publique manualmente o commit da correção pelo fluxo Git/Netlify. Nenhuma publicação foi realizada automaticamente nesta investigação.

## Validação sem compartilhar senha

- Em janela anônima, `/` deve carregar o app sem redirecionar para `app.netlify.com/edge-access`, caso o administrador tenha autorizado acesso direto ao piloto.
- Abra cada URL `/.netlify/functions/operator-login` e `operator-password`: deve retornar status **405** com JSON `{"error":"Método não permitido."}`. HTTP 401 HTML com Login Redirect indica proteção ainda ativa; 200 HTML da página React indica fallback/Function ausente; 404 indica rota ausente; falha de inicialização deve ser investigada nos logs privados da Function sem copiar tokens/credenciais.
- No DevTools → Network, envie o login PCIF pelo app: POST para `/.netlify/functions/operator-login`, resposta `application/json`. Em sucesso, os tokens ficam apenas na sessão em memória. Não copiar a resposta para chat ou relatório.
- Se JSON retornar 401 com “Equipe ou senha inválida”, verificar credencial da GAR 03. Se retornar 503, conferir variáveis runtime e perfil/sessão; não editar o vínculo já confirmado por causa de uma resposta HTML da hospedagem.
- Atualize o app/PWA para receber o novo service worker; feche outras abas do app se a atualização estiver aguardando. Teste no celular e tablet com GAR 03, sem trocar senha obrigatoriamente, e confirme acesso aos formulários.

Nenhuma correção de SQL, criação de usuário ou mudança no Painel Web é necessária para resolver a barreira HTML observada.
