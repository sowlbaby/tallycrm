-- =========================================================
-- Support tickets module. Tickets track post-sale customer issues from
-- opening through assignment, discussion, resolution and closure.
-- =========================================================

DO $$ BEGIN
  CREATE TYPE public.support_ticket_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_ticket_status AS ENUM ('open','in_progress','waiting_on_customer','resolved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS ticket_number_prefix TEXT NOT NULL DEFAULT 'TKT';

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number    TEXT NOT NULL UNIQUE,
  company_id       UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id       UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  subject          TEXT NOT NULL,
  description      TEXT,
  priority         public.support_ticket_priority NOT NULL DEFAULT 'normal',
  status           public.support_ticket_status NOT NULL DEFAULT 'open',
  assigned_to      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ,
  resolution       TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  origin_node_id   UUID REFERENCES public.sync_nodes(id) ON DELETE SET NULL,
  last_modified_by UUID
);

CREATE INDEX IF NOT EXISTS support_tickets_status_idx
  ON public.support_tickets (status, opened_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_priority_idx
  ON public.support_tickets (priority, opened_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_company_idx
  ON public.support_tickets (company_id);
CREATE INDEX IF NOT EXISTS support_tickets_contact_idx
  ON public.support_tickets (contact_id);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_idx
  ON public.support_tickets (assigned_to);
CREATE INDEX IF NOT EXISTS support_tickets_updated_at_idx
  ON public.support_tickets (updated_at);

CREATE TABLE IF NOT EXISTS public.support_ticket_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL CHECK (TRIM(body) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_comments_ticket_idx
  ON public.support_ticket_comments (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS public.support_ticket_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  from_status public.support_ticket_status,
  to_status   public.support_ticket_status NOT NULL,
  note        TEXT,
  changed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_status_history_ticket_idx
  ON public.support_ticket_status_history (ticket_id, changed_at DESC);

-- =========================================================
-- Numbering. Mirrors next_credit_note_number(), including the per-node prefix.
-- =========================================================
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq;

CREATE OR REPLACE FUNCTION public.next_support_ticket_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prefix      TEXT;
  _node_prefix TEXT;
  _serial      TEXT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(ticket_number_prefix), ''), 'TKT'),
         NULLIF(TRIM(COALESCE(quote_number_node_prefix, '')), '')
    INTO _prefix, _node_prefix
    FROM public.app_settings
   ORDER BY (id = '00000000-0000-0000-0000-000000000001') DESC, created_at
   LIMIT 1;

  _prefix := COALESCE(_prefix, 'TKT');
  _serial := LPAD(nextval('public.support_ticket_number_seq')::TEXT, 5, '0');

  RETURN CONCAT_WS('-', _prefix, _node_prefix, to_char(CURRENT_DATE, 'YYYY'), _serial);
END;
$$;

REVOKE ALL ON FUNCTION public.next_support_ticket_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_support_ticket_number() TO authenticated, service_role;

-- =========================================================
-- Shared ticket access predicate for comments and history.
-- =========================================================
CREATE OR REPLACE FUNCTION public.can_access_support_ticket(_ticket_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_tickets ticket
     WHERE ticket.id = _ticket_id
       AND (
         public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'manager')
         OR ticket.assigned_to = auth.uid()
         OR ticket.created_by = auth.uid()
       )
  )
$$;

REVOKE ALL ON FUNCTION public.can_access_support_ticket(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_support_ticket(UUID) TO authenticated;

-- =========================================================
-- Triggers. Workflow fields are manager/admin-controlled. Resolved and closed
-- tickets require a resolution; reopening clears only the resolved timestamp.
-- =========================================================
CREATE OR REPLACE FUNCTION public.support_tickets_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _can_manage BOOLEAN :=
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager');
BEGIN
  IF NEW.ticket_number IS NULL OR TRIM(NEW.ticket_number) = '' THEN
    NEW.ticket_number := public.next_support_ticket_number();
  END IF;

  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  IF NEW.assigned_to IS NULL THEN NEW.assigned_to := auth.uid(); END IF;

  IF NOT _can_manage THEN
    NEW.assigned_to := auth.uid();
    NEW.priority := 'normal';
    NEW.status := 'open';
    NEW.resolution := NULL;
    NEW.resolved_at := NULL;
  ELSIF NEW.status IN ('resolved','closed') THEN
    IF NEW.resolution IS NULL OR TRIM(NEW.resolution) = '' THEN
      RAISE EXCEPTION 'A resolution is required before resolving or closing a support ticket'
        USING ERRCODE = '23514';
    END IF;
    NEW.resolved_at := COALESCE(NEW.resolved_at, now());
  ELSE
    NEW.resolved_at := NULL;
  END IF;

  NEW.subject := TRIM(NEW.subject);
  IF NEW.subject = '' THEN
    RAISE EXCEPTION 'Support ticket subject is required' USING ERRCODE = '23514';
  END IF;

  NEW.last_modified_by := COALESCE(auth.uid(), NEW.last_modified_by);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.support_tickets_before_insert() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.support_tickets_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _can_manage BOOLEAN :=
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager');
BEGIN
  IF NOT _can_manage AND (
    NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
    OR NEW.priority IS DISTINCT FROM OLD.priority
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.resolution IS DISTINCT FROM OLD.resolution
    OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
  ) THEN
    RAISE EXCEPTION 'Only an admin or manager can update support ticket workflow'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IN ('resolved','closed') THEN
    IF NEW.resolution IS NULL OR TRIM(NEW.resolution) = '' THEN
      RAISE EXCEPTION 'A resolution is required before resolving or closing a support ticket'
        USING ERRCODE = '23514';
    END IF;
    NEW.resolved_at := COALESCE(OLD.resolved_at, now());
  ELSE
    NEW.resolved_at := NULL;
  END IF;

  NEW.subject := TRIM(NEW.subject);
  IF NEW.subject = '' THEN
    RAISE EXCEPTION 'Support ticket subject is required' USING ERRCODE = '23514';
  END IF;

  NEW.last_modified_by := COALESCE(auth.uid(), NEW.last_modified_by);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.support_tickets_before_update() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.support_ticket_comments_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN NEW.author_id := auth.uid(); END IF;
  NEW.body := TRIM(NEW.body);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.support_ticket_comments_before_insert() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.support_tickets_log_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.support_ticket_status_history (ticket_id, from_status, to_status, note, changed_by)
    VALUES (NEW.id, NULL, NEW.status, NEW.resolution, auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.support_ticket_status_history (ticket_id, from_status, to_status, note, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.resolution, auth.uid());
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.support_tickets_log_status_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS support_tickets_before_insert ON public.support_tickets;
CREATE TRIGGER support_tickets_before_insert BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_before_insert();

DROP TRIGGER IF EXISTS support_tickets_before_update ON public.support_tickets;
CREATE TRIGGER support_tickets_before_update BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_before_update();

DROP TRIGGER IF EXISTS support_tickets_log_status_change ON public.support_tickets;
CREATE TRIGGER support_tickets_log_status_change AFTER INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_log_status_change();

DROP TRIGGER IF EXISTS support_ticket_comments_before_insert ON public.support_ticket_comments;
CREATE TRIGGER support_ticket_comments_before_insert BEFORE INSERT ON public.support_ticket_comments
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_comments_before_insert();

DROP TRIGGER IF EXISTS set_updated_at_support_tickets ON public.support_tickets;
CREATE TRIGGER set_updated_at_support_tickets BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Grants + RLS. Policy shapes mirror credit notes.
-- =========================================================
REVOKE ALL ON public.support_tickets FROM anon;
REVOKE ALL ON public.support_ticket_comments FROM anon;
REVOKE ALL ON public.support_ticket_status_history FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT SELECT, INSERT ON public.support_ticket_comments TO authenticated;
GRANT SELECT ON public.support_ticket_status_history TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
GRANT ALL ON public.support_ticket_comments TO service_role;
GRANT ALL ON public.support_ticket_status_history TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "st_select_scoped" ON public.support_tickets;
CREATE POLICY "st_select_scoped" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "st_insert_scoped" ON public.support_tickets;
CREATE POLICY "st_insert_scoped" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR assigned_to IS NULL
    OR assigned_to = auth.uid()
  );

DROP POLICY IF EXISTS "st_update_scoped" ON public.support_tickets;
CREATE POLICY "st_update_scoped" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "st_delete_manager_admin" ON public.support_tickets;
CREATE POLICY "st_delete_manager_admin" ON public.support_tickets
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "stc_select_scoped" ON public.support_ticket_comments;
CREATE POLICY "stc_select_scoped" ON public.support_ticket_comments
  FOR SELECT TO authenticated USING (public.can_access_support_ticket(ticket_id));

DROP POLICY IF EXISTS "stc_insert_scoped" ON public.support_ticket_comments;
CREATE POLICY "stc_insert_scoped" ON public.support_ticket_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_support_ticket(ticket_id)
    AND author_id = auth.uid()
  );

DROP POLICY IF EXISTS "stsh_select_scoped" ON public.support_ticket_status_history;
CREATE POLICY "stsh_select_scoped" ON public.support_ticket_status_history
  FOR SELECT TO authenticated USING (public.can_access_support_ticket(ticket_id));

NOTIFY pgrst, 'reload schema';
