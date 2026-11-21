import { usoHandler, metodoNaoPermitido } from "../../lib/handlers.js";

export function GET(request) {
  return usoHandler(request);
}
export function POST() {
  return metodoNaoPermitido(["GET"]);
}
