import { processarHandler, metodoNaoPermitido } from "../../lib/handlers.js";

export function POST(request) {
  return processarHandler(request);
}
export function GET() {
  return metodoNaoPermitido(["POST"]);
}
