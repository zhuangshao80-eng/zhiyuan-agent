import { Activity, Bot, Cpu, Download, Hash, KeyRound, LayoutDashboard, Pencil, Settings } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  ChatSession,
  ChatStreamEvent,
  ModelOption,
  ProviderDescriptor,
  ProviderKeyConfig,
  AgentSettings,
  VisibleToolCall
} from "../../../shared/types";
import { MemoizedChatArea } from "./components/ChatArea";
import { ChannelPanel } from "./components/ChannelPanel";
import { DeskPanel } from "./components/DeskPanel";
import { InputArea } from "./components/InputArea";
import { SettingsModal } from "./components/SettingsModal";
import { changeLanguage, initializeI18n, type Locale, t } from "./i18n";
import { useAppStore } from "./stores/app-store";

const navItems = [
  { id: "chat", labelKey: "nav.chat", icon: Bot },
  { id: "channels", labelKey: "nav.channels", icon: Hash },
  { id: "desk", labelKey: "nav.desk", icon: LayoutDashboard },
  { id: "agent", labelKey: "nav.agent", icon: Activity },
  { id: "settings", labelKey: "nav.settings", icon: Settings }
];

export function App() {
  const { metadata, engineStatus, setMetadata, setEngineStatus } = useAppStore();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [providers, setProviders] = useState<ProviderDescriptor[]>([]);
  const [providerConfigs, setProviderConfigs] = useState<ProviderKeyConfig[]>([]);
  const [agents, setAgents] = useState<AgentSettings[]>([]);
  const [selectedModel, setSelectedModel] = useState("deepseek:deepseek-chat");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionQuery, setSessionQuery] = useState("");
  const [view, setView] = useState<"chat" | "channels" | "desk">("chat");
  const [updateStatus, setUpdateStatus] = useState<any>({ type: "idle", message: "idle" });

  const activeMessages = activeSession?.messages ?? [];

  useEffect(() => {
    void window.zhiyuan?.getAppMetadata().then(setMetadata);
    void window.zhiyuan?.getEngineStatus().then(setEngineStatus);
    void window.zhiyuan?.getGeneralSettings().then((settings) => initializeI18n(settings?.language ?? "zh-CN"));
    void window.zhiyuan?.getUpdateStatus().then(setUpdateStatus);
    void refreshBootstrap();
  }, [setEngineStatus, setMetadata]);

  useEffect(() => window.zhiyuan?.onUpdateStatus(setUpdateStatus), []);

  useEffect(() => {
    const handleShortcut = async (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        const current = await window.zhiyuan?.getGeneralSettings();
        const language: Locale = current?.language === "en" ? "zh-CN" : "en";
        await window.zhiyuan?.saveGeneralSettings({ language });
        await changeLanguage(language);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const unsubscribe = window.zhiyuan?.onStreamToken((event) => {
      applyStreamEvent(event);
    });

    return () => unsubscribe?.();
  }, [activeSession?.id]);

  async function refreshBootstrap() {
    const [nextModels, nextProviders, nextProviderConfigs, nextAgents, nextSessions] = await Promise.all([
      window.zhiyuan?.listModels() ?? Promise.resolve([]),
      window.zhiyuan?.listProviders() ?? Promise.resolve([]),
      window.zhiyuan?.listProviderConfig() ?? Promise.resolve([]),
      window.zhiyuan?.listAgents() ?? Promise.resolve([]),
      window.zhiyuan?.listSessions() ?? Promise.resolve([])
    ]);
    setModels(nextModels);
    setProviders(nextProviders);
    setProviderConfigs(nextProviderConfigs);
    setAgents(nextAgents);
    setSessions(nextSessions);

    const firstModel = sortDeepSeekFirst(nextModels)[0];
    if (firstModel) {
      setSelectedModel(`${firstModel.providerId}:${firstModel.model}`);
    }

    if (nextSessions[0]) {
      setActiveSession(nextSessions[0]);
    }
  }

  function applyStreamEvent(event: ChatStreamEvent) {
    if (event.type === "error") {
      setError(event.error);
      setIsStreaming(false);
      if (event.messageId) {
        setActiveSession((session) => {
          if (!session || session.id !== event.sessionId) {
            return session;
          }

          return {
            ...session,
            messages: session.messages.map((message) =>
              message.id === event.messageId ? { ...message, content: "", error: event.error } : message
            )
          };
        });
      }
      return;
    }

    setActiveSession((session) => {
      if (!session || session.id !== event.sessionId) {
        return session;
      }

      const messages = session.messages.map((message) => {
        if (message.id !== event.messageId) {
          return message;
        }

        if (event.type === "token") {
          return { ...message, content: `${message.content}${event.token}` };
        }

        if (event.type === "reasoning") {
          return { ...message, reasoning: `${message.reasoning ?? ""}${event.token}` };
        }

        if (event.type === "tool_call") {
          return { ...message, tool_calls: upsertToolCall(message.tool_calls ?? [], event.toolCall) };
        }

        if (event.type === "done") {
          setIsStreaming(false);
          void refreshSessions(event.sessionId);
          return event.message;
        }

        return message;
      });

      return { ...session, messages, updatedAt: new Date().toISOString() };
    });
  }

  async function refreshSessions(activeSessionId?: string) {
    const nextSessions = (await window.zhiyuan?.listSessions()) ?? [];
    setSessions(nextSessions);
    const target = nextSessions.find((session) => session.id === activeSessionId) ?? nextSessions[0] ?? null;
    setActiveSession(target);
  }

  async function handleNewSession() {
    const session = await window.zhiyuan?.createSession(selectedModel);
    if (!session) {
      return;
    }

    setSessions((current) => [session, ...current]);
    setActiveSession(session);
    setError(null);
  }

  async function handleClearSession() {
    if (!activeSession) {
      await handleNewSession();
      return;
    }

    const cleared = await window.zhiyuan?.clearSession(activeSession.id);
    if (!cleared) {
      setError(t("chat.clearFailed"));
      return;
    }

    setActiveSession(cleared);
    setError(null);
    void refreshSessions(cleared.id);
  }

  async function handleDeleteSession(sessionId: string) {
    await window.zhiyuan?.deleteSession(sessionId);
    const nextSessions = sessions.filter((session) => session.id !== sessionId);
    setSessions(nextSessions);
    if (activeSession?.id === sessionId) {
      setActiveSession(nextSessions[0] ?? null);
    }
  }

  async function handleRenameSession(sessionId: string, title: string) {
    const renamed = await window.zhiyuan?.renameSession(sessionId, title);
    if (!renamed) return;
    setSessions((current) => current.map((session) => (session.id === sessionId ? renamed : session)));
    if (activeSession?.id === sessionId) setActiveSession(renamed);
  }

  async function handleExportSession(sessionId: string) {
    await window.zhiyuan?.exportSession(sessionId);
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || isStreaming) {
      return;
    }

    setInput("");
    setError(null);
    setIsStreaming(true);

    const result = await window.zhiyuan?.sendChatMessage({
      sessionId: activeSession?.id,
      content,
      model: selectedModel
    });

    if (!result) {
      setError(t("chat.sendFailedIpc"));
      setIsStreaming(false);
      return;
    }

    setActiveSession((session) => {
      const base: ChatSession =
        session && session.id === result.sessionId
          ? session
          : {
              id: result.sessionId,
              title: content.slice(0, 28) || t("chat.newSession"),
              model: selectedModel,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              messages: []
            };

      return {
        ...base,
        model: selectedModel,
        messages: [...base.messages, result.userMessage, result.assistantMessage]
      };
    });

    void refreshSessions(result.sessionId);
  }

  return (
    <main className="h-screen min-h-0 overflow-hidden bg-surface-950 text-zinc-100">
      <div className="grid h-full min-h-0 grid-cols-[76px_1fr]">
        <aside className="flex flex-col items-center border-r border-white/8 bg-surface-900 py-4">
          <div className="mb-8 flex size-11 items-center justify-center rounded-lg bg-brand-500 text-surface-950 shadow-lg shadow-brand-500/20">
            <Cpu size={24} strokeWidth={2.4} />
          </div>
          <nav className="flex flex-1 flex-col gap-3">
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const itemId = item.id;
              const label = t(item.labelKey);
              const active =
                (itemId === "chat" && view === "chat") ||
                (itemId === "channels" && view === "channels") ||
                (itemId === "desk" && view === "desk");

              return (
                <button
                  key={label}
                  className={`flex size-11 items-center justify-center rounded-lg transition ${
                    active
                      ? "bg-white text-surface-950"
                      : "text-zinc-400 hover:bg-white/8 hover:text-zinc-100"
                  }`}
                  onClick={() => {
                    if (itemId === "chat") setView("chat");
                    else if (itemId === "channels") setView("channels");
                    else if (itemId === "desk") setView("desk");
                    else setSettingsOpen(true);
                  }}
                  title={label}
                  type="button"
                >
                  <Icon size={21} />
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/8 bg-surface-900/80 px-6">
            <div>
              <h1 className="text-lg font-semibold tracking-normal">{metadata?.name ?? t("app.title")}</h1>
              <p className="text-xs text-zinc-500">{t("app.subtitle")}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="flex items-center gap-2 rounded-lg border border-white/8 bg-surface-850 px-3 py-2 text-xs text-zinc-300"
                onClick={() => void window.zhiyuan?.checkForUpdates().then(setUpdateStatus)}
                title={t("update.check")}
                type="button"
              >
                <KeyRound size={15} />
                {t("update.check")}
              </button>
              <UpdateNotice status={updateStatus} />
              <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-surface-850 px-3 py-2 text-xs text-zinc-400">
                <span className="size-2 rounded-full bg-brand-500" />
                {t("common.status")}: {engineStatus ?? "initializing"}
              </div>
            </div>
          </header>

          {view === "chat" ? (
          <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_64px] overflow-hidden">
            <ChatSidebar
              agents={agents}
              activeSessionId={activeSession?.id}
              onClearSession={handleClearSession}
              onDeleteSession={handleDeleteSession}
              onExportSession={handleExportSession}
              onNewSession={handleNewSession}
              onOpenChannels={() => setView("channels")}
              onQueryChange={setSessionQuery}
              onRenameSession={handleRenameSession}
              onSelectSession={setActiveSession}
              query={sessionQuery}
              sessions={sessions}
            />

            <section className="flex min-h-0 min-w-0 flex-col bg-surface-950">
              <MemoizedChatArea error={error} isStreaming={isStreaming} messages={activeMessages} />
              <InputArea
                input={input}
                isStreaming={isStreaming}
                models={models}
                onInputChange={setInput}
                onModelChange={setSelectedModel}
                onSubmit={handleSend}
                selectedModel={selectedModel}
              />
            </section>
            <WorkspaceCompanionRail activeSession={activeSession} onOpenDesk={() => setView("desk")} />
          </div>
          ) : view === "channels" ? (
            <ChannelPanel />
          ) : (
            <DeskPanel />
          )}
        </section>
      </div>
      {settingsOpen ? (
        <SettingsModal
          agents={agents}
          configs={providerConfigs}
          models={models}
          onAgentsChange={setAgents}
          onClose={() => setSettingsOpen(false)}
          onProviderConfigsChange={setProviderConfigs}
          onProvidersChange={setProviders}
          providers={providers}
        />
      ) : null}
    </main>
  );
}

