ALTER TABLE "Room" ADD COLUMN "mixed" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "mixedScramble" JSONB, ADD COLUMN "mixedScrambleSource" JSONB,
 ADD COLUMN "mixedChallengeDate" TEXT,
 ADD CONSTRAINT "Room_mixed_casual" CHECK (NOT "mixed" OR (NOT "ranked" AND NOT "competitionAttempt"));
ALTER TABLE "RoomMember" ADD COLUMN "input" TEXT,
 ADD CONSTRAINT "RoomMember_input" CHECK ("input" IN ('virtual','scan','smart'));
ALTER TABLE "Attempt" ADD COLUMN "input" TEXT,
 ADD CONSTRAINT "Attempt_input" CHECK ("input" IN ('virtual','scan','smart'));
CREATE FUNCTION guard_mixed_room() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."mixed" IS DISTINCT FROM OLD."mixed" OR
   (OLD."mixed" AND (NEW."input" IS DISTINCT FROM OLD."input" OR
    NEW."puzzle" IS DISTINCT FROM OLD."puzzle" OR NEW."mode" IS DISTINCT FROM OLD."mode")) THEN
   RAISE EXCEPTION 'Room input classification is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Room_mixed_guard" BEFORE UPDATE ON "Room" FOR EACH ROW EXECUTE FUNCTION guard_mixed_room();
CREATE FUNCTION guard_mixed_member() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "Room"; changed BOOLEAN;
BEGIN
 SELECT * INTO r FROM "Room" WHERE id=NEW."roomId" FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Room required'; END IF;
 IF TG_OP='UPDATE' AND (NEW."roomId" IS DISTINCT FROM OLD."roomId" OR NEW."userId" IS DISTINCT FROM OLD."userId") THEN
   RAISE EXCEPTION 'Room membership identity is immutable';
 END IF;
 IF r."mixed" THEN
   changed := TG_OP='INSERT';
   IF TG_OP='UPDATE' THEN changed := NEW."input" IS DISTINCT FROM OLD."input"; END IF;
   IF NEW."input" IS NULL OR (NEW."input"='scan' AND r."mode" NOT IN ('race','daily')) OR
      (NEW."input"='smart' AND r."puzzle"<>'3x3') THEN RAISE EXCEPTION 'Compatible mixed input required'; END IF;
   IF changed AND (r."status"<>'OPEN' OR EXISTS(SELECT 1 FROM "Attempt" WHERE "roomId"=NEW."roomId" AND "userId"=NEW."userId")) THEN
     RAISE EXCEPTION 'Mixed input is frozen';
   END IF;
 ELSIF NEW."input" IS NOT NULL THEN RAISE EXCEPTION 'Ordinary room input is inherited'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "RoomMember_mixed_guard" BEFORE INSERT OR UPDATE ON "RoomMember" FOR EACH ROW EXECUTE FUNCTION guard_mixed_member();
CREATE FUNCTION guard_mixed_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "Room"; chosen TEXT;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF NEW."input" IS DISTINCT FROM OLD."input" OR NEW."roomId" IS DISTINCT FROM OLD."roomId" OR NEW."userId" IS DISTINCT FROM OLD."userId" THEN
     RAISE EXCEPTION 'Attempt input and ownership are immutable';
   END IF;
   RETURN NEW;
 END IF;
 SELECT * INTO r FROM "Room" WHERE id=NEW."roomId" FOR SHARE;
 IF r."mixed" THEN
   SELECT "input" INTO chosen FROM "RoomMember" WHERE "roomId"=NEW."roomId" AND "userId"=NEW."userId";
   IF chosen IS NULL OR NEW."input" IS DISTINCT FROM chosen OR r."ranked" OR r."competitionAttempt" OR r."status"<>'ACTIVE' THEN
     RAISE EXCEPTION 'Mixed attempt input must match active membership';
   END IF;
 ELSIF NEW."input" IS NOT NULL THEN RAISE EXCEPTION 'Ordinary attempt input is inherited'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Attempt_mixed_guard" BEFORE INSERT OR UPDATE ON "Attempt" FOR EACH ROW EXECUTE FUNCTION guard_mixed_attempt();
