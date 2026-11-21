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
