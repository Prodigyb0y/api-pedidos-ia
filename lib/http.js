// Respostas HTTP padronizadas. Todo erro sai no formato { erro: { codigo, mensagem } }.

export const VERSAO_API = "1.0.0";

const CABECALHOS_BASE = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function json(corpo, status = 200, extras = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CABECALHOS_BASE, ...extras } });
}

export class ErroApi extends Error {
  constructor(status, codigo, mensagem, extras = {}) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.extras = extras;
  }
}

export function erro(status, codigo, mensagem, extras = {}) {
  return json({ erro: { codigo, mensagem, ...extras } }, status);
}

export function respostaDeErro(e) {
  if (e instanceof ErroApi) return erro(e.status, e.codigo, e.message, e.extras);
  // erro inesperado: não expõe detalhes internos
  console.error("[api-pedidos] erro inesperado:", e && e.name);
  return erro(500, "erro_interno", "Erro inesperado. Tente de novo em instantes.");
}

export const LIMITE_CORPO_BYTES = 8 * 1024;

export async function lerJson(request) {
  const tipo = request.headers.get("content-type") || "";
  if (!tipo.includes("application/json")) {
    throw new ErroApi(415, "tipo_invalido", "Envie o corpo em JSON (cabeçalho content-type: application/json).");
  }
  const texto = await request.text();
  if (new TextEncoder().encode(texto).length > LIMITE_CORPO_BYTES) {
    throw new ErroApi(413, "corpo_grande_demais", `O corpo passa de ${LIMITE_CORPO_BYTES / 1024} KB.`);
  }
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErroApi(400, "json_invalido", "O corpo não é um JSON válido.");
  }
}

export function metodoNaoPermitido(permitidos) {
  return json({ erro: { codigo: "metodo_nao_permitido", mensagem: `Use ${permitidos.join(" ou ")}.` } }, 405, {
    allow: permitidos.join(", "),
  });
}
