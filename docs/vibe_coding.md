# Como foi construído

Registro honesto de quais ferramentas de IA fizeram cada parte.

| Data | Ferramenta | O que foi pedido | O que foi gerado | O que o autor revisou ou corrigiu |
|---|---|---|---|---|
| 2026-11-21 | v0 (Vercel), modelo v0 Max com plano do ChatGPT | Base do projeto: rota de saúde, autenticação por `x-api-key`, formato de erro | Base em Next.js com as rotas de teste; segundo o v0, os 4 testes passaram | A publicação pelo v0 travou na etapa de pull request; o caminho foi trocado e a base refeita neste repositório |
| 2026-11-21 | Claude (assistente de código) | API completa sem dependências, testes, OpenAPI, página de demonstração e documentação | Este repositório | |

Próxima linha: interface feita no v0 a partir deste repositório (Import from GitHub), com os prompts registrados aqui.
