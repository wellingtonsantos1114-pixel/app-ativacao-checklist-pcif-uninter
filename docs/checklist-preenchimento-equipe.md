# Checklist: referência anterior por equipe

Ao abrir CHECKLIST no piloto, o aplicativo consulta novamente `public.pcif_ops_snapshot` com a sessão autenticada. Essa RPC já retorna somente os relatórios da equipe/ambiente do perfil no servidor. O frontend também filtra `kind=checklist`, equipe e ambiente antes de escolher a data `created_at` mais recente; outras operações são ignoradas. Não há seleção livre de equipe nem parâmetro de equipe enviado nessa consulta.

São reutilizadas somente condições válidas, descrições de não conformidade e quantidades dos 33 itens conhecidos. Observações gerais anteriores não são copiadas. Sem checklist próprio anterior, os itens ficam vazios. Dados incompletos não recebem respostas presumidas: os campos obrigatórios ainda precisam ser preenchidos.

A referência mostra data/hora em São Paulo e informa que as respostas são anteriores. O formulário continua editável. A consulta ocorre antes de liberar os itens; falha bloqueia o envio e oferece tentar novamente, sem afirmar que não há histórico. Depois de carregado, o formulário não é sobrescrito por alterações do snapshot. Respostas tardias após voltar/sair não reabrem o formulário.

Após revisar as respostas, o operador precisa marcar uma confirmação explícita de que conferiu os 33 equipamentos hoje. Alterar o formulário exige nova revisão/confirmação. Depois de falha de gravação, os valores são preservados e uma nova confirmação é exigida. Essa confirmação é controle de interface; não é prova técnica de inspeção física nem um campo novo de auditoria do banco.

A gravação permanece em `public.pcif_ops_submit`, com `request_id`, revisão otimista, identidade e timestamps do servidor. Repetir uma tentativa após resposta perdida com o mesmo payload mantém o mesmo UUID; após sucesso, outro envio gera outro UUID e outro relatório. Respostas normalizadas e eventos de auditoria continuam inseridos na transação. Nenhum relatório é atualizado/apagado.

Não é necessária migration: as migrações `202610180001_operational_foundation.sql` e `202610180002_operational_pilot.sql` já oferecem payload, histórico, isolamento, RLS, imutabilidade e idempotência. Não foram executados SQL remoto, provisionamento, alteração do Painel Web ou deploy nesta entrega. A estrutura foi conferida no código das migrações e em PostgreSQL local, sem consultar credenciais/dados hospedados.

## Validação de aceite após revisão e publicação manual

1. GAR 03 sem histórico: abrir CHECKLIST; verificar 33 itens vazios. Preencher, revisar, confirmar conferência de hoje e enviar.
2. Reabrir: verificar referência com data/hora, 33 respostas e quantidades carregadas; observações gerais devem estar vazias.
3. Alterar um item, revisar e conferir que não envia sem marcar a confirmação. Enviar; conferir um novo relatório e 33 novas respostas, mantendo o registro anterior.
4. Entrar com outra equipe: não deve visualizar nem reutilizar o checklist GAR 03. Conferir também o isolamento no teste administrativo de API, além da interface.
5. Simular falha de leitura: confirmar opção de tentar novamente e nenhum preenchimento presumido. Simular resposta perdida na gravação: repetir e conferir um só registro para aquele request_id.
6. Testar alterações individuais, checkbox e rolagem em Chrome Android e Safari iPhone. A interface usa layout fluido e checkbox com área mínima de 24 px; o aceite em dispositivos físicos não foi executado no ambiente cloud.

Testes automatizados cobrem seleção da referência, isolamento por equipe/ambiente, formulário, confirmação, preservação após falha e descarte de resposta tardia. O ensaio integrado local cria dois checklists com IDs diferentes e 66 respostas normalizadas, preservando o primeiro e as demais operações. Auth/transporte são simulados; o PostgreSQL/PGlite e handlers são reais.
