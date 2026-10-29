import "reflect-metadata";
import { Db } from "./services";
import { readConfig } from "./config";
import { Operations } from "./operations";
import { OperationalAlerts } from "./operational-alerts";
import { loadOperationalWebhook } from "./operational-webhook";
import { OperationalOutbox } from "./operational-outbox";
import { OperationalDelivery } from "./operational-delivery";

async function main() {
  const once = process.argv.slice(2).join(" ") === "once";
  if (process.argv.length > 2 && !once)
    throw Error("Use operations-main.js [once]");
  const config = readConfig(),
    db = new Db();
  const operations = new Operations(db, { config }),
    alerts = new OperationalAlerts();
  let delivery: OperationalDelivery | undefined;
  let stopped = false,
    timer: ReturnType<typeof setTimeout> | undefined,
    wake: (() => void) | undefined;
  const stop = () => {
    stopped = true;
    delivery?.stop();
    clearTimeout(timer);
    wake?.();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    if (!once && config.OPERATIONS_ALERT_FILE) {
      const credential = await loadOperationalWebhook(
        config.OPERATIONS_ALERT_FILE,
        config.REGION,
        config.OPERATIONS_ALERT_ALLOWED_HOSTS,
      );
      try {
        delivery = new OperationalDelivery(
          await OperationalOutbox.open(
            config.OPERATIONS_ALERT_OUTBOX_DIRECTORY!,
            credential,
          ),
          credential,
        );
      } catch (e) {
        credential.destroy();
        throw e;
      }
    }
    do {
      if (stopped) break;
      const snapshot = await operations.snapshot();
      if (stopped && !once) break;
      if (once) {
        console.log(JSON.stringify(snapshot));
        if (snapshot.state !== "ok") process.exitCode = 1;
      } else {
        let events;
        try {
          events = delivery
            ? delivery.observe(snapshot)
            : alerts.update(snapshot);
        } catch {
          events = alerts.update(snapshot);
          console.error(
            JSON.stringify({
              event: "cubers.operational.delivery-failed",
              region: config.REGION,
              state: "critical",
              reason: "queue-unavailable",
            }),
          );
        }
        for (const event of events) console.log(JSON.stringify(event));
        if (delivery) {
          try {
            const result = await delivery.run();
            console.log(
              JSON.stringify({
                event: "cubers.operational.delivery",
                region: config.REGION,
                ...result,
              }),
            );
          } catch {
            console.error(
              JSON.stringify({
                event: "cubers.operational.delivery-failed",
                region: config.REGION,
                state: "critical",
                reason: "queue-unavailable",
              }),
            );
          }
        }
        console.log(
          JSON.stringify({
            event: "cubers.operational.sample",
            region: snapshot.region,
            sampledAt: snapshot.sampledAt,
            state: snapshot.state,
          }),
        );
      }
      if (once || stopped) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, 30000);
      });
      wake = undefined;
    } while (!stopped);
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    try {
      await delivery?.close();
    } finally {
      try {
        await operations.onApplicationShutdown();
      } finally {
        await db.$disconnect();
      }
    }
  }
}
void main().catch(() => {
  console.error(
    JSON.stringify({
      event: "cubers.operational.monitor-failed",
      state: "critical",
    }),
  );
  process.exitCode = 1;
});
