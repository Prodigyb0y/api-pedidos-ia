// Autenticação por cabeçalho x-api-key.
// API_KEYS = "apelido:segredo,apelido2:segredo2". O apelido vai para o log; o segredo, nunca.
import { createHash, timingSafeEqual } from "node:crypto";
import { ErroApi } from "./http.js";

const TAMANHO_MINIMO = 12;

export function lerChaves(valor = process.env.API_KEYS || "") {
  return valor
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item, i) => {
      const pos = item.indexOf(":");
      const apelido = pos > 0 ? item.slice(0, pos).trim() : `chave${i + 1}`;
      const segredo = pos > 0 ? item.slice(pos + 1).trim() : item;
      return { apelido, segredo };
    })
    .filter((c) => c.segredo.length >= TAMANHO_MINIMO);
}

// Compara resumos SHA-256 (mesmo tamanho) em tempo constante, sem lançar erro com tamanhos diferentes.
function iguais(a, b) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function autenticar(request, chaves = lerChaves()) {
  if (chaves.length === 0) {
    throw new ErroApi(503, "api_nao_configurada", "A API ainda não tem chaves de acesso configuradas (API_KEYS).");
  }
  const enviada = request.headers.get("x-api-key");
  if (!enviada) throw new ErroApi(401, "chave_ausente", "Informe o cabeçalho x-api-key.");
  let encontrada = null;
  for (const c of chaves) {
    if (iguais(enviada, c.segredo) && !encontrada) encontrada = c; // percorre todas, para o tempo não depender da posição
  }
  if (!encontrada) throw new ErroApi(403, "chave_invalida", "A chave informada em x-api-key não é válida.");
  return encontrada.apelido;
}
