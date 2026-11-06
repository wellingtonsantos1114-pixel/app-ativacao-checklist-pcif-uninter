# Piloto operacional APP ↔ Supabase ↔ PAINEL WEB

## Entrega e limites

O modo demonstrativo e sua interface continuam como padrão. O piloto é opt-in, exige login real Supabase e só confirma sucesso após a RPC gravar. Nenhum Supabase hospedado, usuário real ou site publicado foi alterado nesta execução. **Os PRs não devem ser tratados como liberação para produção.**

O piloto hospedado e o aceite em celular/tablet ainda precisam ser executados após a configuração abaixo. Sem URL/chave pública de homologação e contas fictícias não foi possível executar Auth, REST e Realtime hospedados.

## Auditoria dos projetos

- APP: formulários e estados originalmente em memória; `202610180001_operational_foundation.sql` era apenas uma fundação, sem validação de payload, respostas normalizadas ou estado transacional. Foi preservada e complementada pela migração `202610180002_operational_pilot.sql`.
- Painel: Auth real usa Netlify Functions e `public.pcif_has_access()`; comentários usam `pcif_comment_members`, `pcif_comments`, RLS e sessões vivas. Operações eram MOCK ou preparação Survey123. Esses mecanismos e o login atual permanecem.
- Cadastro: os 31 vínculos regionais coincidem. O app usa nomes completos de Estado, o painel usa SP/MG/PR. O banco passa a ser autoridade no piloto; o painel apenas converte as siglas. Os mapas locais continuam no demo e são comparados com a migração nos testes.

## Arquitetura e segurança

Login por GAR/GAC → `operator-login` no Netlify → Supabase Auth com mapeamento de email somente no servidor → sessão em memória no SDK. A RPC de perfil retorna a equipe vinculada ao UUID autenticado, nunca aceita equipe enviada pelo navegador. O front não recebe senha de outros usuários, chave administrativa ou diretório de contas.

A troca de senha exige senha atual e identidade coincidente, usa Auth e pede revogação global. O banco bloqueia operações enquanto `must_change_password` estiver ativo. A liberação usa uma RPC privada, executável somente por `service_role`, chamada pela Function após verificar a senha atual, exigir senha diferente e revogar sessões. Alterar a senha diretamente no Auth NÃO libera essa flag. A chave administrativa só é lida em runtime pelo backend e usada nessa rota fixa; nunca chega ao navegador. As sessões também precisam existir em `auth.sessions`; a validação hospedada dessa regra e da revogação é obrigatória antes de liberação.

As RPCs públicas são `pcif_ops_profile`, `pcif_ops_snapshot`, `pcif_ops_submit` e `pcif_ops_panel_snapshot`. `pcif_ops_complete_password_change` é privada: operadores/analistas não podem executá-la nem atualizar a flag diretamente. Não é necessário expor o schema `pcif_ops` no REST. Perfis `team` só leem sua equipe e seu ambiente; analistas precisam de perfil `analyst`, sessão viva e a autorização já existente do painel. Nenhum operador tem INSERT/UPDATE/DELETE direto nos relatórios. Escritas passam pela RPC que valida campos, 33 respostas, descrição de não conformidade e transições. Horário, data de São Paulo, autor, equipe e ambiente vêm do servidor.

Relatórios são independentes e imutáveis. Respostas de checklist são normalizadas em `checklist_answers`; catálogo central possui 33 itens. `team_state` é serializado com bloqueio por equipe/ambiente, revisão otimista e `request_id` único. Retry após resposta perdida reutiliza o mesmo ID. Um payload diferente não pode reutilizá-lo. Transições registram estado anterior e posterior; não reparam equipamentos implicitamente. A auditoria é inserida na mesma transação.

O piloto tem partição `environment='pilot'`, distinta de `production`, e os dois clientes desta entrega recusam snapshots fora do piloto. A migração interrompe se já houver memberships ou relatórios operacionais, para exigir classificação/reconciliação em vez de atribuir dados antigos ao piloto silenciosamente. Nenhum registro é apagado.

