import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Bot, Star } from "lucide-react";
import { useAgentDetail } from "../hooks/use-agent-detail";
import { AgentGeneralTab } from "./agent-general-tab";
import { AgentConfigTab } from "./agent-config-tab";
import { AgentFilesTab } from "./agent-files-tab";
import { AgentSharesTab } from "./agent-shares-tab";
import { AgentLinksTab } from "./agent-links-tab";
import { AgentSkillsTab } from "./agent-skills-tab";
import { SummoningModal } from "../summoning-modal";
import { DeferredSpinner } from "@/components/shared/loading-skeleton";

interface AgentDetailPageProps {
  agentId: string;
  onBack: () => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function useAgentDisplayName() {
  const { t } = useTranslation();
  return (agent: { display_name?: string; agent_key: string }) => {
    if (agent.display_name) return agent.display_name;
    if (UUID_RE.test(agent.agent_key)) return t("agents.unnamedAgent");
    return agent.agent_key;
  };
}

function agentSubtitle(agent: { display_name?: string; agent_key: string; id: string }) {
  // Don't show agent_key if it equals the id (both are UUID) and there's no display_name
  if (!agent.display_name && agent.agent_key === agent.id) return null;
  // Show agent_key as subtitle (truncate if UUID)
  if (UUID_RE.test(agent.agent_key)) return agent.agent_key.slice(0, 8) + "…";
  return agent.agent_key;
}

export function AgentDetailPage({ agentId, onBack }: AgentDetailPageProps) {
  const { t } = useTranslation();
  const agentDisplayName = useAgentDisplayName();
  const { agent, files, loading, updateAgent, getFile, setFile, regenerateAgent, resummonAgent, refresh } =
    useAgentDetail(agentId);
  const [summoningOpen, setSummoningOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  const handleRegenerate = async (prompt: string) => {
    await regenerateAgent(prompt);
    setSummoningOpen(true);
  };

  const handleResummon = async () => {
    await resummonAgent();
    setSummoningOpen(true);
  };

  // Refresh data after modal closes (not when completed fires)
  const handleSummoningClose = (open: boolean) => {
    setSummoningOpen(open);
    if (!open) refresh();
  };

  if (loading || !agent) {
    return (
      <div className="p-4 sm:p-6">
        <Button variant="ghost" onClick={onBack} className="mb-4 gap-1">
          <ArrowLeft className="h-4 w-4" /> {t("agents.back")}
        </Button>
        <DeferredSpinner />
      </div>
    );
  }

  const title = agentDisplayName(agent);
  const subtitle = agentSubtitle(agent);

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="mt-0.5 shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bot className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-xl font-semibold">{title}</h2>
            {agent.is_default && (
              <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />
            )}
            <Badge variant={agent.status === "active" ? "success" : agent.status === "summon_failed" ? "destructive" : "secondary"}>
              {agent.status === "summon_failed" ? t("agents.summonFailed") : agent.status}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {subtitle && (
              <>
                <span className="font-mono text-xs">{subtitle}</span>
                <span className="text-border">|</span>
              </>
            )}
            <Badge variant="outline" className="text-[11px]">{agent.agent_type}</Badge>
            {agent.provider && (
              <>
                <span className="text-border">|</span>
                <span>{agent.provider} / {agent.model}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl rounded-xl border bg-card p-3 shadow-sm sm:p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden">
            <TabsTrigger value="general">{t("agents.tabGeneral")}</TabsTrigger>
            <TabsTrigger value="config">{t("agents.tabConfig")}</TabsTrigger>
            <TabsTrigger value="files">{t("agents.tabFiles")}</TabsTrigger>
            <TabsTrigger value="shares">{t("agents.tabShares")}</TabsTrigger>
            <TabsTrigger value="links">{t("agents.tabLinks")}</TabsTrigger>
            <TabsTrigger value="skills">{t("agents.tabSkills")}</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <AgentGeneralTab agent={agent} onUpdate={updateAgent} />
          </TabsContent>

          <TabsContent value="config" className="mt-4">
            <AgentConfigTab agent={agent} onUpdate={updateAgent} />
          </TabsContent>

          <TabsContent value="files" className="mt-4">
            <AgentFilesTab
              agent={agent}
              files={files}
              onGetFile={getFile}
              onSetFile={setFile}
              onRegenerate={handleRegenerate}
              onResummon={handleResummon}
            />
          </TabsContent>

          <TabsContent value="shares" className="mt-4">
            <AgentSharesTab agentId={agentId} />
          </TabsContent>

          <TabsContent value="links" className="mt-4">
            <AgentLinksTab agentId={agentId} />
          </TabsContent>

          <TabsContent value="skills" className="mt-4">
            <AgentSkillsTab agentId={agentId} />
          </TabsContent>
        </Tabs>
      </div>

      <SummoningModal
        open={summoningOpen}
        onOpenChange={handleSummoningClose}
        agentId={agentId}
        agentName={title}
        onCompleted={() => {}}
        onResummon={async () => { await resummonAgent(); }}
      />
    </div>
  );
}
