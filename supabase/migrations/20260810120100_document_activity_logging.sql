-- Immutable, user-visible document events backed by the canonical audit log.
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_type TEXT,
  ADD COLUMN IF NOT EXISTS document_id UUID,
  ADD COLUMN IF NOT EXISTS document_action TEXT,
  ADD COLUMN IF NOT EXISTS event_metadata JSONB,
  ADD COLUMN IF NOT EXISTS audit_log_id UUID REFERENCES public.audit_log(id) ON DELETE RESTRICT;

ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_document_shape_check;
ALTER TABLE public.activities
  ADD CONSTRAINT activities_document_shape_check CHECK (
    type <> 'document'
    OR (
      document_type IN ('quotation', 'invoice', 'receipt')
      AND document_id IS NOT NULL
      AND document_action IS NOT NULL
      AND audit_log_id IS NOT NULL
      AND locked_at IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS activities_company_idx
  ON public.activities (company_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS activities_document_idx
  ON public.activities (document_type, document_id, created_at DESC)
  WHERE type = 'document' AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS activities_audit_log_unique
  ON public.activities (audit_log_id) WHERE audit_log_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.log_document_event(
  _action TEXT,
  _document_type TEXT,
  _document_id UUID,
  _document_number TEXT,
  _title TEXT,
  _notes TEXT,
  _owner_id UUID,
  _contact_id UUID,
  _company_id UUID,
  _deal_id UUID,
  _metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _audit_id UUID;
  _actor_id UUID := auth.uid();
BEGIN
  IF _document_type NOT IN ('quotation', 'invoice', 'receipt') THEN
    RAISE EXCEPTION 'Unsupported document type: %', _document_type;
  END IF;

  INSERT INTO public.audit_log (
    actor_id, action, entity, entity_id, entity_name, metadata
  ) VALUES (
    _actor_id,
    _document_type || '.' || _action,
    _document_type,
    _document_id,
    _document_number,
    COALESCE(_metadata, '{}'::JSONB)
  )
  RETURNING id INTO _audit_id;

  INSERT INTO public.activities (
    type, title, notes, outcome, owner_id, actor_id, contact_id, company_id,
    deal_id, locked_at, document_type, document_id, document_action,
    event_metadata, audit_log_id
  ) VALUES (
    'document',
    _title,
    _notes,
    _action,
    COALESCE(_owner_id, _actor_id),
    _actor_id,
    _contact_id,
    _company_id,
    _deal_id,
    now(),
    _document_type,
    _document_id,
    _action,
    COALESCE(_metadata, '{}'::JSONB),
    _audit_id
  );

  RETURN _audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_document_event(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_document_event(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID, JSONB
) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_document_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.type = 'document' AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Document activities are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS guard_document_activity ON public.activities;
CREATE TRIGGER guard_document_activity
  BEFORE UPDATE OR DELETE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_activity();

CREATE OR REPLACE FUNCTION public.log_quote_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action TEXT;
  _label TEXT;
  _notes TEXT;
  _metadata JSONB := '{}'::JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := CASE WHEN NEW.supersedes_quote_id IS NULL THEN 'created' ELSE 'revised' END;
    _label := CASE WHEN _action = 'created' THEN 'Quotation created' ELSE 'Quotation revised' END;
    _notes := NEW.quote_number || ': ' || NEW.title;
    _metadata := jsonb_build_object(
      'status', NEW.status,
      'currency', NEW.currency,
      'version', NEW.version,
      'supersedes_quote_id', NEW.supersedes_quote_id
    );
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    _action := 'archived';
    _label := 'Quotation archived';
    _notes := NEW.quote_number || ': ' || NEW.title;
  ELSIF NEW.converted_deal_id IS DISTINCT FROM OLD.converted_deal_id
      AND NEW.converted_deal_id IS NOT NULL THEN
    _action := 'converted';
    _label := 'Quotation converted to deal';
    _notes := NEW.quote_number || ': ' || NEW.title;
    _metadata := jsonb_build_object('deal_id', NEW.converted_deal_id, 'total', NEW.total);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    _action := NEW.status::TEXT;
    _label := 'Quotation ' || replace(NEW.status::TEXT, '_', ' ');
    _notes := NEW.quote_number || ': ' || NEW.title;
    _metadata := jsonb_build_object(
      'from_status', OLD.status,
      'to_status', NEW.status,
      'decision_note', NEW.decision_note,
      'total', NEW.total,
      'currency', NEW.currency
    );
  ELSIF ROW(
      NEW.title, NEW.contact_id, NEW.company_id, NEW.assigned_to, NEW.currency,
      NEW.issue_date, NEW.valid_until, NEW.discount_type, NEW.discount_value,
      NEW.notes, NEW.terms
    ) IS DISTINCT FROM ROW(
      OLD.title, OLD.contact_id, OLD.company_id, OLD.assigned_to, OLD.currency,
      OLD.issue_date, OLD.valid_until, OLD.discount_type, OLD.discount_value,
      OLD.notes, OLD.terms
    ) THEN
    _action := 'updated';
    _label := 'Quotation details updated';
    _notes := NEW.quote_number || ': ' || NEW.title;
    _metadata := jsonb_build_object(
      'total', NEW.total,
      'currency', NEW.currency,
      'discount_amount', NEW.discount_amount,
      'tax_amount', NEW.tax_amount
    );
  ELSE
    RETURN NULL;
  END IF;

  PERFORM public.log_document_event(
    _action, 'quotation', NEW.id, NEW.quote_number, _label, _notes,
    NEW.assigned_to, NEW.contact_id, NEW.company_id, NEW.deal_id, _metadata
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS quotes_log_document_activity ON public.quotes;
CREATE TRIGGER quotes_log_document_activity
  AFTER INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.log_quote_activity();

CREATE OR REPLACE FUNCTION public.log_invoice_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action TEXT;
  _label TEXT;
  _notes TEXT;
  _metadata JSONB := '{}'::JSONB;
  _source_quote public.quotes%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'created';
    _label := CASE WHEN NEW.quote_id IS NULL THEN 'Invoice created' ELSE 'Invoice created from quotation' END;
    _notes := NEW.invoice_number || ': ' || NEW.title;
    _metadata := jsonb_build_object(
      'status', NEW.status,
      'currency', NEW.currency,
      'quote_id', NEW.quote_id
    );
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    _action := 'archived';
    _label := 'Invoice archived';
    _notes := NEW.invoice_number || ': ' || NEW.title;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    _action := NEW.status::TEXT;
    _label := 'Invoice ' || replace(NEW.status::TEXT, '_', ' ');
    _notes := NEW.invoice_number || ': ' || NEW.title;
    _metadata := jsonb_build_object(
      'from_status', OLD.status,
      'to_status', NEW.status,
      'total', NEW.total,
      'amount_paid', NEW.amount_paid,
      'balance', GREATEST(NEW.total - NEW.amount_paid, 0),
      'currency', NEW.currency
    );
  ELSIF ROW(
      NEW.title, NEW.contact_id, NEW.company_id, NEW.deal_id, NEW.assigned_to,
      NEW.currency, NEW.issue_date, NEW.due_date, NEW.discount_type,
      NEW.discount_value, NEW.notes, NEW.payment_terms
    ) IS DISTINCT FROM ROW(
      OLD.title, OLD.contact_id, OLD.company_id, OLD.deal_id, OLD.assigned_to,
      OLD.currency, OLD.issue_date, OLD.due_date, OLD.discount_type,
      OLD.discount_value, OLD.notes, OLD.payment_terms
    ) THEN
    _action := 'updated';
    _label := 'Invoice details updated';
    _notes := NEW.invoice_number || ': ' || NEW.title;
    _metadata := jsonb_build_object(
      'total', NEW.total,
      'currency', NEW.currency,
      'discount_amount', NEW.discount_amount,
      'tax_amount', NEW.tax_amount
    );
  ELSE
    RETURN NULL;
  END IF;

  PERFORM public.log_document_event(
    _action, 'invoice', NEW.id, NEW.invoice_number, _label, _notes,
    NEW.assigned_to, NEW.contact_id, NEW.company_id, NEW.deal_id, _metadata
  );

  IF TG_OP = 'INSERT' AND NEW.quote_id IS NOT NULL THEN
    SELECT * INTO _source_quote FROM public.quotes WHERE id = NEW.quote_id;
    IF FOUND THEN
      PERFORM public.log_document_event(
        'converted_to_invoice', 'quotation', _source_quote.id, _source_quote.quote_number,
        'Invoice created from quotation',
        _source_quote.quote_number || ' created invoice ' || NEW.invoice_number,
        _source_quote.assigned_to, _source_quote.contact_id, _source_quote.company_id,
        _source_quote.deal_id,
        jsonb_build_object('invoice_id', NEW.id, 'invoice_number', NEW.invoice_number)
      );
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS invoices_log_document_activity ON public.invoices;
CREATE TRIGGER invoices_log_document_activity
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_invoice_activity();

CREATE OR REPLACE FUNCTION public.log_receipt_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action TEXT;
  _label TEXT;
  _notes TEXT;
  _metadata JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'created';
    _label := 'Receipt created';
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    _action := 'archived';
    _label := 'Receipt archived';
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'void' THEN
    _action := 'voided';
    _label := 'Receipt voided';
  ELSIF ROW(
      NEW.amount, NEW.payment_date, NEW.payment_method, NEW.reference, NEW.notes
    ) IS DISTINCT FROM ROW(
      OLD.amount, OLD.payment_date, OLD.payment_method, OLD.reference, OLD.notes
    ) THEN
    _action := 'updated';
    _label := 'Receipt payment details updated';
  ELSE
    RETURN NULL;
  END IF;

  _notes := NEW.receipt_number || ' for ' || NEW.amount || ' ' || NEW.currency;
  _metadata := jsonb_build_object(
    'invoice_id', NEW.invoice_id,
    'amount', NEW.amount,
    'currency', NEW.currency,
    'payment_method', NEW.payment_method,
    'reference', NEW.reference,
    'status', NEW.status
  );

  PERFORM public.log_document_event(
    _action, 'receipt', NEW.id, NEW.receipt_number, _label, _notes,
    NEW.assigned_to, NEW.contact_id, NEW.company_id, NEW.deal_id, _metadata
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS receipts_log_document_activity ON public.receipts;
CREATE TRIGGER receipts_log_document_activity
  AFTER INSERT OR UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.log_receipt_activity();

-- Replace a complete line-item set transactionally and emit one summary event.
CREATE OR REPLACE FUNCTION public.replace_quote_line_items(_quote_id UUID, _lines JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _line JSONB;
  _line_id UUID;
  _kept_ids UUID[] := ARRAY[]::UUID[];
  _position INT := 0;
  _quote public.quotes%ROWTYPE;
BEGIN
  IF NOT public.can_access_quote(_quote_id) THEN
    RAISE EXCEPTION 'Quotation not found or access denied' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(COALESCE(_lines, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Lines must be a JSON array' USING ERRCODE = '22023';
  END IF;

  FOR _line IN SELECT value FROM jsonb_array_elements(COALESCE(_lines, '[]'::JSONB)) LOOP
    _line_id := NULLIF(_line->>'id', '')::UUID;
    IF _line_id IS NOT NULL THEN _kept_ids := array_append(_kept_ids, _line_id); END IF;
  END LOOP;

  DELETE FROM public.quote_line_items
   WHERE quote_id = _quote_id AND NOT (id = ANY(_kept_ids));

  FOR _line IN SELECT value FROM jsonb_array_elements(COALESCE(_lines, '[]'::JSONB)) LOOP
    _line_id := NULLIF(_line->>'id', '')::UUID;
    IF _line_id IS NULL THEN
      INSERT INTO public.quote_line_items (
        quote_id, position, catalog_item_id, name, description, unit,
        quantity, unit_price, discount_percent, tax_rate
      ) VALUES (
        _quote_id,
        _position,
        NULLIF(_line->>'catalog_item_id', '')::UUID,
        trim(_line->>'name'),
        NULLIF(trim(COALESCE(_line->>'description', '')), ''),
        COALESCE(NULLIF(_line->>'unit', ''), 'unit'),
        COALESCE((_line->>'quantity')::NUMERIC, 1),
        COALESCE((_line->>'unit_price')::NUMERIC, 0),
        COALESCE((_line->>'discount_percent')::NUMERIC, 0),
        COALESCE((_line->>'tax_rate')::NUMERIC, 0)
      );
    ELSE
      UPDATE public.quote_line_items SET
        position = _position,
        catalog_item_id = NULLIF(_line->>'catalog_item_id', '')::UUID,
        name = trim(_line->>'name'),
        description = NULLIF(trim(COALESCE(_line->>'description', '')), ''),
        unit = COALESCE(NULLIF(_line->>'unit', ''), 'unit'),
        quantity = COALESCE((_line->>'quantity')::NUMERIC, 1),
        unit_price = COALESCE((_line->>'unit_price')::NUMERIC, 0),
        discount_percent = COALESCE((_line->>'discount_percent')::NUMERIC, 0),
        tax_rate = COALESCE((_line->>'tax_rate')::NUMERIC, 0)
      WHERE id = _line_id AND quote_id = _quote_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Quotation line item not found' USING ERRCODE = 'P0002';
      END IF;
    END IF;
    _position := _position + 1;
  END LOOP;

  SELECT * INTO _quote FROM public.quotes WHERE id = _quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found' USING ERRCODE = 'P0002'; END IF;

  PERFORM public.log_document_event(
    'line_items_updated', 'quotation', _quote.id, _quote.quote_number,
    'Quotation line items updated', _quote.quote_number || ': ' || _quote.title,
    _quote.assigned_to, _quote.contact_id, _quote.company_id, _quote.deal_id,
    jsonb_build_object(
      'line_count', jsonb_array_length(COALESCE(_lines, '[]'::JSONB)),
      'subtotal', _quote.subtotal,
      'discount_amount', _quote.discount_amount,
      'tax_amount', _quote.tax_amount,
      'total', _quote.total,
      'currency', _quote.currency
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_invoice_line_items(_invoice_id UUID, _lines JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _line JSONB;
  _line_id UUID;
  _kept_ids UUID[] := ARRAY[]::UUID[];
  _position INT := 0;
  _invoice public.invoices%ROWTYPE;
BEGIN
  IF NOT public.can_access_invoice(_invoice_id) THEN
    RAISE EXCEPTION 'Invoice not found or access denied' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(COALESCE(_lines, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Lines must be a JSON array' USING ERRCODE = '22023';
  END IF;

  FOR _line IN SELECT value FROM jsonb_array_elements(COALESCE(_lines, '[]'::JSONB)) LOOP
    _line_id := NULLIF(_line->>'id', '')::UUID;
    IF _line_id IS NOT NULL THEN _kept_ids := array_append(_kept_ids, _line_id); END IF;
  END LOOP;

  DELETE FROM public.invoice_line_items
   WHERE invoice_id = _invoice_id AND NOT (id = ANY(_kept_ids));

  FOR _line IN SELECT value FROM jsonb_array_elements(COALESCE(_lines, '[]'::JSONB)) LOOP
    _line_id := NULLIF(_line->>'id', '')::UUID;
    IF _line_id IS NULL THEN
      INSERT INTO public.invoice_line_items (
        invoice_id, position, catalog_item_id, name, description, unit,
        quantity, unit_price, discount_percent, tax_rate
      ) VALUES (
        _invoice_id,
        _position,
        NULLIF(_line->>'catalog_item_id', '')::UUID,
        trim(_line->>'name'),
        NULLIF(trim(COALESCE(_line->>'description', '')), ''),
        COALESCE(NULLIF(_line->>'unit', ''), 'unit'),
        COALESCE((_line->>'quantity')::NUMERIC, 1),
        COALESCE((_line->>'unit_price')::NUMERIC, 0),
        COALESCE((_line->>'discount_percent')::NUMERIC, 0),
        COALESCE((_line->>'tax_rate')::NUMERIC, 0)
      );
    ELSE
      UPDATE public.invoice_line_items SET
        position = _position,
        catalog_item_id = NULLIF(_line->>'catalog_item_id', '')::UUID,
        name = trim(_line->>'name'),
        description = NULLIF(trim(COALESCE(_line->>'description', '')), ''),
        unit = COALESCE(NULLIF(_line->>'unit', ''), 'unit'),
        quantity = COALESCE((_line->>'quantity')::NUMERIC, 1),
        unit_price = COALESCE((_line->>'unit_price')::NUMERIC, 0),
        discount_percent = COALESCE((_line->>'discount_percent')::NUMERIC, 0),
        tax_rate = COALESCE((_line->>'tax_rate')::NUMERIC, 0)
      WHERE id = _line_id AND invoice_id = _invoice_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice line item not found' USING ERRCODE = 'P0002';
      END IF;
    END IF;
    _position := _position + 1;
  END LOOP;

  SELECT * INTO _invoice FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002'; END IF;

  PERFORM public.log_document_event(
    'line_items_updated', 'invoice', _invoice.id, _invoice.invoice_number,
    'Invoice line items updated', _invoice.invoice_number || ': ' || _invoice.title,
    _invoice.assigned_to, _invoice.contact_id, _invoice.company_id, _invoice.deal_id,
    jsonb_build_object(
      'line_count', jsonb_array_length(COALESCE(_lines, '[]'::JSONB)),
      'subtotal', _invoice.subtotal,
      'discount_amount', _invoice.discount_amount,
      'tax_amount', _invoice.tax_amount,
      'total', _invoice.total,
      'currency', _invoice.currency
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_quote_line_items(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_quote_line_items(UUID, JSONB) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_invoice_line_items(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_invoice_line_items(UUID, JSONB) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
