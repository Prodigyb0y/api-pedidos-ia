// Lógica de cada rota, separada dos arquivos em api/ para poder ser testada sem a Vercel.
import { rotaComModelo, rotaLeitura, controlePadrao } from "./rota.js";
import { json, metodoNaoPermitido, VERSAO_API } from "./http.js";
import { validarTextoPedido, validarEntradaEmail, faltantesDe } from "./validacao.js";
import { extrair, emailPendencias, processar, metricas, VERSOES_PROMPTS } from "./servico.js";
import { MODELO } from "./modelo.js";
import { resumirUso } from "./controle.js";
import { PRECOS } from "./custo.js";
import { armazenamentoPadrao } from "./armazenamento.js";
import { especificacao } from "./openapi.js";

const DEMO_TEXTO_MAX = 1000;

export function saude() {
  return json({ status: "ok", versao: VERSAO_API, modelo: MODELO, prompts: VERSOES_PROMPTS, armazenamento: armazenamentoPadrao().tipo });
}

export function extrairHandler(request, opcoes = {}) {
  return rotaComModelo(request, "extrair", async (corpo, controle) => {
    const texto = validarTextoPedido(corpo);
    const { dados, faltantes, acc } = await extrair(texto, controle, opcoes.deps);
    const m = metricas(acc);
    return { corpo: { dados, faltantes, ...m }, log: { custo_usd: m.custo_usd, resultado: faltantes.length ? "pendente" : "completo" } };
  }, opcoes);
}

export function emailHandler(request, opcoes = {}) {
  return rotaComModelo(request, "email-pendencias", async (corpo, controle) => {
    const dados = validarEntradaEmail(corpo);
    const faltantes = faltantesDe(dados);
    const { email, acc } = await emailPendencias(dados, faltantes, controle, opcoes.deps);
    const m = metricas(acc);
    return { corpo: { faltantes, email, ...m }, log: { custo_usd: m.custo_usd } };
  }, opcoes);
}

export function processarHandler(request, opcoes = {}, nome = "processar", maxTexto) {
  return rotaComModelo(request, nome, async (corpo, controle) => {
    const texto = validarTextoPedido(corpo, maxTexto);
    const r = await processar(texto, controle, opcoes.deps);
    const m = metricas(r.acc);
    return {
      corpo: { status: r.status, dados: r.dados, faltantes: r.faltantes, email: r.email, ...m },
      log: { custo_usd: m.custo_usd, resultado: r.status },
    };
  }, opcoes);
}

// Rota pública da página de demonstração: sem chave, com limite diário global próprio e texto menor.
export function demoHandler(request, opcoes = {}) {
  const controle = opcoes.controle || controlePadrao();
  return processarHandler(request, { ...opcoes, controle, apelidoFixo: "demo-site", limiteDiario: controle.config.limiteDiarioDemo }, "demo", DEMO_TEXTO_MAX);
}

export function usoHandler(request, opcoes = {}) {
  return rotaLeitura(request, async () => {
    const controle = opcoes.controle || controlePadrao();
    const registros = await controle.ultimos(1000);
    return {
      armazenamento: controle.a.tipo,
      aviso: controle.a.tipo === "memoria" ? "Sem banco configurado: os números valem só para a instância que respondeu." : null,
      gasto_do_mes_usd: Number((await controle.gastoDoMes()).toFixed(6)),
      teto_do_mes_usd: controle.config.tetoGastoUsd,
      base: `últimas ${registros.length} chamadas registradas (máximo 1000)`,
      ...resumirUso(registros),
      precos: { modelo: PRECOS.modelo, consultado_em: PRECOS.consultado_em, fonte: PRECOS.fonte },
    };
  }, { ...opcoes, publica: true });
}

export function openapiHandler(request) {
  const url = new URL(request.url);
  return json(especificacao(`${url.protocol}//${url.host}`), 200, { "access-control-allow-origin": "*" });
}

export { metodoNaoPermitido };
