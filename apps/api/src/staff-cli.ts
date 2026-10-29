/** Operator-only CLI. Never starts an HTTP listener or accepts browser requests. */
import { PrismaClient } from "@prisma/client";
import {
  prepareStaffAccess,
  applyStaffAccess,
  staffPlanDigest,
} from "./staff-access";
import { readStaffFile, writeStaffFile, consumeStaffFile } from "./staff-files";
async function main() {
  const [mode, inputPath, outputOrConfirmation, ...extra] =
    process.argv.slice(2);
  if (
    extra.length ||
    !["plan", "apply"].includes(mode) ||
    !inputPath ||
    !outputOrConfirmation
  ) {
    console.log(
      "Usage: node apps/api/dist/staff-cli.js plan /private/request.json /private/enrollment.json\n       node apps/api/dist/staff-cli.js apply /private/enrollment.json /private/confirmation.json\nRead docs/STAFF-ACCESS.md first. Inputs must be owned mode-0600 regular files in an owned mode-0700 directory. No secrets belong in argv or stdout.",
    );
    return;
  }
  const region = process.env.REGION;
  if (!["CN", "INTL"].includes(region || "") || !process.env.DATABASE_URL)
    throw Error("Set the intended deployment REGION and DATABASE_URL securely");
  const db = new PrismaClient();
  try {
    const input = await readStaffFile(inputPath);
    if (mode === "plan") {
      const plan = await prepareStaffAccess(db, region!, input.value);
      await writeStaffFile(outputOrConfirmation, plan);
      console.log(
        JSON.stringify({
          status: "prepared",
          planDigest: staffPlanDigest(plan),
          expiresAt: plan.expiresAt,
        }),
      );
    } else {
      if (inputPath === outputOrConfirmation)
        throw Error("Use separate enrollment and confirmation files");
      const confirmation = await readStaffFile(outputOrConfirmation);
      const result = await applyStaffAccess(
        db,
        region!,
        input.value,
        confirmation.value,
      );
      console.log(JSON.stringify({ ...result, status: "applied" }));
      try {
        await consumeStaffFile(inputPath, input.identity);
        await consumeStaffFile(outputOrConfirmation, confirmation.identity);
      } catch {
        console.error(
          "Access change applied, but sensitive input cleanup failed. Remove both private files securely; do not retry the change.",
        );
        process.exitCode = 2;
      }
    }
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    "Staff access was not confirmed. Check protected inputs, current account/factor state and the operator runbook. No credentials or database details are printed.",
  );
  process.exitCode = 1;
});
