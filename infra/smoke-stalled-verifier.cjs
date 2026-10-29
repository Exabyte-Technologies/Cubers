#!/usr/local/bin/node
// LOCAL CONTAINER VERIFICATION ONLY. Mounted read-only by compose.smoke.yml;
// absent from production images. The real receipt verifier must kill this child.
if (process.argv[2] !== "cms") process.exit(1);
require("node:fs").writeFileSync(
  "/tmp/cubers-receipt-probe.pid",
  String(process.pid),
  { mode: 0o600, flag: "wx" },
);
setInterval(() => {}, 1000);
