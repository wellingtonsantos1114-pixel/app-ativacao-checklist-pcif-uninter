# Arquitetura da demonstração e próximos marcos

Para o novo modo piloto, o contrato e o roteiro atualizados estão em [pilot-integration.md](pilot-integration.md). As limitações abaixo descrevem a fundação anterior e o modo demonstrativo padrão.

## Limite da primeira entrega

UI → `OperationsRepository` → adaptador demo em memória. A fábrica Supabase é isolada e não importada pela UI. Não há chamadas de autenticação ou banco. Os campos específicos são mantidos nos registros em memória da sessão, associados à equipe, Estado e Regional selecionados; a revisão mantém o formulário visível antes da confirmação. O status demonstrativo inicia Pendente, passa a Ativa após ativação e a OFF após desativação. Manutenção tem entrada e saída confirmadas e restaura o estado anterior, sem presumir reparos. Sair ou recarregar descarta registros e estado. Troca/recuperação de senha e valores anteriores são próximos marcos. Os indicadores representam apenas a sessão demonstrativa.

## Banco de homologação

A migração cria schema próprio `pcif_ops`, cadastro central de equipes, memberships, colaboradores protegidos, relatórios imutáveis e fundação de auditoria. Não executar ainda no projeto compartilhado de produção. RLS restringe leitura por equipe ou analista; o trigger obtém equipe do usuário autenticado e carimba horário no servidor. Não há permissões públicas, de update ou delete para operadores. `request_id` será chave de idempotência estável por tentativa lógica.

Antes de conectar: testar migração num Supabase descartável; completar validações SQL dos payloads, respostas normalizadas do checklist, auditoria automática, transições de status e correções versionadas. O JSON atual é fundação, não contrato pronto para produção. Testar anon negado, duas equipes isoladas, analista, troca obrigatória, identificador adulterado, duplicidade e timestamps. Não foram executados testes de RLS ou autenticação real nesta entrega.

## Cadastro e autenticação

O mapa demo em `src/lib/teams.ts` deve ser substituído pelo cadastro central autorizado no Supabase e consumido por ambos os aplicativos. Não manter o mapa local como autoridade de produção. Não foi alterado o painel. Importar as 31 equipes somente em homologação após conferência; nomes de colaboradores virão de consulta autenticada, com busca normalizada no servidor, nunca de arquivo público. Confirmar deduplicação de Enxadas e quantidades indefinidas com proprietário.

Próximo backend: função administrativa protegida e auditada, restrita a administradores, usando segredo server-side. Provisionar contas em lote com senhas aleatórias individuais, entrega segura, rotação obrigatória e redefinição administrativa. Não criar contas agora. Login por identificador exige endpoint com limitação de tentativas e mapeamento interno sem expor diretório de identidades. Chave pública Supabase pode estar no frontend; service_role nunca. A demo deliberadamente não coleta senhas reais.

## Contrato futuro com PAINEL WEB PCIF

Painel terá adaptador próprio e permissão de analista, sem mudanças nesta etapa. Consultar snapshots por equipe e data de São Paulo; ativação e checklist são relatórios independentes. Estado OFF deriva de desativação; manutenção é um par de eventos, e saída não implica reparo. Implementar projeção de status no servidor com transação e bloqueio por equipe.

Assinar INSERTs de relatórios via Supabase Realtime depois de revisar publicação e exposição do schema. Ao conectar/reconectar, obter snapshot e recuperar registros desde cursor `(created_at,id)`, deduplicando por id; manter recuperação periódica para lacunas e renovar token. Preservar modal atual do painel e adicionar alternância Ativação/Checklist na mesma data. Não presumir integração pronta: depende de contrato e revisão no repositório do painel. Testar queda, reconexão, duplicatas, eventos fora de ordem e dias sem relatório.

Links Maps são sensíveis: somente usuários autorizados; sem rastreamento contínuo, analytics ou cache de dados operacionais. Definir retenção e auditoria antes de produção.

## Configuração futura

Definir VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY apenas para homologação. Valores VITE são públicos no bundle. Habilitar hosts exatos do Supabase no ambiente cloud quando conhecidos, incluindo canal Realtime. Nenhuma credencial corporativa necessária agora. Revisar e aplicar SQL em homologação, validar RLS, depois configurar Auth e Realtime. Instalação PWA completa depende do ícone original e testes em dispositivos. Não publicar ou aplicar SQL automaticamente.
