import { useState, useEffect } from "react";
import { Wrench, Plus, RefreshCw, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SearchInput } from "@/components/shared/search-input";
import { Pagination } from "@/components/shared/pagination";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useCustomTools, type CustomToolData, type CustomToolInput } from "./hooks/use-custom-tools";
import { CustomToolFormDialog } from "./custom-tool-form-dialog";
import { useMinLoading } from "@/hooks/use-min-loading";
import { useDeferredLoading } from "@/hooks/use-deferred-loading";
import { usePagination } from "@/hooks/use-pagination";

export function CustomToolsPage() {
  const { t } = useTranslation();
  const { tools, loading, refresh, createTool, updateTool, deleteTool } = useCustomTools();
  const spinning = useMinLoading(loading);
  const showSkeleton = useDeferredLoading(loading && tools.length === 0);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editTool, setEditTool] = useState<CustomToolData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomToolData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const filtered = tools.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()),
  );

  const { pageItems, pagination, setPage, setPageSize, resetPage } = usePagination(filtered);

  useEffect(() => { resetPage(); }, [search, resetPage]);

  const handleCreate = async (data: CustomToolInput) => {
    await createTool(data);
  };

  const handleEdit = async (data: CustomToolInput) => {
    if (!editTool) return;
    await updateTool(editTool.id, data);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteTool(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title={t("customTools.title")}
        description={t("customTools.description")}
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditTool(null); setFormOpen(true); }} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> {t("customTools.createTool")}
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
          placeholder={t("customTools.searchPlaceholder")}
          className="max-w-sm"
        />
      </div>

      <div className="mt-4">
        {showSkeleton ? (
          <TableSkeleton rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title={search ? t("customTools.noMatching") : t("customTools.noCustomTools")}
            description={search ? t("common.tryDifferentSearch") : t("customTools.createFirst")}
          />
        ) : (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">{t("customTools.tableName")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("customTools.tableDescription")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("customTools.tableScope")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("customTools.tableEnabled")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("customTools.tableTimeout")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("customTools.tableActions")}</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((tool) => (
                  <tr key={tool.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{tool.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {tool.description || t("common.noDescription")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={tool.agent_id ? "secondary" : "outline"}>
                        {tool.agent_id ? t("customTools.scopeAgent") : t("customTools.scopeGlobal")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={tool.enabled ? "default" : "secondary"}>
                        {tool.enabled ? t("common.yes") : t("common.no")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{tool.timeout_seconds}s</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditTool(tool); setFormOpen(true); }}
                          className="gap-1"
                        >
                          <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(tool)}
                          className="gap-1 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
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

      <CustomToolFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        tool={editTool}
        onSubmit={editTool ? handleEdit : handleCreate}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("customTools.deleteCustomTool")}
        description={t("customTools.deleteConfirm", { name: deleteTarget?.name })}
        confirmLabel={t("common.delete")}
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteLoading}
      />
    </div>
  );
}
