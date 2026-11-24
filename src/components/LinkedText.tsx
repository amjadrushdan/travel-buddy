import { Fragment } from "react";

// Plain text with https links made clickable and shortened ("guest-app.guesty.com/…"),
// so long URLs in notes stay readable and never push past the card edge.
const URL_RE = /(https:\/\/[^\s]+)/g;

function shortUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname === "/" ? "" : "/…";
    return u.hostname.replace(/^www\./, "") + path;
  } catch {
    return raw;
  }
}

export function LinkedText({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.replace(/\r\n?/g, "\n").split(URL_RE);
  return (
    <p className={`min-w-0 whitespace-pre-line [overflow-wrap:anywhere] ${className}`}>
      {parts.map((part, i) => {
        if (!part.startsWith("https://")) return <Fragment key={i}>{part}</Fragment>;
        // keep sentence punctuation that follows a link outside the link
        const m = /^(.*?)([).,;:!?]*)$/.exec(part)!;
        return (
          <Fragment key={i}>
            <a href={m[1]} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-2">
              {shortUrl(m[1])} ↗
            </a>
            {m[2]}
          </Fragment>
        );
      })}
    </p>
  );
}