Painel → endpoint operacional existente → RPC autenticada de snapshot → adaptador para os cards. A estrutura interna legada chamada `Checklist` recebe **apenas Ativações** como projeção compatível; o Checklist de 33 itens continua relatório separado no modal. Odômetro, água ou pessoas ausentes não são inventados. Estado operacional é explícito e não deriva da mera existência de uma Ativação. A fonte nova permite MG/PR/GAC também no turno noturno, preservando a escala fixa do modo anterior.

Realtime invalida o snapshot; conexão/reconexão, retorno à aba, foco e retorno de rede recuperam snapshot completo. Polling a cada 30 segundos cobre eventos perdidos. Uma consulta por vez, descarte ao sair, dados anteriores sinalizados como desatualizados em falhas e pausa em 401/403. O histórico do modal é por equipe/data; dados novos não sobrescrevem versões antigas. Nenhuma mudança no sistema de comentários.

## 1. Criar homologação sem tocar em produção

Pelo navegador, crie um projeto Supabase separado para o piloto, **sem copiar dados pessoais/operacionais de produção**. Use os dois projetos Netlify de preview/piloto separados dos sites publicados atuais, conectados às branches dos PRs. O código foi preparado para reaproveitar o mesmo Supabase do painel depois do aceite, mas essa migração de produção exige revisão posterior.

No SQL Editor de homologação, execute e confira, nesta ordem:

1. Do repositório do painel: `supabase/migrations/202610140001_pcif_comments.sql`.
2. Do painel: `supabase/migrations/202610170001_pcif_session_access.sql`.
3. Do app: `supabase/migrations/202610180001_operational_foundation.sql`.
4. Do app: `supabase/migrations/202610180002_operational_pilot.sql`.

Cada arquivo é transacional. Não reaplique os que já constarem como instalados. Não execute `supabase/test-fixtures`: são cópias para testes locais. Se `pcif_ops` já contiver dados ou perfis, pare e reconcilie a origem/ambiente antes da migração; não esvazie tabelas para contornar a proteção.

Em Database/Replication, confira que `pcif_ops.reports` e `pcif_ops.team_state` pertencem à publicação `supabase_realtime`. A migração adiciona quando essa publicação existe; se não existir, habilite as duas tabelas no painel do Supabase após revisão. RLS permanece ativa. RPCs usam `public`; não libere leitura pública do schema operacional.

## 2. Provisionar as 31 equipes de homologação

**Política atual:** troca no primeiro acesso não é obrigatória. As contas novas devem ter `must_change_password=false`, com acesso imediato e opção voluntária **Alterar senha**. O mecanismo de bloqueio por flag verdadeira permanece disponível para contas legadas, mas não é o padrão deste lote.

Use [provisionamento-31-equipes.md](provisionamento-31-equipes.md): automação pela API oficial Auth Admin, plano somente leitura, aprovação por hash, conflitos sem sobrescrita e senhas aleatórias em cofre cifrado privado. Não executar o template manual GAR 23/analista para provisionar as 31 contas. Não é necessário criar analista para o primeiro teste somente do app.

O fluxo não recupera ou redefine senhas anteriores. Caso GAR 03 já exista com flag verdadeira, o lote interrompe e exige inspeção/ajuste pontual separado; não recrie a conta. Não provisionar nada em produção.

## 3. Campos no Netlify — APP piloto

Em um projeto Netlify de piloto, em Environment variables, configurar por contexto de piloto/preview:

| Nome | Valor | Uso |
| --- | --- | --- |
| `VITE_PCIF_MODE` | `pilot` | Build |
| `VITE_SUPABASE_URL` | URL HTTPS do projeto Supabase de homologação | Build, público |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publishable ou anon de homologação | Build, público |
| `PCIF_PILOT_ENABLED` | `true` | Functions runtime |
| `SUPABASE_URL` | A mesma URL de homologação | Functions runtime |
| `SUPABASE_PUBLISHABLE_KEY` | A mesma chave pública | Functions runtime |
| `PCIF_OPERATOR_EMAIL_DOMAIN` | `pcif-operators.invalid` | Functions runtime |
| `PCIF_PASSWORD_ADMIN_KEY` | Opcional: chave secret ou legacy service_role de **homologação**, apenas para contas legadas com troca obrigatória | Somente Functions runtime, segredo |

