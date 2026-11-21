// Especificação OpenAPI 3.1, escrita a partir das mesmas regras de lib/validacao.js.
import { VERSAO_API } from "./http.js";
import { CAMPOS, UNIDADES, MOEDAS, TEXTO_MIN, TEXTO_MAX, CAMPOS_PENDENCIA } from "./validacao.js";

const Erro = {
  type: "object",
  required: ["erro"],
  properties: { erro: { type: "object", required: ["codigo", "mensagem"], properties: { codigo: { type: "string" }, mensagem: { type: "string" }, campo: { type: "string" } } } },
};

const Dados = {
  type: "object",
  additionalProperties: false,
  required: CAMPOS,
  properties: {
    solicitante_area: { type: ["string", "null"] },
    item: { type: "string" },
    quantidade: { type: "number", exclusiveMinimum: 0 },
    unidade: { type: ["string", "null"], enum: [...UNIDADES, null] },
    prazo_entrega: { type: ["string", "null"], format: "date" },
    valor_unitario: { type: ["number", "null"], minimum: 0 },
    moeda: { type: ["string", "null"], enum: [...MOEDAS, null] },
    fornecedor: { type: ["string", "null"] },
  },
};

const Faltantes = { type: "array", items: { type: "string", enum: CAMPOS_PENDENCIA.map(([c]) => c) } };
const Email = {
  type: ["object", "null"],
  properties: { assunto: { type: "string" }, corpo: { type: "string" }, campos_citados: Faltantes },
};
const Metricas = {
  modelo: { type: "string" },
  custo_usd: { type: "number" },
  latencia_modelo_ms: { type: "integer" },
  tokens_entrada: { type: "integer" },
  tokens_saida: { type: "integer" },
  chamadas_ao_modelo: { type: "integer" },
};

const exemploDados = {
  solicitante_area: "Financeiro",
  item: "papel A4",
  quantidade: 10,
  unidade: "cx",
  prazo_entrega: "2026-12-15",
  valor_unitario: null,
  moeda: null,
  fornecedor: "Papelaria Central",
};
const exemploTexto = { texto: "Preciso de 10 caixas de papel A4 para o Financeiro, entrega até 15/12/2026, fornecedor Papelaria Central." };

const erros = (codigos) =>
  Object.fromEntries(
    codigos.map(([status, descricao]) => [String(status), { description: descricao, content: { "application/json": { schema: { $ref: "#/components/schemas/Erro" } } } }]),
  );

const ERROS_COMUNS = [
  [400, "Entrada inválida (diz qual campo)"],
  [401, "Sem x-api-key"],
  [403, "x-api-key inválida"],
  [413, "Corpo maior que 8 KB"],
  [415, "Corpo não é JSON"],
  [429, "Limite diário da chave atingido"],
  [502, "O modelo não devolveu saída válida depois de duas tentativas"],
  [503, "Teto de gasto do mês atingido ou API sem configuração"],
];

const corpoTexto = {
  required: true,
  content: {
    "application/json": {
      schema: { type: "object", additionalProperties: false, required: ["texto"], properties: { texto: { type: "string", minLength: TEXTO_MIN, maxLength: TEXTO_MAX } } },
      example: exemploTexto,
    },
  },
};

const idPedido = {
  name: "x-id-pedido",
  in: "header",
  required: false,
  description: "Opcional. Se o mesmo id chegar de novo em 24 h, a resposta anterior volta sem chamar o modelo (útil quando o n8n reenvia).",
  schema: { type: "string", pattern: "^[A-Za-z0-9._:-]{1,100}$" },
};

export function especificacao(servidor = "https://api-pedidos.vercel.app") {
  return {
    openapi: "3.1.0",
    info: {
      title: "API de Pedidos · Gutenberg Systems",
      version: VERSAO_API,
      description:
        "Transforma pedidos de compra em texto livre em JSON e escreve o e-mail pedindo só os campos que faltaram. Empresa e dados fictícios. Modelo: claude-haiku-5-5, com os prompts medidos no Prompt Lab.",
    },
    servers: [{ url: servidor }],
    security: [{ chave: [] }],
    components: {
      securitySchemes: { chave: { type: "apiKey", in: "header", name: "x-api-key" } },
      schemas: { Erro, Dados },
    },
    paths: {
      "/api/v1/saude": {
        get: { summary: "Status da API", security: [], responses: { 200: { description: "Funcionando" } } },
      },
      "/api/v1/extrair": {
        post: {
          summary: "Extrai os 8 campos do pedido",
          parameters: [idPedido],
          requestBody: corpoTexto,
          responses: {
            200: {
              description: "Campos extraídos e lista do que falta",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { dados: { $ref: "#/components/schemas/Dados" }, faltantes: Faltantes, ...Metricas } },
                  example: { dados: exemploDados, faltantes: ["valor_unitario"], modelo: "claude-haiku-5-5", custo_usd: 0.00015, latencia_modelo_ms: 1800, tokens_entrada: 700, tokens_saida: 160, chamadas_ao_modelo: 1 },
                },
              },
            },
            422: { description: "O texto não traz item e quantidade" },
            ...erros(ERROS_COMUNS),
          },
        },
      },
      "/api/v1/email-pendencias": {
        post: {
          summary: "Escreve o e-mail pedindo só os campos que faltam",
          parameters: [idPedido],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["dados"], properties: { dados: { $ref: "#/components/schemas/Dados" } } }, example: { dados: exemploDados } } },
          },
          responses: {
            200: {
              description: "E-mail gerado, ou email null quando nada falta (sem chamar o modelo)",
              content: { "application/json": { schema: { type: "object", properties: { faltantes: Faltantes, email: Email, ...Metricas } } } },
            },
            ...erros(ERROS_COMUNS),
          },
        },
      },
      "/api/v1/processar": {
        post: {
          summary: "Extrai e, se faltar algo, já escreve o e-mail (rota para o n8n)",
          parameters: [idPedido],
          requestBody: corpoTexto,
          responses: {
            200: {
              description: "status completo ou pendente",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { status: { type: "string", enum: ["completo", "pendente"] }, dados: { $ref: "#/components/schemas/Dados" }, faltantes: Faltantes, email: Email, ...Metricas },
                  },
                },
              },
            },
            422: { description: "O texto não traz item e quantidade" },
            ...erros(ERROS_COMUNS),
          },
        },
      },
      "/api/v1/uso": {
        get: { summary: "Totais de chamadas, custo e latência (sem conteúdo de pedido)", security: [], responses: { 200: { description: "Resumo do dia e do mês" } } },
      },
    },
  };
}
