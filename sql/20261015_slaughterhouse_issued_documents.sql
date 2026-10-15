-- FRIGOSI / Plaza Ganadera: registro permanente de PDFs certificados.
-- Ejecutar en remates_bd una sola vez (idempotente).
-- No modifica preliquidaciones, faenas ni obligaciones financieras.
BEGIN;
CREATE TABLE IF NOT EXISTS public.slaughterhouse_issued_documents (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  preliquidation_id BIGINT NOT NULL REFERENCES public.slaughterhouse_preliquidations(id),
  document_kind TEXT NOT NULL CHECK(document_kind IN ('seller','transport','commissioner')),
  reference_id BIGINT NOT NULL DEFAULT 0,
  document_code TEXT NOT NULL UNIQUE,
  token_sha256 CHAR(64) NOT NULL UNIQUE,
  pdf_sha256 CHAR(64) NOT NULL,
  pdf_bytes BYTEA NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_by INTEGER NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by INTEGER,
  revoke_reason TEXT,
  CONSTRAINT slaughterhouse_issued_document_one_version
    UNIQUE(company_id,preliquidation_id,document_kind,reference_id),
  CONSTRAINT slaughterhouse_issued_document_reference_check
    CHECK ((document_kind='transport' AND reference_id>0) OR
      (document_kind IN ('seller','commissioner') AND reference_id=0))
);
CREATE INDEX IF NOT EXISTS idx_slaughterhouse_issued_docs_company_lot
  ON public.slaughterhouse_issued_documents(company_id,preliquidation_id);
-- La emision original es inmutable. Solo se admite REVOCAR (sin desrevocacion).
CREATE OR REPLACE FUNCTION public.slaughterhouse_protect_issued_document()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.preliquidation_id IS DISTINCT FROM OLD.preliquidation_id
     OR NEW.document_kind IS DISTINCT FROM OLD.document_kind
     OR NEW.reference_id IS DISTINCT FROM OLD.reference_id
     OR NEW.document_code IS DISTINCT FROM OLD.document_code
     OR NEW.token_sha256 IS DISTINCT FROM OLD.token_sha256
     OR NEW.pdf_sha256 IS DISTINCT FROM OLD.pdf_sha256
     OR NEW.pdf_bytes IS DISTINCT FROM OLD.pdf_bytes
     OR NEW.metadata IS DISTINCT FROM OLD.metadata
     OR NEW.issued_by IS DISTINCT FROM OLD.issued_by
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
     OR (OLD.revoked_at IS NOT NULL AND
       (NEW.revoked_by IS DISTINCT FROM OLD.revoked_by OR
        NEW.revoke_reason IS DISTINCT FROM OLD.revoke_reason))
  THEN
    RAISE EXCEPTION 'El PDF certificado emitido es inmutable; emitir nueva version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgname='trg_slaughterhouse_issued_documents_immutable') THEN
    CREATE TRIGGER trg_slaughterhouse_issued_documents_immutable
    BEFORE UPDATE ON public.slaughterhouse_issued_documents
    FOR EACH ROW EXECUTE FUNCTION public.slaughterhouse_protect_issued_document();
  END IF;
END;
$$;
COMMIT;
