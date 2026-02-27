import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  History,
  Zap,
  Clock,
  Activity,
  BarChart3,
  Radio,
  Terminal,
  Settings,
  ShieldCheck,
  Users,
  Link,
  Wrench,
  Package,
  Plug,
  Volume2,
  Cpu,
  ArrowRightLeft,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { SidebarGroup } from "./sidebar-group";
import { SidebarItem } from "./sidebar-item";
import { ConnectionStatus } from "./connection-status";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const { t } = useTranslation();

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Logo / title */}
      <div className="flex h-14 items-center border-b px-4">
        {!collapsed && (
          <span className="text-base font-semibold tracking-tight">
            GoClaw
          </span>
        )}
        {collapsed && (
          <span className="mx-auto text-lg font-bold">OC</span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
        <SidebarGroup label={t("sidebar.core")} collapsed={collapsed}>
          <SidebarItem to={ROUTES.OVERVIEW} icon={LayoutDashboard} label={t("sidebar.overview")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.CHAT} icon={MessageSquare} label={t("sidebar.chat")} collapsed={collapsed} />
        </SidebarGroup>

        <SidebarGroup label={t("sidebar.management")} collapsed={collapsed}>
          <SidebarItem to={ROUTES.AGENTS} icon={Bot} label={t("sidebar.agents")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.TEAMS} icon={Users} label={t("sidebar.agentTeams")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.SESSIONS} icon={History} label={t("sidebar.sessions")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.CHANNELS} icon={Radio} label={t("sidebar.channels")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.SKILLS} icon={Zap} label={t("sidebar.skills")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.CRON} icon={Clock} label={t("sidebar.cron")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.CUSTOM_TOOLS} icon={Wrench} label={t("sidebar.customTools")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.BUILTIN_TOOLS} icon={Package} label={t("sidebar.builtinTools")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.MCP} icon={Plug} label={t("sidebar.mcpServers")} collapsed={collapsed} />
        </SidebarGroup>

        <SidebarGroup label={t("sidebar.monitoring")} collapsed={collapsed}>
          <SidebarItem to={ROUTES.TRACES} icon={Activity} label={t("sidebar.traces")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.DELEGATIONS} icon={ArrowRightLeft} label={t("sidebar.delegations")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.USAGE} icon={BarChart3} label={t("sidebar.usage")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.LOGS} icon={Terminal} label={t("sidebar.logs")} collapsed={collapsed} />
        </SidebarGroup>

        <SidebarGroup label={t("sidebar.system")} collapsed={collapsed}>
          <SidebarItem to={ROUTES.PROVIDERS} icon={Cpu} label={t("sidebar.providers")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.CONFIG} icon={Settings} label={t("sidebar.config")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.APPROVALS} icon={ShieldCheck} label={t("sidebar.approvals")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.NODES} icon={Link} label={t("sidebar.nodes")} collapsed={collapsed} />
          <SidebarItem to={ROUTES.TTS} icon={Volume2} label={t("sidebar.tts")} collapsed={collapsed} />
        </SidebarGroup>
      </nav>

      {/* Footer: connection status */}
      <div className="border-t px-4 py-3">
        <ConnectionStatus />
      </div>
    </aside>
  );
}