Build command `npm run build`; publish directory `dist`; functions directory `netlify/functions`; Node 24. Os valores VITE ficam no bundle e **não são segredos**. O build recusa chave secret/service_role. Se necessária para contas legadas, a chave administrativa é exceção exclusiva da variável privada `PCIF_PASSWORD_ADMIN_KEY`, usada para liberar a troca inicial. Cadastre-a diretamente nas configurações seguras do Netlify, com escopo Functions; nunca em VITE, arquivo, chat ou PR. Ela pode ser obtida em Settings → API Keys do Supabase de homologação. Ela é necessária apenas para liberar contas legadas com flag verdadeira; contas novas com flag falsa usam a troca voluntária sem essa chave. Não configurar estes valores para o contexto de produção ainda.

## 4. Campos no Netlify — PAINEL piloto

| Nome | Valor | Uso |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | A mesma URL de homologação | Build |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | A mesma chave pública | Build |
| `VITE_PCIF_APP_ENABLED` | `true` | Build, habilita Realtime/data atual |
| `SUPABASE_URL` | A mesma URL de homologação | Functions runtime |
| `SUPABASE_PUBLISHABLE_KEY` | A mesma chave pública | Functions runtime |
| `PCIF_AUTH_EMAIL` | `analyst-pilot@pcif-operators.invalid` | Functions runtime |
| `PCIF_DATA_SOURCE` | `PCIF_APP` | Functions runtime |
| `SURVEY123_ENABLED` | `false` | Functions runtime |

Preservar `netlify.toml` do painel: build `npm run build`, publish `dist`, functions `netlify/functions`, Node 22. Não alterar o login do painel: usuário continua o **usuário padrão do painel**, e a senha é a da conta fictícia do analista deste contexto.

Faça novo deploy **manual após revisão dos PRs e configuração** somente nos dois projetos de piloto. Esta entrega não publicou nenhum site. HTTPS é obrigatório para acesso móvel e `crypto.randomUUID`. Se usar o ambiente cloud para conectar ao Supabase, adicionar o hostname exato de homologação à política de rede, incluindo WebSocket quando aplicável; nenhum destino foi presumido aqui.

## 5. Primeiro teste com celular e tablet

1. No celular Android, abra o APP piloto em HTTPS. Entre como GAR 03 com a senha inicial; confirme acesso imediato. A troca por **Alterar senha** é voluntária. Não use a URL demo publicada antiga, que continua em modo demonstrativo até novo deploy revisado.
2. No tablet/computador, abra o PAINEL piloto, entre com o usuário padrão do painel com a senha do analista fictício. Selecione **SP**, **Diurno** e a data operacional atual (São Paulo). GAR 03 deve iniciar Pendente.
3. Envie Ativação com pessoas/placa/local fictícios. Preencha todos os obrigatórios e revise/confirme. Só considerar sucesso quando aparecer confirmação de gravação. No SQL Editor, confira `pcif_ops.reports` e `team_state`, sem copiar dados ou tokens para chat.
4. Sem F5 no painel, confirme Ativa, equipe/região corretas e dados na aba Ativação do modal. A aba Checklist deve indicar Pendente.
5. Responda os 33 itens do checklist. Marque um como Não conforme, confirme que a descrição é exigida, preencha quantidades, revise e envie. Verifique as 33 linhas em `checklist_answers` e o destaque no mesmo modal, sem substituir Ativação.
6. Inicie manutenção após revisão e confirmação. Confira Em manutenção nos dois aplicativos e o destaque sobre a viatura. Finalize; o estado anterior deve voltar e o equipamento não conforme/inoperante não deve ser automaticamente reparado.
7. Desative com confirmação. Confira OFF e as cinco operações preservadas no histórico. Troque a data no modal e teste datas sem relatório.
8. Desconecte o tablet da rede durante um envio pelo celular; reconecte e confira recuperação sem F5 (Realtime ou polling em até 30 s após a consulta). Repetir com a aba oculta e depois visível.
9. Interrompa a resposta de um envio do app pelo DevTools/proxy de teste e repita o mesmo envio: deve haver um único `request_id`. Faça dois envios concorrentes com revisões antigas: o segundo deve solicitar atualização/revisão, sem alterar silenciosamente o estado.
10. Com uma segunda conta fictícia de equipe, valide isolamento: não deve ler registros, respostas, auditoria ou estado de GAR 23. Um operador não deve acessar o endpoint de analista. Analista autorizado lê todas as equipes do seu ambiente.
11. Saia, revogue a sessão no Auth e confirme recusa de leitura/escrita mesmo com o JWT anterior ainda não expirado. Revalide troca de senha/revogação global na versão hospedada do Auth. Teste comentários no painel piloto para confirmar o fluxo existente intacto.

