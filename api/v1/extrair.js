import { extrairHandler, metodoNaoPermitido } from "../../lib/handlers.js";

export function POST(request) {
  return extrairHandler(request);
}
export function GET() {
  return metodoNaoPermitido(["POST"]);
}
