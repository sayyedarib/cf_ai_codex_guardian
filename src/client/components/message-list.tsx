import { isToolUIPart, type UIMessage } from "ai";
import { Button, Empty } from "@cloudflare/kumo";
import { ShieldCheckIcon } from "@phosphor-icons/react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { ToolPart } from "./tool-part";

export const SUGGESTED_PROMPTS = [
  "What rules are in our codex?",
  "Add a rule: no TODO comments without a ticket like ABC-123",
  "Allow console.log in scripts/**",
  "Review https://github.com/cloudflare/agents/pull/1"
];

interface MessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
  showDebug: boolean;
  onPrompt: (text: string) => void;
}

export function MessageList({
  messages,
  isStreaming,
  showDebug,
  onPrompt
}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <Empty
        icon={<ShieldCheckIcon size={32} />}
        title="Keep every PR on-codex"
        description="Manage your team's rules by chatting, then ask for a pull request review."
        contents={
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                variant="outline"
                size="sm"
                disabled={isStreaming}
                onClick={() => onPrompt(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </div>
        }
      />
    );
  }

  return (
    <>
      {messages.map((message, index) => {
        const isUser = message.role === "user";
        const isLastAssistant = !isUser && index === messages.length - 1;
        return (
          <div key={message.id} className="space-y-2">
            {showDebug && (
              <pre className="text-[11px] text-kumo-subtle bg-kumo-control rounded-lg p-3 overflow-auto max-h-64">
                {JSON.stringify(message, null, 2)}
              </pre>
            )}
            {message.parts.map((part, i) => {
              const key = `${message.id}-${i}`;
              if (isToolUIPart(part)) {
                return <ToolPart key={key} part={part} showDebug={showDebug} />;
              }
              if (part.type !== "text" || !part.text) return null;
              if (isUser) {
                return (
                  <div key={key} className="flex justify-end">
                    <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-kumo-contrast text-kumo-inverse leading-relaxed whitespace-pre-wrap break-words">
                      {part.text}
                    </div>
                  </div>
                );
              }
              return (
                <div key={key} className="flex justify-start">
                  <div className="max-w-[85%] min-w-0 rounded-2xl rounded-bl-md bg-kumo-base text-kumo-default leading-relaxed">
                    <Streamdown
                      className="sd-theme rounded-2xl rounded-bl-md p-3"
                      plugins={{ code }}
                      controls={false}
                      isAnimating={isLastAssistant && isStreaming}
                    >
                      {part.text}
                    </Streamdown>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
