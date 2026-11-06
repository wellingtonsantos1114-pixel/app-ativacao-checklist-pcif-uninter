# Instalação automatizada — pcif-homologacao

## Destino fixado e situação desta execução

- Nome informado pelo proprietário: **pcif-homologacao**.
- Project ref: **exemploprojetoref000**.
- Organização esperada: **Painel de Ativação PCIF**.
- URL: https://supabase.com/dashboard/project/exemploprojetoref000

A URL foi fornecida pelo proprietário; ela não concede autorização administrativa. Nesta execução não havia conector Supabase disponível, Supabase CLI/psql autenticado ou credencial injetada. O acesso HTTPS à Management API também foi bloqueado pelo proxy (`CONNECT 403`, antes de autenticação). Nenhum SQL foi enviado ao Supabase hospedado. **O estado remoto, inclusive a existência das tabelas, ainda não foi consultado nem validado.**

Não houve acesso ou alteração ao projeto original `painel-de-ativacao-pcif`, nem chamadas de publicação/configuração ao Netlify. Este pacote não cria usuários ou perfis de operadores; essa etapa é posterior.

## Caminho preferido para execução pelo assistente: MCP oficial com OAuth

1. Abra o projeto de homologação e seu painel **Connect → MCP**. Atalho oficial com o projeto fixado: https://supabase.com/dashboard/project/exemploprojetoref000?showConnect=true&connectTab=mcp
2. Se o cliente de IA permitir um servidor MCP remoto HTTP, adicione:

```text
https://mcp.supabase.com/mcp?project_ref=exemploprojetoref000&features=database
```

3. Conclua o login OAuth no navegador, usando a conta com acesso ao projeto e escolhendo a organização **Painel de Ativação PCIF**. Permita as ferramentas de banco necessárias à aplicação de migrações; não use `read_only=true` para a etapa de escrita. O `project_ref` deve permanecer fixado: não utilizar a URL sem escopo de projeto.
4. Disponibilize esse conector nesta conversa. A autorização de aplicação não destrutiva em homologação já foi concedida pelo pedido; não é necessário enviar token, senha, service_role ou chave privada na conversa.

O assistente deverá confirmar o contexto do conector/ref e inspecionar metadados antes de executar o pacote. Se não conseguir verificar o destino ou faltar permissão de escrita, deve parar sem tentar outro projeto. Não presumir que adicionar um servidor em outro aplicativo o disponibiliza automaticamente nesta sessão.

Fonte consultada: README do projeto mantido pela comunidade Supabase em https://github.com/supabase-community/supabase-mcp — URL oficial, seleção da organização via OAuth, escopo `project_ref`, `features` e `read_only`. A página HTML da documentação não estava acessível pela rede deste ambiente; o README oficial e os tipos/implementação da Management API foram consultados pelo GitHub.

## Alternativa com uma única execução no navegador, sem instalar programas

Se não houver opção de MCP no cliente:

1. Abra https://supabase.com/dashboard/project/exemploprojetoref000/sql/new e **confira no navegador o nome pcif-homologacao e o ref da URL**.
2. Copie todo o conteúdo de `supabase/homologation/install.sql` para uma nova consulta e clique **Run uma vez**.

Isso instala, em ordem, somente as etapas ausentes e executa todas as validações antes do COMMIT. O resultado esperado é uma linha:

```text
status = validated
project_ref = exemploprojetoref000
migrations = 4
teams = 31
checklist_items = 33
```

**Limite importante:** SQL isolado não possui um identificador universal e confiável do projeto Supabase. Por isso a primeira execução pelo SQL Editor depende da conferência explícita da URL/nome no passo 1. O registro `pcif_bootstrap.target` impede reutilização em uma instalação marcada para outro ref, mas não prova a identidade de um banco vazio. A verificação automática de nome/ref/organização é feita pelo instalador da Management API abaixo. O pacote não deve ser executado no projeto original.

Nenhum dos quatro arquivos precisa ser executado manualmente em separado. Não inclua `pilot-provision.sql` agora: o pedido atual é estruturar e validar o banco.

## Execução automatizada pela Management API oficial

Ferramenta de apoio: `tools/homologation/apply.mjs`, sem dependências adicionais de CLI. Ela usa os endpoints oficiais de consulta ao projeto/organizações e `/v1/projects/{ref}/database/query`, conferidos nos tipos e implementação do servidor MCP oficial.

Para esse caminho, um administrador deve disponibilizar `SUPABASE_ACCESS_TOKEN` exclusivamente como segredo nas configurações seguras do ambiente e liberar o hostname `api.supabase.com` na política de rede. É um token de acesso à Management API, **não** uma chave anon/service_role ou senha do banco. Não passar por argumento, arquivo versionado ou conversa. O caminho MCP OAuth evita copiar um token manualmente.

