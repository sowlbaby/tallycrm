import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { formatRelative } from "@/lib/format";
import { type SupportTicketComment, useAddSupportTicketComment } from "@/lib/support-tickets-data";

export function SupportTicketComments({
  ticketId,
  comments,
}: {
  ticketId: string;
  comments: SupportTicketComment[];
}) {
  const addComment = useAddSupportTicketComment();
  const [body, setBody] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    try {
      await addComment.mutateAsync({ ticketId, body });
      setBody("");
      toast.success("Comment added");
    } catch (error) {
      toast.error("Could not add the comment", { description: (error as Error).message });
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-6 py-4">
        <h2 className="text-[16px] font-semibold text-foreground">Comments</h2>
        <p className="text-xs text-text-secondary">
          A running thread for everyone working the ticket.
        </p>
      </header>

      {comments.length ? (
        <ul className="divide-y divide-border">
          {comments.map((comment) => (
            <li key={comment.id} className="px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">
                  {comment.author?.full_name ?? "Team member"}
                </p>
                <span className="text-xs text-text-muted">
                  {formatRelative(comment.created_at)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-6 py-8 text-center text-sm text-text-muted">No comments yet.</p>
      )}

      <form onSubmit={handleSubmit} className="border-t border-border px-6 py-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Add comment
          </span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-24 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder="Share an update or ask a question..."
          />
        </label>
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={!body.trim() || addComment.isPending}
            className="rounded-lg bg-cta px-4 py-2 text-xs font-semibold text-cta-foreground hover:bg-cta-hover disabled:opacity-50"
          >
            {addComment.isPending ? "Adding..." : "Add comment"}
          </button>
        </div>
      </form>
    </section>
  );
}
