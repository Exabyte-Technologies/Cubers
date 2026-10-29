import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Inject,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  HttpException,
  ConflictException,
} from "@nestjs/common";
import { z } from "zod";
import { notifyUser } from "./notifications";
import { CreatePost, permissions } from "@cubers/core";
import { Db, Infrastructure } from "./services";
import { communityWrite, type CommunityActor } from "./community-authority";
import {
  accountPolicy,
  accountPolicies,
  eligibleGuardian,
  type Authed,
} from "./security";
import { communityAvailable, readableClub } from "./community-access";
import type { Prisma, Club as DbClub, Post as DbPost } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { opaque, hash } from "./crypto";
import { eligiblePostIds } from "./publication";
const author = { select: { id: true, displayName: true } };
@Controller("v1")
export class CommunityController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Infrastructure) private infra: Infrastructure,
  ) {}
  private canPublish(r: Pick<Authed, "policy">) {
    if (!permissions(r.policy).canPost)
      throw new ForbiddenException(
        "Posting requires identity verification and applicable guardian consent",
      );
    communityAvailable(this.infra.config);
  }

  private async visible(
    r: Pick<Authed, "user">,
    id: string,
    tx?: Prisma.TransactionClient,
  ) {
    communityAvailable(this.infra.config);
    z.string().uuid().parse(id);
    const db = tx ?? this.db;
    if (tx)
      await tx.$queryRaw`SELECT id FROM "Post" WHERE id=${id}::uuid FOR SHARE`;
    const p = await db.post.findUnique({ where: { id } });
    if (!p || p.status !== "PUBLISHED") throw new NotFoundException();
    if (!(await eligiblePostIds(db, [p])).has(p.id))
      throw new NotFoundException();
    if (p.clubId) {
      if (tx)
        await tx.$queryRaw`SELECT id FROM "Club" WHERE id=${p.clubId}::uuid FOR SHARE`;
      if (!(await readableClub(db, r.user.id, p.clubId)))
        throw new NotFoundException();
    }
    const block = await db.social.findFirst({
      where: {
        kind: "block",
        OR: [
          {
            actorId: r.user.id,
            targetId: { equals: p.authorId, mode: "insensitive" },
          },
          {
            actorId: p.authorId,
            targetId: { equals: r.user.id, mode: "insensitive" },
          },
        ],
      },
    });
    if (block) throw new NotFoundException();
    return p;
  }
  private async decorate(
    r: Authed,
    rows: (DbPost & {
      author: { id: string; displayName: string };
      _count: { comments: number };
    })[],
  ) {
    const ids = rows.map((row) => row.id),
      authorIds = rows.map((row) => row.authorId);
    const [actions, likes] = await Promise.all([
      this.db.social.findMany({
        where: {
          actorId: r.user.id,
          targetId: { in: [...ids, ...authorIds] },
          kind: { in: ["like", "save", "follow"] },
        },
      }),
      this.db.social.groupBy({
        by: ["targetId"],
        where: { targetId: { in: ids }, kind: "like" },
        _count: { _all: true },
      }),
    ]);
    const selected = new Set(
        actions.map((action) => `${action.kind}:${action.targetId}`),
      ),
      counts = new Map(likes.map((like) => [like.targetId, like._count._all]));
    return rows.map(({ reason, ...row }) => ({
      ...row,
      ...(row.authorId === r.user.id ? { reason } : {}),
      likes: counts.get(row.id) || 0,
      viewer: {
        liked: selected.has(`like:${row.id}`),
        saved: selected.has(`save:${row.id}`),
        following: selected.has(`follow:${row.authorId}`),
      },
    }));
  }
  @Get("feed") async feed(@Req() r: Authed, @Query() query: unknown) {
    communityAvailable(this.infra.config);
    const b = z
      .object({
        kind: z
          .enum(["explore", "following", "clubs", "saved"])
          .default("explore"),
        q: z.string().max(100).default(""),
        tag: z
          .string()
          .regex(/^[\p{L}\p{N}_-]{1,30}$/u)
          .optional(),
        clubId: z.string().uuid().optional(),
        postKind: z.enum(["DISCUSSION", "ANNOUNCEMENT"]).optional(),
        cursor: z
          .string()
          .regex(/^[A-Za-z0-9_-]{43}$/)
          .optional(),
      })
      .strict()
      .parse(query);
    if (b.clubId && !(await readableClub(this.db, r.user.id, b.clubId)))
      throw new NotFoundException();
    if (!(await this.infra.limit("feed-page:" + r.user.id, 60, 60)))
      throw new HttpException("Feed request limit reached", 429);
    const scope = JSON.stringify({
      kind: b.kind,
      q: b.q.trim(),
      tag: b.tag?.normalize("NFC").toLowerCase(),
      clubId: b.clubId?.toLowerCase(),
      postKind: b.postKind,
    });
    const cursorKey = (token: string) =>
      this.infra.config.REGION + ":feed-cursor:" + hash(token);
    let after: { at: Date; id: string } | undefined;
    if (b.cursor) {
      const raw = await this.infra.redis.get(cursorKey(b.cursor));
      const cursor = raw ? JSON.parse(raw) : null;
      if (!cursor || cursor.viewer !== r.user.id || cursor.scope !== scope)
        throw new BadRequestException(
          "Feed cursor expired or belongs to another view",
        );
      after = {
        at: new Date(cursor.at),
        id: z.string().uuid().parse(cursor.last),
      };
    }
    const social = await this.db.social.findMany({
      where: {
        OR: [
          {
            actorId: r.user.id,
            kind: { in: ["block", "mute", "follow", "save"] },
          },
          {
            targetId: { equals: r.user.id, mode: "insensitive" },
            kind: "block",
          },
        ],
      },
    });
    const excluded = social
      .filter((item) => item.kind === "block" || item.kind === "mute")
      .map((item) =>
        item.actorId === r.user.id ? item.targetId.toLowerCase() : item.actorId,
      );
    const follows = social
        .filter((item) => item.kind === "follow")
        .map((item) => item.targetId),
      saved = social
        .filter((item) => item.kind === "save")
        .map((item) => item.targetId);
    const memberships = await this.db.membership.findMany({
      where: { userId: r.user.id, status: "APPROVED" },
    });
    const clubs = await this.db.club.findMany({
      where: {
        status: "APPROVED",
        OR: [
          { private: false },
          { id: { in: memberships.map((member) => member.clubId) } },
        ],
      },
      select: { id: true },
    });
    const accessible = [
      ...clubs.map((club) => club.id),
      ...(b.clubId ? [b.clubId] : []),
    ];
    const tag = b.tag?.normalize("NFC").toLowerCase(),
      text = b.q.trim();
    const rows = await this.db.post.findMany({
      where: {
        status: "PUBLISHED",
        authorId: {
          notIn: excluded,
          ...(b.kind === "following" ? { in: follows } : {}),
        },
        ...(b.kind === "saved" ? { id: { in: saved } } : {}),
        ...(b.clubId ? { clubId: b.clubId } : {}),
        ...(b.postKind ? { kind: b.postKind } : {}),
        ...(tag ? { tags: { has: tag } } : {}),
        AND: [
          ...(after
            ? [
                {
                  OR: [
                    { createdAt: { lt: after.at } },
                    { createdAt: after.at, id: { lt: after.id } },
                  ],
                },
              ]
            : []),
          { OR: [{ clubId: null }, { clubId: { in: accessible } }] },
          ...(b.kind === "clubs"
            ? [{ clubId: { in: memberships.map((member) => member.clubId) } }]
            : []),
          ...(text
            ? [
                {
                  OR: [
                    { body: { contains: text, mode: "insensitive" as const } },
                    {
                      tags: {
                        has: text
                          .replace(/^#/, "")
                          .normalize("NFC")
                          .toLowerCase(),
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      take: 21,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        author,
        _count: { select: { comments: { where: { status: "PUBLISHED" } } } },
      },
    });
    const allowed = await eligiblePostIds(this.db, rows.slice(0, 20));
    let nextCursor: string | null = null;
    if (rows.length > 20) {
      nextCursor = opaque();
      const last = rows[19];
      await this.infra.redis.set(
        cursorKey(nextCursor),
        JSON.stringify({
          viewer: r.user.id,
          scope,
          at: last.createdAt.toISOString(),
          last: last.id,
        }),
        "EX",
        900,
      );
    }
    return {
      items: await this.decorate(
        r,
        rows.slice(0, 20).filter((row) => allowed.has(row.id)),
      ),
      nextCursor,
    };
  }
  @Get("posts/mine") async mine(@Req() r: Authed) {
    return this.db.post.findMany({
      where: { authorId: r.user.id },
      orderBy: { createdAt: "desc" },
    });
  }
  @Get("posts/:id") async post(@Req() r: Authed, @Param("id") id: string) {
    z.string().uuid().parse(id);
    const row = await this.db.post.findUnique({
      where: { id },
      include: {
        author,
        _count: { select: { comments: { where: { status: "PUBLISHED" } } } },
      },
    });
    if (!row) throw new NotFoundException();
    if (row.authorId !== r.user.id) await this.visible(r, id);
    return (await this.decorate(r, [row]))[0];
  }
  private async media(
    tx: Prisma.TransactionClient,
    r: Pick<Authed, "user">,
    ids: string[],
  ) {
    if (
      new Set(ids).size !== ids.length ||
      (ids.length &&
        (await tx.media.count({
          where: {
            id: { in: ids },
            userId: r.user.id,
            purpose: "post",
            status: "READY",
          },
        })) !== ids.length)
    )
      throw new BadRequestException(
        "Media must finish safety processing first",
      );
    const claims = await tx.media.findMany({
      where: { id: { in: ids } },
      select: { aiLabel: true, aiDeclared: true },
    });
    return {
      declared: claims.some((m) => m.aiDeclared),
      sourceLabel:
        claims
          .map((m) => m.aiLabel)
          .filter((v): v is string => v !== null)
          .sort()[0] ?? null,
    };
  }
  private async club(
    tx: Prisma.TransactionClient,
    r: Pick<Authed, "user" | "policy">,
    id: string | undefined,
    kind: string,
  ) {
    if (!id) {
      if (kind === "ANNOUNCEMENT")
        throw new BadRequestException("Announcements belong to a club");
      return;
    }
    await tx.$queryRaw`SELECT id FROM "Club" WHERE id=${id}::uuid FOR SHARE`;
    const club = await tx.club.findFirst({ where: { id, status: "APPROVED" } });
    if (
      !club ||
      !(await tx.membership.findFirst({
        where: { clubId: id, userId: r.user.id, status: "APPROVED" },
      }))
    )
      throw new ForbiddenException("Approved club membership required");
    if (
      kind === "ANNOUNCEMENT" &&
      (club.ownerId !== r.user.id || r.policy.age < 18 || !r.user.adultVerified)
    )
      throw new ForbiddenException(
        "Only the verified adult club owner can announce",
      );
  }
  @Post("posts") async create(@Req() r: Authed, @Body() body: unknown) {
    this.canPublish(r);
    const b = CreatePost.parse(body);
    if (!(await this.infra.limit(`post:${r.user.id}`, 10, 3600)))
      throw new HttpException("Posting limit reached", 429);
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "post",
      [],
      async (tx, current) => {
        const mediaClaims = await this.media(tx, current, b.mediaIds);
        const aiSourceLabel = mediaClaims.sourceLabel;
        await this.club(tx, current, b.clubId, b.kind);
        return tx.post.create({
          data: {
            ...b,
            aiGenerated:
              b.aiGenerated || !!aiSourceLabel || mediaClaims.declared,
            aiSourceLabel,
            authorId: r.user.id,
            status: "PENDING",
            guardianApproved: !permissions(current.policy).needsPostApproval,
          },
        });
      },
    );
  }
  @Patch("posts/:id") async edit(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    this.canPublish(r);
    const { revision, ...b } = CreatePost.extend({
      revision: z.number().int().positive().optional(),
    }).parse(body);
    const p = await this.db.post.findFirst({
      where: { id, authorId: r.user.id },
    });
    if (!p) throw new NotFoundException();
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "post",
      [],
      async (tx, current) => {
        await tx.$queryRaw`SELECT id FROM "Post" WHERE id=${id}::uuid FOR UPDATE`;
        const mediaClaims = await this.media(tx, current, b.mediaIds);
        const aiSourceLabel = mediaClaims.sourceLabel;
        await this.club(tx, current, b.clubId, b.kind);
        const updated = await tx.post.updateMany({
          where: { id, authorId: r.user.id, ...(revision ? { revision } : {}) },
          data: {
            ...b,
            aiGenerated:
              b.aiGenerated || !!aiSourceLabel || mediaClaims.declared,
            aiSourceLabel,
            status: "PENDING",
            guardianApproved: !permissions(current.policy).needsPostApproval,
            moderatorApproved: false,
            revision: { increment: 1 },
            reason: null,
          },
        });
        if (!updated.count)
          throw new ConflictException("Post changed; reload before editing");
        return tx.post.findUniqueOrThrow({ where: { id } });
      },
    );
  }
  @Delete("posts/:id") async remove(@Req() r: Authed, @Param("id") id: string) {
    z.string().uuid().parse(id);
    return communityWrite(this.db, this.infra.config, r, "learn", [], (tx) =>
      tx.post.deleteMany({ where: { id, authorId: r.user.id } }),
    );
  }
  @Post("guardian/posts/:id/approve") async guardianApprove(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const b = z
      .object({ revision: z.number().int().positive() })
      .strict()
      .parse(body);
    z.string().uuid().parse(id);
    const original = await this.db.post.findUnique({ where: { id } });
    if (!original) throw new ForbiddenException();
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "learn",
      [original.authorId],
      async (tx, current) => {
        await tx.$queryRaw`SELECT id FROM "Post" WHERE id=${id}::uuid FOR UPDATE`;
        const post = await tx.post.findUnique({ where: { id } });
        if (!post || post.authorId !== original.authorId)
          throw new ConflictException("Post changed; reopen the review");
        const child = await tx.user.findUnique({
            where: { id: post.authorId },
          }),
          consent = await tx.consent.findUnique({
            where: { childId: post.authorId },
          });
        const policy = child
          ? permissions(await accountPolicy(tx, child))
          : null;
        if (
          !child ||
          child.deletedAt ||
          !child.emailVerified ||
          child.region !== this.infra.config.REGION ||
          !eligibleGuardian(current.user, child.region) ||
          !policy?.canPost ||
          !policy.needsPostApproval ||
          consent?.guardianId !== current.user.id ||
          consent.status !== "APPROVED" ||
          !consent.publicPosting
        )
          throw new ForbiddenException(
            "Current linked guardian and posting permission required",
          );
        const result = await tx.post.updateMany({
          where: { id, revision: b.revision, status: "PENDING" },
          data: { guardianApproved: true },
        });
        if (!result.count)
          throw new BadRequestException(
            "Post changed; review its current revision",
          );
        return { ok: true };
      },
    );
  }
  @Get("posts/:id/comments/page") async commentsPage(
    @Req() r: Authed,
    @Param("id") id: string,
    @Query() query: unknown,
  ) {
    const request = z
      .object({
        cursor: z
          .string()
          .regex(/^[A-Za-z0-9_-]{43}$/)
          .optional(),
      })
      .strict()
      .parse(query);
    return this.commentPage(r, id, request.cursor);
  }
  @Get("posts/:id/comments") async comments(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    // Retain the original bounded array response for older development clients.
    return (await this.commentPage(r, id, undefined, 100, false)).items;
  }
  private async commentPage(
    r: Authed,
    id: string,
    token?: string,
    limit = 20,
    paginate = true,
  ) {
    await this.visible(r, id);
    if (!(await this.infra.limit("comment-page:" + r.user.id, 60, 60)))
      throw new HttpException("Discussion request limit reached", 429);
    const cursorKey = (value: string) =>
      this.infra.config.REGION + ":comment-cursor:" + hash(value);
    let after: { at: Date; id: string } | undefined;
    if (token) {
      const raw = await this.infra.redis.get(cursorKey(token));
      const cursor = raw ? JSON.parse(raw) : null;
      if (!cursor || cursor.viewer !== r.user.id || cursor.post !== id)
        throw new BadRequestException(
          "Discussion cursor expired or belongs to another view",
        );
      after = {
        at: new Date(cursor.at),
        id: z.string().uuid().parse(cursor.last),
      };
    }
    const blocks = await this.db.social.findMany({
      where: {
        kind: "block",
        OR: [
          { actorId: r.user.id },
          { targetId: { equals: r.user.id, mode: "insensitive" } },
        ],
      },
    });
    const excluded = new Set(
      blocks.map((block) =>
        block.actorId === r.user.id
          ? block.targetId.toLowerCase()
          : block.actorId,
      ),
    );
    const rows = await this.db.comment.findMany({
      where: {
        postId: id,
        status: "PUBLISHED",
        ...(after
          ? {
              OR: [
                { createdAt: { gt: after.at } },
                { createdAt: after.at, id: { gt: after.id } },
              ],
            }
          : {}),
      },
      include: { author },
      take: limit + 1,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const candidates = rows.slice(0, limit);
    const byId = new Map(candidates.map((row) => [row.id, row]));
    // A reply may be on a later page than its ancestors. Fetch at most five
    // parent generations, always from this post, and apply current policy to all.
    for (let depth = 0; depth < 5; depth++) {
      const missing = [
        ...new Set(
          [...byId.values()]
            .map((row) => row.parentId)
            .filter(
              (parent): parent is string => !!parent && !byId.has(parent),
            ),
        ),
      ];
      if (!missing.length) break;
      const parents = await this.db.comment.findMany({
        where: { id: { in: missing }, postId: id },
        include: { author },
      });
      for (const parent of parents) byId.set(parent.id, parent);
    }
    const users = await this.db.user.findMany({
      where: {
        id: { in: [...new Set([...byId.values()].map((row) => row.authorId))] },
        deletedAt: null,
        emailVerified: true,
      },
    });
    const policies = await accountPolicies(this.db, users);
    const allowed = new Set(
      users
        .filter((user) => {
          const policy = permissions(policies.get(user.id)!);
          return (
            !excluded.has(user.id) &&
            policy.canPost &&
            !policy.needsPostApproval
          );
        })
        .map((user) => user.id),
    );
    const readable = (row: (typeof candidates)[number]) => {
      let current: typeof row | undefined = row,
        depth = 0;
      const seen = new Set<string>();
      while (current) {
        if (
          seen.has(current.id) ||
          depth++ > 5 ||
          current.status !== "PUBLISHED" ||
          !allowed.has(current.authorId)
        )
          return false;
        seen.add(current.id);
        if (!current.parentId) return true;
        current = byId.get(current.parentId);
      }
      return false;
    };
    const items = candidates.filter(readable);
    const itemIds = new Set(items.map((row) => row.id));
    const contextIds = new Set<string>();
    for (const item of items) {
      let parent = item.parentId;
      while (parent) {
        if (!itemIds.has(parent)) contextIds.add(parent);
        parent = byId.get(parent)!.parentId;
      }
    }
    const context = [...contextIds].map((parent) => byId.get(parent)!);
    let nextCursor: string | null = null;
    if (paginate && rows.length > limit) {
      const last = candidates.at(-1)!;
      nextCursor = opaque();
      await this.infra.redis.set(
        cursorKey(nextCursor),
        JSON.stringify({
          viewer: r.user.id,
          post: id,
          at: last.createdAt.toISOString(),
          last: last.id,
        }),
        "EX",
        900,
      );
    }
    return { items, context, nextCursor };
  }
  private async ancestors(
    db: Prisma.TransactionClient,
    id: string,
    parentId?: string,
    lock = false,
  ) {
    let parent = parentId;
    const seen = new Set<string>(),
      chain: Prisma.CommentGetPayload<{ include: { author: true } }>[] = [];
    while (parent) {
      if (seen.has(parent.toLowerCase()) || chain.length >= 5)
        throw new BadRequestException("Reply nesting limit reached");
      seen.add(parent.toLowerCase());
      if (lock)
        await db.$queryRaw`SELECT id FROM "Comment" WHERE id=${parent}::uuid FOR SHARE`;
      const previous = await db.comment.findFirst({
        where: { id: parent, postId: id, status: "PUBLISHED" },
        include: { author: true },
      });
      if (!previous || previous.author.deletedAt)
        throw new BadRequestException("Invalid parent comment");
      chain.push(previous);
      parent = previous.parentId ?? undefined;
    }
    return chain;
  }
  @Post("posts/:id/comments") async comment(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    this.canPublish(r);
    z.string().uuid().parse(id);
    const b = z
      .object({
        body: z.string().trim().min(1).max(1000),
        parentId: z.string().uuid().optional(),
      })
      .strict()
      .parse(body);
    if (!(await this.infra.limit(`comment:${r.user.id}`, 20, 3600)))
      throw new HttpException("Reply limit reached", 429);
    const original = await this.db.post.findUnique({ where: { id } });
    if (!original) throw new NotFoundException();
    const initial = await this.ancestors(this.db, id, b.parentId);
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "post",
      [original.authorId, ...initial.map((row) => row.authorId)],
      async (tx, current, locked) => {
        const post = await this.visible(current, id, tx);
        if (!locked.has(post.authorId))
          throw new ConflictException("Conversation changed; reopen it");
        if (permissions(current.policy).needsPostApproval)
          throw new ForbiddenException(
            "Use a guardian-reviewed post for younger-child contributions",
          );
        const chain = await this.ancestors(tx, id, b.parentId, true);
        for (const previous of chain) {
          if (!locked.has(previous.authorId))
            throw new ConflictException("Reply context changed; reopen it");
          const policy = permissions(await accountPolicy(tx, previous.author));
          if (
            previous.author.region !== this.infra.config.REGION ||
            !previous.author.emailVerified ||
            !policy.canPost ||
            policy.needsPostApproval
          )
            throw new BadRequestException("Parent reply is unavailable");
        }
        const parentAuthors = chain.map((row) => row.authorId);
        if (
          await tx.social.findFirst({
            where: {
              kind: "block",
              OR: [
                {
                  actorId: current.user.id,
                  targetId: { in: parentAuthors, mode: "insensitive" },
                },
                {
                  actorId: { in: parentAuthors },
                  targetId: { equals: current.user.id, mode: "insensitive" },
                },
              ],
            },
          })
        )
          throw new ForbiddenException("Parent reply is unavailable");
        return tx.comment.create({
          data: { ...b, postId: id, authorId: current.user.id },
        });
      },
    );
  }
  @Post("social") async social(@Req() r: Authed, @Body() body: unknown) {
    communityAvailable(this.infra.config);
    const b = z
      .object({
        targetId: z
          .string()
          .uuid()
          .transform((id) => id.toLowerCase()),
        kind: z.enum([
          "follow",
          "friend",
          "mentorship",
          "like",
          "save",
          "block",
          "mute",
        ]),
        enabled: z.boolean(),
      })
      .strict()
      .parse(body);
    if (b.targetId === r.user.id)
      throw new BadRequestException("Choose another account");
    if (b.enabled && ["friend", "mentorship"].includes(b.kind))
      throw new ForbiddenException(
        "Connections require the controlled acceptance workflow; use moderated club discussions meanwhile",
      );
    const original = ["like", "save"].includes(b.kind)
      ? await this.db.post.findUnique({ where: { id: b.targetId } })
      : null;
    if (["like", "save"].includes(b.kind) && !original)
      throw new NotFoundException();
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "learn",
      [original?.authorId ?? b.targetId],
      async (tx, current, locked) => {
        if (original) {
          const post = await this.visible(current, b.targetId, tx);
          if (!locked.has(post.authorId))
            throw new ConflictException("Post changed; reopen it");
        } else if (
          !(await tx.user.findFirst({
            where: {
              id: b.targetId,
              deletedAt: null,
              region: this.infra.config.REGION,
            },
          }))
        )
          throw new NotFoundException();
        const where = {
          actorId_targetId_kind: {
            actorId: current.user.id,
            targetId: b.targetId,
            kind: b.kind,
          },
        };
        if (b.kind === "block") {
          if (!b.enabled)
            return tx.social.deleteMany({
              where: {
                actorId: current.user.id,
                targetId: { equals: b.targetId, mode: "insensitive" },
                kind: "block",
              },
            });
          await tx.social.upsert({
            where,
            create: {
              actorId: current.user.id,
              targetId: b.targetId,
              kind: "block",
            },
            update: {},
          });
          await tx.connection.updateMany({
            where: {
              status: { in: ["PENDING", "ACCEPTED"] },
              OR: [
                { requesterId: current.user.id, recipientId: b.targetId },
                { requesterId: b.targetId, recipientId: current.user.id },
              ],
            },
            data: {
              status: "ENDED",
              retryAfter: new Date(Date.now() + 7 * 86400000),
              version: { increment: 1 },
            },
          });
          return { ok: true };
        }
        return b.enabled
          ? tx.social.upsert({
              where,
              create: {
                actorId: current.user.id,
                targetId: b.targetId,
                kind: b.kind,
              },
              update: {},
            })
          : tx.social.deleteMany({
              where: {
                actorId: current.user.id,
                targetId: b.targetId,
                kind: b.kind,
              },
            });
      },
    );
  }
  @Post("reports") async report(@Req() r: Authed, @Body() body: unknown) {
    const b = z
      .object({
        targetId: z.string().uuid(),
        reason: z.string().trim().min(5).max(1000),
      })
      .strict()
      .parse(body);
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "learn",
      [],
      (tx, current) =>
        tx.report.create({ data: { ...b, reporterId: current.user.id } }),
    );
  }
  private clubSummary(club: DbClub, userId: string, membership: string | null) {
    const { inviteCode, reason, ...visible } = club;
    return {
      ...visible,
      membership,
      ...(club.ownerId === userId ? { inviteCode, reason } : {}),
    };
  }
  @Get("clubs") async clubs(@Req() r: Authed) {
    communityAvailable(this.infra.config);
    const memberships = await this.db.membership.findMany({
      where: { userId: r.user.id },
    });
    const clubs = await this.db.club.findMany({
      where: {
        status: "APPROVED",
        OR: [
          { private: false },
          {
            id: {
              in: memberships
                .filter((m) => m.status === "APPROVED")
                .map((m) => m.clubId),
            },
          },
        ],
      },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    return clubs.map((club) =>
      this.clubSummary(
        club,
        r.user.id,
        memberships.find((m) => m.clubId === club.id)?.status || null,
      ),
    );
  }
  @Get("clubs/mine") async myClubs(@Req() r: Authed) {
    const memberships = await this.db.membership.findMany({
      where: { userId: r.user.id, status: { not: "BANNED" } },
    });
    const clubs = await this.db.club.findMany({
      where: {
        OR: [
          { ownerId: r.user.id },
          { id: { in: memberships.map((member) => member.clubId) } },
        ],
      },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    return clubs.map((club) =>
      this.clubSummary(
        club,
        r.user.id,
        memberships.find((m) => m.clubId === club.id)?.status || null,
      ),
    );
  }
  @Post("clubs/invite") async acceptInvite(
    @Req() r: Authed,
    @Body() body: unknown,
  ) {
    communityAvailable(this.infra.config);
    const { code } = z.object({ code: z.string().uuid() }).strict().parse(body);
    const club = await this.db.club.findFirst({
      where: { inviteCode: code, status: "APPROVED" },
    });
    if (!club) throw new NotFoundException("Invitation is unavailable");
    const member = await this.joinClub(r, club, true);
    return this.clubSummary(club, r.user.id, member.status);
  }
  @Get("clubs/:id") async clubDetail(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    return this.clubDetailAt(this.db, r, id);
  }
  private async clubDetailAt(
    db: Pick<Prisma.TransactionClient, "club" | "membership">,
    r: Pick<CommunityActor, "user" | "policy">,
    id: string,
  ) {
    communityAvailable(this.infra.config);
    z.string().uuid().parse(id);
    const club = await db.club.findUnique({ where: { id } });
    if (!club) throw new NotFoundException();
    const membership = await db.membership.findFirst({
      where: { clubId: id, userId: r.user.id },
    });
    const readable = await readableClub(db, r.user.id, id);
    if (
      !readable &&
      club.ownerId !== r.user.id &&
      (!membership || membership.status === "BANNED")
    )
      throw new NotFoundException();
    return {
      ...this.clubSummary(club, r.user.id, membership?.status || null),
      canRead: !!readable,
      canPost:
        club.status === "APPROVED" &&
        membership?.status === "APPROVED" &&
        permissions(r.policy).canPost,
      owner: club.ownerId === r.user.id,
    };
  }
  @Post("clubs") async createClub(@Req() r: Authed, @Body() body: unknown) {
    this.canPublish(r);
    if (r.policy.age < 18 || !r.user.adultVerified)
      throw new ForbiddenException("A verified adult must manage a club");
    if (!(await this.infra.limit(`club-create:${r.user.id}`, 3, 86400)))
      throw new HttpException("Club creation limit reached", 429);
    const b = z
      .object({
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().max(1000),
        private: z.boolean(),
      })
      .strict()
      .parse(body);
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "adult",
      [],
      (tx, current) =>
        tx.club.create({ data: { ...b, ownerId: current.user.id } }),
    );
  }
  @Patch("clubs/:id") async editClub(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    this.canPublish(r);
    const b = z
      .object({
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().max(1000),
        private: z.boolean(),
      })
      .strict()
      .parse(body);
    z.string().uuid().parse(id);
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "adult",
      [],
      async (tx, current) => {
        await tx.$queryRaw`SELECT id FROM "Club" WHERE id=${id}::uuid FOR UPDATE`;
        const club = await tx.club.findFirst({
          where: { id, ownerId: current.user.id, status: { not: "ARCHIVED" } },
        });
        if (!club) throw new ForbiddenException();
        return tx.club.update({
          where: { id },
          data: {
            ...b,
            status: "PENDING",
            reason: null,
            revision: { increment: 1 },
          },
        });
      },
    );
  }
  @Post("clubs/:id/invite/rotate") async rotateInvite(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    this.canPublish(r);
    z.string().uuid().parse(id);
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "adult",
      [],
      async (tx, current) => {
        await tx.$queryRaw`SELECT id FROM "Club" WHERE id=${id}::uuid FOR UPDATE`;
        const result = await tx.club.updateMany({
          where: { id, ownerId: current.user.id, status: "APPROVED" },
          data: { inviteCode: randomUUID() },
        });
        if (!result.count) throw new ForbiddenException();
        return this.clubDetailAt(tx, current, id);
      },
    );
  }
  private async joinClub(r: Authed, club: DbClub, invited: boolean) {
    if (!(await this.infra.limit(`club-join:${r.user.id}`, 10, 3600)))
      throw new HttpException("Membership request limit reached", 429);
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "learn",
      [club.ownerId],
      async (tx, current) => {
        await tx.$queryRaw`SELECT id FROM "Club" WHERE id=${club.id}::uuid FOR SHARE`;
        const currentClub = await tx.club.findFirst({
          where: { id: club.id, status: "APPROVED" },
        });
        if (!currentClub) throw new NotFoundException();
        if (
          currentClub.ownerId !== club.ownerId ||
          (invited && currentClub.inviteCode !== club.inviteCode)
        )
          throw new NotFoundException("Invitation was replaced");
        const owner = await tx.user.findUnique({
          where: { id: currentClub.ownerId },
        });
        if (!eligibleGuardian(owner, this.infra.config.REGION))
          throw new ForbiddenException(
            "Current club owner eligibility required",
          );
        if (
          await tx.social.findFirst({
            where: {
              kind: "block",
              OR: [
                {
                  actorId: current.user.id,
                  targetId: {
                    equals: currentClub.ownerId,
                    mode: "insensitive",
                  },
                },
                {
                  actorId: currentClub.ownerId,
                  targetId: { equals: current.user.id, mode: "insensitive" },
                },
              ],
            },
          })
        )
          throw new ForbiddenException("Membership is unavailable");
        const where = {
            clubId_userId: { clubId: club.id, userId: current.user.id },
          },
          existing = await tx.membership.findUnique({ where });
        if (existing?.status === "BANNED")
          throw new ForbiddenException("Membership is unavailable");
        if (existing?.status === "APPROVED" || existing?.status === "PENDING")
          return existing;
        if (currentClub.private && !invited)
          throw new ForbiddenException("Use the club's private invitation");
        const status = currentClub.private ? "PENDING" : "APPROVED";
        return tx.membership.upsert({
          where,
          create: { clubId: club.id, userId: current.user.id, status },
          update: { status },
        });
      },
    );
  }
  @Post("clubs/:id/join") async join(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    communityAvailable(this.infra.config);
    const club = await this.db.club.findFirst({
      where: { id, status: "APPROVED" },
    });
    if (!club) throw new NotFoundException();
    return this.joinClub(r, club, false);
  }
  @Delete("clubs/:id/membership") async leave(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    z.string().uuid().parse(id);
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "learn",
      [],
      async (tx, current) => {
        await tx.$queryRaw`SELECT id FROM "Club" WHERE id=${id}::uuid FOR SHARE`;
        const club = await tx.club.findUnique({ where: { id } });
        if (club?.ownerId === current.user.id)
          throw new BadRequestException("The owner cannot leave their club");
        await tx.membership.deleteMany({
          where: {
            clubId: id,
            userId: current.user.id,
            status: { not: "BANNED" },
          },
        });
        return { ok: true };
      },
    );
  }
  @Get("clubs/:id/members") async members(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    communityAvailable(this.infra.config);
    const club = await readableClub(this.db, r.user.id, id, true);
    if (!club) throw new NotFoundException();
    const owner = club.ownerId === r.user.id;
    if (
      !owner &&
      !(await this.db.membership.findFirst({
        where: { clubId: id, userId: r.user.id, status: "APPROVED" },
      }))
    )
      throw new ForbiddenException();
    const rows = await this.db.membership.findMany({
      where: { clubId: id, ...(owner ? {} : { status: "APPROVED" }) },
      take: 200,
    });
    const users = await this.db.user.findMany({
      where: { id: { in: rows.map((row) => row.userId) }, deletedAt: null },
      select: { id: true, displayName: true },
    });
    return rows
      .filter((row) => users.some((user) => user.id === row.userId))
      .map((row) => ({
        userId: row.userId,
        status: row.status,
        displayName: users.find((user) => user.id === row.userId)!.displayName,
      }));
  }
  @Post("clubs/:id/members/:userId") async approveMember(
    @Req() r: Authed,
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    this.canPublish(r);
    const { status } = z
      .object({
        status: z.enum(["APPROVED", "REJECTED", "BANNED"]).default("APPROVED"),
      })
      .strict()
      .parse(body || {});
    id = z.string().uuid().parse(id).toLowerCase();
    userId = z.string().uuid().parse(userId).toLowerCase();
    return communityWrite(
      this.db,
      this.infra.config,
      r,
      "adult",
      [userId],
      async (tx, current) => {
        await tx.$queryRaw`SELECT id FROM "Club" WHERE id=${id}::uuid FOR SHARE`;
        const club = await tx.club.findFirst({
          where: { id, ownerId: current.user.id, status: "APPROVED" },
        });
        if (!club || userId === club.ownerId) throw new ForbiddenException();
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        if (
          user.region !== this.infra.config.REGION ||
          (status === "APPROVED" &&
            (user.deletedAt ||
              !user.emailVerified ||
              !permissions(await accountPolicy(tx, user)).canLearn))
        )
          throw new ForbiddenException(
            "Current learner eligibility is required",
          );
        const member = await tx.membership.update({
          where: { clubId_userId: { clubId: id, userId } },
          data: { status },
        });
        await notifyUser(
          tx,
          this.infra.config.REGION,
          userId,
          "CLUB",
          "Club membership updated · 社团成员申请有更新",
          "Open your clubs to check its status. 请在我的社团中查看状态。",
        );
        return member;
      },
    );
  }
}
