// Armazenamento de contadores, log e respostas idempotentes.
// Com Upstash Redis (integração da Vercel) os dados ficam persistentes e valem para todas as instâncias.
// Sem ele, usa memória: funciona para teste, mas cada instância tem a sua contagem (dito em /api/v1/uso).

function credenciaisRedis(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export class ArmazenamentoRedis {
  constructor({ url, token }, fetchFn = fetch) {
    this.url = url;
    this.token = token;
    this.fetch = fetchFn;
    this.tipo = "redis";
  }

  async cmd(...args) {
    const r = await this.fetch(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(args.map(String)),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`redis http ${r.status}`);
    const j = await r.json();
    if (j.error) throw new Error("redis erro");
    return j.result;
  }

  async incrby(chave, n, ttlSeg) {
    const v = Number(await this.cmd("INCRBY", chave, Math.round(n)));
    if (ttlSeg) await this.cmd("EXPIRE", chave, ttlSeg);
    return v;
  }
  async get(chave) {
    return this.cmd("GET", chave);
  }
  async set(chave, valor, ttlSeg) {
    return ttlSeg ? this.cmd("SET", chave, valor, "EX", ttlSeg) : this.cmd("SET", chave, valor);
  }
  async lpush(chave, valor, maximo) {
    await this.cmd("LPUSH", chave, valor);
    await this.cmd("LTRIM", chave, 0, maximo - 1);
  }
  async lrange(chave, ini, fim) {
    return (await this.cmd("LRANGE", chave, ini, fim)) || [];
  }
}

export class ArmazenamentoMemoria {
  constructor(agora = () => Date.now()) {
    this.kv = new Map();
    this.listas = new Map();
    this.agora = agora;
    this.tipo = "memoria";
  }
  _vivo(chave) {
    const e = this.kv.get(chave);
    if (e && e.expira && e.expira <= this.agora()) this.kv.delete(chave);
    return this.kv.get(chave);
  }
  async incrby(chave, n, ttlSeg) {
    const e = this._vivo(chave);
    const valor = Number(e ? e.valor : 0) + Math.round(n);
    this.kv.set(chave, { valor, expira: ttlSeg ? this.agora() + ttlSeg * 1000 : e && e.expira });
    return valor;
  }
  async get(chave) {
    const e = this._vivo(chave);
    return e ? String(e.valor) : null;
  }
  async set(chave, valor, ttlSeg) {
    this.kv.set(chave, { valor, expira: ttlSeg ? this.agora() + ttlSeg * 1000 : null });
    return "OK";
  }
  async lpush(chave, valor, maximo) {
    const l = this.listas.get(chave) || [];
    l.unshift(valor);
    this.listas.set(chave, l.slice(0, maximo));
  }
  async lrange(chave, ini, fim) {
    const l = this.listas.get(chave) || [];
    return l.slice(ini, fim === -1 ? undefined : fim + 1);
  }
}

let padrao = null;
export function armazenamentoPadrao() {
  if (!padrao) {
    const cred = credenciaisRedis();
    padrao = cred ? new ArmazenamentoRedis(cred) : new ArmazenamentoMemoria();
  }
  return padrao;
}
