-- A name-only approval cannot authorize later publication of a private bio.
ALTER TABLE "User" ADD COLUMN "profileBioReviewed" BOOLEAN NOT NULL DEFAULT false;
