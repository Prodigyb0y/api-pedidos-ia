// Chamada ao claude-haiku-5-5 pela API HTTP da Anthropic (sem SDK, para não ter dependências).
// Mesmos parâmetros do Prompt Lab: effort "low" e sem temperature (o modelo não aceita).
import { ErroApi } from "./http.js";

export const MODELO = "claude-haiku-5-5";
export const ESFORCO = "low";
export const MAX_TOKENS = 2000; // mesma folga usada nas medições do Prompt Lab
const URL_API = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 25_000;
const TRANSITORIOS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function chamarModelo({ system, user, maxTokens = MAX_TOKENS }, { fetchFn = fetch, chave = process.env.ANTHROPIC_API_KEY, dormir = esperar } = {}) {
  if (!chave) throw new ErroApi(503, "provedor_nao_configurado", "A API ainda não tem a chave do provedor de IA configurada.");
  const corpo = {
    model: MODELO,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort: ESFORCO },
  };
  let ultimoStatus = null;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const t0 = performance.now();
    let r;
    try {
      r = await fetchFn(URL_API, {
        method: "POST",
        headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      ultimoStatus = "rede";
      if (tentativa < 2) { await dormir(1500); continue; }
      break;
    }
    if (r.ok) {
      const j = await r.json();
      const texto = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      return {
        texto,
        tokensEntrada: j.usage?.input_tokens ?? 0,
        tokensSaida: j.usage?.output_tokens ?? 0,
        latenciaMs: Math.round(performance.now() - t0),
        tentativas: tentativa,
      };
    }
    ultimoStatus = r.status;
    if (TRANSITORIOS.has(r.status) && tentativa < 2) { await dormir(1500); continue; }
    break;
  }
  console.error("[api-pedidos] falha no provedor de IA:", ultimoStatus);
  throw new ErroApi(502, "falha_provedor", "O provedor de IA não respondeu como esperado. Tente de novo em instantes.");
}
