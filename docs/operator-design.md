# Área do operador — referência visual PCIF

A tela operacional é implementada em `OperatorDashboard.tsx`, com CSS próprio e textos/controles React reais. Equipe, Estado, Regional, status, indicadores e histórico vêm da sessão demonstrativa existente. O botão Voltar encerra a sessão e retorna ao login, como o antigo Sair; seu nome acessível continua Sair.

## Composição e recursos

Cabeçalho azul-marinho com floresta noturna, identificação branca/dourada, cards verdes/azuis/âmbar/vermelhos, setas circulares, status dos relatórios e histórico com contador. Em celulares os cards continuam verticais e reorganizam descrição, ícone e título; painéis horizontais passam a blocos. Áreas seguras e navegação por teclado são respeitadas, com foco visível e status descritos por texto além da cor.

Os ícones SVG e a floresta vetorial em `public/operator/night-forest.svg` são recursos próprios desta implementação, sem dependências, marcas ou fotos externas. Os cards usam gradientes e elementos gráficos próprios, conforme a alternativa permitida na especificação. **Diferenças da referência:** não foram recebidas fotografias isoladas dos cards ou logotipo oficial PCIF/da empresa contratante; por isso não se reproduziu o logotipo e não há fotos de rádio/motor/estrada. A identificação PCIF é texto e a floresta é vetorial. A captura enviada não foi usada como interface nem como imagem de fundo inteira.

## Manutenção

Somente o destaque e a ação visual da manutenção mudaram entre os formulários: início âmbar, finalização verde, títulos, explicações e botões de revisão distintos. A confirmação continua separada. A mensagem de sucesso identifica a equipe. A lógica que preserva o estado anterior e as observações permanece; não presume reparos. Histórico mantém registros mais recentes primeiro.

Login e seus assets, cadastro regional, 33 itens do checklist, campos dos demais formulários, SQL e Netlify permanecem inalterados. Não há autenticação real, acesso Supabase, publicação manual ou alterações no painel.

## Validação

- `npm test`: 21 testes aprovados, incluindo estados Pendente/Ativa/Em manutenção/OFF, confirmações e cancelamento, retorno ao estado anterior, equipe, observações e checklist completo antes de concluir seu indicador.
- `npm run build`: compilação TypeScript/Vite e geração PWA aprovadas.
- Chromium via Playwright local: 320×740, 360×800, 390×844, 412×915, 768×1024, 1024×768, 1440×1100 e 844×390. Quatro cards verticais, navegação para cada formulário, manutenção de entrada/saída e OFF conferidos, sem rolagem horizontal, erros JavaScript ou requisições externas. Capturas de celular e desktop inspecionadas.
- Funcionamento demonstrativo sem credenciais Supabase; testes com dados fictícios. Não houve teste físico em Android/iPhone nem validação do deploy remoto.
