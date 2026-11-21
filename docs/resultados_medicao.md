# Resultados da medição (21/11/2026)

Medição da API dentro do fluxo real do n8n, seguindo `docs/medicao.md`. Dados, gabarito e script estão em `medicao/`.

## Método
- **Casos:** 20 pedidos novos e fictícios (empresa Gutenberg Systems), 10 completos e 10 incompletos, em `medicao/casos.json`. O gabarito (8 campos, status e campos faltantes) foi escrito e enviado ao GitHub **antes** da execução. SHA-256 do arquivo: `f6562ee46373a183e0a0051d225391358982ee64d3fcd65046b54d839294e7ec`.
- **Execução:** os 20 pedidos passaram, um de cada vez, pelo fluxo `n8n/fluxo_pedidos.json` no n8n Cloud (execuções 15 a 34), chamando a API publicada (`claude-haiku-5-5`, prompts P1 v2 e P3 v2).
- **Pontuação:** `node medicao/pontuar.mjs` compara `medicao/resultados_brutos.json` (linhas da tabela `pedidos_processados` e metadados das execuções) com o gabarito. O item é conferido por palavras-chave; texto sem acento e sem diferença de maiúsculas; números exatos.
- **E-mail:** conta como certo quando cita exatamente os campos que faltam (área solicitante, prazo de entrega, valor unitário, fornecedor), conferido por busca no texto, e não só pela checagem interna da API.

## Resultados
| Medida | Resultado |
|---|---|
| Campos corretos (8 por pedido) | 160 de 160 |
| Status correto (completo ou pendente) | 20 de 20 |
| Campos faltantes corretos | 20 de 20 |
| E-mails que citam exatamente os faltantes | 10 de 10 |
| Pedidos completos sem e-mail | 10 de 10 |
| Tempo de execução no n8n (mediana) | 2,03 s (completos 1,31 s; pendentes 2,75 s; máximo 4,12 s) |
| Custo por pedido (média) | US$ 0,000218 (completos ≈ 0,00014; pendentes ≈ 0,00030; máximo 0,000441) |
| Custo total dos 20 pedidos | US$ 0,004352 |

## Limitações
- **Amostra pequena (20) e uma única rodada.** 160/160 não prova acerto geral; o modelo não é determinístico.
- **Os casos foram escritos por um assistente de IA (Claude) e revisados por Guilherme**, e seguem as regras do prompt (por exemplo, prazo relativo e data sem ano viram vazio). Não são adversariais nem vieram de pedidos reais.
- **Tempo:** é a duração da execução no n8n (API, gravação na tabela e envio pelo Gmail). Não inclui o preenchimento do formulário nem a entrega do e-mail. As execuções foram disparadas pelo conector do n8n em modo manual, e algumas se sobrepuseram por poucos milissegundos ou 1,5 s (execuções 29 e 30).
- **Custo:** soma dos `custo_usd` devolvidos pela API, com o preço consultado em 19/11/2026. Não foi conferido contra a fatura da Anthropic.
- Estes números são **da API no fluxo**. Os números do Prompt Lab (extração e e-mail) são do laboratório e não entram aqui.

## Comparação com o processo manual
Autor, 21/11/2026, cronômetro no celular, 5 pedidos do mesmo conjunto (C02, C07, I01, I04, I06), na ordem do protocolo (`medicao/cronometragem_manual.csv`). Cada tempo vai da leitura do pedido até a linha preenchida na planilha e, nos pendentes, o e-mail pronto para enviar.

| Pedido | Tipo | Manual (s) |
|---|---|---|
| C02 | completo | 61 |
| C07 | completo | 55 |
| I01 | pendente | 150 |
| I04 | pendente | 170 |
| I06 | pendente | 160 |

- **Manual:** média de 119 s por pedido (mediana 150 s); completos ≈ 58 s e pendentes ≈ 160 s.
- **API no fluxo (execução no n8n):** mediana de 2,03 s; completos 1,31 s e pendentes 2,75 s.
- **Acerto manual nesses 5 pedidos:** 38 de 40 campos. Erros: prazo de I01 (25/01/2027, o correto era 28/01/2027) e unidade de I04 (`um`, o correto era `un`). Datas foram anotadas como DD/MM/AAAA e não como AAAA-MM-DD; tratei como o mesmo conteúdo. O acerto dos e-mails escritos à mão não foi conferido.
- **Estimativa, não medição:** com esses tempos, 10 pedidos completos e 10 pendentes levariam cerca de 36 minutos à mão (10 × 58 s + 10 × 160 s) contra cerca de 40 s de execução da API (soma das 20 execuções). A estimativa extrapola 5 amostras.

**Limitações da comparação:** 5 amostras e uma única pessoa, que é o autor do projeto e conhece as regras e os textos, o que tende a favorecer o manual. Os dois tempos não medem a mesma coisa: o da API é tempo de máquina no n8n; o manual inclui a leitura e a digitação. No uso real ainda existe a conferência humana dos pedidos pendentes e dos campos vazios, que não foi cronometrada.
