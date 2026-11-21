// Testes sem chamar a API da Anthropic: o modelo é substituído por respostas gravadas à mão.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { PROMPT_EXTRACAO, PROMPT_EMAIL } from "../lib/prompts.js";
import { autenticar, lerChaves } from "../lib/auth.js";
import { validarExtracao, faltantesDe, validarTextoPedido, extrairTextoJson } from "../lib/validacao.js";
import { custoUsd, custoMaximoUsd } from "../lib/custo.js";
import { ArmazenamentoMemoria, ArmazenamentoRedis } from "../lib/armazenamento.js";
import { Controle, resumirUso } from "../lib/controle.js";
import { camposCitados, separarEmail } from "../lib/servico.js";
import { chamarModelo } from "../lib/modelo.js";
import { extrairHandler, emailHandler, processarHandler, demoHandler, usoHandler, openapiHandler, saude } from "../lib/handlers.js";
import { ErroApi } from "../lib/http.js";

const CHAVES = lerChaves("n8n:segredo-n8n-123456,demo:segredo-demo-123456");
const COMPLETO = { solicitante_area: "Financeiro", item: "papel A4", quantidade: 10, unidade: "cx", prazo_entrega: "2026-12-15", valor_unitario: 12.5, moeda: "BRL", fornecedor: "Papelaria Central" };
const INCOMPLETO = { ...COMPLETO, valor_unitario: null, moeda: null, fornecedor: null };
const EMAIL_OK = "Assunto: Informações para concluir seu pedido\n\nOlá! Recebemos seu pedido de 10 cx de papel A4. Para seguir, precisamos de:\n- valor unitário\n- fornecedor\nObrigado!\nEquipe de Compras · Gutenberg Systems";

function req(rota, corpo, { chave = "segredo-n8n-123456", id, metodo = "POST", tipo = "application/json" } = {}) {
  const headers = { "content-type": tipo };
  if (chave) headers["x-api-key"] = chave;
  if (id) headers["x-id-pedido"] = id;
  return new Request(`https://teste.local${rota}`, { method: metodo, headers, body: metodo === "GET" ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo) });
}

function modeloFalso(respostas) {
  const fila = [...respostas];
  const chamadas = [];
  const fn = async ({ system, user }) => {
    chamadas.push({ system, user });
    const texto = fila.shift();
    if (texto instanceof Error) throw texto;
    return { texto, tokensEntrada: 700, tokensSaida: 150, latenciaMs: 1200, tentativas: 1 };
  };
  fn.chamadas = chamadas;
  return fn;
}

function ambiente(respostas, config = {}) {
  const controle = new Controle(new ArmazenamentoMemoria(), { tetoGastoUsd: 0.5, limiteDiarioPorChave: 200, limiteDiarioDemo: 30, ...config });
  const modelo = modeloFalso(respostas);
  return { controle, modelo, opcoes: { controle, chaves: CHAVES, deps: { chamarModelo: modelo } } };
}

// ---------- prompts ----------
test("prompts têm o mesmo hash do Prompt Lab", () => {
  for (const p of [PROMPT_EXTRACAO, PROMPT_EMAIL]) {
    const h = createHash("sha256").update(`${p.system}\n---\n${p.user_template}`).digest("hex").slice(0, 12);
    assert.equal(h, p.hash12);
  }
  assert.equal(PROMPT_EXTRACAO.hash12, "2c3ccc1873da");
  assert.equal(PROMPT_EMAIL.hash12, "01f069156bb0");
});

// ---------- autenticação ----------
test("autenticação: sem chave 401, chave errada 403, chave certa devolve o apelido", () => {
  const r = (h) => new Request("https://t.local/", { headers: h });
  assert.throws(() => autenticar(r({}), CHAVES), (e) => e.status === 401);
  assert.throws(() => autenticar(r({ "x-api-key": "errada" }), CHAVES), (e) => e.status === 403);
  assert.equal(autenticar(r({ "x-api-key": "segredo-demo-123456" }), CHAVES), "demo");
  assert.throws(() => autenticar(r({ "x-api-key": "x" }), []), (e) => e.status === 503);
});

test("chaves curtas demais são ignoradas", () => {
  assert.equal(lerChaves("a:curta,b:segredo-longo-123").length, 1);
});

