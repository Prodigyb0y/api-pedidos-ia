// Calcula as métricas do plano (docs/medicao.md) a partir de casos.json (gabarito) e resultados_brutos.json.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const dir = new URL(".", import.meta.url);
const lerBytes = (n) => readFileSync(new URL(n, dir));
const gab = JSON.parse(lerBytes("casos.json").toString("utf8"));
const res = JSON.parse(lerBytes("resultados_brutos.json").toString("utf8"));
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const vazio = (x) => x === null || x === undefined || x === "";
const iguaisTexto = (a, b) => (vazio(a) && vazio(b)) || (!vazio(a) && !vazio(b) && norm(a) === norm(b));
const iguaisNum = (a, b) => (vazio(a) && vazio(b)) || (!vazio(a) && !vazio(b) && Math.abs(Number(a) - Number(b)) < 1e-9);
const ROTULOS = { solicitante_area: "area solicitante", prazo_entrega: "prazo de entrega", valor_unitario: "valor unitario", fornecedor: "fornecedor" };
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const CAMPOS = ["solicitante_area", "item", "quantidade", "unidade", "prazo_entrega", "valor_unitario", "moeda", "fornecedor"];

const linhas = [];
let campos_ok = 0, campos_total = 0, status_ok = 0, faltantes_ok = 0, emails_ok = 0, emails_total = 0, completos_sem_email = 0, completos_total = 0;
const tempos = { completo: [], pendente: [] }, custos = [], erros = [];
for (const g of gab.casos) {
  const r = res.casos.find((x) => x.id === g.id);
  const e = g.esperado, d = r.dados;
  const ok = {
    solicitante_area: iguaisTexto(e.solicitante_area, d.solicitante_area),
    item: g.item_palavras_chave.every((p) => norm(d.item).includes(norm(p))),
    quantidade: iguaisNum(e.quantidade, d.quantidade),
    unidade: iguaisTexto(e.unidade, d.unidade),
    prazo_entrega: iguaisTexto(e.prazo_entrega, d.prazo_entrega),
    valor_unitario: iguaisNum(e.valor_unitario, d.valor_unitario),
    moeda: iguaisTexto(e.moeda, d.moeda),
    fornecedor: iguaisTexto(e.fornecedor, d.fornecedor),
  };
  for (const c of CAMPOS) { campos_total++; if (ok[c]) campos_ok++; else erros.push(`${g.id}: campo ${c} esperado=${JSON.stringify(e[c])} obtido=${JSON.stringify(d[c])}`); }
  const st = r.status === g.status_esperado; if (st) status_ok++; else erros.push(`${g.id}: status esperado=${g.status_esperado} obtido=${r.status}`);
  const fa = JSON.stringify([...r.faltantes].sort()) === JSON.stringify([...g.faltantes_esperados].sort()); if (fa) faltantes_ok++; else erros.push(`${g.id}: faltantes esperados=${g.faltantes_esperados} obtidos=${r.faltantes}`);
  let emailOk = null;
  if (g.status_esperado === "pendente") {
    emails_total++;
    const texto = norm(`${r.email?.assunto ?? ""}\n${r.email?.corpo ?? ""}`);
    const citados = Object.keys(ROTULOS).filter((c) => texto.includes(ROTULOS[c]));
    emailOk = !!r.email && JSON.stringify(citados.sort()) === JSON.stringify([...g.faltantes_esperados].sort());
    if (emailOk) emails_ok++; else erros.push(`${g.id}: e-mail cita ${citados} esperado ${g.faltantes_esperados}`);
  } else { completos_total++; if (!r.email) completos_sem_email++; }
  const seg = (Date.parse(r.fim) - Date.parse(r.inicio)) / 1000;
  tempos[g.status_esperado].push(seg); custos.push(r.custo_usd);
  linhas.push({ id: g.id, campos_certos: Object.values(ok).filter(Boolean).length, status_ok: st, faltantes_ok: fa, email_ok: emailOk, tempo_s: +seg.toFixed(3), custo_usd: r.custo_usd });
}
const todos = [...tempos.completo, ...tempos.pendente];
const resumo = {
  data: "2026-11-21", n_casos: gab.casos.length,
  sha256_casos: createHash("sha256").update(lerBytes("casos.json")).digest("hex"),
  campos: { certos: campos_ok, total: campos_total },
  status: { certos: status_ok, total: gab.casos.length },
  faltantes: { certos: faltantes_ok, total: gab.casos.length },
  emails_citam_exatamente_os_faltantes: { certos: emails_ok, total: emails_total },
  completos_sem_email: { certos: completos_sem_email, total: completos_total },
  tempo_execucao_n8n_s: { mediana: +mediana(todos).toFixed(2), media: +media(todos).toFixed(2), max: +Math.max(...todos).toFixed(2), mediana_completos: +mediana(tempos.completo).toFixed(2), mediana_pendentes: +mediana(tempos.pendente).toFixed(2) },
  custo_usd: { total: +custos.reduce((a, b) => a + b, 0).toFixed(6), medio: +media(custos).toFixed(6), mediana: +mediana(custos).toFixed(6), max: Math.max(...custos) },
  divergencias: erros, por_caso: linhas,
};
writeFileSync(new URL("resultados_calculados.json", dir), JSON.stringify(resumo, null, 2) + "\n");
console.log(JSON.stringify({ ...resumo, por_caso: undefined }, null, 2));
