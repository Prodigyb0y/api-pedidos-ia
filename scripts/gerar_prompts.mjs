// Gera lib/prompts.js a partir dos arquivos de prompt copiados do Prompt Lab (prompts/*.json).
// Rode depois de trocar um prompt: node scripts/gerar_prompts.mjs
import { readFileSync, writeFileSync } from "node:fs";

const arquivos = { EXTRACAO: "prompts/P1_system_prompt_v2.json", EMAIL: "prompts/P3_encadeado_v2.json" };
let saida = "// Arquivo gerado por scripts/gerar_prompts.mjs. Não edite à mão.\n// Origem: repositório Prodigyb0y/prompt-lab (prompts medidos lá).\n\n";
for (const [nome, caminho] of Object.entries(arquivos)) {
  const p = JSON.parse(readFileSync(caminho, "utf8"));
  const obj = { id: p.id, nome: p.nome, versao: p.versao, hash12: p.hash12, system: p.system, user_template: p.user_template, origem: "prompt-lab/" + caminho };
  saida += `export const PROMPT_${nome} = Object.freeze(${JSON.stringify(obj, null, 2)});\n\n`;
}
writeFileSync("lib/prompts.js", saida);
console.log("lib/prompts.js gerado");
