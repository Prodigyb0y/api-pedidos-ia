// Envoltório comum das rotas: autenticação, limite diário, idempotência, log e erros.
import { autenticar } from "./auth.js";
import { lerJson, respostaDeErro, json, ErroApi } from "./http.js";
import { armazenamentoPadrao } from "./armazenamento.js";
import { Controle, configuracao, validarIdPedido } from "./controle.js";
import { VERSOES_PROMPTS } from "./servico.js";

export function controlePadrao() {
  return new Controle(armazenamentoPadrao(), configuracao());
}

// executar(corpo, controle) -> { corpo: objeto de resposta, log: campos extras do log }
export async function rotaComModelo(request, nomeRota, executar, opcoes = {}) {
  const controle = opcoes.controle || controlePadrao();
  const t0 = performance.now();
  let apelido = "anonimo";
  let status = 200;
  let extrasLog = {};
  try {
    apelido = opcoes.apelidoFixo || autenticar(request, opcoes.chaves);
    const idPedido = validarIdPedido(request.headers.get("x-id-pedido"));
    const repetida = await controle.lerIdempotente(apelido, idPedido ? `${nomeRota}:${idPedido}` : null);
    if (repetida) {
      extrasLog = { idempotente: true };
      return json(repetida, 200, { "x-idempotente": "true" });
    }
    const corpo = await lerJson(request);
    await controle.contarChamada(apelido, opcoes.limiteDiario ?? controle.config.limiteDiarioPorChave);
    const { corpo: resposta, log } = await executar(corpo, controle);
    extrasLog = log || {};
    await controle.gravarIdempotente(apelido, idPedido ? `${nomeRota}:${idPedido}` : null, resposta);
    return json(resposta);
  } catch (e) {
    status = e instanceof ErroApi ? e.status : 500;
    extrasLog = { ...extrasLog, erro: e instanceof ErroApi ? e.codigo : "erro_interno" };
    return respostaDeErro(e);
  } finally {
    try {
      await controle.registrar({
        rota: nomeRota,
        chave: apelido,
        status,
        latencia_ms: Math.round(performance.now() - t0),
        versoes_prompts: VERSOES_PROMPTS.map((p) => `${p.id}@${p.versao}:${p.hash12}`),
        ...extrasLog,
      });
    } catch {
      console.error("[api-pedidos] falha ao gravar log");
    }
  }
}

export async function rotaLeitura(request, executar, opcoes = {}) {
  try {
    if (!opcoes.publica) autenticar(request, opcoes.chaves);
    return json(await executar());
  } catch (e) {
    return respostaDeErro(e);
  }
}
