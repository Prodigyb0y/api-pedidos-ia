# API de Pedidos · Gutenberg Systems

**Pedido de compra em texto livre vira dados prontos e e-mail pedindo só o que faltou.** Uma API leve, publicada na Vercel e consumida por um fluxo do n8n, que reaproveita dois prompts já medidos no [Prompt Lab](https://github.com/Prodigyb0y/prompt-lab).

> Recriação conceitual com **empresa, pessoas e pedidos 100% fictícios** (Gutenberg Systems). Nenhum dado, nome ou sistema de empresa real.

![Console de teste da API](docs/img/console.png)
<sub>Captura feita localmente, com o modelo substituído por uma resposta de teste. Os números reais de custo e latência estão em [Resultados](#resultados).</sub>

- **Demo:** `https://api-pedidos-mu.vercel.app`
- **Especificação OpenAPI:** `/api/openapi.json`

## Por que isso importa para um time de negócio
Quem compra recebe pedidos em e-mail ou mensagem, redigita item, quantidade, prazo, valor e fornecedor, e escreve de volta pedindo o que faltou. A API faz as duas coisas em segundos, com custo medido por pedido e teto de gasto no código. O que não está no texto volta vazio, nunca inventado, para uma pessoa conferir.

## O que a API faz
| Rota | Chave | O que faz |
|---|---|---|
| `GET /api/v1/saude` | não | Status, versão, modelo e versões dos prompts |
| `POST /api/v1/extrair` | sim | Texto do pedido → 8 campos em JSON + lista do que falta |
| `POST /api/v1/email-pendencias` | sim | Campos extraídos → e-mail citando **exatamente** os campos que faltam |
| `POST /api/v1/processar` | sim | Os dois em sequência; `status` = `completo` ou `pendente` (rota usada pelo n8n) |
| `GET /api/v1/uso` | não | Totais de chamadas, custo e latência (sem conteúdo de pedido) |
| `GET /api/openapi.json` | não | Especificação OpenAPI 3.1 |
| `POST /api/demo` | não | Rota da página de demonstração, com limite diário próprio e texto até 1.000 caracteres |

Campos extraídos: `solicitante_area`, `item`, `quantidade`, `unidade` (`un`, `kg`, `m`, `l`, `cx`), `prazo_entrega` (AAAA-MM-DD), `valor_unitario`, `moeda` (`BRL`, `USD`, `EUR`), `fornecedor`.
Campos que o e-mail sabe pedir: área solicitante, prazo de entrega, valor unitário (com a moeda) e fornecedor.

### Exemplo
```bash
curl -X POST https://api-pedidos-mu.vercel.app/api/v1/processar \
  -H "content-type: application/json" \
  -H "x-api-key: SUA_CHAVE" \
  -H "x-id-pedido: msg-123" \
  -d '{"texto":"O Almoxarifado precisa de 25 kg de detergente industrial até 05/01/2027."}'
```
Resposta (resumida):
```json
{
  "status": "pendente",
  "dados": { "solicitante_area": "Almoxarifado", "item": "detergente industrial", "quantidade": 25, "unidade": "kg",
             "prazo_entrega": "2027-01-05", "valor_unitario": null, "moeda": null, "fornecedor": null },
  "faltantes": ["valor_unitario", "fornecedor"],
  "email": { "assunto": "...", "corpo": "...", "campos_citados": ["fornecedor", "valor_unitario"] },
  "modelo": "claude-haiku-5-5", "custo_usd": 0.00028, "chamadas_ao_modelo": 2
}
```

## Como funciona
```
Pedido (e-mail ou formulário) → n8n → POST /api/v1/processar
                                        ├─ prompt de extração (Prompt Lab P1 v2) → JSON validado em código
                                        └─ se faltar algo: prompt de e-mail (Prompt Lab P3 v2) → campos citados conferidos em código
                                      → planilha → e-mail ao solicitante (pendente) ou aviso a Compras (completo)
```
- **Modelo:** `claude-haiku-5-5`, com `effort: low` e sem `temperature` (o modelo não aceita), como no Prompt Lab.
- **Prompts:** copiados sem alteração de `prompt-lab/prompts/` (hash `2c3ccc1873da` e `01f069156bb0`, conferidos por teste).
- **Saída conferida em código:** o JSON passa por validação estrita; o e-mail só é aceito se citar exatamente os campos que faltam. Se não passar, uma nova tentativa; se falhar de novo, erro 502 com o motivo, nunca dado aproximado.
- **Segurança:** cabeçalho `x-api-key` comparado em tempo constante; segredos só em variáveis de ambiente; corpo limitado a 8 KB; log sem texto do pedido e sem e-mail.
- **Custo sob controle:** antes de cada chamada, a API reserva o custo máximo; se o total do mês passar de `TETO_GASTO_USD`, responde 503 sem chamar o modelo. Limite diário por chave (429).
- **Idempotência:** com `x-id-pedido`, o mesmo pedido reenviado em 24 h devolve a resposta anterior sem novo custo.
- **Sem dependências:** JavaScript puro em funções da Vercel; a chamada ao modelo usa a API HTTP da Anthropic.

## Resultados
**Medição pendente.** O plano (`docs/medicao.md`): 20 pedidos novos fictícios com gabarito escrito antes, enviados pelo fluxo do n8n, medindo acerto dos campos, acerto do status, e-mails citando exatamente os faltantes, tempo de ponta a ponta e custo por pedido, comparados com o processo manual cronometrado.

O que já está medido vem do Prompt Lab, com os mesmos prompts: extração 100% em 50 casos de desenvolvimento e em 20 pedidos novos (só 6 de valor total); e-mail 98,3% em 60 respostas. Esses números são do laboratório, não desta API.

## Como rodar
**Na Vercel (recomendado):** importe o repositório em vercel.com → Add New → Project, cadastre as variáveis abaixo (Production e Preview) e publique. Cada push em `main` publica de novo.

| Variável | Para que serve |
|---|---|
| `ANTHROPIC_API_KEY` | Chave da Anthropic (só no servidor) |
| `API_KEYS` | `apelido:segredo` separados por vírgula (segredo com 12+ caracteres), ex.: `n8n:...,demo:...` |
| `TETO_GASTO_USD` | Teto do mês com o modelo (padrão `0.50`) |
| `LIMITE_DIARIO_POR_CHAVE` | Chamadas por dia por chave (padrão `200`) |
| `LIMITE_DIARIO_DEMO` | Chamadas por dia na página de demonstração (padrão `30`) |
| `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` | Opcional. Integração Upstash Redis da Vercel: deixa contadores, teto e log persistentes. Sem ela, ficam em memória por instância (a rota `/api/v1/uso` avisa) |

**Testes (sem chamar a API da Anthropic):**
```bash
npm test
```
28 testes cobrem autenticação, validação, cálculo de custo, teto de gasto, limite diário, idempotência, conferência do e-mail, log sem conteúdo, cliente do modelo e hash dos prompts.

## Estrutura
```
api/               funções da Vercel (uma por rota)
lib/               regras: validação, autenticação, custo, controle (teto, limites, log), serviço, OpenAPI
prompts/           prompts copiados do Prompt Lab (fonte da verdade)
scripts/           gera lib/prompts.js a partir de prompts/
public/            página de demonstração (console, documentação, uso)
test/              testes com node:test
docs/              n8n, medição e registro de como foi construído
```

## Limitações
- Dados e pedidos fictícios; um único modelo; prompts medidos em casos gerados pelo autor do Prompt Lab.
- Sem a integração de Redis, limites e teto valem por instância, não para a API inteira.
- O e-mail pede só quatro campos (área, prazo, valor com moeda e fornecedor); unidade e moeda sozinhas não geram pedido de informação.
- A conferência do e-mail é por nome exato do campo: um e-mail correto escrito com outro nome seria recusado.

## Como foi construído
Código escrito com assistente de código de IA (Claude), a partir do desenho e das regras definidos pelo autor; a primeira versão da base foi tentada no v0, que ficou para a camada de interface. Registro em [`docs/vibe_coding.md`](docs/vibe_coding.md).
