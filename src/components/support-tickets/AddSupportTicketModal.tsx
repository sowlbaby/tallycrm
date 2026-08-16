import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useModalA11y } from "@/components/common/use-modal-a11y";
import { useAuth, useCurrentRole } from "@/lib/auth-context";
import {
  type SupportTicketPriority,
  useCreateSupportTicket,
  useSupportTicketOptions,
} from "@/lib/support-tickets-data";

interface AddSupportTicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddSupportTicketModal({ open, onOpenChange }: AddSupportTicketModalProps) {
  const { data: options } = useSupportTicketOptions();
  const createTicket = useCreateSupportTicket();
  const { user } = useAuth();
  const role = useCurrentRole();
  const navigate = useNavigate();
  const modal = useModalA11y(open, onOpenChange, { disabled: createTicket.isPending });
  const canAssign = role === "admin" || role === "manager";

  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<SupportTicketPriority>("normal");
  const [assignedTo, setAssignedTo] = useState("");

  useEffect(() => {
    if (open && !assignedTo && user?.id) setAssignedTo(user.id);
  }, [assignedTo, open, user?.id]);

  useEffect(() => {
    if (!contactId || companyId) return;
    const contact = options?.contacts.find((item) => item.id === contactId);
    if (contact?.company_id) setCompanyId(contact.company_id);
  }, [companyId, contactId, options]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!companyId && !contactId) {
      toast.error("Choose a company or contact");
      return;
    }
    if (!subject.trim()) {
      toast.error("Enter a ticket subject");
      return;
    }

    try {
      const ticket = await createTicket.mutateAsync({
        company_id: companyId || null,
        contact_id: contactId || null,
        subject,
        description: description.trim() || null,
        priority,
        assigned_to: canAssign ? assignedTo || null : user?.id || null,
      });
      toast.success(`Ticket ${ticket.ticket_number} created`);
      onOpenChange(false);
      setCompanyId("");
      setContactId("");
      setSubject("");
      setDescription("");
      setPriority("normal");
      setAssignedTo(user?.id ?? "");
      navigate({ to: "/app/support-tickets/$id", params: { id: ticket.id } });
    } catch (error) {
      toast.error("Could not create the support ticket", {
        description: (error as Error).message,
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/60 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-support-ticket-title"
      ref={modal.ref}
      onKeyDown={modal.onKeyDown}
    >
      <div className="flex max-h-[90vh] w-full max-w-[680px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border bg-muted px-8 py-6">
          <div>
            <h2 id="add-support-ticket-title" className="text-[22px] font-semibold text-foreground">
              New Support Ticket
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Record the customer issue and assign the initial priority.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-2 text-text-secondary transition-colors hover:bg-danger-light hover:text-danger"
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
                  <option value="">Select company...</option>
                  {(options?.companies ?? []).map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Contact" hint="At least one customer field is required.">
                <select
                  value={contactId}
                  onChange={(event) => setContactId(event.target.value)}
                  className="deal-input appearance-none"
                >
                  <option value="">Select contact...</option>
                  {(options?.contacts ?? []).map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.first_name} {contact.last_name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Subject" required>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="deal-input"
                maxLength={200}
                required
                autoFocus
              />
            </Field>

            <Field label="Description">
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-28 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="What problem did the customer report?"
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Priority" required>
                {canAssign ? (
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
                ) : (
                  <input value="Normal" readOnly className="deal-input" />
                )}
              </Field>
              <Field label="Assigned to">
                {canAssign ? (
                  <select
                    value={assignedTo}
                    onChange={(event) => setAssignedTo(event.target.value)}
                    className="deal-input appearance-none"
                  >
                    {(options?.profiles ?? []).map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.full_name ?? "Unnamed user"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={user?.fullName ?? "Self"} readOnly className="deal-input" />
                )}
              </Field>
            </div>
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
              disabled={createTicket.isPending}
              className="rounded-lg bg-cta px-6 py-2 text-xs font-semibold text-cta-foreground hover:bg-cta-hover disabled:opacity-60"
            >
              {createTicket.isPending ? "Creating..." : "Create ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
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
      {hint ? <span className="mt-1 block text-[11px] text-text-muted">{hint}</span> : null}
    </label>
  );
}
