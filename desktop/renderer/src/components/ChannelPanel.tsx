import { Plus, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Channel, ChannelMessage } from "../../../../shared/types";
import { t } from "../i18n";

export function ChannelPanel() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [text, setText] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (active) void window.zhiyuan?.listChannelMessages(active.id).then(setMessages);
  }, [active?.id]);

  async function refresh() {
    const next = (await window.zhiyuan?.listChannels()) ?? [];
    setChannels(next);
    setActive((current) => current ?? next[0] ?? null);
  }

  async function send() {
    if (!active || !text.trim()) return;
    const message = await window.zhiyuan?.postChannelMessage(active.id, text.trim());
    if (message) setMessages((current) => [...current, message]);
    setText("");
  }

  async function remove(channel: Channel) {
    await window.zhiyuan?.deleteChannel(channel.id);
    await refresh();
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-surface-950">
      <ChannelTab channels={channels} activeId={active?.id} onCreate={() => setCreateOpen(true)} onSelect={setActive} />
      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] overflow-hidden">
        <ChannelList channels={channels} activeId={active?.id} onCreate={() => setCreateOpen(true)} onDelete={remove} onSelect={setActive} />
        <div className="flex min-h-0 flex-col">
          <ChannelHeader channel={active} />
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {messages.map((message) => (
              <div className="mb-3 rounded-lg border border-white/8 bg-surface-900 p-3" key={message.id}>
                <p className="text-xs text-zinc-500">{message.author} · {new Date(message.createdAt).toLocaleString()}</p>
                <p className="mt-1 text-sm text-zinc-200">{message.content}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t border-white/8 p-4">
            <input className="zy-input" value={text} onChange={(event) => setText(event.target.value)} placeholder={active?.dm ? t("channel.sendDm") : t("channel.sendMessage")} />
            <button className="zy-icon-button h-10 w-10" onClick={send} type="button"><Send size={16} /></button>
          </div>
        </div>
      </div>
      {createOpen ? <ChannelCreateOverlay onClose={() => setCreateOpen(false)} onCreated={(channel) => { setChannels((current) => [channel, ...current]); setActive(channel); setCreateOpen(false); }} /> : null}
    </section>
  );
}

export function ChannelTab({ activeId, channels, onCreate, onSelect }: { channels: Channel[]; activeId?: string; onSelect: (channel: Channel) => void; onCreate: () => void }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-white/8 px-4">
      {channels.slice(0, 8).map((channel) => (
        <button className={`rounded-lg px-3 py-1.5 text-xs ${channel.id === activeId ? "bg-white text-surface-950" : "text-zinc-400 hover:bg-white/8"}`} key={channel.id} onClick={() => onSelect(channel)} type="button">
          {channel.dm ? t("channel.dm") : "#"} {channel.name}
        </button>
      ))}
      <button className="zy-icon-button" onClick={onCreate} type="button"><Plus size={14} /></button>
    </div>
  );
}

export function ChannelList({ activeId, channels, onCreate, onDelete, onSelect }: { channels: Channel[]; activeId?: string; onSelect: (channel: Channel) => void; onCreate: () => void; onDelete: (channel: Channel) => void }) {
  return (
    <aside className="min-h-0 overflow-y-auto border-r border-white/8 bg-surface-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-200">{t("channel.title")}</h2>
        <button className="zy-icon-button" onClick={onCreate} type="button"><Plus size={14} /></button>
      </div>
      {channels.map((channel) => (
        <div className={`mb-2 rounded-lg border p-3 ${channel.id === activeId ? "border-brand-500 bg-surface-850" : "border-white/8 bg-surface-900"}`} key={channel.id}>
          <button className="w-full text-left" onClick={() => onSelect(channel)} type="button">
            <p className="truncate text-sm text-zinc-200">{channel.dm ? "DM " : "# "}{channel.name}</p>
            <p className="mt-1 truncate text-xs text-zinc-500">{channel.topic ?? t("channel.members", { count: channel.members.length })}</p>
          </button>
          <button className="mt-2 text-xs text-red-300" onClick={() => onDelete(channel)} type="button"><Trash2 className="mr-1 inline" size={12} />{t("channel.delete")}</button>
        </div>
      ))}
    </aside>
  );
}

export function ChannelHeader({ channel }: { channel: Channel | null }) {
  return (
    <header className="h-14 shrink-0 border-b border-white/8 px-5 py-3">
      <h2 className="text-sm font-medium text-zinc-100">{channel ? `${channel.dm ? t("channel.dm") : "#"} ${channel.name}` : t("channel.select")}</h2>
      <p className="text-xs text-zinc-500">{channel?.topic ?? t("channel.localHint")}</p>
    </header>
  );
}

export function ChannelCreateOverlay({ onClose, onCreated }: { onClose: () => void; onCreated: (channel: Channel) => void }) {
  const [name, setName] = useState("general");
  const [topic, setTopic] = useState("");
  const [dm, setDm] = useState(false);
  async function create() {
    const channel = await window.zhiyuan?.createChannel({ name, topic, dm });
    if (channel) onCreated(channel);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5">
      <section className="w-full max-w-sm rounded-lg border border-white/10 bg-surface-950 p-5">
        <h2 className="mb-4 text-base font-medium text-zinc-100">{t("channel.createTitle")}</h2>
        <input className="zy-input mb-3" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("channel.namePlaceholder")} />
        <input className="zy-input mb-3" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={t("channel.topicPlaceholder")} />
        <label className="mb-4 flex items-center gap-2 text-sm text-zinc-300"><input checked={dm} onChange={(event) => setDm(event.target.checked)} type="checkbox" /> {t("channel.dmLabel")}</label>
        <div className="flex gap-2">
          <button className="h-9 flex-1 rounded-lg border border-white/10 text-sm text-zinc-300" onClick={onClose} type="button">{t("common.cancel")}</button>
          <button className="h-9 flex-1 rounded-lg bg-white text-sm font-medium text-surface-950" onClick={create} type="button">{t("common.create")}</button>
        </div>
      </section>
    </div>
  );
}
