-- Erasure drains the first remaining object batch; listing positions are not
-- stable while the listing is being deleted or old signed uploads finish.
ALTER TABLE "AccountRemoval" DROP COLUMN "cursor";
