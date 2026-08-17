-- Customer feedback module (tenant_a). Ratings recorded after resolved interactions.

CREATE TABLE IF NOT EXISTS public.customer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  origin_node_id UUID REFERENCES public.sync_nodes(id) ON DELETE SET NULL,
  last_modified_by UUID
);

CREATE INDEX IF NOT EXISTS customer_feedback_company_idx ON public.customer_feedback (company_id);
CREATE INDEX IF NOT EXISTS customer_feedback_contact_idx ON public.customer_feedback (contact_id);
CREATE INDEX IF NOT EXISTS customer_feedback_rating_submitted_idx
  ON public.customer_feedback (rating, submitted_at DESC);
CREATE INDEX IF NOT EXISTS customer_feedback_updated_at_idx ON public.customer_feedback (updated_at);

CREATE OR REPLACE FUNCTION public.customer_feedback_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
  END IF;
  NEW.comment := NULLIF(TRIM(COALESCE(NEW.comment, '')), '');
  NEW.last_modified_by := COALESCE(auth.uid(), NEW.last_modified_by);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_feedback_before_write() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_feedback_before_write() TO service_role;

DROP TRIGGER IF EXISTS customer_feedback_before_write ON public.customer_feedback;
CREATE TRIGGER customer_feedback_before_write
  BEFORE INSERT OR UPDATE ON public.customer_feedback
  FOR EACH ROW EXECUTE FUNCTION public.customer_feedback_before_write();

DROP TRIGGER IF EXISTS set_updated_at_customer_feedback ON public.customer_feedback;
CREATE TRIGGER set_updated_at_customer_feedback
  BEFORE UPDATE ON public.customer_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.customer_feedback FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_feedback TO authenticated;
GRANT ALL ON public.customer_feedback TO service_role;
ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_feedback_select_scoped" ON public.customer_feedback;
CREATE POLICY "customer_feedback_select_scoped" ON public.customer_feedback
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "customer_feedback_insert_scoped" ON public.customer_feedback;
CREATE POLICY "customer_feedback_insert_scoped" ON public.customer_feedback
  FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND (company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.companies company
      WHERE company.id = customer_feedback.company_id AND company.deleted_at IS NULL
    ))
    AND (contact_id IS NULL OR EXISTS (
      SELECT 1 FROM public.contacts contact
      WHERE contact.id = customer_feedback.contact_id AND contact.deleted_at IS NULL
    ))
  );

DROP POLICY IF EXISTS "customer_feedback_update_scoped" ON public.customer_feedback;
CREATE POLICY "customer_feedback_update_scoped" ON public.customer_feedback
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
    OR created_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "customer_feedback_delete_manager_admin" ON public.customer_feedback;
CREATE POLICY "customer_feedback_delete_manager_admin" ON public.customer_feedback
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
  );

NOTIFY pgrst, 'reload schema';
