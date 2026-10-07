import { createContext, useContext } from "react";
import type { CodexState } from "../shared/schemas";

/** Actions the UI can take directly (without going through chat). */
export interface CodexActions {
  setRuleEnabled(ruleId: string, enabled: boolean): Promise<unknown>;
  removeRule(ruleId: string): Promise<unknown>;
  removeException(exceptionId: string): Promise<unknown>;
  decideComment(reviewId: string, approved: boolean): Promise<unknown>;
}

export interface CodexContextValue {
  state: CodexState;
  actions: CodexActions;
}

export const CodexContext = createContext<CodexContextValue | null>(null);

export function useCodex(): CodexContextValue {
  const value = useContext(CodexContext);
  if (!value) throw new Error("useCodex must be used inside CodexContext");
  return value;
}
