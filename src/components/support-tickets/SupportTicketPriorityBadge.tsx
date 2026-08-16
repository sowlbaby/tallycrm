import { StatusBadge, type StatusTone } from "@/components/common";
import type { SupportTicketPriority } from "@/lib/support-tickets-data";

const PRIORITY_TONES: Record<string, { tone: StatusTone; label: string; icon: string }> = {
  low: { tone: "neutral", label: "Low", icon: "arrow_downward" },
  normal: { tone: "info", label: "Normal", icon: "remove" },
  high: { tone: "warning", label: "High", icon: "arrow_upward" },
  urgent: { tone: "danger", label: "Urgent", icon: "priority_high" },
};

export function SupportTicketPriorityBadge({
  priority,
}: {
  priority: SupportTicketPriority | string;
}) {
  const config = PRIORITY_TONES[priority] ?? PRIORITY_TONES.normal;
  return (
    <StatusBadge
      tone={config.tone}
      icon={<span className="material-symbols-outlined text-[14px]">{config.icon}</span>}
    >
      {config.label}
    </StatusBadge>
  );
}
