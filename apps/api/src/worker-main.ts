import { reconcileDeletionJournal } from "./recovery";
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { readConfig } from "./config";
import { CONFIG, Db, Infrastructure } from "./services";
import { Background } from "./worker";
import { AppleReceiptMaintenance } from "./attestation/receipt-maintenance";
import { AppAttestationCrypto } from "./attestation/provider";

class WorkerReceiptCrypto extends AppAttestationCrypto {
  override async onModuleInit() {
    // Manual-only installations need not mount verification secrets in workers.
    if (this.infra.config.APP_ATTESTATION_APPLE_AUTO_REFRESH === "true")
      await super.onModuleInit();
  }
}

@Module({
  providers: [
    { provide: CONFIG, useFactory: () => readConfig() },
    Db,
    Infrastructure,
    {
      provide: AppAttestationCrypto,
      useFactory: (infra: Infrastructure) => new WorkerReceiptCrypto(infra),
      inject: [Infrastructure],
    },
    AppleReceiptMaintenance,
    Background,
  ],
})
class WorkerModule {}
async function bootstrapWorker() {
  // Validate and replay before creating a queue worker, so a restored database
  // is never processed while its independent deletion history is unverified.
  const preflight = new Db();
  try {
    await reconcileDeletionJournal(preflight, readConfig());
  } finally {
    await preflight.$disconnect();
  }
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["error", "warn", "log"],
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    // Drain the active job before Nest closes its database/cache providers.
    await app.get(Background).onModuleDestroy();
    await app.close();
  };
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());
}
void bootstrapWorker();
