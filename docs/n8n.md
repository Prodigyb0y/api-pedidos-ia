# Fluxo no n8n

O n8n recebe o pedido, chama a API e decide o próximo passo pelo campo `status`.

## Nós
1. **Gatilho:** Gmail Trigger (rótulo `pedidos-compra`) ou n8n Form com um campo de texto.
2. **HTTP Request**
   - Método: `POST`
   - URL: `https://api-pedidos-mu.vercel.app/api/v1/processar`
   - Autenticação: *Generic Credential Type → Header Auth*, nome `x-api-key`, valor = segredo da chave `n8n` de `API_KEYS`
   - Cabeçalho extra: `x-id-pedido` = id da mensagem (evita custo dobrado se o n8n reenviar)
   - Corpo (JSON): `{ "texto": "{{ $json.text }}" }` (ajuste para o campo do gatilho)
   - Em *Settings*, ligue **Continue On Fail** para tratar os erros no passo 5
3. **IF** `{{ $json.status }}` igual a `pendente`
   - verdadeiro → **Gmail Send** ao remetente com `{{ $json.email.assunto }}` e `{{ $json.email.corpo }}`
   - falso → **Gmail Send** (ou Slack) avisando Compras que o pedido está completo
4. **Google Sheets Append**: data, status, os 8 campos de `dados`, `custo_usd` e `latencia_modelo_ms`
5. **Erros:** se a resposta tiver `erro.codigo`:
   - `limite_diario` (429) ou `teto_de_gasto` (503): grave a linha com status `bloqueado` e avise o responsável
   - `pedido_sem_item` (422): responda ao remetente pedindo o item e a quantidade
   - `falha_provedor`, `saida_invalida` ou `email_invalido` (502): grave como `revisar` para uma pessoa olhar

Depois de montar, exporte o fluxo (sem credenciais) para `n8n/fluxo_pedidos.json`.

## Versão montada (21/11/2026)
O fluxo está em `n8n/fluxo_pedidos.json` (importe em Workflows → Import from file). Diferenças em relação ao desenho acima:
- **Gatilho:** n8n Form (dois campos: texto do pedido e e-mail do solicitante).
- **Armazenamento:** n8n Data Table `pedidos_processados` (crie uma com o mesmo nome e as colunas do nó de gravação) em vez de Google Sheets.
- **Erros:** o HTTP Request usa `neverError`; qualquer resposta com `erro.codigo` vira uma linha com status `bloqueado`, `pedido_sem_item` ou `revisar`. O e-mail só é enviado quando o status é `pendente`.
- **Ainda não tratado:** e-mail de resposta para `pedido_sem_item` e aviso a Compras quando o pedido está completo.
- **Credenciais (não vão no arquivo):** Header Auth com nome `x-api-key` e o segredo da chave `n8n`; conta Gmail por OAuth.
- **Teste feito em 21/11/2026:** pedido do detergente gerou `pendente`, e-mail citando `valor_unitario` e `fornecedor`, uma linha na tabela e custo de cerca de US$ 0,00027. É um teste isolado, não a medição (ver `docs/medicao.md`).
- **Publicação:** o formulário de produção foi despublicado em 22/11/2026, porque qualquer visitante poderia digitar um e-mail e fazer o fluxo enviar mensagem pela conta do Gmail do autor. O fluxo continua salvo e pode ser republicado para uma demonstração ao vivo.
