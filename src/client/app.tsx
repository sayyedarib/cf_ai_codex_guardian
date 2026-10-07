import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import {
  Badge,
  Button,
  InputArea,
  PoweredByCloudflare,
  Switch,
  Text
} from "@cloudflare/kumo";
import {
  BugIcon,
  CircleIcon,
  ListChecksIcon,
  PaperPlaneRightIcon,
  ShieldCheckIcon,
  StopIcon,
  TrashIcon
} from "@phosphor-icons/react";
import type { GuardianAgent } from "../agent/guardian-agent";
import type { CodexState } from "../shared/schemas";
import { CodexContext, type CodexContextValue } from "./codex-context";
import { CodexPanel } from "./components/codex-panel";
import { MessageList } from "./components/message-list";
import { ThemeToggle } from "./components/theme-toggle";

const EMPTY_STATE: CodexState = { rules: [], exceptions: [], reviews: [] };

/** Each team gets its own agent instance: `?codex=my-team`. */
function codexName(): string {
  const name = new URLSearchParams(window.location.search).get("codex");
  return name && /^[\w-]{1,64}$/.test(name) ? name : "default";
}

function Guardian() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const name = useMemo(() => codexName(), []);

  const agent = useAgent<GuardianAgent, CodexState>({
    agent: "GuardianAgent",
    name,
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), [])
  });

  const { messages, sendMessage, clearHistory, stop, status } = useAgentChat({
    agent,
    experimental_throttle: 100
  });
  const isStreaming = status === "streaming" || status === "submitted";

  const codex = useMemo<CodexContextValue>(
    () => ({
      state: agent.state ?? EMPTY_STATE,
      actions: {
        setRuleEnabled: (id, enabled) => agent.stub.updateRule(id, { enabled }),
        removeRule: (id) => agent.stub.removeRule(id),
        removeException: (id) => agent.stub.removeException(id),
        decideComment: (id, approved) => agent.stub.decideComment(id, approved)
      }
    }),
    [agent.state, agent.stub]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming) textareaRef.current?.focus();
  }, [isStreaming]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      sendMessage({ role: "user", parts: [{ type: "text", text: trimmed }] });
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    },
    [isStreaming, sendMessage]
  );

  return (
    <CodexContext.Provider value={codex}>
      <div className="flex flex-col h-dvh bg-kumo-elevated">
        <header className="px-4 py-3 bg-kumo-base border-b border-kumo-line">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheckIcon
                size={22}
                weight="duotone"
                className="text-kumo-brand shrink-0"
              />
              <h1 className="text-lg font-semibold text-kumo-default truncate">
                Codex Guardian
              </h1>
              <Badge variant="secondary">{name}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5">
                <CircleIcon
                  size={8}
                  weight="fill"
                  className={
                    connected ? "text-kumo-success" : "text-kumo-danger"
                  }
                />
                <Text size="xs" variant="secondary">
                  {connected ? "Connected" : "Disconnected"}
                </Text>
              </div>
              <div className="hidden sm:flex items-center gap-1.5">
                <BugIcon size={14} className="text-kumo-inactive" />
                <Switch
                  checked={showDebug}
                  onCheckedChange={setShowDebug}
                  size="sm"
                  aria-label="Toggle debug mode"
                />
              </div>
              <ThemeToggle />
              <Button
                variant="secondary"
                className="lg:hidden"
                icon={<ListChecksIcon size={16} />}
                onClick={() => setShowPanel(!showPanel)}
                aria-label="Toggle codex panel"
              />
              <Button
                variant="secondary"
                icon={<TrashIcon size={16} />}
                onClick={clearHistory}
                aria-label="Clear chat"
              />
            </div>
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          <main className="flex flex-col flex-1 min-w-0">
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
                <MessageList
                  messages={messages}
                  isStreaming={isStreaming}
                  showDebug={showDebug}
                  onPrompt={send}
                />
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="border-t border-kumo-line bg-kumo-base">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="max-w-3xl mx-auto px-4 py-3"
              >
                <div className="flex items-end gap-3 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-sm focus-within:ring-2 focus-within:ring-kumo-ring focus-within:border-transparent transition-shadow">
                  <InputArea
                    ref={textareaRef}
                    value={input}
                    onValueChange={setInput}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send(input);
                      }
                    }}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = `${el.scrollHeight}px`;
                    }}
                    placeholder="Add a rule, allow an exception, or paste a PR link to review…"
                    disabled={!connected || isStreaming}
                    rows={1}
                    className="flex-1 ring-0! focus:ring-0! shadow-none! bg-transparent! outline-none! resize-none max-h-40"
                  />
                  {isStreaming ? (
                    <Button
                      type="button"
                      variant="secondary"
                      shape="square"
                      aria-label="Stop generation"
                      icon={<StopIcon size={18} />}
                      onClick={stop}
                    />
                  ) : (
                    <Button
                      type="submit"
                      variant="primary"
                      shape="square"
                      aria-label="Send message"
                      disabled={!input.trim() || !connected}
                      icon={<PaperPlaneRightIcon size={18} />}
                    />
                  )}
                </div>
              </form>
              <div className="flex justify-center pb-2">
                <PoweredByCloudflare href="https://developers.cloudflare.com/agents/" />
              </div>
            </div>
          </main>

          <aside
            className={`${showPanel ? "block" : "hidden"} lg:block absolute lg:static inset-x-0 top-[57px] bottom-0 z-20 lg:z-auto w-full lg:w-96 shrink-0 overflow-y-auto border-l border-kumo-line bg-kumo-base p-4`}
          >
            <CodexPanel />
          </aside>
        </div>
      </div>
    </CodexContext.Provider>
  );
}

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-dvh text-kumo-inactive">
          Loading…
        </div>
      }
    >
      <Guardian />
    </Suspense>
  );
}