O piloto deve usar apenas dados fictícios. Não habilitar rastreamento contínuo. Links Maps são informação sensível, protegida pelas mesmas RLS, sem cache operacional local.

## 6. Evidências locais e repetição

Na raiz de cada projeto: `npm ci`, `npm test`, `npm run build`. No cloud use `--cache /workspace/.npm-cache` no `npm ci`.

No app: `PCIF_PANEL_ROOT=/caminho/do/checkout-painel npm run test:integration`. O script executa as migrações em PostgreSQL/PGlite em memória, usa os serviços e handlers reais dos dois projetos, simula apenas Auth/HTTPS e bloqueia qualquer rede externa. Exercita login, troca inicial, resposta perdida, retry idempotente, cinco operações, 33 respostas e leitura pelo handler do painel. Não lê `.env` real nem cria contas externas. É um ensaio local, **não um aceite do Supabase hospedado**.

Para conferir separadamente o contrato de snapshot gerado pelo SQL:

```sh
# No app:
PCIF_PILOT_SNAPSHOT_OUTPUT=/tmp/pcif-pilot-snapshot.json npm test -- src/pilot/database.test.ts
# No painel:
PCIF_PILOT_SNAPSHOT_INPUT=/tmp/pcif-pilot-snapshot.json npm test -- src/integration/app/adapter.test.tsx
```

## Resultados desta execução

APP: 43 testes aprovados (incluindo 9 cenários SQL/RLS em PostgreSQL local). PAINEL: 348 testes aprovados, preservando os testes existentes de Auth e comentários. Builds de demonstração e de piloto dos dois projetos aprovados. O ensaio integrado local completou cinco operações e 33 respostas, com Auth/HTTPS simulados e PostgreSQL real em memória. Teste hospedado e em dispositivos físicos não executado.

## Pendências antes de produção

- Aceite hospedado completo acima: Auth, revogação, RLS/REST, Realtime e redes móveis/dispositivos físicos.
- Habilitar modo de produção em PR próprio, revisando os bloqueios explícitos de ambiente piloto nos dois clientes. Não basta apontar variáveis ao Supabase de produção.
- Aprovação e instalação controlada das migrações no projeto compartilhado do painel, sem reexecutar migrações de comentários existentes. Reconciliar quaisquer dados/perfis anteriores.
- Relação oficial de colaboradores autenticada, busca por nomes/acentos e validação por IDs; o piloto atual usa os campos existentes e somente nomes fictícios.
- Provisionamento e entrega segura de contas reais, fluxo administrativo de recuperação, políticas de senha, rate limit/captcha conforme necessidade e rotina de revogação.
- Paginação/limites de histórico e desempenho em escala: o piloto usa snapshots completos; não é uma solução de carga ilimitada.
- Decisão operacional sobre virada de data: status guarda o último evento confirmado; indicadores de Ativação/Checklist usam o dia operacional do servidor.
- Revisão de retenção/auditoria e dos links Maps, ícone oficial PWA ainda pendente e teste de instalação em Android/iPhone.
- Revisar e fazer merge dos dois PRs conscientemente; esta execução não fez merge nem publicou.

## Instalação automatizada de pcif-homologacao

O projeto de homologação informado pelo proprietário tem ref `exemploprojetoref000`. Há agora um pacote único, transacional e retomável, com as quatro migrações e validação de RLS/permissões: consulte [homologacao-bootstrap.md](homologacao-bootstrap.md). A execução remota permanece dependente de acesso autorizado; a URL pública sozinha não concede acesso.
