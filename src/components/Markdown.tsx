// A small, safe markdown renderer for guide notes.
// It builds React elements (never raw HTML), so a note can't inject scripts.
// Supports: paragraphs, "- "/"* " bullet lists, "1. " numbered lists, "## " headings,
// **bold**, *italic*, `code`, and [links](https://…) (https only).
import { Fragment, type ReactNode } from "react";

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul" | "ol"; items: string[] };

export function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };

  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const num = /^\d+[.)]\s+(.*)$/.exec(line);
    const head = /^#{1,6}\s+(.*)$/.exec(line);
    if (!line) {
      flush();
    } else if (head) {
      flush();
      blocks.push({ kind: "h", text: head[1] });
    } else if (bullet || num) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const text = (bullet ?? num)![1];
      const last = blocks[blocks.length - 1];
      if (last && last.kind === kind) last.items.push(text);
      else blocks.push({ kind, items: [text] });
    } else {
      // a plain line right after a list item continues that item
      const last = blocks[blocks.length - 1];
      if (!para.length && last && (last.kind === "ul" || last.kind === "ol") && /^\s/.test(raw)) {
        last.items[last.items.length - 1] += " " + line;
      } else {
        para.push(line);
      }
    }
  }
  flush();
  return blocks;
}

// URL part allows one level of balanced brackets, e.g. https://en.wikipedia.org/wiki/Nara_(city)
const URL_PART = String.raw`[^\s()]*(?:\([^\s()]*\)[^\s()]*)*`;
const LINK = new RegExp(String.raw`^\[([^\]]+)\]\((${URL_PART})\)$`);
const INLINE = new RegExp(String.raw`(\*\*[^*]+\*\*|` + "`[^`]+`" + String.raw`|\[[^\]]+\]\(${URL_PART}\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)`, "g");

export function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="rounded bg-neutral-badge px-1 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    const link = LINK.exec(part);
    if (link) {
      return /^https:\/\//i.test(link[2]) ? (
        <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-2">
          {link[1]}
        </a>
      ) : (
        <Fragment key={i}>{link[1]}</Fragment>
      );
    }
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_")))
      return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={`flex min-w-0 flex-col gap-2.5 text-sm leading-normal [overflow-wrap:anywhere] ${className}`}>
      {blocks.map((b, i) => {
        if (b.kind === "h") return <h3 key={i} className="text-[15px] font-semibold text-ink">{renderInline(b.text)}</h3>;
        if (b.kind === "p") return <p key={i} className="text-pretty">{renderInline(b.text)}</p>;
        const List = b.kind === "ul" ? "ul" : "ol";
        return (
          <List key={i} className={`flex flex-col gap-1.5 pl-5 ${b.kind === "ul" ? "list-disc" : "list-decimal"} marker:text-muted`}>
            {b.items.map((it, j) => (
              <li key={j} className="text-pretty">
                {renderInline(it)}
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
