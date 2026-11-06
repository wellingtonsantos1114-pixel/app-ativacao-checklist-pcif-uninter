# Provisionamento administrativo das 31 equipes — somente homologação

## Política atual

O pedido atual substitui a troca obrigatória: contas novas têm `role='team'`, `environment='pilot'`, `active=true` e **`must_change_password=false`**. O login permanece a seleção GAR/GAC. O email é interno (`gar03@pcif-operators.invalid`, por exemplo). As 31 equipes e suas regionais já existem; não são editadas pelo provisionador.

A administração aprova a geração de senhas iniciais criptograficamente aleatórias, exclusivas e de 36 caracteres. Não há padrão Brigada/numeração. O operador pode escolher **Alterar senha** no aplicativo; a troca voluntária exige senha atual, nova senha diferente, confirmação e pelo menos 12 caracteres com maiúscula, minúscula, número e símbolo. Não há mudança visual nesta entrega.

## Estado verificado e limite da execução

O proprietário confirmou no SQL Editor a instalação das quatro migrações, 31 equipes e 33 itens. Nesta sessão não há conector Supabase nem segredos administrativos disponíveis; a política de saída também não inclui a Management API ou o hostname de homologação. **Nenhuma conta hospedada foi criada, alterada ou inspecionada por esta entrega.** Não houve publicação, alteração de produção ou edição do Painel Web original.

## Execução sem instalar programas no computador

Use um terminal de ambiente administrativo privado no navegador, como este ambiente cloud quando disponibilizado, com Node 24 e acesso ao checkout da branch `feat/provision-pilot-teams`. Não use SQL para inserir diretamente em `auth.users`: a criação e confirmação de usuários usa a API oficial Supabase Auth Admin.

Configure **somente no armazenamento de segredos do ambiente administrativo**, nunca em argumentos, arquivos versionados ou chat:

| Nome | Conteúdo | Classificação |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Token pessoal da Management API da conta com acesso à organização | Segredo administrativo |
| `PCIF_PROVISION_ADMIN_KEY` | Secret key ou legacy service_role exclusivamente de `pcif-homologacao` | Segredo administrativo |
| `PCIF_VAULT_PASSPHRASE` | Frase exclusiva, aleatória, com no mínimo 20 caracteres, guardada em gerenciador de senhas privado | Segredo de proteção do cofre |

Nenhuma dessas variáveis deve ir para VITE, Netlify do app, GitHub, PR, logs ou conversa. A URL/ref públicos são fixos no código; não existe argumento para trocar o destino. Libere somente os hosts necessários: `api.supabase.com` e `exemploprojetoref000.supabase.co` em HTTPS. Depois da execução, retire as credenciais do ambiente administrativo quando não forem mais necessárias.

O navegador do Supabase não disponibiliza automaticamente sua sessão ao terminal. O MCP de banco sozinho também não concede Auth Admin para criar contas e entregar senhas com segurança. Este procedimento exige as duas autorizações acima; não solicite que o administrador as envie na conversa.

No terminal privado, na raiz do app:

```sh
mkdir -m 700 /tmp/pcif-admin
npm run teams:plan -- --vault /tmp/pcif-admin/teams.vault.json
```

Se o diretório privado já existir, não o recrie nem apague o cofre. Use preferencialmente um diretório persistente, privado, fora do repositório; `/tmp` pode desaparecer quando o ambiente for encerrado.

O plano é somente leitura: verifica nome **pcif-homologacao**, ref **exemploprojetoref000**, organização **Painel de Ativação PCIF**, estado `ACTIVE_HEALTHY`, RLS/permissões, 31 equipes, usuários Auth e vínculos existentes. Imprime apenas contagens `create/resume/preserve`, a política `must_change_password=false` e um hash público `approval`. O valor não contém senhas.

**Revise e aprove esse resumo antes de escrever.** Para um banco sem contas haverá 31 criações. Contas existentes compatíveis são preservadas. Após aprovação administrativa explícita, copie o hash exibido no lugar de HASH:

```sh
npm run teams:apply -- --approve HASH --vault /tmp/pcif-admin/teams.vault.json
```

Sem hash correspondente ao plano atual, nenhuma escrita é enviada. Se a execução for feita pelo assistente, ele deve apresentar o resumo ao proprietário e aguardar sua aprovação antes do comando de aplicação. A autorização para preparar a ferramenta não substitui essa aprovação final.

## Credenciais acessíveis somente ao administrador

Antes de criar cada usuário, a senha é gravada **cifrada**, não em texto, no arquivo do cofre. Usa AES-256-GCM autenticado, nonce aleatório e PBKDF2-SHA-256 com 310.000 iterações/salt aleatório. O arquivo tem permissão 0600, dentro de diretório 0700 pertencente ao administrador, e deve ficar fora do checkout. Não há relatório de senhas em claro.

1. Pelo explorador privado de arquivos do ambiente, baixe o cofre cifrado para o computador administrativo. Não publique nem envie para o chat ou artifacts públicos.
2. Baixe também `tools/provision/open-vault.html` e abra esse HTML **como arquivo local**, em computador privado.
3. Selecione o cofre e informe a frase de proteção diretamente na página local. Ela não utiliza rede; a política CSP bloqueia conexões e não carrega dependências externas. As senhas começam mascaradas.
4. Guarde cada credencial no gerenciador de senhas administrativo e entregue somente a senha da equipe correspondente pelo canal privado aprovado. Depois use **Limpar** e feche a página.
5. Preserve backup cifrado e frase de proteção em locais privados separados. Nunca publique o leitor/cofre no aplicativo ou Netlify.

