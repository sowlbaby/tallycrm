import { StatusBadge, type StatusTone } from "@/components/common";
import type { SupportTicketStatus } from "@/lib/support-tickets-data";

const STATUS_TONES: Record<string, { tone: StatusTone; label: string; icon: string }> = {
  open: { tone: "info", label: "Open", icon: "markunread_mailbox" },
  in_progress: { tone: "warning", label: "In progress", icon: "pending_actions" },
  waiting_on_customer: { tone: "neutral", label: "Waiting on customer", icon: "hourglass_top" },
  resolved: { tone: "success", label: "Resolved", icon: "task_alt" },
  closed: { tone: "neutral", label: "Closed", icon: "lock" },
};

export function SupportTicketStatusBadge({ status }: { status: SupportTicketStatus | string }) {
  const config = STATUS_TONES[status] ?? STATUS_TONES.open;
  return (
    <StatusBadge
      tone={config.tone}
      icon={<span className="material-symbols-outlined text-[14px]">{config.icon}</span>}
    >
      {config.label}
    </StatusBadge>
  );
}
