import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { CompanyRow, ContactRow, ProfileRow } from "@/lib/quotes-data";

export type SupportTicketRow = Database["public"]["Tables"]["support_tickets"]["Row"];
export type SupportTicketInsert = Database["public"]["Tables"]["support_tickets"]["Insert"];
export type SupportTicketUpdate = Database["public"]["Tables"]["support_tickets"]["Update"];
export type SupportTicketCommentRow =
  Database["public"]["Tables"]["support_ticket_comments"]["Row"];
export type SupportTicketStatusHistoryRow =
  Database["public"]["Tables"]["support_ticket_status_history"]["Row"];
export type SupportTicketStatus = Database["public"]["Enums"]["support_ticket_status"];
export type SupportTicketPriority = Database["public"]["Enums"]["support_ticket_priority"];

export interface SupportTicketSummary extends SupportTicketRow {
  contact?: ContactRow | null;
  company?: CompanyRow | null;
  assigned_rep?: ProfileRow | null;
  comment_count: number;
}

export interface SupportTicketComment extends SupportTicketCommentRow {
  author?: ProfileRow | null;
}

export interface SupportTicketDetail extends SupportTicketSummary {
  comments: SupportTicketComment[];
  status_history: SupportTicketStatusHistoryRow[];
}

export interface CreateSupportTicketInput {
  company_id?: string | null;
  contact_id?: string | null;
  subject: string;
  description?: string | null;
  priority: SupportTicketPriority;
  assigned_to?: string | null;
}

export interface SupportTicketOptions {
  contacts: ContactRow[];
  companies: CompanyRow[];
  profiles: ProfileRow[];
}

export const supportTicketsKey = ["support_tickets"] as const;

export function useSupportTickets() {
  return useQuery({
    queryKey: supportTicketsKey,
    queryFn: async () => {
      const [ticketsRes, commentsRes, contactsRes, companiesRes, profilesRes] = await Promise.all([
        supabase.from("support_tickets").select("*").order("opened_at", { ascending: false }),
        supabase.from("support_ticket_comments").select("ticket_id"),
        supabase.from("contacts").select("*").is("deleted_at", null),
        supabase.from("companies").select("*").is("deleted_at", null),
        supabase.from("profiles").select("*"),
      ]);

      if (ticketsRes.error) throw ticketsRes.error;
      if (commentsRes.error) throw commentsRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (companiesRes.error) throw companiesRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const counts = new Map<string, number>();
      for (const comment of (commentsRes.data ?? []) as Array<{ ticket_id: string }>) {
        counts.set(comment.ticket_id, (counts.get(comment.ticket_id) ?? 0) + 1);
      }

      return ((ticketsRes.data ?? []) as SupportTicketRow[]).map((ticket) =>
        summarizeSupportTicket(
          ticket,
          (contactsRes.data ?? []) as ContactRow[],
          (companiesRes.data ?? []) as CompanyRow[],
          (profilesRes.data ?? []) as ProfileRow[],
          counts,
        ),
      );
    },
  });
}

export function useSupportTicket(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ["support_ticket", id],
    queryFn: async (): Promise<SupportTicketDetail> => {
      const ticketRes = await supabase.from("support_tickets").select("*").eq("id", id!).single();
      if (ticketRes.error) throw ticketRes.error;
      const ticket = ticketRes.data as SupportTicketRow;

      const [commentsRes, historyRes, contactsRes, companiesRes, profilesRes] = await Promise.all([
        supabase
          .from("support_ticket_comments")
          .select("*")
          .eq("ticket_id", id!)
          .order("created_at", { ascending: true }),
        supabase
          .from("support_ticket_status_history")
          .select("*")
          .eq("ticket_id", id!)
          .order("changed_at", { ascending: false }),
        supabase.from("contacts").select("*").is("deleted_at", null),
        supabase.from("companies").select("*").is("deleted_at", null),
        supabase.from("profiles").select("*"),
      ]);

      if (commentsRes.error) throw commentsRes.error;
      if (historyRes.error) throw historyRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (companiesRes.error) throw companiesRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const profiles = (profilesRes.data ?? []) as ProfileRow[];
      const comments = ((commentsRes.data ?? []) as SupportTicketCommentRow[]).map((comment) => ({
        ...comment,
        author: profiles.find((profile) => profile.id === comment.author_id) ?? null,
      }));

      return {
        ...summarizeSupportTicket(
          ticket,
          (contactsRes.data ?? []) as ContactRow[],
          (companiesRes.data ?? []) as CompanyRow[],
          profiles,
          new Map([[ticket.id, comments.length]]),
        ),
        comments,
        status_history: (historyRes.data ?? []) as SupportTicketStatusHistoryRow[],
      };
    },
  });
}

