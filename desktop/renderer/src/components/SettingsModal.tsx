import { Check, Download, GripVertical, Plus, Save, Trash2, X } from "lucide-react";
import { DragEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { changeLanguage, type Locale, t } from "../i18n";
import type {
  AgentSettings,
  CreateAgentRequest,
  ModelOption,
  ProviderDescriptor,
  ProviderKeyConfig,
  SaveAgentSettingsRequest
} from "../../../../shared/types";

type TabKey = "agent" | "providers" | "general";

export function calculateAgentCardGeometry(index: number, total: number, scrollOffset = 0) {
  const center = (total - 1) / 2;
  const relative = index - center + scrollOffset;
  const angle = relative * 7;
  return {
    x: relative * 26,
    y: Math.abs(relative) * 10,
    rotate: angle,
    zIndex: total - Math.abs(Math.round(relative)),
    scale: 1 - Math.min(Math.abs(relative) * 0.025, 0.12)
  };
}

export function SettingsModal({
  agents,
  configs,
  models,
  onAgentsChange,
  onClose,
  onProviderConfigsChange,
  onProvidersChange,
  providers
}: {
  agents: AgentSettings[];
  configs: ProviderKeyConfig[];
  models: ModelOption[];
  providers: ProviderDescriptor[];
  onAgentsChange: (agents: AgentSettings[]) => void;
  onProviderConfigsChange: (configs: ProviderKeyConfig[]) => void;
  onProvidersChange: (providers: ProviderDescriptor[]) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("agent");
  const [showCreate, setShowCreate] = useState(agents.length === 0);
  const [showProviderCreate, setShowProviderCreate] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5">
      <section className="flex h-[86vh] min-w-0 max-w-[1180px] flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-surface-950 shadow-2xl">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-2">
            {(["agent", "providers", "general"] as TabKey[]).map((key) => (
              <button
                key={key}
                className={`h-9 rounded-lg px-4 text-sm ${tab === key ? "bg-white text-surface-950" : "text-zinc-400 hover:bg-white/8 hover:text-zinc-100"}`}
                onClick={() => setTab(key)}
                type="button"
              >
                {key === "agent" ? t("common.agent") : key === "providers" ? t("common.providers") : t("settings.general")}
              </button>
            ))}
          </div>
          <button className="flex size-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/8 hover:text-zinc-100" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === "agent" ? (
            <AgentTab agents={agents} models={models} onAgentsChange={onAgentsChange} onCreate={() => setShowCreate(true)} />
          ) : null}
          {tab === "providers" ? (
            <ProvidersTab
              agents={agents}
              configs={configs}
              models={models}
              onAgentsChange={onAgentsChange}
              onCreate={() => setShowProviderCreate(true)}
              onProviderConfigsChange={onProviderConfigsChange}
              onProvidersChange={onProvidersChange}
              providers={providers}
            />
          ) : null}
          {tab === "general" ? <GeneralTab /> : null}
        </div>

        {showCreate ? (
          <CreateAgentOverlay
            models={models}
            onClose={() => setShowCreate(false)}
            onCreated={(next) => {
              onAgentsChange(next);
              setShowCreate(false);
            }}
          />
        ) : null}
        {showProviderCreate ? (
          <AddProviderOverlay
            onClose={() => setShowProviderCreate(false)}
            onCreated={(next) => {
              onProvidersChange(next);
              setShowProviderCreate(false);
            }}
          />
        ) : null}
      </section>
    </div>
  );
}

