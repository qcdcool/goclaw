import { useState } from "react";
import { ShieldCheck, Check, X, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatRelativeTime } from "@/lib/format";
import { useApprovals, type PendingApproval } from "./hooks/use-approvals";
import { useMinLoading } from "@/hooks/use-min-loading";
import { useDeferredLoading } from "@/hooks/use-deferred-loading";

export function ApprovalsPage() {
  const { t } = useTranslation();
  const { pending, loading, refresh, approve, deny } = useApprovals();
  const spinning = useMinLoading(loading);
  const showSkeleton = useDeferredLoading(loading && pending.length === 0);
  const [denyTarget, setDenyTarget] = useState<PendingApproval | null>(null);
  const [approveTarget, setApproveTarget] = useState<{ approval: PendingApproval; always: boolean } | null>(null);

  return (
    <div className="p-6">
      <PageHeader
        title={t("approvals.title")}
        description={t("approvals.description")}
        actions={
          <div className="flex items-center gap-2">
            {pending.length > 0 && (
              <Badge variant="destructive">{pending.length} {t("approvals.pending")}</Badge>
            )}
            <Button variant="outline" size="sm" onClick={refresh} disabled={spinning} className="gap-1">
              <RefreshCw className={"h-3.5 w-3.5" + (spinning ? " animate-spin" : "")} /> {t("common.refresh")}
            </Button>
          </div>
        }
      />

      <div className="mt-4">
        {showSkeleton ? (
          <TableSkeleton rows={3} />
        ) : pending.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={t("approvals.noPending")}
            description={t("approvals.allResolved")}
          />
        ) : (
          <div className="space-y-3">
            {pending.map((approval: PendingApproval) => (
              <div key={approval.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{approval.agentId}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(new Date(approval.createdAt))}
                      </span>
                    </div>
                    <pre className="mt-2 rounded-md bg-muted p-3 text-sm">
                      {approval.command}
                    </pre>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      onClick={() => setApproveTarget({ approval, always: false })}
                      className="gap-1"
                    >
                      <Check className="h-3.5 w-3.5" /> {t("approvals.allowOnce")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setApproveTarget({ approval, always: true })}
                      className="gap-1"
                    >
                      <Check className="h-3.5 w-3.5" /> {t("approvals.allowAlways")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDenyTarget(approval)}
                      className="gap-1"
                    >
                      <X className="h-3.5 w-3.5" /> {t("approvals.deny")}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!approveTarget}
        onOpenChange={() => setApproveTarget(null)}
        title={approveTarget?.always ? t("approvals.allowAlways") : t("approvals.allowOnce")}
        description={
          approveTarget?.always
            ? t("approvals.allowAlwaysConfirm", { command: approveTarget.approval.command, agentId: approveTarget.approval.agentId })
            : t("approvals.allowOnceConfirm", { command: approveTarget?.approval.command, agentId: approveTarget?.approval.agentId })
        }
        confirmLabel={approveTarget?.always ? t("approvals.allowAlways") : t("approvals.allowOnce")}
        onConfirm={async () => {
          if (approveTarget) {
            await approve(approveTarget.approval.id, approveTarget.always);
            setApproveTarget(null);
          }
        }}
      />

      <ConfirmDialog
        open={!!denyTarget}
        onOpenChange={() => setDenyTarget(null)}
        title={t("approvals.denyExecution")}
        description={t("approvals.denyConfirm", { command: denyTarget?.command, agentId: denyTarget?.agentId })}
        confirmLabel={t("approvals.deny")}
        variant="destructive"
        onConfirm={async () => {
          if (denyTarget) {
            await deny(denyTarget.id);
            setDenyTarget(null);
          }
        }}
      />
    </div>
  );
}
