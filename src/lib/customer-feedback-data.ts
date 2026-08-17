import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type CustomerFeedbackRow = Database["public"]["Tables"]["customer_feedback"]["Row"];
export type CustomerFeedbackInsert = Database["public"]["Tables"]["customer_feedback"]["Insert"];
type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];

export interface CustomerFeedbackSummary extends CustomerFeedbackRow {
  company?: Pick<CompanyRow, "id" | "name"> | null;
}

export const customerFeedbackKey = ["customer_feedback"] as const;

export function useCustomerFeedback() {
  return useQuery({
    queryKey: customerFeedbackKey,
    queryFn: async () => {
      const [feedbackRes, companiesRes] = await Promise.all([
        supabase.from("customer_feedback").select("*").order("submitted_at", { ascending: false }),
        supabase.from("companies").select("id,name").is("deleted_at", null),
      ]);
      if (feedbackRes.error) throw feedbackRes.error;
      if (companiesRes.error) throw companiesRes.error;
      const companies = (companiesRes.data ?? []) as Array<Pick<CompanyRow, "id" | "name">>;
      return ((feedbackRes.data ?? []) as CustomerFeedbackRow[]).map((feedback) => ({
        ...feedback,
        company: companies.find((company) => company.id === feedback.company_id) ?? null,
      })) satisfies CustomerFeedbackSummary[];
    },
  });
}

export function useCustomerFeedbackOptions() {
  return useQuery({
    queryKey: ["customer_feedback_options"],
    queryFn: async () => {
      const [companiesRes, contactsRes] = await Promise.all([
        supabase.from("companies").select("*").is("deleted_at", null).order("name"),
        supabase.from("contacts").select("*").is("deleted_at", null).order("last_name"),
      ]);
      if (companiesRes.error) throw companiesRes.error;
      if (contactsRes.error) throw contactsRes.error;
      return {
        companies: (companiesRes.data ?? []) as CompanyRow[],
        contacts: (contactsRes.data ?? []) as ContactRow[],
      };
    },
  });
}

export function useCreateCustomerFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Pick<CustomerFeedbackInsert, "company_id" | "contact_id" | "rating" | "comment">,
    ) => {
      const { data, error } = await supabase
        .from("customer_feedback")
        .insert({ ...input, comment: input.comment?.trim() || null })
        .select("*")
        .single();
      if (error) throw error;
      return data as CustomerFeedbackRow;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerFeedbackKey }),
  });
}
