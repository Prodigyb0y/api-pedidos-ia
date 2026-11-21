import { saude, metodoNaoPermitido } from "../../lib/handlers.js";

export function GET() {
  return saude();
}
export function POST() {
  return metodoNaoPermitido(["GET"]);
}