function AgentTab({ agents, models, onAgentsChange, onCreate }: { agents: AgentSettings[]; models: ModelOption[]; onAgentsChange: (agents: AgentSettings[]) => void; onCreate: () => void }) {
  const [selectedId, setSelectedId] = useState(agents.find((agent) => agent.isActive)?.id ?? agents[0]?.id);
  const [scrollOffset, setScrollOffset] = useState(0);
  const selected = agents.find((agent) => agent.id === selectedId) ?? agents[0];

  useEffect(() => {
    if (!selectedId && agents[0]) setSelectedId(agents[0].id);
  }, [agents, selectedId]);

  async function save(patch: SaveAgentSettingsRequest) {
    const next = await window.zhiyuan?.saveAgent(patch);
    if (next) onAgentsChange(next);
  }

  async function setActive(id: string) {
    const next = await window.zhiyuan?.setActiveAgent(id);
    if (next) onAgentsChange(next);
  }

  async function remove(id: string) {
    const next = await window.zhiyuan?.deleteAgent(id);
    if (next) onAgentsChange(next);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
      <aside className="min-h-0 overflow-hidden border-r border-white/10 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-200">Agent</h2>
          <button className="flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-xs font-medium text-surface-950" onClick={onCreate} type="button">
            <Plus size={15} /> {t("common.new")}
          </button>
        </div>
        <AgentCardStack
          agents={agents}
          onExport={(id) => void window.zhiyuan?.exportAgent(id)}
          onRemove={remove}
          onScroll={setScrollOffset}
          onSelect={setSelectedId}
          onSetActive={setActive}
          scrollOffset={scrollOffset}
          selectedId={selected?.id}
        />
      </aside>

      {selected ? (
        <div className="min-h-0 overflow-y-auto p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label={t("agent.name")}>
              <input className="zy-input" value={selected.name} onChange={(event) => void save({ id: selected.id, name: event.target.value })} />
            </Field>
            <Field label={t("agent.chatModel")}>
              <SelectWidget value={selected.chatModel} models={models} onChange={(chatModel) => void save({ id: selected.id, chatModel })} />
            </Field>
            <Field label={t("agent.yuan")}>
              <YuanSelector value={selected.yuan} onChange={(yuan) => void save({ id: selected.id, yuan })} />
            </Field>
            <MemorySection agent={selected} onChange={(patch) => void save({ id: selected.id, ...patch })} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Field label={t("agent.identity")}>
              <textarea className="zy-textarea h-40" value={selected.identityText} onChange={(event) => void save({ id: selected.id, identityText: event.target.value })} />
            </Field>
            <Field label={t("agent.ishiki")}>
              <textarea className="zy-textarea h-40" value={selected.ishikiText} onChange={(event) => void save({ id: selected.id, ishikiText: event.target.value })} />
            </Field>
          </div>
          <AgentToolsSection agent={selected} onChange={(toolsDisabled) => void save({ id: selected.id, toolsDisabled })} />
        </div>
      ) : (
        <WelcomeScreen onCreate={onCreate} />
      )}
    </div>
  );
}

