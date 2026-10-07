import { routeAgentRequest } from "agents";

export { GuardianAgent } from "./agent/guardian-agent";
export { ReviewWorkflow } from "./workflow/review-workflow";

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