Na raiz do app:

```sh
npm run homologacao:plan
# Somente após o plano validar o destino e suas dependências:
npm run homologacao:apply
```

O destino não aceita override por parâmetro ou DATABASE_URL. Antes de qualquer consulta SQL, o instalador exige:

- ref exatamente `exemploprojetoref000`;
- nome exatamente `pcif-homologacao`;
- organização exatamente `Painel de Ativação PCIF`;
- estado `ACTIVE_HEALTHY`;
- pacote SQL gerado igual às fontes locais e ao catálogo revisado.

O plano usa consulta `read_only`. A aplicação envia uma transação única, sem retry automático após timeout. Depois compara novamente o catálogo remoto com a referência. Registra etapas/erros em `/tmp/pcif-homologacao-report.json`, sem imprimir credenciais, headers, configurações secretas ou respostas brutas de erro. Se a conexão cair após submissão, o resultado será **unconfirmed**, e será necessário inspecionar o estado antes de repetir.

## Migrações incluídas e procedência

| Ordem | Versão | Origem |
| --- | --- | --- |
| 1 | `202610140001_pcif_comments.sql` | Painel Web — comentários e RLS |
| 2 | `202610170001_pcif_session_access.sql` | Painel Web — sessões vivas/autorização |
| 3 | `202610180001_operational_foundation.sql` | APP — fundação operacional |
| 4 | `202610180002_operational_pilot.sql` | APP — piloto, validação, estado e segurança |

As dependências do painel estão em `supabase/homologation/dependencies`, copiadas dos arquivos originais do commit `85a7bfbcf2ec93d1bb3bf92b3a2f100852106e15`. Não são os fixtures de teste. A origem e o SHA-256 de cada arquivo estão em `supabase/homologation/manifest.json`; nenhuma migração original foi editada.

`install.sql` é um artefato gerado a partir dessas quatro fontes. O gerador remove somente os BEGIN/COMMIT externos e coloca todas as etapas na mesma transação. Os DROP POLICY existentes nas migrações redefinem políticas de acesso e são validados antes do commit; não há DROP TABLE/SCHEMA, exclusão de relatórios, reset de banco ou criação de contas. As únicas inserções automáticas são os 31 cadastros de equipes, os 33 itens oficiais e o registro de instalação.

## Segurança e retomada

- Lock transacional impede instalações simultâneas. Timeouts evitam esperar indefinidamente por locks.
- Objetos de uma etapa devem estar todos ausentes ou todos detectáveis. Instalação parcial/incompatível é bloqueada, sem apagar/reparar objetos desconhecidos.
- Etapas detectadas são ignoradas, e as definições finais precisam corresponder à referência. Não basta haver uma tabela com o mesmo nome.
- `pcif_bootstrap.migrations` registra as quatro versões e checksums. O instalador não modifica a tabela de histórico do Supabase CLI; esse ledger próprio deve ser levado em conta em um rollout futuro via CLI.
- Erros de dependência, RLS, permissão, definição ou catálogo cancelam toda a transação. Nenhuma instrução orienta limpar tabelas para contornar um erro.
- O banco piloto precisa estar vazio de perfis/relatórios antes da primeira aplicação da quarta migração. Se ela já estiver instalada, a reexecução preserva esses dados.
- Nenhuma conta, senha, chave, conteúdo de comentário ou relatório entra no catálogo de referência.

## O que é validado

Dez tabelas da aplicação/comentários, onze funções, trigger de identidade, índices/restrição de idempotência, políticas RLS, proibição de leitura anônima e de mutações diretas, grants de comentários por coluna, RPC privada de liberação de senha inicial e as três tabelas na publicação Realtime. O catálogo compara funções (hash de corpo, search_path, segurança/volatilidade), colunas, políticas e os 31/33 cadastros oficiais. Definições divergentes causam erro, não substituição silenciosa.

O código compara metadados gerados em PostgreSQL local. Diferenças de representação entre versões do PostgreSQL podem causar bloqueio conservador e exigem revisão; não se deve desativar a validação para forçar aplicação.

Isso valida a estrutura. Auth hospedado, entrega de eventos Realtime, contas piloto e teste celular/tablet continuam sendo etapas posteriores de `docs/pilot-integration.md`.

## Evidências locais e regeneração

```sh
npm run homologacao:prepare
npm test -- src/homologation/bootstrap.test.ts
npm test
npm run build
```

O gerador executa as quatro migrações em PostgreSQL/PGlite em memória para construir a referência; não se conecta ao Supabase. Os testes também usam PostgreSQL local e transporte Management API simulado. Cobrem instalação, reexecução com dados preservados, retomada de migrações anteriores, rollback, grants incompatíveis, destino/organização incorretos e ausência de credenciais. Esses resultados **não** constituem aplicação ou validação remota de pcif-homologacao.
