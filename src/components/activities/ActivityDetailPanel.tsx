import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type ActivityItem, canEditActivity, useCompleteActivityItem } from "@/lib/activities-data";
import { formatCurrency, formatRelative } from "@/lib/format";

interface ActivityDetailPanelProps {
  item: ActivityItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActivityDetailPanel({ item, open, onOpenChange }: ActivityDetailPanelProps) {
  const completeItem = useCompleteActivityItem();
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setOutcome(item?.outcome ?? item?.notes ?? "");
    setError("");
  }, [item]);

  async function markComplete() {
    if (!item) return;
    const value = outcome.trim();
    if (!value) {
      setError("Outcome is required before completing this activity.");
      return;
    }
    await completeItem.mutateAsync({ item, outcome: value });
    onOpenChange(false);
  }

  return (
    <>
      <div
        onClick={() => onOpenChange(false)}
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[400px] flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {item ? (
          <>
            <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenChange(false)}
                  className="rounded-full p-1 text-text-secondary transition-colors hover:bg-muted"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
                <span className="text-xs font-semibold text-text-secondary">Activity Details</span>
              </div>
              {item.type !== "document" ? (
                <div className="flex gap-1">
                  <button
                    disabled={!canEditActivity(item)}
                    className="rounded-full p-1 text-text-secondary transition-colors hover:bg-muted disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined">edit</span>
                  </button>
                  <button className="rounded-full p-1 text-text-secondary transition-colors hover:bg-muted">
                    <span className="material-symbols-outlined">more_vert</span>
                  </button>
                </div>
              ) : null}
            </header>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <div className="space-y-2">
                <span
                  className={`inline-flex items-center rounded px-2 py-1 text-[11px] font-bold uppercase ${typeTone(
                    item.type,
                  )}`}
                >
                  <span className="material-symbols-outlined mr-1 text-[14px]">
                    {typeIcon(item.type)}
                  </span>
                  {typeLabel(item)}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${statusTone(item.status)}`}
                  >
                    {item.type === "document" ? "logged" : item.status.replace("_", " ")}
                  </span>
                  <span className="text-[11px] font-medium text-text-muted">
                    {item.type === "document"
                      ? "Immutable document history"
                      : item.status === "completed"
                        ? "Completed and locked once the outcome is recorded"
                        : item.status === "in_progress"
                          ? "Due date passed and still open"
                          : "Scheduled and pending"}
                  </span>
                </div>
                <h2 className="text-[24px] font-semibold leading-tight text-foreground">
                  {item.title}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-6 border-y border-border py-6">
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase text-text-muted">
                    {item.type === "document" ? "Logged At" : "Due Date"}
                  </p>
                  <div
                    className={`flex items-center gap-1 text-sm font-semibold ${
                      isOverdue(item) ? "text-danger" : "text-foreground"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                    {item.type === "document"
                      ? new Date(item.created_at).toLocaleString()
                      : formatDue(item.due_at)}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase text-text-muted">
                    {item.type === "document" ? "Actor" : "Owner"}
                  </p>
                  <div className="flex items-center gap-2">
                    <Avatar
                      label={
                        item.type === "document"
                          ? (item.actor?.full_name ?? "System")
                          : (item.owner?.full_name ?? "Unassigned")
                      }
                    />
                    <span className="text-sm font-semibold">
                      {item.type === "document"
                        ? (item.actor?.full_name ?? "System")
                        : (item.owner?.full_name ?? "Unassigned")}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase text-text-muted">Description</p>
                <p className="text-sm leading-relaxed text-text-secondary">
                  {item.notes || "No description has been added for this activity."}
                </p>
              </div>

              {item.type === "document" ? <DocumentSummary item={item} /> : null}

              <div className="space-y-4">
                <p className="text-[11px] font-bold uppercase text-text-muted">Related Records</p>
                {item.contact ? <ContactCard item={item} /> : null}
                {item.deal ? <DealCard item={item} /> : null}
                {item.type === "document" && item.document_id ? <DocumentCard item={item} /> : null}
                {!item.contact && !item.deal && !item.document_id ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-text-muted">
                    No contact or deal is linked.
                  </div>
                ) : null}
              </div>

              {item.type !== "document" ? (
                <label className="block space-y-2">
                  <span className="text-[11px] font-bold uppercase text-text-muted">
                    Outcome Notes
                  </span>
                  <textarea
                    disabled={item.locked}
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    className="h-[100px] w-full resize-none rounded-lg border border-border bg-card p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-muted disabled:text-text-muted"
                    placeholder="Write the activity outcome here..."
                  />
                  {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
                </label>
              ) : null}

              <div className="flex items-center gap-1 border-t border-border pt-4">
                <span className="material-symbols-outlined text-[16px] text-text-muted">
                  history
                </span>
                <p className="text-sm text-text-muted">
                  Created {formatRelative(item.created_at)}
                  {item.locked
                    ? item.type === "document"
                      ? " • Read-only event"
                      : " • Locked after grace window"
                    : ""}
                </p>
              </div>
            </div>

            {item.type !== "document" ? (
              <footer className="border-t border-border bg-card p-6 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
                <div className="flex gap-4">
                  <button
                    onClick={markComplete}
                    disabled={completeItem.isPending || item.locked || item.status === "completed"}
                    className="flex h-11 flex-1 items-center justify-center gap-1 rounded-lg bg-primary text-[16px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      check_circle
                    </span>
                    {item.status === "completed" ? "Completed" : "Mark Complete"}
                  </button>
                  <button className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted">
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </footer>
            ) : null}
          </>
        ) : null}
      </aside>
    </>
  );
}

