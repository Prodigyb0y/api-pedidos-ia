// Limite diário por chave, teto de gasto mensal, idempotência e log sem conteúdo de pedido.
import { ErroApi } from "./http.js";
import { paraMicro, deMicro } from "./custo.js";

const DIA_S = 24 * 60 * 60;

export function configuracao(env = process.env) {
  const num = (v, padrao) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : padrao);
  return {
    tetoGastoUsd: num(env.TETO_GASTO_USD, 0.5),
    limiteDiarioPorChave: num(env.LIMITE_DIARIO_POR_CHAVE, 200),
    limiteDiarioDemo: num(env.LIMITE_DIARIO_DEMO, 30),
  };
}

export const hojeUtc = (agora = new Date()) => agora.toISOString().slice(0, 10);
export const mesUtc = (agora = new Date()) => agora.toISOString().slice(0, 7);

export class Controle {
  constructor(armazenamento, config = configuracao(), relogio = () => new Date()) {
    this.a = armazenamento;
    this.config = config;
    this.relogio = relogio;
  }

  async contarChamada(apelido, limite) {
    const chave = `uso:${apelido}:${hojeUtc(this.relogio())}`;
    const n = await this.a.incrby(chave, 1, 2 * DIA_S);
    if (n > limite) {
      throw new ErroApi(429, "limite_diario", `Limite de ${limite} chamadas por dia atingido para esta chave. Tente amanhã (UTC).`);
    }
    return n;
  }

  // Reserva o custo máximo antes da chamada; devolve uma função para acertar com o custo real.
  async reservar(custoMaximoUsd) {
    const chave = `gasto:${mesUtc(this.relogio())}`;
    const reserva = paraMicro(custoMaximoUsd);
    const total = await this.a.incrby(chave, reserva, 40 * DIA_S);
    if (deMicro(total) > this.config.tetoGastoUsd) {
      await this.a.incrby(chave, -reserva, 40 * DIA_S);
      throw new ErroApi(503, "teto_de_gasto", "O teto de gasto do mês foi atingido. A API volta no próximo mês ou quando o teto for aumentado.");
    }
    let acertado = false;
    return async (custoRealUsd) => {
      if (acertado) return;
      acertado = true;
      await this.a.incrby(chave, paraMicro(custoRealUsd) - reserva, 40 * DIA_S);
    };
  }

  async gastoDoMes() {
    return deMicro(Number((await this.a.get(`gasto:${mesUtc(this.relogio())}`)) || 0));
  }

  async lerIdempotente(apelido, id) {
    if (!id) return null;
    const v = await this.a.get(`idem:${apelido}:${id}`);
    return v ? JSON.parse(v) : null;
  }

  async gravarIdempotente(apelido, id, resposta) {
    if (!id) return;
    await this.a.set(`idem:${apelido}:${id}`, JSON.stringify(resposta), DIA_S);
  }

  // Log sem texto do pedido nem e-mail: só metadados.
  async registrar(linha) {
    const registro = { em: this.relogio().toISOString(), ...linha };
    await this.a.lpush("log", JSON.stringify(registro), 1000);
  }

  async ultimos(n = 1000) {
    return (await this.a.lrange("log", 0, n - 1)).map((s) => JSON.parse(s));
  }
}

export function validarIdPedido(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(valor)) {
    throw new ErroApi(400, "id_pedido_invalido", "x-id-pedido aceita até 100 caracteres: letras, números, ponto, hífen, dois-pontos e sublinhado.");
  }
  return valor;
}

function mediana(v) {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function resumirUso(registros, agora = new Date()) {
  const dia = hojeUtc(agora);
  const mes = mesUtc(agora);
  const resumir = (lista) => {
    const sucesso = lista.filter((r) => r.status === 200);
    const custo = lista.reduce((s, r) => s + (r.custo_usd || 0), 0);
    const processados = sucesso.filter((r) => r.rota === "processar" || r.rota === "demo");
    return {
      chamadas: lista.length,
      sucesso: sucesso.length,
      erros: lista.length - sucesso.length,
      custo_usd: Number(custo.toFixed(6)),
      custo_medio_usd: sucesso.length ? Number((custo / sucesso.length).toFixed(6)) : null,
      latencia_mediana_ms: mediana(sucesso.map((r) => r.latencia_ms).filter((x) => typeof x === "number")),
      pedidos_processados: processados.length,
      pedidos_pendentes: processados.filter((r) => r.resultado === "pendente").length,
    };
  };
  const doMes = registros.filter((r) => (r.em || "").startsWith(mes));
  const porRota = {};
  for (const r of doMes) (porRota[r.rota] ||= []).push(r);
  return {
    hoje: resumir(doMes.filter((r) => (r.em || "").startsWith(dia))),
    mes: resumir(doMes),
    por_rota_no_mes: Object.fromEntries(Object.entries(porRota).map(([k, v]) => [k, resumir(v)])),
  };
}
