import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CardSkeleton, ErrorState } from "@/components/common";
import { PageHeader } from "@/components/layout";
import { SupportTicketComments } from "@/components/support-tickets/SupportTicketComments";
import { SupportTicketPriorityBadge } from "@/components/support-tickets/SupportTicketPriorityBadge";
import { SupportTicketStatusBadge } from "@/components/support-tickets/SupportTicketStatusBadge";
import { useCurrentRole } from "@/lib/auth-context";
import { formatDateOnly, formatRelative } from "@/lib/format";
import {
  type SupportTicketPriority,
  type SupportTicketStatus,
  supportTicketCustomerName,
  useSupportTicket,
  useSupportTicketOptions,
  useUpdateSupportTicket,
} from "@/lib/support-tickets-data";

export const Route = createFileRoute("/_authenticated/app/support-tickets/$id")({
  component: SupportTicketDetailPage,
});

function SupportTicketDetailPage() {
  const { id } = Route.useParams();
  const { data: ticket, isLoading, isError, error, refetch } = useSupportTicket(id);
  const { data: options } = useSupportTicketOptions();
  const updateTicket = useUpdateSupportTicket();
  const role = useCurrentRole();
  const canManage = role === "admin" || role === "manager";

  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState<SupportTicketPriority>("normal");
  const [status, setStatus] = useState<SupportTicketStatus>("open");
  const [resolution, setResolution] = useState("");

  useEffect(() => {
    if (!ticket) return;
    setAssignedTo(ticket.assigned_to ?? "");
    setPriority(ticket.priority);
    setStatus(ticket.status);
    setResolution(ticket.resolution ?? "");
  }, [ticket]);

  if (isLoading) return <CardSkeleton />;
  if (isError || !ticket) {
    return (
      <ErrorState
        description={(error as Error)?.message ?? "Could not load this support ticket"}
        onRetry={() => refetch()}
      />
    );
  }

  async function saveWorkflow() {
    if ((status === "resolved" || status === "closed") && !resolution.trim()) {
      toast.error("Enter a resolution before resolving or closing the ticket");
      return;
    }
    try {
      await updateTicket.mutateAsync({
        id,
        patch: {
          assigned_to: assignedTo || null,
          priority,
          status,
          resolution: resolution.trim() || null,
        },
      });
      toast.success("Support ticket updated");
    } catch (err) {
      toast.error("Could not update the support ticket", { description: (err as Error).message });
    }
  }

  return (
    <>
      <PageHeader
        title={ticket.subject}
        breadcrumbs={[
          { label: "Support Tickets", to: "/app/support-tickets" },
          { label: ticket.ticket_number },
        ]}
      />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border border-border bg-card px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs text-text-muted">{ticket.ticket_number}</p>
              <h1 className="mt-1 text-[20px] font-semibold text-foreground">{ticket.subject}</h1>
              <p className="mt-1 text-sm text-text-secondary">
                {supportTicketCustomerName(ticket)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <SupportTicketPriorityBadge priority={ticket.priority} />
              <SupportTicketStatusBadge status={ticket.status} />
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Info label="Opened" value={formatDateOnly(ticket.opened_at)} />
            <Info label="Resolved" value={formatDateOnly(ticket.resolved_at)} />
            <Info label="Assigned to" value={ticket.assigned_rep?.full_name ?? "Unassigned"} />
            <Info label="Comments" value={String(ticket.comment_count)} />
          </dl>

          <div className="mt-6 border-t border-border pt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Description
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
              {ticket.description || "No description was provided."}
            </p>
          </div>

          <div className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
            <CustomerLink
              label="Company"
              name={ticket.company?.name}
              to={ticket.company?.id ? "/app/companies/$id" : undefined}
              id={ticket.company?.id}
            />
            <CustomerLink
              label="Contact"
              name={
                ticket.contact
                  ? `${ticket.contact.first_name} ${ticket.contact.last_name}`.trim()
                  : undefined
              }
              to={ticket.contact?.id ? "/app/contacts/$id" : undefined}
              id={ticket.contact?.id}
            />
          </div>

          {ticket.resolution ? (
            <div className="mt-6 rounded-lg border border-success/20 bg-success-light px-4 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-success">
                Resolution
              </h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {ticket.resolution}
              </p>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card px-6 py-5">
          <h2 className="text-[15px] font-semibold text-foreground">Workflow</h2>
          <p className="text-xs text-text-secondary">
            {canManage
              ? "Admins and managers can update ownership and progress."
              : "An admin or manager manages ticket workflow."}
          </p>

          {canManage ? (
            <div className="mt-4 space-y-4">
              <Field label="Assigned to">
                <select
                  value={assignedTo}
                  onChange={(event) => setAssignedTo(event.target.value)}
                  className="deal-input appearance-none"
                >
                  <option value="">Unassigned</option>
                  {(options?.profiles ?? []).map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name ?? "Unnamed user"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as SupportTicketPriority)}
                  className="deal-input appearance-none"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </Field>
              <Field label="Status">
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as SupportTicketStatus)}
                  className="deal-input appearance-none"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="waiting_on_customer">Waiting on customer</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
              <Field label="Resolution">
                <textarea
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                  className="min-h-24 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="Required when resolving or closing the ticket."
                />
              </Field>
              <button
                type="button"
                onClick={saveWorkflow}
                disabled={updateTicket.isPending}
                className="w-full rounded-lg bg-cta px-4 py-2 text-xs font-semibold text-cta-foreground hover:bg-cta-hover disabled:opacity-60"
              >
                {updateTicket.isPending ? "Saving..." : "Save workflow"}
              </button>
            </div>
          ) : (
            <dl className="mt-4 space-y-3 text-sm">
              <Info label="Assigned to" value={ticket.assigned_rep?.full_name ?? "Unassigned"} />
              <Info label="Priority" value={humanize(ticket.priority)} />
              <Info label="Status" value={humanize(ticket.status)} />
            </dl>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <SupportTicketComments ticketId={ticket.id} comments={ticket.comments} />

        <section className="rounded-xl border border-border bg-card">
          <header className="border-b border-border px-6 py-4">
            <h2 className="text-[16px] font-semibold text-foreground">Status history</h2>
          </header>
          {ticket.status_history.length ? (
            <ul className="divide-y divide-border">
              {ticket.status_history.map((entry) => (
                <li key={entry.id} className="px-6 py-3 text-sm">
                  <p className="text-text-secondary">
                    {entry.from_status ? `${humanize(entry.from_status)} → ` : ""}
                    <strong className="text-foreground">{humanize(entry.to_status)}</strong>
                  </p>
                  {entry.note ? (
                    <p className="mt-1 text-xs text-text-secondary">{entry.note}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-text-muted">{formatRelative(entry.changed_at)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 py-8 text-center text-sm text-text-muted">No status changes yet.</p>
          )}
        </section>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </dt>
      <dd className="mt-0.5 font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}

function CustomerLink({
  label,
  name,
  to,
  id,
}: {
  label: string;
  name?: string;
  to?: "/app/companies/$id" | "/app/contacts/$id";
  id?: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      {to && id ? (
        <Link
          to={to}
          params={{ id }}
          className="mt-1 inline-block text-sm font-semibold text-primary hover:underline"
        >
          {name}
        </Link>
      ) : (
        <p className="mt-1 text-sm text-text-muted">—</p>
      )}
    </div>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
