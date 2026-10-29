/** A continuation is an allowlisted app action, never a caller-supplied URL. */
export type Invitation = {
  kind: "club" | "room" | "replay";
  key?: string;
  code: string;
  community?: "CN" | "INTL";
};
export function invitationFromParams(
  value: Record<string, unknown>,
): Invitation | null {
  const { kind, code, community, key } = value;
  if (
    (kind !== "club" && kind !== "room" && kind !== "replay") ||
    typeof code !== "string"
  )
    return null;
  if (community !== undefined && community !== "CN" && community !== "INTL")
    return null;
  if (
    kind === "club" || kind === "replay"
      ? !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          code,
        )
      : !/^[A-Za-z0-9_-]{6,30}$/.test(code)
  )
    return null;
  if (
    kind === "replay" &&
    (typeof key !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(key) || !community)
  )
    return null;
  return {
    kind,
    code,
    ...(kind === "replay" ? { key: key as string } : {}),
    ...(community ? { community } : {}),
  };
}
export function invitationHref(invite: Invitation) {
  return { pathname: "/invitation" as const, params: { ...invite } };
}
export function invitationSignIn(invite: Invitation) {
  return {
    pathname: "/" as const,
    params: { continuation: "invitation", ...invite },
  };
}
export function authContinuation(params: Record<string, unknown>) {
  const invite =
    params.continuation === "invitation" ? invitationFromParams(params) : null;
  return invite ? invitationHref(invite) : ("/(tabs)" as const);
}
export function invitationLink(invite: Invitation) {
  if (!invitationFromParams(invite)) throw Error("Invalid invitation");
  return `cubers://invitation?kind=${invite.kind}&code=${encodeURIComponent(invite.code)}${invite.community ? `&community=${invite.community}` : ""}${invite.kind === "replay" ? `&key=${encodeURIComponent(invite.key!)}` : ""}`;
}
