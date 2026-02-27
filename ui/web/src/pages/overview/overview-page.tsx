import { useEffect, useState, useCallback } from "react";
import { Activity, Bot, History, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWsCall } from "@/hooks/use-ws-call";
import { useWsEvent } from "@/hooks/use-ws-event";
import { Methods, Events } from "@/api/protocol";

interface HealthPayload {
  status?: string;
  uptime?: number;
}

interface AgentInfo {
  id: string;
  model: string;
  isRunning: boolean;
}

interface StatusPayload {
  agents?: AgentInfo[];
  sessions?: number;
  clients?: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-muted p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

export function OverviewPage() {
  const { t } = useTranslation();
  const connected = useAuthStore((s) => s.connected);
  const { call: fetchHealth, data: health } = useWsCall<HealthPayload>(Methods.HEALTH);
  const { call: fetchStatus, data: status } = useWsCall<StatusPayload>(Methods.STATUS);
  const [, setLastUpdate] = useState(0);

  useEffect(() => {
    if (connected) {
      fetchHealth();
      fetchStatus();
    }
  }, [connected, fetchHealth, fetchStatus]);

  const handleHealth = useCallback(() => {
    setLastUpdate(Date.now());
    fetchHealth();
  }, [fetchHealth]);

  useWsEvent(Events.HEALTH, handleHealth);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={t("overview.title")}
        description={t("overview.description")}
        actions={
          <StatusBadge
            status={connected ? "success" : "error"}
            label={connected ? t("common.connected") : t("common.disconnected")}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Activity}
          label={t("overview.status")}
          value={health?.status ?? t("common.unknown")}
        />
        <StatCard
          icon={Bot}
          label={t("overview.agents")}
          value={status?.agents?.length ?? 0}
        />
        <StatCard
          icon={History}
          label={t("overview.sessions")}
          value={status?.sessions ?? 0}
        />
        <StatCard
          icon={Zap}
          label={t("overview.connectedClients")}
          value={status?.clients ?? 0}
        />
      </div>
    </div>
  );
}
