import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import type { AgentData } from "@/types/agent";
import { slugify, isValidSlug } from "@/lib/slug";
import { useProviders } from "@/pages/providers/hooks/use-providers";
import { useProviderModels } from "@/pages/providers/hooks/use-provider-models";
import { useProviderVerify } from "@/pages/providers/hooks/use-provider-verify";
import { AGENT_PRESETS } from "./agent-presets";

interface AgentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: Partial<AgentData>) => Promise<unknown>;
}

export function AgentCreateDialog({ open, onOpenChange, onCreate }: AgentCreateDialogProps) {
  const { t } = useTranslation();
  const { providers } = useProviders();
  const [agentKey, setAgentKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [agentType, setAgentType] = useState<"open" | "predefined">("open");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const enabledProviders = providers.filter((p) => p.enabled);

  // Look up provider ID from selected provider name for model fetching
  const selectedProviderId = useMemo(
    () => enabledProviders.find((p) => p.name === provider)?.id,
    [enabledProviders, provider],
  );
  const { models, loading: modelsLoading } = useProviderModels(selectedProviderId);
  const { verify, verifying, result: verifyResult, reset: resetVerify } = useProviderVerify();

  // Reset verification when provider or model changes
  useEffect(() => {
    resetVerify();
  }, [provider, model, resetVerify]);

  const handleVerify = async () => {
    if (!selectedProviderId || !model.trim()) return;
    await verify(selectedProviderId, model.trim());
  };

  const handleVerifyAndCreate = async () => {
    if (!selectedProviderId || !model.trim()) return;
    const res = await verify(selectedProviderId, model.trim());
    if (res?.valid) await handleCreate();
  };

  const handleCreate = async () => {
    if (!agentKey.trim()) return;
    setLoading(true);
    try {
      await onCreate({
        agent_key: agentKey.trim(),
        display_name: displayName.trim() || undefined,
        provider: provider.trim(),
        model: model.trim(),
        agent_type: agentType,
        other_config: description.trim() ? { description: description.trim() } : undefined,
      });
      onOpenChange(false);
      setAgentKey("");
      setKeyTouched(false);
      setDisplayName("");
      setProvider("");
      setModel("");
      setAgentType("open");
      setDescription("");
    } catch {
      // error handled upstream
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (value: string) => {
    setProvider(value);
    setModel("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("agents.createAgent")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayName">{t("agents.displayName")}</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={() => {
                  if (!keyTouched && displayName.trim()) {
                    setAgentKey(slugify(displayName.trim()));
                  }
                }}
                placeholder={t("agents.displayNamePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agentKey">{t("agents.agentKey")}</Label>
              <Input
                id="agentKey"
                value={agentKey}
                onChange={(e) => {
                  setKeyTouched(true);
                  setAgentKey(e.target.value);
                }}
                onBlur={() => setAgentKey(slugify(agentKey))}
                placeholder={t("agents.agentKeyPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("agents.agentKeyHint")}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("agents.providerRequired")}</Label>
              {enabledProviders.length > 0 ? (
                <Select value={provider} onValueChange={handleProviderChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("agents.selectProvider")} />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledProviders.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.display_name || p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  placeholder="openrouter"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("agents.modelRequired")}</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Combobox
                    value={model}
                    onChange={setModel}
                    options={models.map((m) => ({ value: m.id, label: m.name }))}
                    placeholder={modelsLoading ? t("agents.loadingModels") : t("agents.enterOrSelectModel")}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                  disabled={!selectedProviderId || !model.trim() || verifying}
                  onClick={handleVerify}
                >
                  {verifying ? "..." : t("agents.check")}
                </Button>
              </div>
              {verifyResult && (
                <p className={`text-xs ${verifyResult.valid ? "text-success" : "text-destructive"}`}>
                  {verifyResult.valid ? t("agents.modelVerified") : verifyResult.error || t("agents.verificationFailed")}
                </p>
              )}
              {!verifyResult && provider && !modelsLoading && models.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("agents.noModelListHint")}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("agents.agentType")}</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAgentType("open")}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  agentType === "open"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                {t("agents.open")}
                <span className="block text-xs font-normal opacity-70">{t("agents.perUserContext")}</span>
              </button>
              <button
                type="button"
                onClick={() => setAgentType("predefined")}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  agentType === "predefined"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                {t("agents.predefined")}
                <span className="block text-xs font-normal opacity-70">{t("agents.agentLevelConfig")}</span>
              </button>
            </div>
          </div>

          {agentType === "predefined" && (
            <div className="space-y-3">
              <Label>{t("agents.describeAgent")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {AGENT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setDescription(preset.prompt)}
                    className="rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:bg-accent"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("agents.describePlaceholder")}
                className="min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                {t("agents.descriptionHint")}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t("common.cancel")}
          </Button>
          {loading ? (
            <Button disabled>{t("agents.creating")}</Button>
          ) : !verifyResult?.valid && selectedProviderId && model.trim() ? (
            <Button onClick={handleVerifyAndCreate} disabled={verifying || !displayName.trim() || !agentKey.trim() || !isValidSlug(agentKey) || (agentType === "predefined" && !description.trim())}>
              {verifying ? t("agents.checking") : t("agents.checkAndCreate")}
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={!displayName.trim() || !agentKey.trim() || !isValidSlug(agentKey) || !provider.trim() || !model.trim() || !verifyResult?.valid || (agentType === "predefined" && !description.trim())}>
              {t("common.create")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
