ALTER TABLE "Media" ADD COLUMN "aiDeclared" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Media" ADD CONSTRAINT "Media_aiDeclared_purpose" CHECK (NOT "aiDeclared" OR "purpose"='post');
CREATE FUNCTION cubers_media_declaration_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."aiDeclared" IS DISTINCT FROM OLD."aiDeclared" THEN
    RAISE EXCEPTION 'Media declaration is immutable; upload a new file for a new declaration';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Media_declaration_guard" BEFORE UPDATE ON "Media" FOR EACH ROW EXECUTE FUNCTION cubers_media_declaration_guard();
