import { useState, useEffect } from "react";
import { Radio, Plus, RefreshCw, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { SearchInput } from "@/components/shared/search-input";
import { Pagination } from "@/components/shared/pagination";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useChannels } from "./hooks/use-channels";
import { useChannelInstances, type ChannelInstanceData, type ChannelInstanceInput } from "./hooks/use-channel-instances";
import { ChannelInstanceFormDialog } from "./channel-instance-form-dialog";
import { ChannelsStatusView, channelTypeLabels } from "./channels-status-view";
import { useAgents } from "@/pages/agents/hooks/use-agents";
import { useMinLoading } from "@/hooks/use-min-loading";
import { useDeferredLoading } from "@/hooks/use-deferred-loading";
import { usePagination } from "@/hooks/use-pagination";

export function ChannelsPage() {
  const { t } = useTranslation();
  const { channels, loading: statusLoading, refresh: refreshStatus } = useChannels();
  const {
    instances, loading: instancesLoading, supported,
    refresh: refreshInstances, createInstance, updateInstance, deleteInstance,
  } = useChannelInstances();
  const { agents } = useAgents();

  const loading = statusLoading || instancesLoading;
  const spinning = useMinLoading(loading);
  const showSkeleton = useDeferredLoading(loading && instances.length === 0);

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editInstance, setEditInstance] = useState<ChannelInstanceData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChannelInstanceData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const refresh = () => {
    refreshStatus();
    if (supported) refreshInstances();
  };

  if (!supported) {
    return <ChannelsStatusView channels={channels} loading={statusLoading} spinning={spinning} refresh={refreshStatus} />;
  }

  const filtered = instances.filter(
    (inst) =>
      inst.name.toLowerCase().includes(search.toLowerCase()) ||
      (inst.display_name || "").toLowerCase().includes(search.toLowerCase()) ||
      inst.channel_type.toLowerCase().includes(search.toLowerCase()),
  );

  const { pageItems, pagination, setPage, setPageSize, resetPage } = usePagination(filtered);

  useEffect(() => { resetPage(); }, [search, resetPage]);

  const handleCreate = async (data: ChannelInstanceInput) => {
    await createInstance(data);
  };

  const handleEdit = async (data: ChannelInstanceInput) => {
    if (!editInstance) return;
    await updateInstance(editInstance.id, data);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteInstance(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent?.display_name || agent?.agent_key || agentId.slice(0, 8);
  };

  const getStatus = (instanceName: string) => {
    return channels[instanceName] ?? null;
  };

  return (
    <div className="p-6">
      <PageHeader
        title={t("channels.title")}
        description={t("channels.description")}
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditInstance(null); setFormOpen(true); }} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> {t("channels.addChannel")}
            </Button>
            <Button variant="outline" size="sm" onClick={refresh} disabled={spinning} className="gap-1">
              <RefreshCw className={"h-3.5 w-3.5" + (spinning ? " animate-spin" : "")} /> {t("common.refresh")}
            </Button>
          </div>
        }
      />

      <div className="mt-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("channels.searchPlaceholder")}
          className="max-w-sm"
        />
      </div>

      <div className="mt-4">
        {showSkeleton ? (
          <TableSkeleton rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Radio}
            title={search ? t("channels.noMatching") : t("channels.noChannels")}
            description={search ? t("common.tryDifferentSearch") : t("channels.addFirst")}
          />
        ) : (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">{t("channels.tableName")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("channels.tableType")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("channels.tableAgent")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("channels.tableStatus")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("channels.tableEnabled")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("channels.tableActions")}</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((inst) => {
                  const status = getStatus(inst.name);
                  return (
                    <tr key={inst.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Radio className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <span className="font-medium">{inst.display_name || inst.name}</span>
                            {inst.display_name && (
                              <span className="ml-1 text-xs text-muted-foreground">({inst.name})</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">
                          {channelTypeLabels[inst.channel_type] || inst.channel_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {getAgentName(inst.agent_id)}
                      </td>
                      <td className="px-4 py-3">
                        {status ? (
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${status.running ? "bg-green-500" : "bg-muted-foreground"}`}
                            />
                            <span className="text-muted-foreground">
                              {status.running ? t("common.running") : t("common.stopped")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={inst.enabled ? "default" : "secondary"}>
                          {inst.enabled ? t("common.enabled") : t("common.disabled")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setEditInstance(inst); setFormOpen(true); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {!inst.is_default && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(inst)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              total={pagination.total}
              totalPages={pagination.totalPages}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </div>

      <ChannelInstanceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        instance={editInstance}
        agents={agents}
        onSubmit={editInstance ? handleEdit : handleCreate}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={t("channels.deleteChannel")}
        description={t("channels.deleteConfirm", { name: deleteTarget?.display_name || deleteTarget?.name })}
        confirmLabel={t("common.delete")}
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteLoading}
      />
    </div>
  );
}
