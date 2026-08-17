import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common";
import { AddCustomerFeedbackModal } from "@/components/customer-feedback/AddCustomerFeedbackModal";
import { CrmToolbar, PageHeader, ToolbarButton } from "@/components/layout";
import { formatDateOnly } from "@/lib/format";
import { useCustomerFeedback } from "@/lib/customer-feedback-data";

export const Route = createFileRoute("/_authenticated/app/feedback")({
  component: CustomerFeedbackPage,
});

function CustomerFeedbackPage() {
  const { data, isLoading, isError, error, refetch } = useCustomerFeedback();
  const [ratingFilter, setRatingFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const feedback = useMemo(
    () =>
      (data ?? []).filter((item) => ratingFilter === "all" || item.rating === Number(ratingFilter)),
    [data, ratingFilter],
  );

  return (
    <>
      <PageHeader
        title="Customer Feedback"
        count={data?.length}
        actions={
          <>
            <ToolbarButton icon="refresh" onClick={() => refetch()}>
              Refresh
            </ToolbarButton>
            <ToolbarButton icon="reviews" variant="cta" onClick={() => setAddOpen(true)}>
              Record Feedback
            </ToolbarButton>
          </>
        }
      />
      <CrmToolbar
        filters={[
          {
            label: "Rating",
            value: ratingFilter,
            onChange: setRatingFilter,
            options: [5, 4, 3, 2, 1].map((rating) => ({
              value: String(rating),
              label: `${rating} stars`,
            })),
          },
        ]}
      />
      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : isError ? (
        <ErrorState
          description={(error as Error)?.message ?? "Could not load feedback"}
          onRetry={() => refetch()}
        />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<span className="material-symbols-outlined text-[28px]">reviews</span>}
          title="No feedback yet"
          description="Record the first customer rating after an issue is resolved."
        />
      ) : feedback.length === 0 ? (
        <EmptyState
          icon={<span className="material-symbols-outlined text-[28px]">filter_alt_off</span>}
          title="No feedback matches this rating"
          description="Choose another rating or clear the filter."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-[11px] uppercase tracking-wide text-text-secondary">
                  <th className="px-4 py-3 text-left font-semibold">Rating</th>
                  <th className="px-4 py-3 text-left font-semibold">Company</th>
                  <th className="px-4 py-3 text-left font-semibold">Comment</th>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((item) => (
                  <tr key={item.id} className="border-b border-border/70 hover:bg-muted/50">
                    <td
                      className="px-4 py-3 font-semibold text-warning"
                      aria-label={`${item.rating} out of 5 stars`}
                    >
                      {"★".repeat(item.rating)}
                      <span className="text-border">{"★".repeat(5 - item.rating)}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {item.company?.name ?? "—"}
                    </td>
                    <td className="max-w-md px-4 py-3 text-text-secondary">
                      {item.comment ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatDateOnly(item.submitted_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <AddCustomerFeedbackModal open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
