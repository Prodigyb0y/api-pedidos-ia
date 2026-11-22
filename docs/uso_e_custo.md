# Como ler `GET /api/v1/uso`

A rota é pública e não mostra conteúdo de pedido. Os números vêm de duas fontes diferentes, e por isso nem sempre coincidem.

## Chamadas, sucesso e erro
- **Fonte:** o log das últimas 1.000 chamadas (a rota informa quantas foram usadas em `base`).
- **Sucesso:** resposta com status 200. **Erro:** qualquer outra resposta, inclusive chave ausente (401) ou errada (403), texto sem item e quantidade (422), limite diário (429), teto de gasto (503) e falha do modelo (502). O `/uso` não separa por código, embora o log guarde o código de cada erro.
- **Efeito colateral:** como as chamadas sem chave válida também entram no log, testes de autenticação aumentam a contagem de erros e ocupam espaço nas 1.000 linhas.
- **Exemplo (22/11/2026):** `/uso` mostrava 31 chamadas no mês, 30 com sucesso e 1 erro. O erro coincide com um teste de chave antiga feito pelo autor (resposta 403) após uma leitura anterior com 28 chamadas e 0 erros. Isso é uma inferência pela ordem dos testes; o endpoint não permite confirmar.

## Custo: por que há dois números
| Campo | De onde vem | O que inclui |
|---|---|---|
| `gasto_do_mes_usd` | Contador usado para o teto de gasto, em micro-dólares inteiros | Custo de **cada chamada ao modelo**, arredondado **para cima** em micro-dólares, inclusive de chamadas que depois terminaram em erro (por exemplo, o modelo respondeu, mas a saída foi recusada) |
| `mes.custo_usd` | Soma do `custo_usd` das linhas do log | Só o custo das respostas com sucesso, com 6 casas decimais |

A diferença é pequena e esperada: em 22/11/2026, `gasto_do_mes_usd` era 0,006372 e `mes.custo_usd` era 0,006347 (US$ 0,000025). O arredondamento para cima, repetido a cada chamada ao modelo, explica uma parte: foram pelo menos 46 chamadas no mês (16 pedidos pendentes usam 2 chamadas e 14 completos usam 1, conforme `pedidos_pendentes` e `pedidos_processados` do `/uso`; novas tentativas e chamadas com erro somam mais). O custo de chamadas que terminaram em erro explica outra parte: se o modelo respondeu mas a saída foi recusada, o custo entra no contador; se o modelo falhou por exceção (rede ou erro do provedor), o acerto é zero. Sem o log bruto não é possível separar as duas partes. O número que vale para o teto é `gasto_do_mes_usd`, porque é o que a API consulta antes de chamar o modelo.

## O portal
As páginas `Início` e `Uso` do portal leem esta rota. Em 22/11/2026, uma requisição às duas páginas (feita do próprio navegador, com o cabeçalho da resposta lido) voltou com `cache-control: no-store` e `x-vercel-cache: MISS`; isso vale para as páginas, não para o código do portal, que não está neste repositório. A API também responde com `no-store`. Em 22/11/2026 elas exibiam 30 pedidos processados e base de 31 chamadas, iguais à API. Uma leitura externa que mostrou 26 chamadas no mesmo dia não foi reproduzida; a causa não foi identificada (provável leitura antiga).
