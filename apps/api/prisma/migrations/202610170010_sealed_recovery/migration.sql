ALTER TABLE "RecoveryBinding" ADD COLUMN "state" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "RecoveryBinding" ADD CONSTRAINT "RecoveryBinding_state_check" CHECK ("state" IN ('ACTIVE', 'SEALED'));
