import { AppAttestations } from "./app-attestation";
import { AppAttestationController } from "./app-attestation.controller";
import { AppAttestationCrypto } from "./attestation/provider";
import { ReplayShares } from "./replay-shares";
import {
  ReplaySharesController,
  GuardianReplaySharesController,
  AdminReplaySharesController,
  SharedReplaysController,
} from "./replay-shares.controller";
import { SmartAttemptController } from "./smart-attempt.controller";
import { SmartPlayAccess } from "./smart-play-access";
import { Campaigns, CampaignsController } from "./campaigns";
import { DeviceTesting, DeviceTestingController } from "./device-testing";
import {
  Announcements,
  AnnouncementsController,
  AdminAnnouncementsController,
} from "./announcements";
import { reconcileInterruptedRelays } from "./relay";
import { reconcileDeletionJournal } from "./recovery";
import "reflect-metadata";
import { Competitions } from "./competitions";
import {
  CompetitionsController,
  AdminCompetitionsController,
  AdminCompetitionPublicationsController,
  GuardianCompetitionPublicationsController,
} from "./competitions.controller";
import {
  Module,
  Controller,
  Get,
  Param,
  Inject,
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
  ServiceUnavailableException,
  Req,
} from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { ZodError } from "zod";
import helmet from "helmet";
import { Prisma } from "@prisma/client";
import { readConfig } from "./config";
import { CONFIG, Db, Infrastructure } from "./services";
import { Public, Security } from "./security";
import { AuthController } from "./auth.controller";
import { CourseEditing, CourseEditingController } from "./course-editing";
import { LearningController } from "./learning.controller";
import { SmartFirstSolveController } from "./smart-first-solve.controller";
import {
  SmartLearningController,
  SmartLessonAccess,
} from "./smart-learning.controller";
import { CommunityController } from "./community.controller";
import { PlayController } from "./play.controller";
import { AdminController } from "./admin.controller";
import { MediaController } from "./media.controller";
import { PlayGateway } from "./gateway";
import { Background } from "./worker";
import { legalDocuments, regionalLegalDocument } from "./legal";
import { ProfileController } from "./profile.controller";
import { Connections } from "./connections";
import { ConnectionsController } from "./connections.controller";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { allowedOrigin, proxyTrust } from "./network-security";
import { ProtectedSocketAdapter } from "./socket-adapter";
import { Profiles } from "./profiles";
import { ProfilesController } from "./profiles.controller";
import { Operations } from "./operations";
import { PlayIntegrityProvider } from "./attestation/google-provider";
import { OperationsController } from "./operations.controller";
import { CommunityRegion } from "./community-region";
import { AssessmentController } from "./assessment.controller";
import { FirstSolveController } from "./first-solve.controller";
import { FirstSolveSolver } from "./first-solve-solver";
import { NotificationsController } from "./notifications.controller";
import { Replays } from "./replays";
import { AchievementCards } from "./achievement-cards";
import {
  AchievementCardsController,
  GuardianCardsController,
  AdminCardsController,
} from "./achievement-cards.controller";
@Controller("v1")
class PublicController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
    @Inject(CommunityRegion) private communityRegion: CommunityRegion,
  ) {}
  @Public() @Get("community-region") region(
    @Req() r: import("express").Request,
  ) {
    // Express derives this IP only from the socket and configured trusted hops.
    // Country headers, query strings and request bodies are never consulted.
    return this.communityRegion.detect(r.ip);
  }
  @Public() @Get("health") async health() {
    if (this.infra.playIntegrityUnavailable)
      throw new ServiceUnavailableException(
        "Play integrity reconciliation required",
      );
    await this.db.$queryRaw`SELECT 1`;
    await this.infra.redis.ping();
    return {
      status: "ok",
      region: this.infra.config.REGION,
      aiMode: this.infra.config.AI_MODE,
    };
  }
  @Public() @Get("legal/:slug") legal(@Param("slug") slug: string) {
    if (!Object.hasOwn(legalDocuments, slug))
      throw new HttpException("Not found", 404);
    return {
      ...regionalLegalDocument(slug, this.infra.config.REGION),
      ...(slug === "deletion"
        ? {
            actionUrl: `${this.infra.config.APP_ORIGIN.replace(/\/$/, "")}/delete-account?community=${this.infra.config.REGION}`,
          }
        : {}),
    };
  }
}
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (error instanceof ZodError)
      return response.status(400).json({
        message: "Invalid request",
        issues: error.issues.slice(0, 20).map((x) => ({
          path: x.path.join("."),
          message: x.message,
        })),
      });
    if (error instanceof HttpException)
      return response.status(error.getStatus()).json(error.getResponse());
    const parserType = (error as { type?: string })?.type;
    if (parserType === "entity.too.large")
      return response
        .status(413)
        .json({ message: "Request body exceeds limit" });
    if (
      parserType === "encoding.unsupported" ||
      parserType === "charset.unsupported"
    )
      return response
        .status(415)
        .json({ message: "Unsupported request encoding" });
    if (
      parserType === "entity.parse.failed" ||
      parserType === "request.size.invalid"
    )
      return response.status(400).json({ message: "Invalid JSON request" });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const status =
        error.code === "P2002" ? 409 : error.code === "P2025" ? 404 : 400;
      return response.status(status).json({
        message:
          status === 409
            ? "This action conflicts with an existing record"
            : status === 404
              ? "Not found"
              : "Request could not be applied",
      });
    }
    console.error("Unhandled request failure; inspect redacted diagnostics");
    return response
      .status(500)
      .json({ message: "Service unavailable. Please try again." });
  }
}
const config = readConfig();
@Module({
  controllers: [
    OperationsController,
    AppAttestationController,
    ReplaySharesController,
    GuardianReplaySharesController,
    AdminReplaySharesController,
    SharedReplaysController,
    DeviceTestingController,
    AnnouncementsController,
    AdminAnnouncementsController,
    CampaignsController,
    CompetitionsController,
    AdminCompetitionsController,
    AdminCompetitionPublicationsController,
    GuardianCompetitionPublicationsController,
    NotificationsController,
    PublicController,
    AuthController,
    LearningController,
    SmartLearningController,
    SmartFirstSolveController,
    SmartAttemptController,
    CourseEditingController,
    AssessmentController,
    FirstSolveController,
    CommunityController,
    PlayController,
    AdminController,
    MediaController,
    ProfileController,
    AchievementCardsController,
    GuardianCardsController,
    AdminCardsController,
    ConnectionsController,
    ProfilesController,
  ],
  providers: [
    PlayIntegrityProvider,
    Operations,
    AppAttestations,
    AppAttestationCrypto,
    { provide: CONFIG, useValue: config },
    Db,
    Infrastructure,
    SmartLessonAccess,
    SmartPlayAccess,
    Background,
    PlayGateway,
    { provide: APP_GUARD, useClass: Security },
    PlayController,
    Connections,
    Profiles,
    CommunityRegion,
    FirstSolveSolver,
    Replays,
    ReplayShares,
    AchievementCards,
    CourseEditing,
    Campaigns,
    Announcements,
    DeviceTesting,
    Competitions,
  ],
})
class AppModule {}
export async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn", "log"],
    bodyParser: false,
  });
  app.set("trust proxy", proxyTrust(config.TRUSTED_PROXY_CIDRS));
  app.useWebSocketAdapter(
    new ProtectedSocketAdapter(
      app,
      app.get(Infrastructure),
      app.get(CommunityRegion),
    ),
  );
  app.use(helmet());
  // Authenticated views and permission failures must not be reused from a
  // browser/proxy cache after a user withdraws sharing or blocks an account.
  app.use(
    (
      _request: import("express").Request,
      response: import("express").Response,
      next: import("express").NextFunction,
    ) => {
      response.setHeader("Cache-Control", "private, no-store");
      next();
    },
  );
  app.use(
    (
      request: import("express").Request,
      response: import("express").Response,
      next: import("express").NextFunction,
    ) => {
      if (
        !allowedOrigin(request.headers.origin, [
          config.APP_ORIGIN,
          config.ADMIN_ORIGIN,
        ])
      )
        return response.status(403).json({ message: "Origin not allowed" });
      if (
        ["POST", "PATCH", "PUT"].includes(request.method) &&
        (request.headers["transfer-encoding"] ||
          Number(request.headers["content-length"] || 0) > 0) &&
        !request.is("application/json")
      )
        return response
          .status(415)
          .json({ message: "JSON content type required" });
      next();
    },
  );
  app.useBodyParser("json", { limit: "128kb", inflate: false, strict: true });
  app.enableCors({
    origin: [config.APP_ORIGIN, config.ADMIN_ORIGIN],
    credentials: false,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  });
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  // The current deployment supports one realtime API process. A restarted
  // process cannot verify continuity of an already-running ranked solve.
  await app.get(Db).attempt.updateMany({
    where: {
      OR: [
        { status: { in: ["INSPECTION", "SOLVING"] } },
        { status: "CREATED", recordingAt: { not: null } },
      ],
    },
    data: {
      status: "INTERRUPTED",
      reason: "Server restarted; attempt continuity lost",
      version: { increment: 1 },
    },
  });
  await reconcileInterruptedRelays(app.get(Db));
  if (config.NODE_ENV === "development") {
    const { SwaggerModule, DocumentBuilder } = await import("@nestjs/swagger");
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Cubers API")
        .setVersion("1")
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup("api-docs", app, document);
  }
  await reconcileDeletionJournal(app.get(Db), config);
  await app.listen(
    config.PORT,
    config.HOST || (config.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  );
  const server = app.getHttpServer() as import("node:http").Server;
  server.headersTimeout = 10000;
  server.requestTimeout = 30000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 1000;
  return app;
}
if (require.main === module) void bootstrap();
