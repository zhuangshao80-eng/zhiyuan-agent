import { FilePlus, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import { DragEvent, useEffect, useMemo, useState } from "react";
import type { DeskFileNode } from "../../../../shared/types";
import { importDroppedTextFiles } from "../../../../lib/desk/desk-upload";
import { t } from "../i18n";

export function DeskPanel() {
  const [tree, setTree] = useState<DeskFileNode[]>([]);
  const [activePath, setActivePath] = useState("notes.md");
  const [content, setContent] = useState("");
  const [cronJobs, setCronJobs] = useState<any[]>([]);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setTree((await window.zhiyuan?.getDeskTree()) ?? []);
    setCronJobs((await window.zhiyuan?.listCronJobs()) ?? []);
  }

  async function openFile(filePath: string) {
    setActivePath(filePath);
    setContent((await window.zhiyuan?.readDeskFile(filePath)) ?? "");
  }

  async function save() {
    setTree((await window.zhiyuan?.writeDeskFile(activePath, content)) ?? []);
  }

  async function createFile() {
    const filePath = `note-${Date.now()}.md`;
    setActivePath(filePath);
    setContent(`# ${t("desk.newDoc")}\n`);
    setTree((await window.zhiyuan?.writeDeskFile(filePath, `# ${t("desk.newDoc")}\n`)) ?? []);
  }

  async function remove() {
    setTree((await window.zhiyuan?.deleteDeskFile(activePath)) ?? []);
    setContent("");
  }

  return (
    <section className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_320px] overflow-hidden bg-surface-950">
      <aside className="min-h-0 overflow-y-auto border-r border-white/8 bg-surface-900/60 p-4">
        <DeskToolbar onCreate={createFile} onDelete={remove} onRefresh={refresh} />
        <DeskDropZone
          existingNames={flattenFileNames(tree)}
          onImported={(nextTree, firstFile) => {
            setTree(nextTree);
            if (firstFile) void openFile(firstFile);
          }}
        />
        <DeskTree nodes={tree} onSelect={openFile} selectedPath={activePath} />
      </aside>
      <div className="flex min-h-0 flex-col">
        <DeskEditor content={content} filePath={activePath} onChange={setContent} onSave={save} />
      </div>
      <aside className="min-h-0 overflow-y-auto border-l border-white/8 bg-surface-900/60 p-4">
        <DeskCwdSkills />
        <CronJobManager jobs={cronJobs} onRefresh={refresh} />
      </aside>
    </section>
  );
}

export function DeskToolbar({ onCreate, onDelete, onRefresh }: { onCreate: () => void; onDelete: () => void; onRefresh: () => void }) {
  return (
    <div className="mb-3 flex gap-2">
      <button className="zy-icon-button" onClick={onCreate} title={t("desk.new")} type="button"><FilePlus size={14} /></button>
      <button className="zy-icon-button" onClick={onDelete} title={t("desk.delete")} type="button"><Trash2 size={14} /></button>
      <button className="zy-icon-button" onClick={onRefresh} title={t("desk.refresh")} type="button"><RefreshCw size={14} /></button>
    </div>
  );
}

export function DeskTree({ nodes, onSelect, selectedPath }: { nodes: DeskFileNode[]; selectedPath: string; onSelect: (path: string) => void }) {
  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <div key={node.path}>
          <button className={`w-full rounded-lg px-2 py-1.5 text-left text-xs ${selectedPath === node.path ? "bg-white text-surface-950" : "text-zinc-300 hover:bg-white/8"}`} onClick={() => node.type === "file" && onSelect(node.path)} type="button">
            {node.type === "directory" ? "▸" : "•"} {node.name}
          </button>
          {node.children ? <div className="ml-3"><DeskTree nodes={node.children} onSelect={onSelect} selectedPath={selectedPath} /></div> : null}
        </div>
      ))}
    </div>
  );
}

