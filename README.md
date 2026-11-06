# APP Ativação/Checklist PCIF

Aplicativo web instalável (PWA) para as equipes de campo **GAR** (veículos 4x4) e **GAC** (caminhões-pipa). Ele digitaliza a rotina operacional do turno: ativação, checklist da viatura e dos materiais, registro de manutenção e desativação ao final da jornada.

Projeto desenvolvido na **Atividade Extensionista II** do curso de **Gestão da Tecnologia da Informação – Centro Universitário Internacional UNINTER**.

- **Aluno:** Wellington dos Santos Silva
- **Professora:** Mariane Gavioli Bergamini Fernandes

> **Dados fictícios.** Este repositório é a versão pública para avaliação acadêmica. Nomes de colaboradores, identificadores de projeto e contas são fictícios. Nenhum dado pessoal real ou credencial está incluído.

## Problema e solução

As equipes registravam o início e o fim do turno, o checklist e as ocorrências de manutenção de forma manual, o que dificultava a padronização e o acompanhamento pela Central. O aplicativo organiza essas etapas em um fluxo único no tablet ou celular. Os registros ficam disponíveis de forma centralizada para o painel da Central de Incêndio, que é um sistema complementar e não faz parte deste repositório.

## Funcionalidades

| Operação | O que faz |
|---|---|
| **Ativação** | Registra o início do turno: equipe, colaboradores (líder/condutor e auxiliares), placa do veículo e local de atuação |
| **Checklist** | 33 itens de verificação: 13 itens da viatura (VTR) e 20 materiais de carga; não conformidades exigem descrição |
| **Manutenção** | Registra entrada e saída de manutenção/indisponibilidade do recurso |
| **Desativação** | Encerra o turno e muda o status da equipe para OFF |

Outros pontos:
- Revisão do formulário antes da confirmação do envio.
- Seleção de colaboradores por busca, sem repetir a mesma pessoa em duas funções.
- Instalável como aplicativo (PWA), com aviso de atualização.
- Interface pensada para uso em campo (mobile-first).

## Tecnologias

- **Front-end:** React 19 + TypeScript + Vite
- **PWA:** vite-plugin-pwa (service worker e manifesto)
- **Banco de dados e autenticação:** Supabase (PostgreSQL com RLS)
- **Back-end serverless:** Netlify Functions (login e troca de senha das equipes)
- **Testes:** Vitest + Testing Library + PGlite (banco PostgreSQL local para testes)
- **Integração contínua:** GitHub Actions

## Como executar (modo demonstração)

O modo demonstração é o padrão. Ele **não precisa de nenhuma chave nem de conta**, e os dados ficam só na memória, sendo descartados ao recarregar a página.

Requisito: Node.js 22.12 ou superior.

```sh
npm ci
npm run dev       # abre em http://localhost:5173
npm test          # executa os testes automatizados
npm run build     # gera a versão de produção (PWA)
```

Para testar: escolha uma equipe na tela inicial e percorra **Ativação → Checklist → Manutenção → Desativação**.

## Estrutura do projeto

```
src/                 Telas e lógica do aplicativo (React)
  lib/               Regras de checklist, operações, equipes e colaboradores
  pilot/             Integração com Supabase (modo piloto)
  data/              Lista de colaboradores (fictícia nesta versão)
netlify/functions/   Funções serverless de login e senha
supabase/            Migrações SQL do banco e políticas de acesso (RLS)
tools/               Scripts de homologação e provisionamento
docs/                Documentação técnica (arquitetura, PWA, integração)
```

## Segurança

- Nenhuma chave secreta está no repositório. O `.env` é ignorado pelo Git e o `.env.example` traz só os nomes das variáveis.
- A chave `service_role` só é usada nas funções do servidor e nunca no front-end.
- O acesso aos dados é restrito por equipe com Row Level Security (RLS) no Supabase.

## Documentação

Mais detalhes técnicos em [`docs/`](docs/), principalmente [arquitetura](docs/architecture.md), [integração piloto](docs/pilot-integration.md) e [PWA](docs/pwa.md).