export function useSupportTicketOptions() {
  return useQuery({
    queryKey: ["support_ticket_options"],
    queryFn: async (): Promise<SupportTicketOptions> => {
      const [contactsRes, companiesRes, profilesRes] = await Promise.all([
        supabase.from("contacts").select("*").is("deleted_at", null).order("first_name"),
        supabase.from("companies").select("*").is("deleted_at", null).order("name"),
        supabase.from("profiles").select("*").eq("status", "active").order("full_name"),
      ]);
      if (contactsRes.error) throw contactsRes.error;
      if (companiesRes.error) throw companiesRes.error;
      if (profilesRes.error) throw profilesRes.error;
      return {
        contacts: (contactsRes.data ?? []) as ContactRow[],
        companies: (companiesRes.data ?? []) as CompanyRow[],
        profiles: (profilesRes.data ?? []) as ProfileRow[],
      };
    },
  });
}

export function useCreateSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSupportTicketInput) => {
      const { data, error } = await supabase
        .from("support_tickets")
        .insert({
          company_id: input.company_id || null,
          contact_id: input.contact_id || null,
          subject: input.subject.trim(),
          description: input.description?.trim() || null,
          priority: input.priority,
          assigned_to: input.assigned_to || null,
        } as SupportTicketInsert)
        .select("id,ticket_number")
        .single();
      if (error) throw error;
      return data as Pick<SupportTicketRow, "id" | "ticket_number">;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supportTicketsKey }),
  });
}

export function useUpdateSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: SupportTicketUpdate }) => {
      const { error } = await supabase.from("support_tickets").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => invalidateSupportTickets(qc, vars.id),
  });
}

export function useAddSupportTicketComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error("Comment is required");
      const { error } = await supabase
        .from("support_ticket_comments")
        .insert({ ticket_id: ticketId, body: trimmed });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => invalidateSupportTickets(qc, vars.ticketId),
  });
}

function invalidateSupportTickets(qc: ReturnType<typeof useQueryClient>, supportTicketId?: string) {
  qc.invalidateQueries({ queryKey: supportTicketsKey });
  if (supportTicketId) qc.invalidateQueries({ queryKey: ["support_ticket", supportTicketId] });
}

function summarizeSupportTicket(
  ticket: SupportTicketRow,
  contacts: ContactRow[],
  companies: CompanyRow[],
  profiles: ProfileRow[],
  commentCounts: Map<string, number>,
): SupportTicketSummary {
  return {
    ...ticket,
    contact: contacts.find((contact) => contact.id === ticket.contact_id) ?? null,
    company: companies.find((company) => company.id === ticket.company_id) ?? null,
    assigned_rep: profiles.find((profile) => profile.id === ticket.assigned_to) ?? null,
    comment_count: commentCounts.get(ticket.id) ?? 0,
  };
}

export function supportTicketCustomerName(ticket: {
  contact?: ContactRow | null;
  company?: CompanyRow | null;
}): string {
  if (ticket.company?.name) return ticket.company.name;
  if (ticket.contact) return `${ticket.contact.first_name} ${ticket.contact.last_name}`.trim();
  return "No customer";
}
