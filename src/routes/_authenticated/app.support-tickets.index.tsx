import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common";
import { CrmToolbar, PageHeader, ToolbarButton } from "@/components/layout";
import { AddSupportTicketModal } from "@/components/support-tickets/AddSupportTicketModal";
import { SupportTicketPriorityBadge } from "@/components/support-tickets/SupportTicketPriorityBadge";
import { SupportTicketStatusBadge } from "@/components/support-tickets/SupportTicketStatusBadge";
import { formatDateOnly } from "@/lib/format";
import { supportTicketCustomerName, useSupportTickets } from "@/lib/support-tickets-data";

export const Route = createFileRoute("/_authenticated/app/support-tickets/")({
  component: SupportTicketsIndex,
});

type SupportTicketSort = "recent" | "priority" | "customer";

const PRIORITY_RANK: Record<string, number> = { low: 0, normal: 1, high: 2, urgent: 3 };

function SupportTicketsIndex() {
  const { data, isLoading, isError, error, refetch } = useSupportTickets();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SupportTicketSort>("recent");
  const [addOpen, setAddOpen] = useState(false);

  const tickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = (data ?? []).filter((ticket) => {
      const searchMatch =
        !query ||
        [
          ticket.ticket_number,
          ticket.subject,
          ticket.description,
          supportTicketCustomerName(ticket),
          ticket.assigned_rep?.full_name,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query));
      return (
        searchMatch &&
        (statusFilter === "all" || ticket.status === statusFilter) &&
        (priorityFilter === "all" || ticket.priority === priorityFilter)
      );
    });

    return list.sort((a, b) => {
      if (sortKey === "priority") {
        return (
          PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
          rank(b.opened_at) - rank(a.opened_at)
        );
      }
      if (sortKey === "customer") {
        return supportTicketCustomerName(a).localeCompare(supportTicketCustomerName(b));
      }
      return rank(b.opened_at) - rank(a.opened_at);
    });
  }, [data, priorityFilter, search, sortKey, statusFilter]);

  const activeCount = (data ?? []).filter(
    (ticket) => ticket.status !== "resolved" && ticket.status !== "closed",
  ).length;
  const urgentCount = (data ?? []).filter(
    (ticket) => ticket.priority === "urgent" && ticket.status !== "closed",
  ).length;
  const resolvedCount = (data ?? []).filter((ticket) => ticket.status === "resolved").length;

  return (
    <>
      <PageHeader
        title="Support Tickets"
        count={data?.length}
        actions={
          <>
            <ToolbarButton icon="refresh" onClick={() => refetch()}>
              Refresh
            </ToolbarButton>
            <ToolbarButton
              icon="confirmation_number"
              variant="cta"
              onClick={() => setAddOpen(true)}
            >
              New Ticket
            </ToolbarButton>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Active" value={String(activeCount)} icon="support_agent" />
        <StatTile label="Urgent" value={String(urgentCount)} icon="priority_high" />
        <StatTile label="Resolved" value={String(resolvedCount)} icon="task_alt" />
      </div>

      <CrmToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by ticket, subject, customer, or assignee..."
        filters={[
          {
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "open", label: "Open" },
              { value: "in_progress", label: "In progress" },
              { value: "waiting_on_customer", label: "Waiting on customer" },
              { value: "resolved", label: "Resolved" },
              { value: "closed", label: "Closed" },
            ],
          },
          {
            label: "Priority",
            value: priorityFilter,
            onChange: setPriorityFilter,
            options: [
              { value: "low", label: "Low" },
              { value: "normal", label: "Normal" },
              { value: "high", label: "High" },
              { value: "urgent", label: "Urgent" },
            ],
          },
        ]}
        sort={{
          value: sortKey,
          onChange: (value) => setSortKey(value as SupportTicketSort),
          options: [
            { value: "recent", label: "Recently opened" },
            { value: "priority", label: "Highest priority" },
            { value: "customer", label: "Customer name" },
          ],
        }}
      />

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : isError ? (
        <ErrorState
          description={(error as Error)?.message ?? "Could not load support tickets"}
          onRetry={() => refetch()}
        />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<span className="material-symbols-outlined text-[28px]">support_agent</span>}
          title="No support tickets yet"
          description="Create a ticket when a customer reports a post-sale problem."
          action={
            <button
              onClick={() => setAddOpen(true)}
              className="rounded-lg bg-cta px-4 py-2 text-sm font-semibold text-cta-foreground"
            >
              Create Ticket
            </button>
          }
        />
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={<span className="material-symbols-outlined text-[28px]">search_off</span>}
          title="No tickets match your filters"
          description="Adjust the search, status, or priority filter to widen the result set."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-[11px] uppercase tracking-wide text-text-secondary">
                  <th className="px-4 py-3 text-left font-semibold">Ticket</th>
                  <th className="px-4 py-3 text-left font-semibold">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Assigned to</th>
                  <th className="px-4 py-3 text-left font-semibold">Opened</th>
                  <th className="px-4 py-3 text-right font-semibold">Comments</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="border-b border-border/70 hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link
                        to="/app/support-tickets/$id"
                        params={{ id: ticket.id }}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {ticket.ticket_number}
                      </Link>
                      <p className="mt-0.5 max-w-xs truncate font-semibold text-foreground">
                        {ticket.subject}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {supportTicketCustomerName(ticket)}
                    </td>
                    <td className="px-4 py-3">
                      <SupportTicketPriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <SupportTicketStatusBadge status={ticket.status} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {ticket.assigned_rep?.full_name ?? "Unassigned"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatDateOnly(ticket.opened_at)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {ticket.comment_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddSupportTicketModal open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

function StatTile({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light text-primary">
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          {label}
        </p>
        <p className="text-[16px] font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function rank(value: string | null | undefined) {
  return value ? new Date(value).getTime() : 0;
}
