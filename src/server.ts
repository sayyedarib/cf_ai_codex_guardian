import { routeAgentRequest } from "agents";
import { handleMcp } from "./mcp/server";

export { GuardianAgent } from "./agent/guardian-agent";
export { ReviewWorkflow } from "./workflow/review-workflow";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === "/mcp") {
      return handleMcp(request, env, ctx);
    }
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
