# PWA Ativação e Checklist

## Análise antes das alterações

Base: main 872e967. React 19, Vite 7, vite-plugin-pwa/Workbox já instalados; manifest sem ícones e nome genérico. Registro central em AppUpdateNotice, atualizações por confirmação. Netlify compila em dist, com fallback SPA e header no-cache para sw.js. Nenhuma configuração operacional do Netlify foi alterada.

Riscos identificados: recarga descarta formulários e sessão em memória; atualização em outra janela; cache de HTML antigo. Login, logout, SDK Supabase com persistSession:false, payload, regras dos 33 itens, histórico e consulta da referência anterior foram preservados. Não foram executadas operações em bancos hospedados nem alterado o Painel.

## Implementação

Manifest com nome Ativação e Checklist, nome curto Ativação e Checklist, identidade /, escopo /, standalone e cores existentes. PNGs de 192/512, máscara com conteúdo central seguro e apple-touch-icon de 180. Metadados iOS no HTML. Ícones derivados exclusivamente da arte oficial anexada (PNG RGB de 1254 × 1254), sem redesenho, recorte ou alteração de cores. Redimensionamento Lanczos com fundo preto e margens técnicas; versões comuns/Apple usam 90% do lado, e a máscara usa 56%, mantendo inclusive os cantos da arte dentro do círculo seguro de 80% de diâmetro. Não foram modificadas telas.

Cache limitado aos bundles de build, imagens públicas, ícones e manifest. HTML e navegações dependem da rede. Sem runtime caching, fallback de navegação ou fila offline. Supabase e Functions não são interceptados por rotas do SW; tokens, operações, respostas e checklists não entram no Cache Storage. Falta de conexão não deve ser interpretada como dado atualizado. O app requer conexão; não oferece funcionamento offline completo.

A nova versão aguarda clique e confirmação; formulário operacional aberto ou login/senha editados bloqueiam o botão. Nenhum rascunho sensível é persistido. A verificação do worker exige apenas uma janela aberta antes da atualização, para proteger outras abas. Falha/timeout bloqueiam atualização. Após envio confirmado ou saída voluntária do formulário, o usuário pode atualizar. Sair voluntariamente, fechar, recarregar manualmente ou o SO encerrar o app continuam podendo descartar dados em memória, como antes.

Migração do worker anterior: ele não conhece a verificação multi-janela; nesse caso, conclua todos os registros, feche todas as abas/janelas do app e reabra online para ativação natural. Não é necessário limpar o navegador. Versões antigas já em execução não recebem os novos bloqueios retroativamente.

## Instalação (após aprovação e disponibilização HTTPS)

- Android/Chrome: abrir o endereço do APP, menu ⋮, Instalar aplicativo ou Adicionar à tela inicial, confirmar e abrir pelo ícone.
- iPhone/Safari: abrir o endereço do APP, Compartilhar, Adicionar à Tela de Início, manter Abrir como App quando disponível, Adicionar. Abrir pelo ícone.
- O modo standalone depende do suporte do navegador e da abertura pelo ícone. A instalação não altera a persistência da sessão: pode ser necessário entrar novamente ao reabrir.

## Verificações reproduzíveis

`npm test`, `npm run build`, `node tools/check-pwa.mjs`.

A suíte usa mocks e PostgreSQL/PGlite local para login/logout, falha de envio, consulta anterior, 33 respostas normalizadas e histórico. Não comprova dados hospedados nem instalação real. `npm run test:integration` depende de PCIF_PANEL_ROOT com checkout do Painel, ausente neste ambiente; não modificar o Painel para contornar essa dependência.

## Roteiro manual pendente

Usar ambiente de revisão HTTPS autorizado, com credenciais de teste. Não enviar checklists de teste em produção.

1. DevTools Application: verificar manifest sem erros, ícones, scope /, SW ativo e Cache Storage contendo apenas a lista estática. Confirmar que não há HTML, tokens, respostas RPC ou Functions no cache.
2. Instalar no Android e iPhone pelas instruções acima. Abrir pelo ícone, verificar standalone, nome, ícone comum/adaptativo e cores.
3. Entrar e sair; reabrir e conferir comportamento de sessão equivalente à versão anterior. Navegar em todas as operações e trocar senha com conta de teste, quando aplicável.
4. Em retrato/paisagem, conferir rolagem, teclado virtual, foco, selects, textarea e botões, inclusive com aviso de atualização aberto.
5. Abrir checklist e conferir referência/data/equipe; revisar os 33 itens, enviar e reabrir para recuperar respostas. Conferir histórico e revisões anteriores preservados. Repetir com outra equipe para conferir isolamento.
6. Cortar a rede: consulta/envio devem falhar sem anunciar sucesso nem mostrar resposta cacheada como atual. Restaurar a rede e consultar novamente.
7. Em duas versões de revisão, manter a anterior aberta com formulário preenchido. O aviso deve aparecer sem recarga e o botão ficar bloqueado; texto e respostas devem permanecer. Cancelar a confirmação no dashboard deve preservar a sessão.
8. Abrir outra aba/PWA: atualização deve ser recusada até fechar a outra janela. Concluir envio, voltar ao dashboard, fechar outras janelas e confirmar: versão nova e novo login, sem limpeza manual. Verificar também migração do worker anterior por fechamento de todas as janelas após envio.

Não houve validação em dispositivos reais, Safari/Chrome reais ou Lighthouse nesta execução. A aceitação final da instalação, teclado, layout e atualização entre versões depende deste roteiro.

## Identidade oficial

Nome completo e curto: **Ativação e Checklist**, sem abreviação mesmo quando o sistema operacional truncar a legenda. O título HTML e o nome Apple usam a mesma identidade do manifest; o layout interno não foi alterado. A abertura instalada utiliza os ícones do manifest/Apple; a composição da tela de abertura é controlada pelo sistema operacional.

A inspeção visual das versões de 192 e 180 px confirma a identificação do emblema e do texto principal. Em 48 px o conjunto continua reconhecível, mas letras menores e detalhes finos perdem legibilidade naturalmente; nenhuma letra foi redesenhada para contornar essa limitação. A versão adaptativa preserva a imagem inteira dentro da zona segura, com maior margem preta. A validação final em telas reais segue pendente.
