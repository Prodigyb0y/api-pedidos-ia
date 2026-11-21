import { demoHandler, metodoNaoPermitido } from "../lib/handlers.js";

export function POST(request) {
  return demoHandler(request);
}
export function GET() {
  return metodoNaoPermitido(["POST"]);
}
