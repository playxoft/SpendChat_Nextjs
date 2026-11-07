import Link from "next/link";
import { siteConfig } from "@/lib/site";

/**
 * Building blocks shared by the legal pages (Terms, Privacy, Cookies), so the
 * long documents read the same and each one stays mostly prose. Server
 * components only — nothing here needs the browser.
 */

const linkClass = "text-foreground underline underline-offset-4 hover:no-underline";

export function LegalPage({
  title,
  updated,
  intro,
  toc,
  inShort = false,
  children,
}: {
  title: string;
  updated: string;
  intro?: React.ReactNode;
  /** Section anchors for the contents list; omit for a short page. */
  toc?: { id: string; title: string }[];
  /** The page's sections carry "In short" summaries — say what they are, once. */
  inShort?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: {updated}</p>
      {inShort && <InShortNote />}
      {intro && <div className="mt-8 space-y-3 text-muted-foreground">{intro}</div>}
      {toc && (
        <nav aria-label="Contents" className="mt-8 rounded-xl border bg-card p-5">
          <p className="text-sm font-medium text-foreground">Contents</p>
          <ol className="mt-3 grid list-decimal gap-x-8 gap-y-1.5 pl-5 text-sm text-muted-foreground sm:grid-cols-2">
            {toc.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="hover:text-foreground hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="mt-10 space-y-10 text-muted-foreground">{children}</div>
    </div>
  );
}

/** Says once, near the top, what the "In short" notes are — and that they aren't the rule. */
export function InShortNote() {
  return (
    <p className="mt-6 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
      Look for the <span className="font-medium text-foreground">In short</span> notes —
      plain-words summaries to help you read. The full text under each one is what counts.
    </p>
  );
}

/** A section's "In short" box: one or two friendly sentences under its heading. */
export function InShort({ children }: { children: React.ReactNode }) {
  return (
    <aside aria-label="In short" className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
      <span className="font-medium text-foreground">In short: </span>
      <span className="text-muted-foreground">{children}</span>
    </aside>
  );
}

export function LegalSection({
  id,
  title,
  summary,
  children,
}: {
  id: string;
  title: string;
  /** "In short": one or two friendly sentences — a reading aid, never the rule. */
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <h2 className="text-xl font-medium text-foreground">{title}</h2>
      {summary && <InShort>{summary}</InShort>}
      {children}
    </section>
  );
}

export function LegalSubsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 pt-1">
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>;
}

/** A term in bold, then its explanation — for definition-style list items. */
export function Term({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

export function LegalTable({
  head,
  rows,
  minWidth = "36rem",
}: {
  head: string[];
  rows: React.ReactNode[][];
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b bg-muted/40">
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium text-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60 align-top last:border-b-0">
              {row.map((cell, j) => (
                <td key={j} className={j === 0 ? "px-3 py-2 text-foreground" : "px-3 py-2"}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A link to another page of this site. */
export function In({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={linkClass}>
      {children}
    </Link>
  );
}

/** A link off-site, opened in a new tab. */
export function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {children}
    </a>
  );
}

/** The support address as a mailto link. */
export function SupportEmail() {
  return (
    <a href={`mailto:${siteConfig.supportEmail}`} className={linkClass}>
      {siteConfig.supportEmail}
    </a>
  );
}

/**
 * "Nitheesh, at support@playxoft.com (with “Grievance” in the subject line)" —
 * the Grievance Officer India's IT Rules and DPDP Act ask us to name.
 */
export function GrievanceOfficer() {
  const { name, email } = siteConfig.grievanceOfficer;
  return (
    <>
      {name}, at{" "}
      <a href={`mailto:${email}?subject=Grievance`} className={linkClass}>
        {email}
      </a>{" "}
      (with “Grievance” in the subject line)
    </>
  );
}
