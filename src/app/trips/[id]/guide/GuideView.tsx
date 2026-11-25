"use client";

import { useEffect, useState, useTransition } from "react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Markdown } from "@/components/Markdown";
import { Field, inputCls, SheetActions, SheetForm, useToast } from "@/components/ui";
import { CATEGORIES, categoryLabel, type Category, type Guide } from "@/lib/guides";
import { deleteGuide, saveGuide } from "./actions";

type Sheet = { mode: "new" } | { mode: "edit"; guide: Guide } | null;

export function GuideView({
  tripId,
  tripName,
  guides,
  canEdit,
}: {
  tripId: string;
  tripName: string;
  guides: Guide[];
  canEdit: boolean;
}) {
  const [cat, setCat] = useState<"all" | Category>("all");
  // Notes start closed; this phone remembers which ones you left open.
  const openKey = `tb-guide-open-${tripId}`;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const saved = localStorage.getItem(openKey);
      if (saved) setOpen(JSON.parse(saved));
    } catch {
      /* private mode */
    }
  }, [openKey]);
  function toggle(id: string) {
    setOpen((o) => {
      const next = { ...o };
      if (next[id]) delete next[id];
      else next[id] = true;
      try {
        localStorage.setItem(openKey, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  }
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useToast();

  // Only show pills for categories that have notes.
  const used = CATEGORIES.filter((c) => guides.some((g) => g.category === c.key));
  const shown = guides.filter((g) => cat === "all" || g.category === cat);

  return (
    <main data-two-col className="flex flex-col gap-4 pt-[calc(26px+env(safe-area-inset-top))] lg:pt-0">
      <div className="flex items-end justify-between gap-3 px-5">
        <div className="flex flex-col gap-1">
          <span className="label">{tripName} · shared notes</span>
          <h1 className="page-title">Guide</h1>
        </div>
        {canEdit && guides.length > 0 && (
          <button
            type="button"
            onClick={() => setSheet({ mode: "new" })}
            className="rounded-sm bg-ink px-3 py-[7px] text-[13px] font-semibold text-white"
          >
            + Add
          </button>
        )}
      </div>

      {used.length > 1 && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-0.5" role="tablist" aria-label="Categories">
          {[{ key: "all" as const, label: "All" }, ...used].map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={cat === c.key}
              onClick={() => setCat(c.key)}
              className={`flex flex-none items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${
                cat === c.key ? "border-ink bg-ink text-white" : "border-line bg-surface"
              }`}
            >
              {c.key !== "all" && <CategoryIcon category={c.key} size={15} />}
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Desktop: notes in two columns. */}
      <div className="flex flex-col gap-2.5 px-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        {guides.length === 0 && (
          <div className="flex flex-col gap-3 rounded-card lg:col-span-2 border-[1.5px] border-dashed border-line p-5 text-center">
            <span className="text-sm text-muted">No guide notes yet. Food spots, prayer places, transport tips, phrases…</span>
            {canEdit && (
              <button type="button" onClick={() => setSheet({ mode: "new" })} className="rounded-sm bg-ink p-[13px] text-[15px] font-semibold text-white">
                Add a note
              </button>
            )}
          </div>
        )}

        {shown.map((g) => {
          const isOpen = !!open[g.id];
          return (
            <article key={g.id} className="overflow-hidden rounded-card border border-line bg-surface">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(g.id)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-ink/[.02]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 flex-none items-center justify-center rounded-sm bg-bg text-ink">
                    <CategoryIcon category={g.category} size={22} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="label">{categoryLabel(g.category)}</span>
                    <span className="text-[17px] font-semibold text-pretty [overflow-wrap:anywhere]">{g.title}</span>
                  </span>
                </span>
                <span className="flex-none font-mono text-xl text-muted" aria-hidden>
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-3 border-t border-line px-4 pt-3 pb-4">
                  {g.body_md ? <Markdown text={g.body_md} className="text-muted" /> : <span className="text-sm text-muted">No details yet.</span>}
                  {canEdit && (
                    <button type="button" onClick={() => setSheet({ mode: "edit", guide: g })} className="self-start text-[13px] font-semibold">
                      Edit note
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {sheet && <GuideSheet tripId={tripId} sheet={sheet} defaultCat={cat === "all" ? "food" : cat} onClose={() => setSheet(null)} onDone={setToast} />}
      {toast}
    </main>
  );
}

function GuideSheet({
  tripId,
  sheet,
  defaultCat,
  onClose,
  onDone,
}: {
  tripId: string;
  sheet: NonNullable<Sheet>;
  defaultCat: Category;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const g = sheet.mode === "edit" ? sheet.guide : null;
  const [body, setBody] = useState(g?.body_md ?? "");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(fd: FormData) {
    setError(null);
    fd.set("body_md", body);
    start(async () => {
      const res = await saveGuide(tripId, g?.id ?? null, fd).catch(() => ({ error: "Couldn't reach the server. Are you offline?" }));
      if (res.error) setError(res.error);
      else {
        onClose();
        onDone(g ? "Note saved" : "Note added");
      }
    });
  }

  function remove() {
    if (!g) return;
    start(async () => {
      const res = await deleteGuide(tripId, g.id).catch(() => ({ error: "Couldn't reach the server. Are you offline?" }));
      if (res.error) setError(res.error);
      else {
        onClose();
        onDone("Note removed");
      }
    });
  }

  return (
    <SheetForm title={g ? "Edit note" : "Add note"} onClose={onClose} onSubmit={submit}>
      <div className="grid grid-cols-[1fr_1.5fr] gap-2.5">
        <Field label="Category">
          <select name="category" defaultValue={g?.category ?? defaultCat} className={inputCls}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input name="title" required maxLength={120} defaultValue={g?.title ?? ""} placeholder="Halal-friendly eating" className={inputCls} />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted">Note</span>
          <button type="button" onClick={() => setPreview((p) => !p)} className="text-xs font-semibold underline">
            {preview ? "Edit" : "Preview"}
          </button>
        </div>
        {preview ? (
          <div className="min-h-[160px] rounded-sm border border-line bg-surface p-3">
            {body.trim() ? <Markdown text={body} /> : <span className="text-sm text-muted">Nothing to preview.</span>}
          </div>
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            maxLength={10000}
            placeholder={"Look for the Muslim-friendly sticker.\n\n- Naritaya Asakusa — halal ramen\n- **Book ahead** for groups"}
            className={`${inputCls} resize-y font-mono text-sm`}
          />
        )}
        <span className="text-[11px] text-muted">Lines starting with “- ” become a list. **bold**, *italic*, [link](https://…)</span>
      </div>
      <SheetActions pending={pending} error={error} saveLabel={g ? "Save" : "Add note"} onDelete={g ? remove : undefined} />
    </SheetForm>
  );
}
