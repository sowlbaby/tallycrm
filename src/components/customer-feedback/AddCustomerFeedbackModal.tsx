import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { useModalA11y } from "@/components/common/use-modal-a11y";
import {
  useCreateCustomerFeedback,
  useCustomerFeedbackOptions,
} from "@/lib/customer-feedback-data";

interface AddCustomerFeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddCustomerFeedbackModal({ open, onOpenChange }: AddCustomerFeedbackModalProps) {
  const { data: options } = useCustomerFeedbackOptions();
  const createFeedback = useCreateCustomerFeedback();
  const modal = useModalA11y(open, onOpenChange, { disabled: createFeedback.isPending });
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!contactId || companyId) return;
    const contact = options?.contacts.find((item) => item.id === contactId);
    if (contact?.company_id) setCompanyId(contact.company_id);
  }, [companyId, contactId, options]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await createFeedback.mutateAsync({
        company_id: companyId || null,
        contact_id: contactId || null,
        rating: Number(rating),
        comment: comment.trim() || null,
      });
      toast.success("Feedback recorded");
      onOpenChange(false);
      setCompanyId("");
      setContactId("");
      setRating("5");
      setComment("");
    } catch (error) {
      toast.error("Could not record feedback", { description: (error as Error).message });
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/60 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-customer-feedback-title"
      ref={modal.ref}
      onKeyDown={modal.onKeyDown}
    >
      <div className="flex max-h-[90vh] w-full max-w-[620px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border bg-muted px-8 py-6">
          <div>
            <h2 id="add-customer-feedback-title" className="text-[22px] font-semibold">
              Record Customer Feedback
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Capture the customer rating after their issue was resolved.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-2 text-text-secondary hover:bg-danger-light hover:text-danger"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-8 py-8">
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Company">
                <select
                  value={companyId}
                  onChange={(event) => setCompanyId(event.target.value)}
                  className="deal-input appearance-none"
                >
                  <option value="">No company</option>
                  {(options?.companies ?? []).map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Contact">
                <select
                  value={contactId}
                  onChange={(event) => setContactId(event.target.value)}
                  className="deal-input appearance-none"
                >
                  <option value="">No contact</option>
                  {(options?.contacts ?? []).map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.first_name} {contact.last_name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Rating" required>
              <select
                value={rating}
                onChange={(event) => setRating(event.target.value)}
                className="deal-input appearance-none"
                required
                autoFocus
              >
                {[5, 4, 3, 2, 1].map((value) => (
                  <option key={value} value={value}>
                    {value} —{" "}
                    {value === 1 ? "Very poor" : value === 5 ? "Excellent" : "★".repeat(value)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Comment">
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="min-h-28 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                maxLength={5000}
                placeholder="What did the customer say?"
              />
            </Field>
          </div>
          <div className="mt-8 flex justify-end gap-4 border-t border-border pt-6">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-border bg-card px-6 py-2 text-xs font-semibold hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createFeedback.isPending}
              className="rounded-lg bg-cta px-6 py-2 text-xs font-semibold text-cta-foreground hover:bg-cta-hover disabled:opacity-60"
            >
              {createFeedback.isPending ? "Saving..." : "Record feedback"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {label}
        {required ? <span className="ml-1 text-danger">*</span> : null}
      </span>
      {children}
    </label>
  );
}