export function DeskEditor({ content, filePath, onChange, onSave }: { filePath: string; content: string; onChange: (value: string) => void; onSave: () => void }) {
  return (
    <>
      <header className="flex h-12 items-center justify-between border-b border-white/8 px-4">
        <span className="text-sm text-zinc-300">{filePath}</span>
        <button className="flex h-8 items-center gap-2 rounded-lg bg-white px-3 text-xs text-surface-950" onClick={onSave} type="button"><Save size={14} />{t("desk.save")}</button>
      </header>
      <textarea className="min-h-0 flex-1 resize-none bg-surface-950 p-5 font-mono text-sm leading-6 text-zinc-100 outline-none" value={content} onChange={(event) => onChange(event.target.value)} />
    </>
  );
}

export function DeskCwdSkills() {
  return (
    <section className="mb-4 rounded-lg border border-white/10 bg-surface-900 p-3">
      <h3 className="text-sm font-medium text-zinc-200">{t("desk.cwdSkills")}</h3>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400"><span>Markdown</span><span>{t("desk.fileOrganize")}</span><span>{t("desk.cronSkill")}</span></div>
    </section>
  );
}

export function DeskDropZone({ existingNames, onImported }: { existingNames: string[]; onImported: (tree: DeskFileNode[], firstFile?: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState(t("desk.dropZone"));
  const existing = useMemo(() => existingNames, [existingNames]);

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) {
      setStatus(t("desk.noFiles"));
      return;
    }

    const result = await importDroppedTextFiles(
      files.map((file) => ({ name: file.name, type: file.type, text: () => file.text() })),
      async (filePath, content) => (await window.zhiyuan?.writeDeskFile(filePath, content)) ?? [],
      existing
    );

    if (result.imported.length > 0) {
      onImported(result.tree, result.imported[0]);
    }
    setStatus(
      [
        result.imported.length ? t("desk.uploaded", { files: result.imported.join(", ") }) : "",
        result.rejected.length ? t("desk.failed", { files: result.rejected.map((item) => `${item.name}(${item.reason})`).join("; ") }) : ""
      ]
        .filter(Boolean)
        .join("; ") || t("desk.noImport")
    );
  }

  return (
    <div
      className={`mb-3 rounded-lg border border-dashed p-3 text-center text-xs transition ${
        dragging ? "border-brand-500 bg-brand-500/10 text-brand-300" : "border-white/15 text-zinc-500"
      }`}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDrop={handleDrop}
    >
      <Upload className="mx-auto mb-1" size={16} />
      {dragging ? t("desk.dropRelease") : status}
    </div>
  );
}

export function CronJobManager({ jobs, onRefresh }: { jobs: any[]; onRefresh: () => void }) {
  const [name, setName] = useState(t("cron.newName"));
  async function create() {
    await window.zhiyuan?.upsertCronJob({ name, schedule: "every 1m", task: name });
    onRefresh();
  }
  return (
    <section className="rounded-lg border border-white/10 bg-surface-900 p-3">
      <h3 className="mb-3 text-sm font-medium text-zinc-200">{t("cron.title")}</h3>
      <div className="mb-3 flex gap-2">
        <input className="zy-input h-8 text-xs" value={name} onChange={(event) => setName(event.target.value)} />
        <button className="h-8 rounded-lg bg-white px-2 text-xs text-surface-950" onClick={create} type="button">{t("common.create")}</button>
      </div>
      {jobs.map((job) => (
        <div className="mb-2 rounded-lg border border-white/8 p-2" key={job.id}>
          <p className="truncate text-xs text-zinc-200">{job.name}</p>
          <p className="text-xs text-zinc-500">{job.schedule}</p>
          <div className="mt-2 flex gap-2">
            <button className="text-xs text-brand-300" onClick={async () => { await window.zhiyuan?.toggleCronJob(job.id, !job.enabled); onRefresh(); }} type="button">{job.enabled ? t("common.disable") : t("common.enable")}</button>
            <button className="text-xs text-red-300" onClick={async () => { await window.zhiyuan?.deleteCronJob(job.id); onRefresh(); }} type="button">{t("common.delete")}</button>
          </div>
        </div>
      ))}
    </section>
  );
}

function flattenFileNames(nodes: DeskFileNode[]): string[] {
  return nodes.flatMap((node) => (node.type === "file" ? [node.path] : flattenFileNames(node.children ?? [])));
}
