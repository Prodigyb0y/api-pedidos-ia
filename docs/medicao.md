# Plano de medição

Objetivo: medir a API no fluxo real (n8n → API → planilha → e-mail), não só no laboratório.

1. **Casos:** 20 pedidos novos fictícios (10 completos, 10 com campos faltando), escritos com o gabarito **antes** de rodar. Congelar o arquivo com hash.
2. **Execução:** enviar os 20 pelo fluxo do n8n, com `x-id-pedido` único por caso.
3. **Medidas:**
   - acerto dos 8 campos por caso, contra o gabarito;
   - acerto do `status` (completo ou pendente);
   - e-mails que citam exatamente os campos que faltam;
   - tempo de ponta a ponta: chegada do pedido até o e-mail enviado (log de execução do n8n);
   - custo por pedido (campo `custo_usd` e `/api/v1/uso`).
4. **Comparação manual:** cronometrar 5 vezes o processo à mão (ler o pedido, preencher a planilha, escrever o e-mail).
5. **Relatório:** números com método, data e limitações nesta pasta; README atualizado só com o que foi medido.