// ---------- validação ----------
test("validação aceita a extração correta e lista os faltantes", () => {
  const v = validarExtracao(INCOMPLETO);
  assert.ok(v.ok);
  assert.deepEqual(faltantesDe(v.dados), ["valor_unitario", "fornecedor"]);
  assert.deepEqual(faltantesDe(COMPLETO), []);
});

test("validação recusa campos extras, unidade fora da lista e data impossível", () => {
  assert.equal(validarExtracao({ ...COMPLETO, extra: 1 }).ok, false);
  assert.equal(validarExtracao({ ...COMPLETO, unidade: "pacote" }).ok, false);
  assert.equal(validarExtracao({ ...COMPLETO, prazo_entrega: "2026-02-30" }).ok, false);
  assert.equal(validarExtracao({ ...COMPLETO, quantidade: "10" }).ok, false);
});

test("texto do pedido: tamanho e campos", () => {
  assert.throws(() => validarTextoPedido({ texto: "curto" }), (e) => e.status === 400);
  assert.throws(() => validarTextoPedido({ texto: "um texto válido aqui", outro: 1 }), (e) => e.status === 400);
  assert.equal(validarTextoPedido({ texto: "  pedido de papel A4  " }), "pedido de papel A4");
});

test("tira cercas de código do JSON", () => {
  assert.equal(extrairTextoJson('```json\n{"a":1}\n```'), '{"a":1}');
});

// ---------- custo ----------
test("custo segue a tabela por 1M de tokens", () => {
  assert.ok(Math.abs(custoUsd(100_000, 0) - 0.01) < 1e-12); // até 100 mil tokens: US$ 0,10 por 1M de entrada
  assert.equal(custoUsd(0, 1_000_000), 0.5); // saída: US$ 0,50 por 1M
  assert.ok(Math.abs(custoUsd(200_000, 0) - 0.1) < 1e-12); // acima de 100 mil: US$ 0,50 por 1M
  assert.ok(custoMaximoUsd("a".repeat(2000), "b".repeat(200), 2000) > custoUsd(1100, 2000) - 1e-9);
});

// ---------- e-mail ----------
test("campos citados usam o nome exato, sem acento e sem maiúscula", () => {
  assert.deepEqual(camposCitados(EMAIL_OK).sort(), ["fornecedor", "valor_unitario"]);
  assert.deepEqual(camposCitados("Precisamos do PRAZO DE ENTREGA").sort(), ["prazo_entrega"]);
  assert.deepEqual(separarEmail(EMAIL_OK).assunto, "Informações para concluir seu pedido");
  assert.equal(separarEmail("sem assunto"), null);
});

// ---------- rotas ----------
test("extrair: devolve dados, faltantes e métricas", async () => {
  const { opcoes } = ambiente([JSON.stringify(INCOMPLETO)]);
  const r = await extrairHandler(req("/api/v1/extrair", { texto: "Preciso de 10 cx de papel A4 para o Financeiro" }), opcoes);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual(j.faltantes, ["valor_unitario", "fornecedor"]);
  assert.equal(j.chamadas_ao_modelo, 1);
  assert.ok(j.custo_usd > 0);
});

test("extrair: saída inválida tenta de novo uma vez e depois 502", async () => {
  const { opcoes, modelo } = ambiente(["isso não é json", '{"item":"x"}']);
  const r = await extrairHandler(req("/api/v1/extrair", { texto: "Preciso de 10 cx de papel A4" }), opcoes);
  assert.equal(r.status, 502);
  assert.equal(modelo.chamadas.length, 2);
  assert.equal((await r.json()).erro.codigo, "saida_invalida");
});

test("extrair: texto que não é pedido vira 422", async () => {
  const { opcoes } = ambiente([JSON.stringify({ ...INCOMPLETO, item: null, quantidade: null })]);
  const r = await extrairHandler(req("/api/v1/extrair", { texto: "Bom dia, tudo bem com vocês?" }), opcoes);
  assert.equal(r.status, 422);
});

test("rotas exigem chave e JSON", async () => {
  const { opcoes } = ambiente([]);
  assert.equal((await extrairHandler(req("/api/v1/extrair", { texto: "papel A4 dez caixas" }, { chave: null }), opcoes)).status, 401);
  assert.equal((await extrairHandler(req("/api/v1/extrair", "texto=oi", { tipo: "text/plain" }), opcoes)).status, 415);
  assert.equal((await extrairHandler(req("/api/v1/extrair", "{quebrado"), opcoes)).status, 400);
});