O cofre contém apenas as senhas iniciais criadas por esta execução. Não é recuperador de senhas das contas anteriores; após troca voluntária, o valor inicial deixa de representar a senha vigente. Perder o cofre/frase após criação exige recuperação administrativa revisada, não reset automático. Quem possui cofre e frase consegue ler as credenciais: restrinja ambos ao administrador.

## Idempotência, conflitos e falhas

- Usuário existente só é preservado se email confirmado e vínculo exclusivo, ativo, `team/pilot` e `must_change_password=false`. Sua senha não é consultada ou substituída.
- Perfil antigo com `must_change_password=true` (inclusive eventual GAR 03 criada pelo roteiro anterior), usuário sem vínculo reconhecido, equipe duplicada, vínculo em produção ou conta não confirmada **interrompe o lote antes das criações**. Não apague/recrie a conta para contornar. Inspecione e aprove separadamente eventual ajuste pontual da flag em homologação; esta ferramenta não faz UPDATE ou reset.
- Um vínculo ausente só é retomado se a conta tiver a identificação de execução no `app_metadata` igual à do cofre privado. Um usuário prévio desconhecido não é adotado.
- Auth e PostgreSQL não compartilham transação. Uma falha pode deixar uma conta confirmada ainda sem membership; ela não consegue operar. Não há exclusão compensatória.
- Preserve o mesmo cofre/frase, execute novo plano e aprove novamente. A senha inicial já cifrada é reutilizada somente para concluir aquela criação, sem redefinir contas existentes.
- Há lock local por cofre, sem retries de escrita. Não execute lotes paralelos ou compartilhe diretório entre processos. Um lock remanescente após queda exige verificar que nenhum processo está ativo antes de removê-lo.
- Não são enviados DELETE, PUT ou PATCH ao Auth. No banco, a única mutação é INSERT de membership após conferência por usuário/equipe. RLS, políticas, cadastro regional, contas anteriores e relatórios não são editados.
- Resultado `validated` significa 31 contas confirmadas com os 31 vínculos corretos e RLS/permissões verificadas. Não significa aceite físico ou login hospedado.

## Aplicativo piloto e primeiro aceite

Não é necessário instalar um endpoint administrativo no app. `operator-login` e `operator-password` já existem em `netlify/functions`. No site **separado de homologação**, configure manualmente, após revisão:

| Variável | Valor | Escopo |
| --- | --- | --- |
| `VITE_PCIF_MODE` | `pilot` | Build, público |
| `VITE_SUPABASE_URL` | `https://exemploprojetoref000.supabase.co` | Build, público |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon de homologação | Build, público |
| `PCIF_PILOT_ENABLED` | `true` | Functions, não secreto |
| `SUPABASE_URL` | Mesma URL de homologação | Functions, não secreto |
| `SUPABASE_PUBLISHABLE_KEY` | Mesma chave pública | Functions, não secreto |
| `PCIF_OPERATOR_EMAIL_DOMAIN` | `pcif-operators.invalid` | Functions, não secreto |

Para essas 31 contas com flag falsa, a troca voluntária usa Auth com o token do próprio usuário: **não precisa de `PCIF_PASSWORD_ADMIN_KEY` no app**. Essa chave continua sendo exigida apenas pelo caminho legado de liberação da flag verdadeira, se houver contas nesse estado. Não envie `PCIF_PROVISION_ADMIN_KEY` ao site.

Build `npm run build`, publish `dist`, Functions `netlify/functions`, Node 24 já constam no netlify.toml. Variáveis VITE exigem novo build. Faça deploy manual do código revisado apenas no site piloto; esta entrega não publica. Não é necessário editar/configurar o Painel Web original para validar o app.

No celular e depois no tablet:

1. Abra a URL HTTPS do site piloto, confira **PILOTO ISOLADO**, selecione **GAR 03** e use sua senha pelo canal privado.
2. Confirme acesso imediato aos formulários, sem tela obrigatória de troca.
3. Envie uma Ativação com pessoas/placa/local fictícios. Aguarde confirmação real de gravação; confira no SQL Editor `team_id='GAR 03'`, `environment='pilot'`, autor correto e estado Ativa.
4. Entre como GAR 04 e confirme ausência do relatório GAR 03. Tente acesso cruzado com a API autenticada somente em teste administrativo controlado; a checagem visual sozinha não prova RLS.
5. Na GAR 03, escolha **Alterar senha**, informe senha atual e nova diferente. Entre novamente após a revogação. Não é uma etapa obrigatória para enviar a Ativação.
6. Registre sucesso/falha sem senhas, tokens ou dados reais. Confirme Auth hospedado, sessão viva e revogação global; localmente essas partes são simuladas.

## Testes locais

`npm test` cobre provisionamento real em PostgreSQL/PGlite com Auth/Management API simuladas, 31 vínculos, confirmação, flag falsa, geração/cifragem e leitura Web Crypto, idempotência, aprovação, retomada, conflitos, GAR 03 enviando Ativação imediatamente e isolamento GAR 04. A UI também verifica acesso imediato e troca voluntária.

`PCIF_PANEL_ROOT=/caminho/do/checkout npm run test:integration` exercita GAR 03, login imediato, troca voluntária, Ativação, 33 respostas, manutenção e desativação, usando handlers reais e PostgreSQL local; nenhuma rede externa é permitida. Isso não constitui teste de Supabase hospedado ou celular/tablet.
