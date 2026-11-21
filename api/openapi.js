import { openapiHandler } from "../lib/handlers.js";

export function GET(request) {
  return openapiHandler(request);
}
