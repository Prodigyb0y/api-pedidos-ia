import { emailHandler, metodoNaoPermitido } from "../../lib/handlers.js";

export function POST(request) {
  return emailHandler(request);
}
export function GET() {
  return metodoNaoPermitido(["POST"]);
}
