import { backOrReplace } from "../src/back-navigation";
import React, { useEffect, useState } from "react";
import { router, Redirect } from "expo-router";
import { Share, Switch, Linking } from "react-native";
import { useApp } from "../src/state";
import { appVerification } from "../src/verification/native";
import {
  Screen,
  Heading,
  Card,
  Txt,
  Button,
  Notice,
  Field,
  Row,
  useTheme,
} from "../src/ui";
import { chooseConsent } from "../src/consent-upload";
export default function Guardian() {
  const { token, region, user } = useApp();
  if (!token) return <Redirect href="/" />;
  return (
    <GuardianPage
      key={JSON.stringify([token, region, user?.id, user?.guardianEligible])}
    />
  );
}
function GuardianPage() {
  const { t, api, token, signin, user, region } = useApp(),
    c = useTheme(),
    [children, setChildren] = useState<any[]>([]),
    [message, setMessage] = useState(""),
    [activity, setActivity] = useState<any>(),
    [childName, setChildName] = useState(""),
    [birthday, setBirthday] = useState(""),
    [publicPosting, setPublicPosting] = useState(false),
    [recording, setRecording] = useState(false),
    [signed, setSigned] = useState(false),
    [documentId, setDocumentId] = useState<string | null>(null),
    [documentReady, setDocumentReady] = useState(false),
    [busy, setBusy] = useState(false),
    [deletingId, setDeletingId] = useState<string | null>(null),
    [confirmation, setConfirmation] = useState("");
  const load = () =>
    api("guardian/children")
      .then(setChildren)
      .catch((e) => setMessage(e.message));
  useEffect(() => {
    void load();
  }, [api]);
  useEffect(() => {
    if (!documentId || documentReady) return;
    const poll = setInterval(() => {
      api(`media/${documentId}`)
        .then((result) => {
          if (result.status === "READY") {
            setDocumentReady(true);
            setMessage(
              t(
                "Signed document uploaded privately. Submit the child request for human review.",
                "签署文件已私密上传，请提交儿童账号申请，等待人工审核。",
              ),
            );
          } else if (result.status === "REJECTED") {
            setDocumentId(null);
            setMessage(
              t(
                "Document validation failed. Choose a valid signed PDF.",
                "文件验证失败，请选择有效的已签署 PDF。",
              ),
            );
          }
        })
        .catch((error) => setMessage(error.message));
    }, 2000);
    return () => clearInterval(poll);
  }, [api, documentId, documentReady]);
  async function upload() {
    setBusy(true);
    try {
      const id = await chooseConsent(api);
      if (id) {
        setDocumentId(id);
        setDocumentReady(false);
        setMessage(t("Checking your private document…", "正在检查私密文件……"));
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    try {
      await api("guardian/children", {
        displayName: childName,
        birthDate: birthday,
        documentId,
        publicPosting,
        recording,
        signedConsent: true,
      });
      setChildName("");
      setBirthday("");
      setDocumentId(null);
      setDocumentReady(false);
      setSigned(false);
      setPublicPosting(false);
      setRecording(false);
      setMessage(
        t(
          "Request submitted. A reviewer must verify your signed consent and guardian relationship before child access opens.",
          "申请已提交。审核人员核验已签署同意书及监护关系后，儿童账号才能开放。",
        ),
      );
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!token) return <Redirect href="/" />;
  return (
    <Screen>
      <Button
        small
        kind="secondary"
        label={t("Profile", "返回个人页")}
        onPress={() => backOrReplace(router, "/(tabs)/profile")}
      />
      <Card style={{ backgroundColor: c.mint }}>
      <Heading>{t("Grow together.", "陪伴，一起成长。")}</Heading>
      <Notice
        text={t(
          "Child access requires a reviewed signed consent document and verified adult guardian. Public posting and competition recording have separate permissions.",
          "儿童账号需经审核的签署同意书与监护人身份核验。公开发布和竞赛录像分别授权。",
        )}
      />
      <Button
        kind="secondary"
        label={t("Children’s privacy rules", "儿童个人信息保护规则")}
        onPress={() => router.push("/legal/children")}
      />
      </Card>
      {user?.guardianEligible && (
        <Button
          kind="secondary"
          label={t("Review competition score sharing", "审核比赛成绩分享")}
          onPress={() => router.push("/competition-reviews")}
        />
      )}
      {user?.guardianEligible ? (
        <Card>
          <Txt style={{ fontWeight: "600", fontSize: 22 }}>
            {t("Create a child account", "创建儿童账号")}
          </Txt>
          <Txt small>
            {t(
              "Use a nickname. The signed PDF must identify you as the guardian, explain the relationship, and give separate choices for learning, public posts, and recording. An email confirmation alone is insufficient. Use an unencrypted PDF of at most eight pages and 10 MB. Avoid unrelated identity or family information.",
              "请使用昵称。已签署 PDF 须说明监护人身份及监护关系，并分别选择学习、公开发帖与录像授权。仅验证邮箱不够。请使用不加密、最多八页且不超过 10 MB 的 PDF，勿提交无关身份或家庭信息。",
            )}
          </Txt>
          <Field
            label={t("Child nickname", "儿童昵称")}
            value={childName}
            onChangeText={setChildName}
            maxLength={40}
          />
          <Field
            label={t("Date of birth (YYYY-MM-DD)", "出生日期（YYYY-MM-DD）")}
            value={birthday}
            onChangeText={setBirthday}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
          />
          <Row>
            <Switch
              accessibilityLabel={t(
                "Permission for public posts",
                "公开发帖授权",
              )}
              value={publicPosting}
              onValueChange={setPublicPosting}
            />
            <Txt>
              {t(
                "Permit guardian-reviewed public posts",
                "允许经监护人审核的公开帖子",
              )}
            </Txt>
          </Row>
          <Row>
            <Switch
              accessibilityLabel={t(
                "Permission for competition recording",
                "竞赛录像授权",
              )}
              value={recording}
              onValueChange={setRecording}
            />
            <Txt>
              {t("Permit private competition recording", "允许私密竞赛录像")}
            </Txt>
          </Row>
          <Row>
            <Switch
              accessibilityLabel={t(
                "I signed the child consent document",
                "我已签署儿童同意书",
              )}
              value={signed}
              onValueChange={setSigned}
            />
            <Txt>
              {t(
                "I signed the learning and privacy consent",
                "我已签署学习及隐私同意书",
              )}
            </Txt>
          </Row>
          <Button
            kind="secondary"
            label={
              documentReady
                ? t("✓ Signed PDF ready / replace", "✓ 已签署 PDF 就绪 / 更换")
                : documentId
                  ? t("PDF processing…", "PDF 处理中……")
                  : t("Upload signed PDF privately", "私密上传已签署 PDF")
            }
            onPress={() => void upload()}
            disabled={busy}
          />
          <Button
            label={t("Submit for guardian review", "提交监护人审核")}
            onPress={() => void create()}
            disabled={
              busy ||
              !documentReady ||
              !signed ||
              childName.trim().length < 2 ||
              !/^\d{4}-\d{2}-\d{2}$/.test(birthday)
            }
          />
        </Card>
      ) : (
        <Notice
          text={t(
            "A verified adult guardian is needed to create child accounts. Contact support to arrange an independent eligibility review.",
            "创建儿童账号需要经过核验的成年监护人，请联系支持人员安排独立资格审核。",
          )}
        />
      )}
      {user?.guardianEligible && (
        <Button
          kind="secondary"
          label={t("Review achievement-card requests", "审核成就卡片申请")}
          onPress={() => router.push("/guardian-cards")}
        />
      )}
      {children.map((child) => (
        <Card key={child.id}>
          <Txt style={{ fontWeight: "600" }}>
            {child.child?.displayName || t("Linked child", "关联儿童")}
          </Txt>
          <Txt small>
            {child.status} / {t("Public posts", "公开发帖")}:{" "}
            {child.publicPosting ? "✓" : "—"} / {t("Recording", "录像")}:{" "}
            {child.recording ? "✓" : "—"}
          </Txt>
          {child.reason && <Txt small>{child.reason}</Txt>}
          <Button
            kind="secondary"
            label={t("Export child’s information", "导出儿童信息")}
            onPress={() => {
              api(`guardian/children/${child.childId}/export`)
                .then((data) =>
                  Share.share({
                    title: "Cubers child account export",
                    message: JSON.stringify(data, null, 2),
                  }),
                )
                .catch((error) => setMessage(error.message));
            }}
          />
          <Button
            kind="secondary"
            label={t("Review friends and mentorship", "审核好友与指导申请")}
            onPress={() =>
              router.push({
                pathname: "/connections",
                params: { childId: child.childId },
              })
            }
          />
          <Button
            kind="secondary"
            label={t("View activity", "查看活动")}
            onPress={() => {
              api(`guardian/children/${child.childId}/activity`)
                .then(setActivity)
                .catch((e) => setMessage(e.message));
            }}
          />
          <Button
            label={t("Open child session", "进入儿童账号")}
            disabled={child.status !== "APPROVED" || !!child.child?.deletedAt}
            onPress={() => {
              api(`guardian/children/${child.childId}/session`, {})
                .then(async (r) => {
                  await signin(r.token);
                  router.replace("/(tabs)");
                })
                .catch((e) => setMessage(e.message));
            }}
          />
          <Button
            kind="danger"
            label={t("Revoke permissions", "撤销授权")}
            onPress={() => {
              api(
                `guardian/children/${child.childId}/consent`,
                undefined,
                "DELETE",
              )
                .then(load)
                .catch((e) => setMessage(e.message));
            }}
          />
          <Button
            kind="danger"
            label={t("Delete this child account…", "注销此儿童账号……")}
            onPress={() => {
              setDeletingId(child.childId);
              setConfirmation("");
            }}
            disabled={!!child.child?.deletedAt}
          />
          {deletingId === child.childId && (
            <>
              <Notice
                text={t(
                  "This removes this child’s account, posts, practice and media. Your guardian account stays active. Type DELETE to confirm.",
                  "将删除此儿童的账号、帖子、练习及媒体；监护人账号仍可使用。请输入 DELETE 确认。",
                )}
              />
              <Field
                label={t("Confirmation", "确认文字")}
                value={confirmation}
                onChangeText={setConfirmation}
                autoCapitalize="characters"
              />
              <Button
                kind="danger"
                label={t("Confirm child deletion", "确认注销儿童账号")}
                disabled={confirmation !== "DELETE"}
                onPress={() => {
                  api(
                    `guardian/children/${child.childId}`,
                    { confirmation },
                    "DELETE",
                  )
                    .then(async () => {
                      await appVerification.eraseLocal(child.childId, region);
                      setDeletingId(null);
                      setConfirmation("");
                      await load();
                      setMessage(
                        t(
                          "Child account disabled and deletion queued.",
                          "儿童账号已停用，并已安排删除。",
                        ),
                      );
                    })
                    .catch((error) => setMessage(error.message));
                }}
              />
            </>
          )}
        </Card>
      ))}
      {!children.length && (
        <Card>
          <Txt>
            {t(
              "No linked child accounts yet. A verified guardian can submit a signed-document request above.",
              "尚未关联儿童账号。经过核验的监护人可在上方提交已签署文件的申请。",
            )}
          </Txt>
        </Card>
      )}
      {activity && (
        <Card>
          <Txt>
            {t(
              `${activity.progress.length} practice records / ${activity.posts.length} posts / ${activity.attempts.length} attempts`,
              `${activity.progress.length} 条练习记录 / ${activity.posts.length} 篇帖子 / ${activity.attempts.length} 次尝试`,
            )}
          </Txt>
          {(activity.guidedSolves || []).slice(0, 10).map((practice: any) => (
            <Card key={practice.id}>
              <Txt style={{ fontWeight: "600" }}>
                {t(
                  `Guided ${practice.puzzle === "pyraminx" ? "Pyraminx" : (practice.puzzle || "3x3").replace("x", "×")} practice`,
                  `${practice.puzzle === "pyraminx" ? "金字塔魔方" : (practice.puzzle || "3x3").replace("x", "×")} 完整指导练习`,
                )}
              </Txt>
              <Txt small>
                {t(
                  `${practice.stage}/${practice.plan.steps.length} checkpoints / ${practice.input === "virtual" ? "virtual" : "physical scans"}`,
                  `${practice.stage}/${practice.plan.steps.length} 个检查点 / ${practice.input === "virtual" ? "虚拟魔方" : "实物扫描"}`,
                )}
              </Txt>
              <Txt small>
                {practice.status === "COMPLETED"
                  ? t("Completed", "已完成")
                  : practice.status === "CANCELLED"
                    ? t("Ended", "已结束")
                    : practice.status === "EXPIRED" ||
                        new Date(practice.expiresAt) <= new Date()
                      ? t("Expired", "已到期")
                      : t("In progress", "进行中")}
              </Txt>
            </Card>
          ))}
          {(activity.assessments || []).slice(0, 10).map((check: any) => (
            <Card key={check.id}>
              <Txt style={{ fontWeight: "600" }}>
                {t("Optional placement check", "可选的起点小测")} /{" "}
                {check.puzzle === "pyraminx"
                  ? t("Pyraminx", "金字塔")
                  : check.puzzle.replace("x", "×")}
              </Txt>
              <Txt small>
                {t(
                  `${check.answers.length}/${check.tasks.length} checks saved / practice suggestions only`,
                  `已保存 ${check.answers.length}/${check.tasks.length} 项 / 仅用于练习推荐`,
                )}
              </Txt>
            </Card>
          ))}
          {activity.posts
            .filter(
              (post: any) =>
                post.status === "PENDING" && !post.guardianApproved,
            )
            .map((post: any) => (
              <Card key={post.id}>
                <Txt>{post.body}</Txt>
                {post.mediaIds.map((mediaId: string, index: number) => (
                  <Button
                    key={mediaId}
                    kind="secondary"
                    label={t(
                      `Review attachment ${index + 1}`,
                      `查看附件 ${index + 1}`,
                    )}
                    onPress={() => {
                      api(`media/${mediaId}`)
                        .then((media) => {
                          if (media.url) return Linking.openURL(media.url);
                          throw new Error(
                            t("Attachment unavailable", "附件不可用"),
                          );
                        })
                        .catch((error) => setMessage(error.message));
                    }}
                  />
                ))}
                <Txt small>
                  {t(
                    "Review this exact revision before approving public sharing. Moderator review is still required.",
                    "请核对当前版本后再批准公开分享，之后仍需管理员审核。",
                  )}
                </Txt>
                <Button
                  label={t("Approve this revision", "批准当前版本")}
                  onPress={() => {
                    api(`guardian/posts/${post.id}/approve`, {
                      revision: post.revision,
                    })
                      .then(() => {
                        setActivity({
                          ...activity,
                          posts: activity.posts.map((p: any) =>
                            p.id === post.id
                              ? { ...p, guardianApproved: true }
                              : p,
                          ),
                        });
                        setMessage(
                          t(
                            "Guardian approval saved. Moderator review is next.",
                            "监护人批准已保存，接下来等待管理员审核。",
                          ),
                        );
                      })
                      .catch((error) => setMessage(error.message));
                  }}
                />
              </Card>
            ))}
        </Card>
      )}
      {!!message && <Notice text={message} />}
    </Screen>
  );
}