function AgentCardStack({
  agents,
  onExport,
  onRemove,
  onScroll,
  onSelect,
  onSetActive,
  scrollOffset,
  selectedId
}: {
  agents: AgentSettings[];
  selectedId?: string;
  scrollOffset: number;
  onSelect: (id: string) => void;
  onScroll: (value: number) => void;
  onSetActive: (id: string) => void;
  onExport: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [order, setOrder] = useState(agents.map((agent) => agent.id));
  const orderedAgents = order.map((id) => agents.find((agent) => agent.id === id)).filter(Boolean) as AgentSettings[];

  useEffect(() => setOrder(agents.map((agent) => agent.id)), [agents]);

  function drop(targetId: string) {
    if (!dragged || dragged === targetId) return;
    const next = order.filter((id) => id !== dragged);
    next.splice(next.indexOf(targetId), 0, dragged);
    setOrder(next);
    setDragged(null);
  }

  return (
    <div className="relative h-[520px] overflow-hidden rounded-lg border border-white/8 bg-surface-900/60" onWheel={(event) => onScroll(scrollOffset + event.deltaY / 260)}>
      {orderedAgents.map((agent, index) => {
        const geometry = calculateAgentCardGeometry(index, orderedAgents.length, scrollOffset);
        return (
          <div
            draggable
            key={agent.id}
            onDragOver={(event: DragEvent) => event.preventDefault()}
            onDragStart={() => setDragged(agent.id)}
            onDrop={() => drop(agent.id)}
            style={{ transform: `translate(${geometry.x}px, ${geometry.y + index * 54}px) rotate(${geometry.rotate}deg) scale(${geometry.scale})`, zIndex: geometry.zIndex }}
            className={`absolute left-8 right-8 top-6 rounded-lg border p-3 transition hover:rotate-0 hover:scale-105 ${
              selectedId === agent.id ? "border-brand-500 bg-surface-850" : "border-white/10 bg-surface-900"
            }`}
          >
            <button className="w-full text-left" onClick={() => onSelect(agent.id)} type="button">
              <div className="flex items-center gap-2">
                <GripVertical size={15} className="text-zinc-500" />
                <span className="truncate text-sm font-medium text-zinc-100">{agent.name}</span>
                {agent.isActive ? <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-xs text-brand-400">{t("agent.primary")}</span> : null}
              </div>
              <p className="mt-1 truncate text-xs text-zinc-500">{agent.yuan} · {agent.chatModel}</p>
            </button>
            <div className="mt-3 flex gap-2">
              <button className="zy-icon-button" onClick={() => onSetActive(agent.id)} title={t("agent.setPrimary")} type="button"><Check size={14} /></button>
              <button className="zy-icon-button" onClick={() => onExport(agent.id)} title={t("common.export")} type="button"><Download size={14} /></button>
              <button className="zy-icon-button" onClick={() => onRemove(agent.id)} title={t("common.delete")} type="button"><Trash2 size={14} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProvidersTab({ agents, configs, models, onAgentsChange, onCreate, onProviderConfigsChange, onProvidersChange, providers }: { agents: AgentSettings[]; configs: ProviderKeyConfig[]; models: ModelOption[]; providers: ProviderDescriptor[]; onAgentsChange: (agents: AgentSettings[]) => void; onProviderConfigsChange: (configs: ProviderKeyConfig[]) => void; onProvidersChange: (providers: ProviderDescriptor[]) => void; onCreate: () => void }) {
  const [selectedId, setSelectedId] = useState(providers.find((provider) => provider.id === "deepseek")?.id ?? providers[0]?.id);
  const provider = providers.find((item) => item.id === selectedId) ?? providers[0];
  const apiProviders = providers.filter((item) => item.authType === "apikey");

  return (
    <div className="pv-layout grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
      <aside className="min-h-0 overflow-y-auto border-r border-white/10 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-200">{t("provider.apiProviders")}</h2>
          <button className="zy-icon-button" onClick={onCreate} title={t("provider.new")} type="button"><Plus size={15} /></button>
        </div>
        <div className="space-y-2">
          {apiProviders.map((item) => (
            <button key={item.id} className={`w-full rounded-lg border p-3 text-left ${item.id === provider?.id ? "border-brand-500 bg-surface-850" : "border-white/8 bg-surface-900"}`} onClick={() => setSelectedId(item.id)} type="button">
              <p className="text-sm text-zinc-200">{item.name}</p>
              <p className="mt-1 truncate text-xs text-zinc-500">{item.baseURL}</p>
            </button>
          ))}
        </div>
      </aside>
      <div className="min-h-0 overflow-y-auto p-5">
        {provider ? (
          <ProviderDetail
            configs={configs}
            onDeleted={(nextProviders) => {
              setSelectedId(nextProviders[0]?.id);
              onProvidersChange(nextProviders);
              onProviderConfigsChange(configs.filter((config) => config.providerId !== provider.id));
            }}
            onProviderConfigsChange={onProviderConfigsChange}
            provider={provider}
          />
        ) : null}
        <OtherModelsSection agent={agents.find((item) => item.isActive) ?? agents[0]} models={models} onAgentsChange={onAgentsChange} />
      </div>
    </div>
  );
}

function ProviderDetail({
  configs,
  onDeleted,
  onProviderConfigsChange,
  provider
}: {
  provider: ProviderDescriptor;
  configs: ProviderKeyConfig[];
  onProviderConfigsChange: (configs: ProviderKeyConfig[]) => void;
  onDeleted: (providers: ProviderDescriptor[]) => void;
}) {
  const saved = configs.find((config) => config.providerId === provider.id);
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState(saved?.baseURL ?? provider.baseURL);
  const builtIn = ["openai", "zhipu", "qwen", "deepseek", "baidu", "moonshot"].includes(provider.id);
  async function save() {
    const next = await window.zhiyuan?.saveProviderConfig({ providerId: provider.id, apiKey, baseURL });
    if (next) onProviderConfigsChange(next);
    setApiKey("");
  }
  async function remove() {
    if (builtIn) return;
    const next = await window.zhiyuan?.deleteProvider(provider.id);
    if (next) onDeleted(next);
  }
  return (
    <section className="rounded-lg border border-white/10 bg-surface-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium text-zinc-100">{provider.name}</h3>
          <p className="text-xs text-zinc-500">{provider.compatLayer} · {saved?.apiKeyMasked ? t("provider.savedKey", { key: saved.apiKeyMasked }) : t("provider.noKey")}</p>
        </div>
        <div className="flex gap-2">
          <button
            className="flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-medium text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={builtIn}
            onClick={remove}
            title={builtIn ? t("provider.builtinDeleteDisabled") : t("provider.delete")}
            type="button"
          >
            <Trash2 size={14} /> {t("common.delete")}
          </button>
          <button className="flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-xs font-medium text-surface-950" onClick={save} type="button"><Save size={14} /> {t("common.save")}</button>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="API Key"><input className="zy-input" placeholder={saved?.apiKeyMasked ? t("provider.savedPlaceholder", { key: saved.apiKeyMasked }) : provider.envKey ?? "API Key"} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} /></Field>
        <Field label="Base URL"><input className="zy-input" value={baseURL} onChange={(event) => setBaseURL(event.target.value)} /></Field>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-xs text-zinc-500">{t("provider.modelList")}</p>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">{provider.id}/{t("provider.defaultModel")}</span>
        </div>
      </div>
    </section>
  );
}

function OtherModelsSection({ agent, models, onAgentsChange }: { agent?: AgentSettings; models: ModelOption[]; onAgentsChange: (agents: AgentSettings[]) => void }) {
  async function save(patch: Pick<SaveAgentSettingsRequest, "utilityModel" | "utilityLargeModel">) {
    if (!agent) return;
    const next = await window.zhiyuan?.saveAgent({ id: agent.id, ...patch });
    if (next) onAgentsChange(next);
  }

  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-zinc-200">{t("provider.globalModels")}</h3>
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="Utility"><SelectWidget models={models} value={agent?.utilityModel ?? "deepseek:deepseek-chat"} onChange={(utilityModel) => void save({ utilityModel })} /></Field>
        <Field label="Utility Large"><SelectWidget models={models} value={agent?.utilityLargeModel ?? "deepseek:deepseek-chat"} onChange={(utilityLargeModel) => void save({ utilityLargeModel })} /></Field>
      </div>
    </section>
  );
}

function CreateAgentOverlay({ models, onClose, onCreated }: { models: ModelOption[]; onClose: () => void; onCreated: (agents: AgentSettings[]) => void }) {
  const [name, setName] = useState(t("agent.newName"));
  const [yuan, setYuan] = useState("zhiyuan");
  const [chatModel, setChatModel] = useState("deepseek:deepseek-chat");
  async function create() {
    const request: CreateAgentRequest = { name, yuan, chatModel };
    const next = await window.zhiyuan?.createAgent(request);
    if (next) onCreated(next);
  }
  return (
    <Overlay title={t("agent.createTitle")} onClose={onClose}>
      <p className="text-xs text-zinc-500">{t("agent.createHint")}</p>
      <Field label={t("common.name")}><input className="zy-input" value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label={t("agent.yuan")}><YuanSelector value={yuan} onChange={setYuan} /></Field>
      <Field label={t("common.model")}><SelectWidget models={models} value={chatModel} onChange={setChatModel} /></Field>
      <button className="mt-4 h-10 w-full rounded-lg bg-white text-sm font-medium text-surface-950" onClick={create} type="button">{t("common.create")}</button>
    </Overlay>
  );
}

function AddProviderOverlay({ onClose, onCreated }: { onClose: () => void; onCreated: (providers: ProviderDescriptor[]) => void }) {
  const [name, setName] = useState(t("provider.customName"));
  const [id, setId] = useState("custom");
  const [baseURL, setBaseURL] = useState("https://api.example.com/v1");
  async function create() {
    const next = await window.zhiyuan?.addCustomProvider({ id, name, baseURL, authType: "apikey", compatLayer: "openai", enabled: true });
    if (next) onCreated(next);
  }
  return (
    <Overlay title={t("provider.new")} onClose={onClose}>
      <Field label={t("common.name")}><input className="zy-input" value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="ID"><input className="zy-input" value={id} onChange={(event) => setId(event.target.value)} /></Field>
      <Field label="Base URL"><input className="zy-input" value={baseURL} onChange={(event) => setBaseURL(event.target.value)} /></Field>
      <button className="mt-4 h-10 w-full rounded-lg bg-white text-sm font-medium text-surface-950" onClick={create} type="button">{t("common.create")}</button>
    </Overlay>
  );
}

function WelcomeScreen({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-zinc-100">{t("agent.welcome")}</h2>
        <p className="mt-2 text-sm text-zinc-500">{t("agent.welcomeHint")}</p>
        <button className="mt-5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-surface-950" onClick={onCreate} type="button">{t("agent.createTitle")}</button>
      </div>
    </div>
  );
}

function MemorySection({ agent, onChange }: { agent: AgentSettings; onChange: (patch: Partial<SaveAgentSettingsRequest>) => void }) {
  return (
    <Field label={t("agent.memory")}>
      <div className="flex gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-300"><input checked={agent.memoryEnabled} onChange={(event) => onChange({ memoryEnabled: event.target.checked })} type="checkbox" /> Master</label>
        <label className="flex items-center gap-2 text-sm text-zinc-300"><input checked={agent.sessionMemoryEnabled} onChange={(event) => onChange({ sessionMemoryEnabled: event.target.checked })} type="checkbox" /> Session</label>
      </div>
    </Field>
  );
}

function AgentToolsSection({ agent, onChange }: { agent: AgentSettings; onChange: (toolsDisabled: string[]) => void }) {
  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-zinc-200">{t("agent.tools")}</h3>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {agent.tools.map((tool) => (
          <label key={tool.name} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-white/8 px-3 py-2">
            <span className="truncate text-xs text-zinc-300" title={tool.description}>{tool.name}</span>
            <input
              checked={!agent.toolsDisabled.includes(tool.name)}
              onChange={(event) => {
                const disabled = event.target.checked ? agent.toolsDisabled.filter((name) => name !== tool.name) : [...agent.toolsDisabled, tool.name];
                onChange(disabled);
              }}
              type="checkbox"
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function SelectWidget({ models, onChange, value }: { models: ModelOption[]; value: string; onChange: (value: string) => void }) {
  return (
    <select className="zy-input" value={value} onChange={(event) => onChange(event.target.value)}>
      {models.map((model) => <option key={`${model.providerId}:${model.model}`} value={`${model.providerId}:${model.model}`}>{model.providerId}/{model.model}</option>)}
    </select>
  );
}

function YuanSelector({ onChange, value }: { value: string; onChange: (value: string) => void }) {
  const items = [
    ["zhiyuan", t("yuan.zhiyuan")],
    ["lingxi", t("yuan.lingxi")],
    ["yanjin", t("yuan.yanjin")]
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(([id, label]) => (
        <button key={id} className={`rounded-full border px-3 py-1 text-sm ${value === id ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-white/10 text-zinc-400"}`} onClick={() => onChange(id)} type="button">{label}</button>
      ))}
    </div>
  );
}

function GeneralTab() {
  const [settings, setSettings] = useState({
    language: "zh-CN" as Locale,
    compactMode: true,
    reduceMotion: false,
    confirmDanger: true
  });
  const [usage, setUsage] = useState<any | null>(null);
  const [audit, setAudit] = useState<any[]>([]);

  useEffect(() => {
    void window.zhiyuan?.getGeneralSettings().then((next) => {
      if (next) {
        setSettings(next);
        void changeLanguage(next.language);
      }
    });
    void window.zhiyuan?.getUsageSummary().then(setUsage);
    void window.zhiyuan?.listAuditLog(5).then(setAudit);

    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        const language = settings.language === "zh-CN" ? "en" : "zh-CN";
        void save({ language });
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [settings.language]);

  async function save(patch: Partial<typeof settings>) {
    const next = await window.zhiyuan?.saveGeneralSettings(patch);
    if (!next) return;
    setSettings(next);
    await changeLanguage(next.language);
  }

  return (
    <div className="space-y-4 p-5">
      <section className="rounded-lg border border-white/10 bg-surface-900 p-4">
        <h2 className="text-sm font-medium text-zinc-200">{t("settings.general")}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label={t("settings.language")}>
            <select className="zy-input" value={settings.language} onChange={(event) => void save({ language: event.target.value as Locale })}>
              <option value="zh-CN">zh-CN</option>
              <option value="en">English</option>
            </select>
            <p className="mt-2 text-xs text-zinc-500">{t("settings.languageHint")}</p>
          </Field>
          {[
            ["compactMode", t("settings.compactMode")],
            ["reduceMotion", t("settings.reduceMotion")],
            ["confirmDanger", t("settings.confirmDanger")]
          ].map(([key, label]) => (
            <label className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300" key={key}>
              {label}
              <input
                checked={Boolean(settings[key as keyof typeof settings])}
                onChange={(event) => void save({ [key]: event.target.checked })}
                type="checkbox"
              />
            </label>
          ))}
        </div>
      </section>
      <UsageLedgerSection usage={usage} />
      <section className="rounded-lg border border-white/10 bg-surface-900 p-4">
        <h2 className="text-sm font-medium text-zinc-200">{t("security.audit")}</h2>
        <div className="mt-3 space-y-2">
          {audit.length === 0 ? <p className="text-xs text-zinc-500">{t("security.noAudit")}</p> : null}
          {audit.map((entry) => (
            <div className="rounded-lg border border-white/8 px-3 py-2 text-xs text-zinc-400" key={entry.id}>
              <span className="text-zinc-200">{entry.action}</span> · {entry.subject} · {entry.outcome} · {entry.createdAt}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function UsageLedgerSection({ usage }: { usage: any | null }) {
  const items = [
    [t("usage.input"), usage?.totalInputTokens ?? 0],
    [t("usage.output"), usage?.totalOutputTokens ?? 0],
    [t("usage.total"), usage?.totalTokens ?? 0],
    [t("usage.records"), usage?.records ?? 0]
  ];
  return (
    <section className="rounded-lg border border-white/10 bg-surface-900 p-4">
      <h2 className="text-sm font-medium text-zinc-200">{t("usage.title")}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {items.map(([label, value]) => (
          <div className="rounded-lg border border-white/8 p-3" key={label}>
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-100">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Field({ children, label }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs text-zinc-500">{label}</span>{children}</label>;
}

function Overlay({ children, onClose, title }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-5">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-surface-950 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium text-zinc-100">{title}</h2>
          <button className="zy-icon-button" onClick={onClose} type="button"><X size={16} /></button>
        </div>
        <div className="space-y-3">{children}</div>
      </section>
    </div>
  );
}