test("processar: pedido incompleto vira pendente com e-mail citando só o que falta", async () => {
  const { opcoes, modelo } = ambiente([JSON.stringify(INCOMPLETO), EMAIL_OK]);
  const r = await processarHandler(req("/api/v1/processar", { texto: "Preciso de 10 cx de papel A4 para o Financeiro" }), opcoes);
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.status, "pendente");
  assert.deepEqual(j.email.campos_citados.sort(), ["fornecedor", "valor_unitario"]);
  assert.equal(modelo.chamadas.length, 2);
  assert.ok(modelo.chamadas[1].user.includes('"fornecedor":null'));
});

test("processar: pedido completo não chama o modelo de e-mail", async () => {
  const { opcoes, modelo } = ambiente([JSON.stringify(COMPLETO)]);
  const j = await (await processarHandler(req("/api/v1/processar", { texto: "Pedido completo de papel A4" }), opcoes)).json();
  assert.equal(j.status, "completo");
  assert.equal(j.email, null);
  assert.equal(modelo.chamadas.length, 1);
});

test("e-mail que cita campo a mais é refeito; se insistir, 502", async () => {
  const errado = EMAIL_OK.replace("- fornecedor", "- fornecedor\n- prazo de entrega");
  const { opcoes } = ambiente([errado, errado]);
  const r = await emailHandler(req("/api/v1/email-pendencias", { dados: INCOMPLETO }), opcoes);
  assert.equal(r.status, 502);
  const { opcoes: o2 } = ambiente([errado, EMAIL_OK]);
  assert.equal((await emailHandler(req("/api/v1/email-pendencias", { dados: INCOMPLETO }), o2)).status, 200);
});

test("idempotência: mesmo x-id-pedido não chama o modelo de novo", async () => {
  const { opcoes, modelo } = ambiente([JSON.stringify(COMPLETO)]);
  const r1 = await processarHandler(req("/api/v1/processar", { texto: "Pedido completo de papel A4" }, { id: "msg-1" }), opcoes);
  const r2 = await processarHandler(req("/api/v1/processar", { texto: "Pedido completo de papel A4" }, { id: "msg-1" }), opcoes);
  assert.equal(r2.headers.get("x-idempotente"), "true");
  assert.deepEqual(await r1.json(), await r2.json());
  assert.equal(modelo.chamadas.length, 1);
});

test("limite diário por chave devolve 429", async () => {
  const { opcoes } = ambiente([JSON.stringify(COMPLETO), JSON.stringify(COMPLETO)], { limiteDiarioPorChave: 1 });
  assert.equal((await extrairHandler(req("/api/v1/extrair", { texto: "Pedido completo de papel A4" }), opcoes)).status, 200);
  assert.equal((await extrairHandler(req("/api/v1/extrair", { texto: "Pedido completo de papel A4" }), opcoes)).status, 429);
});

test("teto de gasto bloqueia antes de chamar o modelo", async () => {
  const { opcoes, modelo } = ambiente([JSON.stringify(COMPLETO)], { tetoGastoUsd: 0.000001 });
  const r = await extrairHandler(req("/api/v1/extrair", { texto: "Pedido completo de papel A4" }), opcoes);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).erro.codigo, "teto_de_gasto");
  assert.equal(modelo.chamadas.length, 0);
});

test("reserva é devolvida e o gasto fica igual ao custo real", async () => {
  const { opcoes, controle } = ambiente([JSON.stringify(COMPLETO)]);
  const j = await (await extrairHandler(req("/api/v1/extrair", { texto: "Pedido completo de papel A4" }), opcoes)).json();
  const gasto = await controle.gastoDoMes();
  assert.ok(Math.abs(gasto - j.custo_usd) < 2e-6, `${gasto} vs ${j.custo_usd}`);
});

test("log não guarda o texto do pedido nem o e-mail", async () => {
  const { opcoes, controle } = ambiente([JSON.stringify(INCOMPLETO), EMAIL_OK]);
  await processarHandler(req("/api/v1/processar", { texto: "SEGREDO-DO-PEDIDO papel A4 dez caixas" }), opcoes);
  const log = JSON.stringify(await controle.ultimos());
  assert.ok(!log.includes("SEGREDO-DO-PEDIDO"));
  assert.ok(!log.includes("Equipe de Compras"));
  assert.ok(log.includes('"rota":"processar"'));
});

