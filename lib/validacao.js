// Validação de entrada e da saída do modelo, sem dependências.
import { ErroApi } from "./http.js";

export const CAMPOS = ["solicitante_area", "item", "quantidade", "unidade", "prazo_entrega", "valor_unitario", "moeda", "fornecedor"];
export const UNIDADES = ["un", "kg", "m", "l", "cx"];
export const MOEDAS = ["BRL", "USD", "EUR"];

// Campos que o e-mail do P3 v2 sabe pedir, com o nome exato usado no texto (vocabulário do Prompt Lab).
export const CAMPOS_PENDENCIA = [
  ["solicitante_area", "área solicitante"],
  ["prazo_entrega", "prazo de entrega"],
  ["valor_unitario", "valor unitário"],
  ["fornecedor", "fornecedor"],
];

export const TEXTO_MIN = 10;
export const TEXTO_MAX = 4000;

export function validarTextoPedido(corpo, max = TEXTO_MAX) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new ErroApi(400, "entrada_invalida", 'Envie um objeto JSON com o campo "texto".');
  }
  const extras = Object.keys(corpo).filter((k) => k !== "texto");
  if (extras.length) throw new ErroApi(400, "entrada_invalida", `Campo não permitido: ${extras.join(", ")}.`, { campo: extras[0] });
  if (typeof corpo.texto !== "string") throw new ErroApi(400, "entrada_invalida", 'O campo "texto" deve ser uma string.', { campo: "texto" });
  const texto = corpo.texto.trim();
  if (texto.length < TEXTO_MIN || texto.length > max) {
    throw new ErroApi(400, "entrada_invalida", `O campo "texto" deve ter entre ${TEXTO_MIN} e ${max} caracteres.`, { campo: "texto" });
  }
  return texto;
}

const ehNumero = (x) => typeof x === "number" && Number.isFinite(x);
const textoOuNull = (x) => x === null || (typeof x === "string" && x.trim().length > 0);

function dataValida(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Tira cercas de código (```json ... ```) se o modelo usar, como no Prompt Lab.
export function extrairTextoJson(resposta) {
  const s = String(resposta || "").trim();
  const m = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : s;
}

// Valida os 8 campos. item e quantidade podem vir null quando o texto não é um pedido;
// quem chama decide o que fazer (a API responde 422 nesse caso).
export function validarExtracao(obj) {
  const erros = [];
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, erros: ["não é um objeto JSON"] };
  const chaves = Object.keys(obj);
  const faltando = CAMPOS.filter((c) => !(c in obj));
  const extras = chaves.filter((c) => !CAMPOS.includes(c));
  if (faltando.length) erros.push(`campos ausentes: ${faltando.join(", ")}`);
  if (extras.length) erros.push(`campos não permitidos: ${extras.join(", ")}`);
  if (!textoOuNull(obj.solicitante_area)) erros.push("solicitante_area deve ser texto ou null");
  if (!textoOuNull(obj.item)) erros.push("item deve ser texto ou null");
  if (!(obj.quantidade === null || (ehNumero(obj.quantidade) && obj.quantidade > 0))) erros.push("quantidade deve ser número positivo ou null");
  if (!(obj.unidade === null || UNIDADES.includes(obj.unidade))) erros.push(`unidade deve ser uma de ${UNIDADES.join(", ")}`);
  if (!(obj.prazo_entrega === null || dataValida(obj.prazo_entrega))) erros.push("prazo_entrega deve ser AAAA-MM-DD ou null");
  if (!(obj.valor_unitario === null || (ehNumero(obj.valor_unitario) && obj.valor_unitario >= 0))) erros.push("valor_unitario deve ser número ou null");
  if (!(obj.moeda === null || MOEDAS.includes(obj.moeda))) erros.push(`moeda deve ser ${MOEDAS.join(", ")} ou null`);
  if (!textoOuNull(obj.fornecedor)) erros.push("fornecedor deve ser texto ou null");
  if (erros.length) return { ok: false, erros };
  const dados = Object.fromEntries(CAMPOS.map((c) => [c, typeof obj[c] === "string" ? obj[c].trim() : obj[c]]));
  return { ok: true, dados };
}

export function faltantesDe(dados) {
  return CAMPOS_PENDENCIA.map(([c]) => c).filter((c) => dados[c] === null);
}

export function validarEntradaEmail(corpo) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new ErroApi(400, "entrada_invalida", 'Envie um objeto JSON com o campo "dados" (saída de /api/v1/extrair).');
  }
  const r = validarExtracao(corpo.dados);
  if (!r.ok) throw new ErroApi(400, "entrada_invalida", `"dados" inválido: ${r.erros.join("; ")}.`, { campo: "dados" });
  if (r.dados.item === null || r.dados.quantidade === null) {
    throw new ErroApi(422, "pedido_sem_item", '"dados" precisa trazer item e quantidade.');
  }
  return r.dados;
}
