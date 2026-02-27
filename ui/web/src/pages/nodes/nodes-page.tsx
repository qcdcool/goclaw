import { useState } from "react";
import { Link as LinkIcon, RefreshCw, Check, X, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatDate, formatRelativeTime } from "@/lib/format";
import {
  useNodes,
  type PendingPairing,
  type PairedDevice,
} from "./hooks/use-nodes";
import { useMinLoading } from "@/hooks/use-min-loading";
import { useDeferredLoading } from "@/hooks/use-deferred-loading";

export function NodesPage() {
  const { t } = useTranslation();
  const { pendingPairings, pairedDevices, loading, refresh, approvePairing, denyPairing, revokePairing } = useNodes();
  const spinning = useMinLoading(loading);
  const isEmpty = pendingPairings.length === 0 && pairedDevices.length === 0;
  const showSkeleton = useDeferredLoading(loading && isEmpty);
  const [revokeTarget, setRevokeTarget] = useState<PairedDevice | null>(null);
  const [approveTarget, setApproveTarget] = useState<PendingPairing | null>(null);
  const [denyTarget, setDenyTarget] = useState<PendingPairing | null>(null);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title={t("nodes.title")}
        description={t("nodes.description")}
        actions={
          <Button variant="outline" size="sm" onClick={refresh} disabled={spinning} className="gap-1">
            <RefreshCw className={"h-3.5 w-3.5" + (spinning ? " animate-spin" : "")} /> {t("common.refresh")}
          </Button>
        }
      />

      <div className="mt-4">
        {showSkeleton ? (
          <TableSkeleton rows={4} />
        ) : isEmpty ? (
          <EmptyState
            icon={LinkIcon}
            title={t("nodes.noDevices")}
            description={t("nodes.noDevicesDesc")}
          />
        ) : (
          <div className="space-y-6">
            {pendingPairings.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-medium">
                  {t("nodes.pendingRequests", { count: pendingPairings.length })}
                </h3>
                <div className="space-y-2">
                  {pendingPairings.map((p: PendingPairing) => (
                    <div key={p.code} className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{p.channel}</Badge>
                          <span className="font-mono text-sm font-medium">{p.code}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t("nodes.sender")}: {p.sender_id}
                          {p.chat_id && ` | Chat: ${p.chat_id}`}
                          {" | "}
                          {formatRelativeTime(new Date(p.created_at))}
                        </div>
                      </div>
<div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDenyTarget(p)}
                          className="gap-1"
                        >
                          <X className="h-3.5 w-3.5" /> {t("approvals.deny")}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setApproveTarget(p)}
                          className="gap-1"
                        >
                          <Check className="h-3.5 w-3.5" /> {t("nodes.approve")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pairedDevices.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-medium">
                  {t("nodes.pairedDevices", { count: pairedDevices.length })}
                </h3>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left font-medium">{t("nodes.tableChannel")}</th>
                        <th className="px-4 py-3 text-left font-medium">{t("nodes.tableSenderId")}</th>
                        <th className="px-4 py-3 text-left font-medium">{t("nodes.tablePaired")}</th>
                        <th className="px-4 py-3 text-left font-medium">{t("nodes.tableBy")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("nodes.tableActions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pairedDevices.map((d: PairedDevice) => (
                        <tr key={`${d.channel}-${d.sender_id}`} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <Badge variant="outline">{d.channel}</Badge>
                          </td>
                          <td className="px-4 py-3 font-medium">{d.sender_id}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(new Date(d.paired_at))}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{d.paired_by}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRevokeTarget(d)}
                              className="gap-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> {t("nodes.revoke")}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {approveTarget && (
        <ConfirmDialog
          open
          onOpenChange={() => setApproveTarget(null)}
          title={t("nodes.approvePairing")}
          description={t("nodes.approveConfirm", {
            channel: approveTarget.channel,
            senderId: approveTarget.sender_id,
            code: approveTarget.code,
          })}
          confirmLabel={t("nodes.approve")}
          onConfirm={async () => {
            await approvePairing(approveTarget.code);
            setApproveTarget(null);
          }}
        />
      )}

      {denyTarget && (
        <ConfirmDialog
          open
          onOpenChange={() => setDenyTarget(null)}
          title="Deny Pairing"
          description={`Deny pairing request from ${denyTarget.channel}:${denyTarget.sender_id} (code: ${denyTarget.code})? The request will be removed.`}
          confirmLabel="Deny"
          variant="destructive"
          onConfirm={async () => {
            await denyPairing(denyTarget.code);
            setDenyTarget(null);
          }}
        />
      )}

      {revokeTarget && (
        <ConfirmDialog
          open
          onOpenChange={() => setRevokeTarget(null)}
          title={t("nodes.revokeDevice")}
          description={t("nodes.revokeConfirm", {
            channel: revokeTarget.channel,
            senderId: revokeTarget.sender_id,
          })}
          confirmLabel={t("nodes.revoke")}
          variant="destructive"
          onConfirm={async () => {
            await revokePairing(revokeTarget.sender_id, revokeTarget.channel);
            setRevokeTarget(null);
          }}
        />
      )}
    </div>
  );
}
