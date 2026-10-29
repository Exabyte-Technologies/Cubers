import {
  Injectable,
  Inject,
  OnApplicationShutdown,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createTransport } from "nodemailer";
import type { Config } from "./config";
import { WcaScrambles } from "./wca-scrambles";
import { OperationalTelemetry } from "./operational-telemetry";
export const CONFIG = "CONFIG";
@Injectable()
export class Db extends PrismaClient implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
@Injectable()
export class Infrastructure implements OnApplicationShutdown {
  playIntegrityUnavailable = false;
  redis: Redis;
  storage: S3Client;
  scrambles: WcaScrambles;
  telemetry: OperationalTelemetry;
  constructor(@Inject(CONFIG) public config: Config) {
    this.scrambles = new WcaScrambles(config);
    this.redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2 });
    this.telemetry = new OperationalTelemetry(this.redis, config.REGION);
    this.storage = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY,
        secretAccessKey: config.S3_SECRET_KEY,
      },
    });
  }
  async limit(key: string, count: number, seconds: number) {
    const n = (await this.redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      1,
      `${this.config.REGION}:${key}`,
      seconds,
    )) as number;
    return n <= count;
  }
  async mail(to: string, subject: string, text: string) {
    try {
      if (!this.config.SMTP_URL)
        throw new Error("Email transport is not configured");
      await createTransport(this.config.SMTP_URL).sendMail({
        from: this.config.MAIL_FROM,
        to,
        subject,
        text,
      });
    } catch (error) {
      await this.telemetry.safely("smtp", false);
      throw error;
    }
    await this.telemetry.safely("smtp", true);
  }
  uploadUrl(key: string, type: string, size: number) {
    return getSignedUrl(
      this.storage,
      new PutObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: key,
        ContentType: type,
        ContentLength: size,
      }),
      { expiresIn: 300 },
    );
  }
  downloadUrl(key: string, expiresAt?: number) {
    const signingDate = new Date();
    const expiresIn =
      expiresAt === undefined
        ? 120
        : Math.min(120, Math.floor((expiresAt - signingDate.getTime()) / 1000));
    if (!Number.isFinite(expiresIn) || expiresIn < 1)
      throw new ForbiddenException("Media retention expired");
    return getSignedUrl(
      this.storage,
      new GetObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }),
      { expiresIn, signingDate },
    );
  }
  head(key: string) {
    return this.storage.send(
      new HeadObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }),
    );
  }
  delete(key: string) {
    return this.storage.send(
      new DeleteObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }),
    );
  }
  async close() {
    await this.scrambles.close();
    this.redis.disconnect();
    this.storage.destroy();
  }
  async onApplicationShutdown() {
    await this.close();
  }
}
