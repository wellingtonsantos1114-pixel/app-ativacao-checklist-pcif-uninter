# Checklist vazio: deploy, snapshot e atualização PWA

## Evidências coletadas antes da alteração

- `main` em `07c50e682d77cad544f5853e53cf89c06e63f3df`, merge confirmado do PR #8.
- Netlify servindo HTTP 200, HTML com `/assets/index-BSN3m4ym.js` e SW com o mesmo asset em precache. A Function operator-login retornou GET 405 JSON, como esperado.
- Build isolado da main, usando somente a configuração pública do bundle, produziu `index-BSN3m4ym.js` **idêntico byte a byte** ao publicado. Portanto o código do PR #8 está no servidor. Isso comprova correspondência do conteúdo, não acesso ao metadado privado do deploy Netlify.
- O bundle contém as mensagens “Consultando o último checklist”, “Nenhum checklist anterior”, “Respostas anteriores de” e a confirmação da conferência diária. O usuário informou que nenhuma dessas mensagens aparece no aparelho. O componente atualizado sempre apresenta um desses estados acima dos itens.
- Registro PWA publicado: `/registerSW.js` somente chama `navigator.serviceWorker.register('/sw.js')`. A configuração era `registerType:'prompt'`, sem `useRegisterSW`, `onNeedRefresh`, botão de atualização ou ativação solicitada. Um SW novo pode ficar aguardando enquanto o anterior continua controlando abas/PWA.

**Defeito confirmado:** ausência de fluxo de aviso/ativação de atualização do PWA. O deploy desatualizado foi descartado. Uma versão antiga em cache no aparelho é compatível com a ausência dos blocos novos; confirmar em janela privada ou DevTools antes de atribuir qualquer falha aos registros hospedados. Não foi possível inspecionar o SW/console do aparelho remotamente.

## Fluxo de dados atual (preservado)

CHECKLIST → `remote.refresh()` → SDK Supabase → POST `/rest/v1/rpc/pcif_ops_snapshot`, com sessão do operador. Não utiliza Netlify Function para ler checklist; Functions são usadas no login/troca de senha.

A definição em `202610180002_operational_pilot.sql` filtra `reports.team_id=m.team_id` e `reports.environment=m.environment`, com perfil do UUID autenticado e sessão ativa. `latestChecklist` filtra novamente por equipe/ambiente do perfil e `kind='checklist'`, selecionando o mais recente e usando revisão do servidor para desempate. Os campos são lidos de `reports.payload.fields`, com chaves `vehicle.N.answer`, `cargo.N.quantity`, etc.

**Não existe uma consulta adicional a checklist_answers na leitura do formulário.** No envio, a mesma RPC insere respostas normalizadas com `report_id` do relatório recém-criado e usa `checklist_items.field_key` para ler os mesmos campos do payload. Por isso o preenchimento foi implementado com o payload já retornado pelo snapshot; não há conversão de checklist_answers no frontend. Os testes PostgreSQL locais verificam as duas gravações e histórico preservado.

O banco hospedado não foi inspecionado por SQL nesta investigação: Access Token ausente; tentativa somente GET ao REST com schema pcif_ops retornou HTTP 406/PGRST106 (schema privado não exposto). Isso não demonstra ausência ou erro de relatórios. Nenhuma permissão/schema foi alterada para contornar a proteção.

## Aba de visitante e persistência

A aba de visitante/privada muda o armazenamento e a duração da sessão/cache do navegador, não a persistência dos registros confirmados no servidor. O app também usa `persistSession:false` no SDK: é esperado precisar entrar novamente ao fechar/reabrir. Uma inspeção não confirmada ainda em memória pode ser perdida ao fechar; uma inspeção já gravada em reports/checklist_answers não é removida por isso. A recuperação depende do perfil autenticado, equipe e ambiente, não do perfil de navegador usado no envio.

O teste SQL local foi reforçado para comparar, no mesmo report_id, todas as 33 respostas normalizadas, quantidades e descrições com os campos que `latestChecklist` entrega à interface. Nenhuma nova inspeção hospedada foi enviada para esse diagnóstico. Não foi encontrada divergência no fluxo implementado. Uma diferença específica nos dados hospedados continua exigindo a consulta somente leitura abaixo ou a inspeção privada do snapshot.

## Correção e aceite

`AppUpdateNotice` usa o registro virtual do plugin PWA, exibe aviso quando uma versão aguarda ativação e consulta atualização ao registrar, retornar ao app/reconectar e periodicamente. A ativação exige clique e confirmação da recarga; nunca recarrega formulário automaticamente. A tela informa o commit curto de `COMMIT_REF` fornecido pelo Netlify (`local` em builds sem essa variável). O registro automático antigo é desativado para haver um único responsável pelo SW.

A correção não alcança retroativamente um JavaScript antigo já em execução: para o primeiro acesso ao fluxo novo, feche todas as abas e a janela instalada do APP, reabra online ou teste em janela privada. Conclua qualquer formulário pendente antes de fechar. Não é necessário limpar registros do Supabase, senhas ou memberships. Não inserir tokens de bypass ou credenciais na URL.

Após revisão e publicação manual:

1. Em janela privada, entrar na GAR 03 e abrir checklist. Verificar qual bloco aparece acima dos itens. Se a referência/respostas aparecem apenas na janela privada, confirma cache do perfil normal.
2. Conferir o identificador de versão exibido. Na próxima publicação, manter uma aba antiga aberta e verificar aviso de atualização. Cancelar a confirmação deve preservar formulário/sessão; aceitar deve carregar a versão nova e exigir login novamente.
3. Se aparecer “Nenhum checklist anterior”, examinar no DevTools a resposta do POST pcif_ops_snapshot: somente conferir equipe, ambiente, contagem/tipos de relatórios e chaves dos campos. Não copiar token ou payload com dados para chat. Nesse caso ainda é necessário diagnóstico de dados, sem correção presumida do banco.
4. Opcionalmente, o administrador pode executar a consulta somente leitura abaixo no SQL Editor **pcif-homologacao** para conferir a associação normalizada. A investigação não a executou.

```sql
with latest as (
  select id, created_at, payload
  from pcif_ops.reports
  where team_id = 'GAR 03'
    and environment = 'pilot'
    and kind = 'checklist'
  order by created_at desc, team_revision desc, id desc
  limit 1
)
select l.id as report_id, l.created_at,
       (select count(*) from jsonb_object_keys(
          case when jsonb_typeof(l.payload->'fields')='object'
               then l.payload->'fields' else '{}'::jsonb end
        ) k where k like '%.answer') as respostas_no_payload,
       count(a.item_id) as respostas_normalizadas,
       count(*) filter (
         where a.item_id is not null
           and l.payload->'fields'->>(i.field_key||'.answer') = a.answer
       ) as respostas_coincidentes
from latest l
left join pcif_ops.checklist_answers a on a.report_id = l.id
left join pcif_ops.checklist_items i on i.id = a.item_id
group by l.id, l.created_at, l.payload;
```

Um checklist completo enviado pela RPC existente deve retornar 33 nas três contagens. Nenhuma linha indica ausência de relatório com esses filtros. Divergências precisam ser analisadas antes de qualquer mudança; não apagar, preencher ou migrar dados automaticamente.
