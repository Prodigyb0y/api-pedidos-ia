# Como foi construído

Registro honesto de quais ferramentas de IA fizeram cada parte.

| Data | Ferramenta | O que foi pedido | O que foi gerado | O que o autor revisou ou corrigiu |
|---|---|---|---|---|
| 2026-11-21 | v0 (Vercel), modelo v0 Max com plano do ChatGPT | Base do projeto: rota de saúde, autenticação por `x-api-key`, formato de erro | Base em Next.js com as rotas de teste; segundo o v0, os 4 testes passaram | A publicação pelo v0 travou na etapa de pull request; o caminho foi trocado e a base refeita neste repositório |
| 2026-11-21 | Claude (assistente de código) | API completa sem dependências, testes, OpenAPI, página de demonstração e documentação | Este repositório | |
| 2026-11-21 | v0 (Vercel), modelo v0 Max, em um app separado (`api-pedidos-portal`) | Plano de um cliente Next.js que consome a API publicada, sem escrever código ainda; depois, revisão do plano e aprovação | Plano em 5 telas (Início, Console, Documentação, Uso, Como integra) com rota interna para o segredo `demo` | O autor, com apoio do assistente, dividiu o plano em 3 etapas para que o segredo só entrasse na etapa 2; o v0 reescreveu o plano e o autor aprovou a etapa 1 |
| 2026-11-21 | v0 (Vercel), modelo v0 Max | Etapa 1: layout, tema escuro e claro, Início, Uso e Documentação, só com leituras públicas (`/api/v1/uso` e `/api/openapi.json`) | Portal Next.js com 3 telas, sem route handler e sem variável secreta; o v0 também gerou uma imagem de ilustração com IA para a página inicial | Conferido em 22/11/2026 no site publicado (`api-pedidos-portal.vercel.app`): números iguais ao `/api/v1/uso`, sem botão de execução na documentação e só GETs na aba Rede. Pendente: navegação por teclado e tema claro |

Próxima linha: Etapa 2 no v0 (rota interna com o segredo `demo` e Console com 4 exemplos) e Etapa 3 (Como integra e acessibilidade). Até lá, apenas o portal público (Início, Uso, Documentação) foi feito no v0; o Console ainda não existe.
