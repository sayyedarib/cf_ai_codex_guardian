/**
 * Workers AI adapter: the only place that knows how to call the model for
 * rule evaluation. Review logic depends on the provider-agnostic CompleteFn.
 */
import { LLM_FINDINGS_JSON_SCHEMA } from "../review/llm-rules";
import type { CompleteFn } from "../review/types";

export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export function createRuleEvaluator(ai: Ai): CompleteFn {
  return async (messages) => {
    const result = await ai.run(MODEL, {
      messages,
      temperature: 0,
      max_tokens: 1500,
      response_format: {
        type: "json_schema",
        json_schema: LLM_FINDINGS_JSON_SCHEMA
      }
    });
    // In JSON mode Workers AI may hand back an object instead of a string.
    const response = (result as { response?: unknown }).response;
    return typeof response === "string"
      ? response
      : JSON.stringify(response ?? {});
  };
}