function UpdateNotice({ status }: { status: any }) {
  const type = status?.type ?? "idle";
  const label = t(`update.${type}`) || t("update.idle");
  const progress = status?.progress?.percent ? ` ${Math.round(status.progress.percent)}%` : "";
  if (type === "idle") {
    return null;
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-surface-850 px-3 py-2 text-xs text-zinc-300">
      <span>{label}{progress}</span>
      {type === "available" ? (
        <button className="text-brand-300" onClick={() => void window.zhiyuan?.downloadUpdate()} type="button">{t("update.download")}</button>
      ) : null}
      {type === "downloaded" ? (
        <button className="text-brand-300" onClick={() => void window.zhiyuan?.installUpdate()} type="button">{t("update.install")}</button>
      ) : null}
    </div>
  );
}

function ChatSidebar({
  activeSessionId,
  agents,
  onClearSession,
  onDeleteSession,
  onExportSession,
  onNewSession,
  onOpenChannels,
  onQueryChange,
  onRenameSession,
  onSelectSession,
  query,
  sessions
}: {
  activeSessionId?: string;
  agents: AgentSettings[];
  onClearSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onExportSession: (sessionId: string) => void;
  onNewSession: () => void;
  onOpenChannels: () => void;
  onQueryChange: (query: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onSelectSession: (session: ChatSession) => void;
  query: string;
  sessions: ChatSession[];
}) {
  const visibleSessions = sessions.filter((session) => `${session.title} ${session.model}`.toLowerCase().includes(query.trim().toLowerCase()));
  const grouped = groupSessions(visibleSessions);
  return (
    <aside className="min-h-0 overflow-y-auto border-r border-white/8 bg-surface-900/60 p-4">
      <div className="mb-3 rounded-lg border border-white/8 bg-surface-900 p-3">
        <p className="text-xs text-zinc-500">{t("chat.currentAgent")}</p>
        <select className="mt-2 h-8 w-full rounded-lg border border-white/8 bg-surface-950 px-2 text-xs text-zinc-200">
          {agents.map((agent) => <option key={agent.id}>{agent.name}</option>)}
        </select>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-200">{t("chat.sessions")}</h2>
        <div className="flex gap-2">
          <button className="rounded-lg border border-white/8 px-3 py-1.5 text-xs font-medium text-zinc-200" onClick={onClearSession} type="button">
            {t("chat.clear")}
          </button>
          <button className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-surface-950" onClick={onNewSession} type="button">
            {t("common.new")}
          </button>
        </div>
      </div>
      <input
        className="mb-3 h-9 w-full rounded-lg border border-white/8 bg-surface-950 px-3 text-xs text-zinc-100 outline-none placeholder:text-zinc-600"
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t("chat.searchSessions")}
        value={query}
      />
      <SessionSwitcher sessions={visibleSessions} onSelectSession={onSelectSession} />
      <button className="mb-3 w-full rounded-lg border border-white/8 px-3 py-2 text-xs text-zinc-300" onClick={onOpenChannels} type="button">{t("chat.openChannels")}</button>
      <div className="space-y-2">
        {Object.entries(grouped).map(([group, groupSessions]) => (
          <div key={group}>
            <p className="mb-2 mt-3 text-xs text-zinc-500">{group}</p>
            {groupSessions.map((session) => (
          <div
            key={session.id}
            className={`w-full rounded-lg border p-3 text-left transition ${
              activeSessionId === session.id
                ? "border-white/50 bg-surface-850"
                : "border-white/8 bg-surface-900 hover:bg-surface-850"
            }`}
          >
            <button className="w-full text-left" onClick={() => onSelectSession(session)} type="button">
              <p className="truncate text-sm text-zinc-200">{session.title}</p>
              <p className="mt-1 truncate text-xs text-zinc-500">{session.model}</p>
            </button>
            {session.messages.length > 20 ? <p className="mt-2 rounded bg-yellow-500/10 px-2 py-1 text-xs text-yellow-200">{t("chat.longSessionHint")}</p> : null}
            <div className="mt-2 flex gap-3">
              <button className="text-xs text-zinc-400 hover:text-zinc-100" onClick={() => onRenameSession(session.id, prompt(t("chat.renamePrompt"), session.title) ?? session.title)} type="button"><Pencil className="mr-1 inline" size={12} />{t("chat.rename")}</button>
              <button className="text-xs text-zinc-400 hover:text-zinc-100" onClick={() => onExportSession(session.id)} type="button"><Download className="mr-1 inline" size={12} />{t("common.export")}</button>
              <button className="text-xs text-red-300 hover:text-red-200" onClick={() => onDeleteSession(session.id)} type="button">{t("common.delete")}</button>
            </div>
          </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

function SessionSwitcher({ onSelectSession, sessions }: { sessions: ChatSession[]; onSelectSession: (session: ChatSession) => void }) {
  return (
    <select className="mb-3 h-9 w-full rounded-lg border border-white/8 bg-surface-950 px-2 text-xs text-zinc-200" onChange={(event) => {
      const session = sessions.find((item) => item.id === event.target.value);
      if (session) onSelectSession(session);
    }}>
      <option value="">{t("chat.quickSwitch")}</option>
      {sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}
    </select>
  );
}

function WorkspaceCompanionRail({ activeSession, onOpenDesk }: { activeSession: ChatSession | null; onOpenDesk: () => void }) {
  return (
    <aside className="flex flex-col items-center gap-3 border-l border-white/8 bg-surface-900/60 p-3">
      <button className="zy-icon-button" onClick={onOpenDesk} title={t("chat.openDesk")} type="button"><LayoutDashboard size={16} /></button>
      <div className="mt-2 writing-vertical text-[10px] text-zinc-500">{activeSession ? `${activeSession.messages.length} msgs` : "idle"}</div>
    </aside>
  );
}

function groupSessions(sessions: ChatSession[]): Record<string, ChatSession[]> {
  const groups: Record<string, ChatSession[]> = {};
  const today = new Date().toDateString();
  for (const session of sessions) {
    const date = new Date(session.updatedAt);
    const key = date.toDateString() === today ? t("chat.today") : t("chat.earlier");
    groups[key] = groups[key] ?? [];
    groups[key].push(session);
  }
  return groups;
}

function ProviderSettings({
  configs,
  onSaved,
  open,
  providers
}: {
  configs: ProviderKeyConfig[];
  onSaved: (configs: ProviderKeyConfig[]) => void;
  open: boolean;
  providers: ProviderDescriptor[];
}) {
  const [draft, setDraft] = useState<Record<string, ProviderKeyConfig>>({});
  const [saveState, setSaveState] = useState<Record<string, "idle" | "saving" | "saved" | "failed">>({});

  useEffect(() => {
    setDraft(
      Object.fromEntries(
        configs.map((config) => [
          config.providerId,
          {
            providerId: config.providerId,
            baseURL: config.baseURL
          }
        ])
      )
    );
  }, [configs]);

  async function handleSave(providerId: string, value: ProviderKeyConfig) {
    setSaveState((current) => ({ ...current, [providerId]: "saving" }));

    try {
      const nextConfigs = await window.zhiyuan?.saveProviderConfig(value);
      if (!nextConfigs) {
        throw new Error("IPC not ready");
      }

      onSaved(nextConfigs);
      setSaveState((current) => ({ ...current, [providerId]: "saved" }));
    } catch {
      setSaveState((current) => ({ ...current, [providerId]: "failed" }));
    }
  }

  const content = useMemo(() => {
    if (!open) {
      return <div className="border-l border-white/8 bg-surface-900/60" />;
    }

    const visibleProviders = providers.filter((provider) => provider.id === "deepseek");

    return (
      <aside className="min-h-0 overflow-y-auto border-l border-white/8 bg-surface-900/60 px-4 pb-8">
        <div className="sticky top-0 z-10 border-b border-white/8 bg-surface-900/95 py-4">
          <h2 className="text-sm font-medium text-zinc-200">{t("provider.deepseekKey")}</h2>
          <p className="mt-1 text-xs text-zinc-500">{t("provider.deepseekHint")}</p>
        </div>
        <div className="space-y-3 py-4">
          {visibleProviders.map((provider) => {
            const value = draft[provider.id] ?? { providerId: provider.id };
            const savedConfig = configs.find((config) => config.providerId === provider.id);
            const status = saveState[provider.id] ?? "idle";
            const canSave = status !== "saving";

            return (
              <form
                className="rounded-lg border border-white/8 bg-surface-900 p-3"
                key={provider.id}
                onSubmit={async (event) => {
                  event.preventDefault();
                  await handleSave(provider.id, value);
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-sm text-zinc-200">{provider.name}</p>
                  {savedConfig?.apiKeyMasked ? (
                    <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-xs text-brand-500">{t("common.saved")}</span>
                  ) : (
                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-200">{t("common.unsaved")}</span>
                  )}
                  {status === "saved" ? <span className="text-xs text-brand-500">{t("common.saveSuccess")}</span> : null}
                  {status === "failed" ? <span className="text-xs text-red-300">{t("common.saveFailed")}</span> : null}
                </div>
                <p className="mb-2 text-xs leading-5 text-zinc-500">{t("provider.noKeyBackfill")}</p>
                <div className="mb-2 flex gap-2">
                  <input
                    className="h-9 min-w-0 flex-1 rounded-lg border border-white/8 bg-surface-950 px-3 text-xs text-zinc-100 outline-none"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [provider.id]: { ...value, apiKey: event.target.value }
                      }))
                    }
                    placeholder={
                      savedConfig?.apiKeyMasked
                        ? t("provider.savedPlaceholder", { key: savedConfig.apiKeyMasked })
                        : `${provider.envKey ?? provider.id.toUpperCase()} API Key`
                    }
                    type="password"
                  />
                  <button
                    className="h-9 shrink-0 rounded-lg bg-white px-3 text-xs font-medium text-surface-950 disabled:cursor-wait disabled:opacity-60"
                    disabled={!canSave}
                    type="submit"
                  >
                    {status === "saving" ? t("common.saving") : t("common.save")}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="h-9 min-w-0 flex-1 rounded-lg border border-white/8 bg-surface-950 px-3 text-xs text-zinc-100 outline-none"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [provider.id]: { ...value, baseURL: event.target.value }
                      }))
                    }
                    placeholder={provider.baseURL}
                    type="text"
                    value={value.baseURL ?? ""}
                  />
                  <button
                    className="h-9 shrink-0 rounded-lg border border-white/8 px-3 text-xs font-medium text-zinc-200 disabled:cursor-wait disabled:opacity-60"
                    disabled={!canSave}
                    type="submit"
                  >
                    {status === "saving" ? t("common.saving") : t("common.save")}
                  </button>
                </div>
              </form>
            );
          })}
        </div>
      </aside>
    );
  }, [draft, open, providers, saveState]);

  return content;
}

function upsertToolCall(toolCalls: VisibleToolCall[], toolCall: VisibleToolCall): VisibleToolCall[] {
  const index = toolCalls.findIndex((item) => item.id === toolCall.id);
  if (index === -1) {
    return [...toolCalls, toolCall];
  }

  return toolCalls.map((item, itemIndex) => (itemIndex === index ? toolCall : item));
}

function sortDeepSeekFirst(models: ModelOption[]): ModelOption[] {
  return [...models].sort((left, right) => {
    if (left.providerId === "deepseek") {
      return -1;
    }

    if (right.providerId === "deepseek") {
      return 1;
    }

    return left.label.localeCompare(right.label, "zh-CN");
  });
}