test("demo funciona sem chave e tem limite próprio", async () => {
  const { opcoes } = ambiente([JSON.stringify(COMPLETO)], { limiteDiarioDemo: 1 });
  assert.equal((await demoHandler(req("/api/demo", { texto: "Pedido completo de papel A4" }, { chave: null }), opcoes)).status, 200);
  assert.equal((await demoHandler(req("/api/demo", { texto: "Pedido completo de papel A4" }, { chave: null }), opcoes)).status, 429);
  const longo = { texto: "x".repeat(1500) };
  assert.equal((await demoHandler(req("/api/demo", longo, { chave: null }), ambiente([]).opcoes)).status, 400);
});

test("uso resume chamadas, custo e latência", async () => {
  const { opcoes } = ambiente([JSON.stringify(COMPLETO)]);
  await processarHandler(req("/api/v1/processar", { texto: "Pedido completo de papel A4" }), opcoes);
  const j = await (await usoHandler(req("/api/v1/uso", null, { metodo: "GET", chave: null }), opcoes)).json();
  assert.equal(j.mes.chamadas, 1);
  assert.equal(j.mes.pedidos_processados, 1);
  assert.ok(j.mes.custo_usd > 0);
  assert.equal(j.armazenamento, "memoria");
});

test("resumo de uso calcula mediana", () => {
  const agora = new Date("2026-11-21T12:00:00Z");
  const regs = [10, 30, 20].map((l) => ({ em: "2026-11-21T10:00:00Z", rota: "extrair", status: 200, latencia_ms: l, custo_usd: 0.001 }));
  assert.equal(resumirUso(regs, agora).hoje.latencia_mediana_ms, 20);
});

test("saude e openapi respondem", async () => {
  assert.equal((await saude().json()).prompts.length, 2);
  const spec = await openapiHandler(new Request("https://exemplo.vercel.app/api/openapi.json")).json();
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(spec.servers[0].url, "https://exemplo.vercel.app");
  assert.ok(spec.paths["/api/v1/processar"]);
});

// ---------- cliente do modelo ----------
test("cliente do modelo: monta o corpo como no Prompt Lab e lê o texto", async () => {
  let enviado;
  const fetchFn = async (url, init) => {
    enviado = JSON.parse(init.body);
    return new Response(JSON.stringify({ content: [{ type: "thinking", thinking: "..." }, { type: "text", text: "oi" }], usage: { input_tokens: 5, output_tokens: 2 } }), { status: 200 });
  };
  const r = await chamarModelo({ system: "s", user: "u" }, { fetchFn, chave: "k" });
  assert.equal(r.texto, "oi");
  assert.equal(enviado.model, "claude-haiku-5-5");
  assert.deepEqual(enviado.output_config, { effort: "low" });
  assert.equal("temperature" in enviado, false);
});

test("cliente do modelo: erro transitório tenta de novo; erro definitivo vira 502", async () => {
  let n = 0;
  const transit = async () => (++n === 1 ? new Response("x", { status: 529 }) : new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }], usage: {} }), { status: 200 }));
  assert.equal((await chamarModelo({ system: "s", user: "u" }, { fetchFn: transit, chave: "k", dormir: async () => {} })).texto, "ok");
  const definitivo = async () => new Response("x", { status: 400 });
  await assert.rejects(chamarModelo({ system: "s", user: "u" }, { fetchFn: definitivo, chave: "k" }), (e) => e instanceof ErroApi && e.status === 502);
  await assert.rejects(chamarModelo({ system: "s", user: "u" }, { fetchFn: definitivo, chave: "" }), (e) => e.status === 503);
});

test("Redis: envia comandos no formato REST do Upstash", async () => {
  const enviados = [];
  const fetchFn = async (url, init) => {
    enviados.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ result: 3 }), { status: 200 });
  };
  const r = new ArmazenamentoRedis({ url: "https://x.upstash.io", token: "t" }, fetchFn);
  assert.equal(await r.incrby("uso:a:2026-11-21", 1, 60), 3);
  assert.deepEqual(enviados[0], ["INCRBY", "uso:a:2026-11-21", "1"]);
  assert.deepEqual(enviados[1], ["EXPIRE", "uso:a:2026-11-21", "60"]);
});
