// Custo por chamada a partir do preço de tabela. Fonte e data ficam junto do número.
export const PRECOS = Object.freeze({
  modelo: "claude-haiku-5-5",
  moeda: "USD",
  unidade: "por 1.000.000 de tokens",
  ate_100k_tokens_de_prompt: { entrada: 0.1, saida: 0.5 },
  acima_100k_tokens_de_prompt: { entrada: 0.5, saida: 2.5 },
  consultado_em: "2026-11-19",
  fonte: "https://platform.claude.com/docs/en/about-claude/pricing",
  observacao: "Preço base de tabela, sem cache e sem batch. Copiado de config/precos.json do Prompt Lab.",
});

export function custoUsd(tokensEntrada, tokensSaida, precos = PRECOS) {
  const faixa = tokensEntrada > 100_000 ? precos.acima_100k_tokens_de_prompt : precos.ate_100k_tokens_de_prompt;
  return (tokensEntrada * faixa.entrada + tokensSaida * faixa.saida) / 1_000_000;
}

// Reserva conservadora antes da chamada: 1 token a cada 2 caracteres na entrada e o máximo de saída.
export function custoMaximoUsd(system, user, maxTokens, precos = PRECOS) {
  const estimativaEntrada = Math.ceil((system.length + user.length) / 2) + 1;
  return custoUsd(estimativaEntrada, maxTokens, precos);
}

// Contadores guardam micro-dólares inteiros (1 US$ = 1.000.000), arredondando para cima.
export const paraMicro = (usd) => Math.ceil(usd * 1_000_000);
export const deMicro = (micro) => micro / 1_000_000;
