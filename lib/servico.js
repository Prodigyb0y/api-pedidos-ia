// Regras de negócio: extrair, escrever e-mail de pendências e processar (os dois em sequência).
// Toda chamada ao modelo passa pelo teto de gasto e tem a saída conferida em código.
import { ErroApi } from "./http.js";
import { PROMPT_EXTRACAO, PROMPT_EMAIL } from "./prompts.js";
import { chamarModelo, MAX_TOKENS, MODELO } from "./modelo.js";
import { custoUsd, custoMaximoUsd } from "./custo.js";
import { validarExtracao, extrairTextoJson, faltantesDe, CAMPOS_PENDENCIA } from "./validacao.js";

export const SENTINELA = "NENHUM_CAMPO_FALTANTE";

export function normalizar(s) {
  return String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Mesma regra do avaliador do Prompt Lab: um campo é citado se o nome exato aparece no e-mail.
export function camposCitados(email) {
  const t = normalizar(email);
  return CAMPOS_PENDENCIA.filter(([, rotulo]) => t.includes(normalizar(rotulo))).map(([c]) => c);
}

export function separarEmail(texto) {
  const linhas = String(texto).trim().split(/\r?\n/);
  const m = (linhas[0] || "").match(/^Assunto:\s*(.+)$/i);
  if (!m) return null;
  const corpo = linhas.slice(1).join("\n").trim();
  return corpo ? { assunto: m[1].trim(), corpo } : null;
}

const montar = (prompt, entrada) => ({ system: prompt.system, user: prompt.user_template.replace("{texto}", entrada) });

// Chama o modelo dentro do teto: reserva antes, acerta com o custo real depois.
async function chamarComTeto(controle, prompt, entrada, deps) {
  const { system, user } = montar(prompt, entrada);
  const acertar = await controle.reservar(custoMaximoUsd(system, user, MAX_TOKENS));
  let r;
  try {
    r = await (deps.chamarModelo || chamarModelo)({ system, user, maxTokens: MAX_TOKENS });
  } catch (e) {
    await acertar(0);
    throw e;
  }
  const custo = custoUsd(r.tokensEntrada, r.tokensSaida);
  await acertar(custo);
  return { ...r, custo };
}

function somar(acc, r) {
  acc.custo += r.custo;
  acc.latenciaMs += r.latenciaMs;
  acc.tokensEntrada += r.tokensEntrada;
  acc.tokensSaida += r.tokensSaida;
  acc.chamadasModelo += 1;
  return acc;
}

const novoAcc = () => ({ custo: 0, latenciaMs: 0, tokensEntrada: 0, tokensSaida: 0, chamadasModelo: 0 });

export async function extrair(texto, controle, deps = {}, acc = novoAcc()) {
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const r = await chamarComTeto(controle, PROMPT_EXTRACAO, texto, deps);
    somar(acc, r);
    let obj;
    try {
      obj = JSON.parse(extrairTextoJson(r.texto));
    } catch {
      continue;
    }
    const v = validarExtracao(obj);
    if (!v.ok) continue;
    if (v.dados.item === null || v.dados.quantidade === null) {
      throw new ErroApi(422, "pedido_sem_item", "Não encontrei item e quantidade no texto. Confira se é um pedido de compra.");
    }
    return { dados: v.dados, faltantes: faltantesDe(v.dados), acc };
  }
  throw new ErroApi(502, "saida_invalida", "O modelo não devolveu um JSON válido depois de duas tentativas.");
}

export async function emailPendencias(dados, faltantes, controle, deps = {}, acc = novoAcc()) {
  if (faltantes.length === 0) return { email: null, acc };
  const esperado = [...faltantes].sort().join(",");
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const r = await chamarComTeto(controle, PROMPT_EMAIL, JSON.stringify(dados), deps);
    somar(acc, r);
    if (r.texto.trim() === SENTINELA) continue;
    const email = separarEmail(r.texto);
    if (!email) continue;
    const citados = camposCitados(r.texto); // assunto e corpo, como no avaliador do Prompt Lab
    if (citados.sort().join(",") !== esperado) continue;
    return { email: { ...email, campos_citados: citados }, acc };
  }
  throw new ErroApi(502, "email_invalido", "O e-mail gerado não citou exatamente os campos que faltam depois de duas tentativas.");
}

export async function processar(texto, controle, deps = {}) {
  const acc = novoAcc();
  const { dados, faltantes } = await extrair(texto, controle, deps, acc);
  const { email } = await emailPendencias(dados, faltantes, controle, deps, acc);
  return { dados, faltantes, email, status: faltantes.length ? "pendente" : "completo", acc };
}

export function metricas(acc) {
  return {
    modelo: MODELO,
    custo_usd: Number(acc.custo.toFixed(6)),
    latencia_modelo_ms: acc.latenciaMs,
    tokens_entrada: acc.tokensEntrada,
    tokens_saida: acc.tokensSaida,
    chamadas_ao_modelo: acc.chamadasModelo,
  };
}

export const VERSOES_PROMPTS = [
  { id: "extracao", origem: "Prompt Lab P1", versao: PROMPT_EXTRACAO.versao, hash12: PROMPT_EXTRACAO.hash12 },
  { id: "email_pendencias", origem: "Prompt Lab P3", versao: PROMPT_EMAIL.versao, hash12: PROMPT_EMAIL.hash12 },
];