function DocumentCard({ item }: { item: ActivityItem }) {
  const label =
    item.document_type === "quotation"
      ? "Quotation"
      : item.document_type === "invoice"
        ? "Invoice"
        : "Receipt";
  const content = (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary">
      <div>
        <p className="text-[11px] font-bold uppercase text-text-muted">{label}</p>
        <p className="mt-1 text-sm font-semibold text-foreground">Open related document</p>
      </div>
      <span className="material-symbols-outlined text-text-muted">open_in_new</span>
    </div>
  );

  if (item.document_type === "quotation") {
    return (
      <Link to="/app/quotes/$id" params={{ id: item.document_id! }}>
        {content}
      </Link>
    );
  }
  if (item.document_type === "invoice") {
    return (
      <Link to="/app/invoices/$id" params={{ id: item.document_id! }}>
        {content}
      </Link>
    );
  }
  return (
    <Link to="/app/receipts/$id" params={{ id: item.document_id! }}>
      {content}
    </Link>
  );
}

function DocumentSummary({ item }: { item: ActivityItem }) {
  if (!item.event_metadata || Array.isArray(item.event_metadata)) return null;
  const metadata = item.event_metadata as Record<string, unknown>;
  const currency = typeof metadata.currency === "string" ? metadata.currency : "GHS";
  const fields = [
    field("Previous status", metadata.from_status),
    field("New status", metadata.to_status ?? metadata.status),
    moneyField("Subtotal", metadata.subtotal, currency),
    moneyField("Discount", metadata.discount_amount, currency),
    moneyField("Tax", metadata.tax_amount, currency),
    moneyField("Total", metadata.total, currency),
    moneyField("Amount paid", metadata.amount_paid ?? metadata.amount, currency),
    moneyField("Balance", metadata.balance, currency),
    field("Payment method", metadata.payment_method),
    field("Reference", metadata.reference),
    field("Line items", metadata.line_count),
    field("Invoice", metadata.invoice_number),
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry));

  if (!fields.length) return null;
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase text-text-muted">Event Summary</p>
      <dl className="space-y-2 rounded-lg border border-border bg-muted p-4 text-sm">
        {fields.map((entry) => (
          <div key={entry.label} className="flex justify-between gap-4">
            <dt className="text-text-secondary">{entry.label}</dt>
            <dd className="text-right font-semibold text-foreground">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function field(label: string, value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return { label, value: String(value).replaceAll("_", " ") };
}

function moneyField(label: string, value: unknown, currency: string) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return { label, value: formatCurrency(amount, currency) };
}

function ContactCard({ item }: { item: ActivityItem }) {
  const contact = item.contact!;
  const name = `${contact.first_name} ${contact.last_name}`;
  return (
    <Link
      to="/app/contacts/$id"
      params={{ id: contact.id }}
      className="group flex items-start justify-between rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary"
    >
      <div className="flex gap-4">
        <Avatar label={name} large />
        <div>
          <h3 className="text-[16px] font-semibold text-foreground transition-colors group-hover:text-primary">
            {name}
          </h3>
          <p className="text-sm text-text-secondary">
            {contact.job_title ?? "Contact"}
            {item.company ? `, ${item.company.name}` : ""}
          </p>
        </div>
      </div>
      <span className="material-symbols-outlined text-text-muted group-hover:text-primary">
        open_in_new
      </span>
    </Link>
  );
}

function DealCard({ item }: { item: ActivityItem }) {
  const deal = item.deal!;
  return (
    <Link
      to="/app/deals/$id"
      params={{ id: deal.id }}
      className="group block rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary"
    >
      <div className="flex items-start justify-between">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light text-primary">
            <span className="material-symbols-outlined">payments</span>
          </div>
          <div>
            <h3 className="text-[16px] font-semibold text-foreground transition-colors group-hover:text-primary">
              {deal.name}
            </h3>
            <p className="text-sm text-text-secondary">
              {formatCurrency(Number(deal.value ?? 0), deal.currency ?? "USD")} • Closing{" "}
              {deal.expected_close_date
                ? new Date(deal.expected_close_date).toLocaleDateString()
                : "TBD"}
            </p>
          </div>
        </div>
        <span className="material-symbols-outlined text-text-muted group-hover:text-primary">
          open_in_new
        </span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full bg-primary" style={{ width: `${deal.probability ?? 50}%` }} />
      </div>
    </Link>
  );
}

function Avatar({ label, large = false }: { label: string; large?: boolean }) {
  const initials = label
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary-light font-bold text-primary ${
        large ? "h-10 w-10 rounded-lg text-sm" : "h-6 w-6 text-[10px]"
      }`}
    >
      {initials}
    </span>
  );
}

function typeLabel(item: ActivityItem) {
  if (item.type === "document") return item.document_type ?? "Document";
  if (item.type === "call") return "Outbound Call";
  if (item.type === "meeting") return "Meeting";
  if (item.type === "email") return "Email";
  if (item.type === "task") return "Task";
  return item.type;
}

function typeIcon(type: ActivityItem["type"]) {
  if (type === "call") return "call";
  if (type === "meeting") return "groups";
  if (type === "email") return "mail";
  if (type === "task") return "assignment";
  if (type === "demo") return "present_to_all";
  if (type === "proposal") return "description";
  if (type === "document") return "history_edu";
  return "edit_note";
}

function typeTone(type: ActivityItem["type"]) {
  if (type === "call") return "bg-green-100 text-green-700";
  if (type === "email") return "bg-amber-100 text-amber-700";
  if (type === "task") return "bg-orange-100 text-orange-700";
  if (type === "meeting") return "bg-primary-light text-primary";
  if (type === "document") return "bg-cyan-100 text-cyan-800";
  return "bg-secondary text-secondary-foreground";
}

function statusTone(status: ActivityItem["status"]) {
  if (status === "completed") return "bg-green-100 text-green-700";
  if (status === "in_progress") return "bg-amber-100 text-amber-700";
  return "bg-primary-light text-primary";
}

function isOverdue(item: ActivityItem) {
  return item.status !== "completed" && item.due_at && new Date(item.due_at).getTime() < Date.now();
}

function formatDue(dueAt: string | null) {
  if (!dueAt) return "No due date";
  const date = new Date(dueAt);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
