import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AgentSelector } from "@/components/chat/agent-selector";
import { SessionSwitcher } from "@/components/chat/session-switcher";
import type { SessionInfo } from "@/types/session";

interface ChatSidebarProps {
  agentId: string;
  onAgentChange: (agentId: string) => void;
  sessions: SessionInfo[];
  sessionsLoading: boolean;
  activeSessionKey: string;
  onSessionSelect: (key: string) => void;
  onNewChat: () => void;
}

export function ChatSidebar({
  agentId,
  onAgentChange,
  sessions,
  sessionsLoading,
  activeSessionKey,
  onSessionSelect,
  onNewChat,
}: ChatSidebarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-72 flex-col border-r">
      <div className="border-b p-3">
        <AgentSelector value={agentId} onChange={onAgentChange} />
      </div>

      <div className="p-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onNewChat}
        >
          <Plus className="h-4 w-4" />
          {t("chat.newChat")}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <SessionSwitcher
          sessions={sessions}
          activeKey={activeSessionKey}
          onSelect={onSessionSelect}
          loading={sessionsLoading}
        />
      </div>
    </div>
  );
}
