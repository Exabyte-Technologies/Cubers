# Operator-managed staff access

The compiled regional API image contains an operator-only CLI for first-administrator enrollment, independent ADMIN/MODERATOR grants, factor rotation, lost-factor recovery and revocation. It does not expose a web enrollment/reset endpoint, create demonstration staff, send messages or overwrite passwords. Normal users cannot invoke it through the API. The host/database operator remains trusted and can already change database records directly; file digests are review bindings, not signatures that protect against a compromised operator host.

## Commissioning and custody

Keep public ingress closed while commissioning. Use the intended approved production installation on an operator-only HTTPS ingress for ordinary registration and actual email verification before making it publicly reachable. Preserve the real operator connection IP through the configured trusted proxy for community detection; use allowlisted ingress from the community being commissioned, rather than forged country headers or a private-address bypass. Do not point development fixtures at production or lower its environment/release checks. A registered, email-verified adult in the same region is the target of enrollment. The operator must independently review the person's identity, age, role and access need using an external case record. `operatorReviewConfirmed` records that attestation; it is not automated identity proof or regulatory approval. No adult/identity eligibility flags are set by this tool.

Use an owned directory with mode 0700 and canonical absolute paths. Each input must be an owned regular file, mode 0600, with no symlink or hard link; outputs use exclusive creation and never overwrite an existing file. The tool rejects inputs over 16 KB. Use an encrypted operator workstation/secret volume, restricted database credentials and an approved password-manager workflow. Do not put passwords, codes, database URLs or enrollment material in argv, shell history, CI logs, chat, tickets or source control. The examples below contain field names and placeholders only; create actual private files in a protected editor.

The enrollment file contains a fresh authenticator secret, otpauth URI, one-use recovery code, thirty-minute expiry and account snapshots. Transfer the target's enrollment and recovery information through the operator's approved private process. Save the recovery code separately from the everyday authenticator, preferably in a protected offline vault. Copying the seed or URI also copies the factor; deleting the working file does not erase other copies or guarantee physical secure erasure.

The CLI reads `REGION` and `DATABASE_URL` from the intended regional deployment. No AI, S3, email or public API listener is started by the command. The approved regional API must still be running to complete ordinary registration/verification and later normal login. The executable is available in the runtime and migrations images after building.

## Prepare

A private request file has this shape:

```json
{
  "action": "bootstrap",
  "region": "INTL",
  "userId": "<existing-user-uuid>",
  "role": "ADMIN",
  "caseReference": "<non-personal-operator-case-id>",
  "operatorReviewConfirmed": true
}
```

Run from the repository root with the protected deployment environment loaded:

```sh
node --env-file=.env.production apps/api/dist/staff-cli.js plan /private/operator/request.json /private/operator/enrollment.json
```

Inside a container with the intended environment and private operator directory mounted, omit `--env-file`; use the same compiled path. For example, after the intended private database stack is healthy:

```sh
docker compose --env-file .env.production -f infra/compose.production.yml run --rm --no-deps -v /srv/cubers/operator:/operator --entrypoint node api apps/api/dist/staff-cli.js plan /operator/request.json /operator/enrollment.json
docker compose --env-file .env.production -f infra/compose.production.yml run --rm --no-deps -v /srv/cubers/operator:/operator --entrypoint node api apps/api/dist/staff-cli.js apply /operator/enrollment.json /operator/confirmation.json
```

The target can obtain their own user UUID from their private account export; no existing administrator is needed to identify the first target. The container's non-root UID must own the mounted directory/files. Do not change their permissions to make an unsafe mount work. Files are not created in the image's read-only application directory.

The command prints only status, plan digest and expiry. View the enrollment file privately to configure the target's authenticator and custody of its recovery code. The first bootstrap is available only while **no non-deleted ADMIN or MODERATOR exists** in that database. Two concurrent bootstraps cannot both apply. Requests and deployment region must match. A different action is required once staff exists.

| Action | Target | Additional request fields | Proof at apply |
| --- | --- | --- | --- |
| bootstrap | Ordinary verified adult, no factor | `role: ADMIN` | Target password and new-factor code |
| grant | Ordinary verified adult, no factor | `role: ADMIN` or `MODERATOR`, different `actorId` | Target password/new-factor code; current ADMIN password/code |
| rotate | Existing staff | No role or actor | Target password/new-factor code and either old-factor code or current one-use recovery code |
| recover | Existing staff who lost a factor | Different `actorId`, no role | Target password/new-factor code; current ADMIN password/code |
| revoke | Existing staff | Different `actorId`, no role | Current ADMIN password/code; no target password required |

Independent actors must be active, email-verified adults in this region with the ADMIN role and an enrolled factor; MODERATOR cannot authorize these changes. No self-grant, self-recovery override or self-revocation is accepted. Revoke returns the target to USER, clears factor/recovery material and cannot remove the last active administrator. Keep at least two independently managed administrators with separate factor/recovery custody. Password recovery remains the ordinary verified email process; it does not bypass staff MFA.

## Apply

A separate protected confirmation file contains the printed `planDigest`, the proofs required by the table, and `recoverySaved: true` when a replacement recovery code is issued. For first enrollment:

```json
{
  "planDigest": "<digest-printed-by-plan>",
  "targetPassword": "<target-password>",
  "newOtp": "<current-six-digit-code-from-new-authenticator>",
  "recoverySaved": true
}
```

Other actions use `actorPassword`, `actorOtp`, `oldOtp` or `recoveryCode` as required. Do not include an old factor and recovery code unnecessarily. Revocation needs no replacement recovery-code confirmation.

```sh
node --env-file=.env.production apps/api/dist/staff-cli.js apply /private/operator/enrollment.json /private/operator/confirmation.json
```

Apply validates the exact plan, expiry, region and unchanged account/factor/password snapshots. Password derivation happens outside the locks, followed by fresh state checks under ordered account locks. The regional database serializes all lifecycle changes and bootstrap/last-administrator decisions. A missing/revoked email, deleted account, wrong password, invalid/used OTP, stale plan or changed actor rejects the operation atomically. Prepare a fresh plan after any relevant account change or successful login changes its used-code counter.

Success replaces the factor/recovery hash where applicable, increments the factor generation, removes every target session and verification/recovery token, and writes a staff audit event with actor/case/region/role/generation and revoked-session count. No password, seed, recovery code or OTP is copied into audits. The recovery code is stored only as a high-entropy hash. Existing staff factor seeds use the current protected database representation; database/backup encryption, key custody and privileged database access remain operator responsibilities. This milestone does not add an independent encrypted seed vault.

Successful apply removes both sensitive enrollment and confirmation files. Exit 2 means the access change committed but input cleanup failed: remove those exact protected files and inspect the audit; **do not retry the change**. A lost connection or interrupted process can leave an uncertain outcome, so inspect the private audit using case reference/plan digest before attempting another operation. The original request file is retained; it has no password or factor. Failed/expired plans and confirmations also need operator cleanup. App-side revocation rejects subsequent authenticated requests; it cannot undo an action that had already committed or recall information already viewed.

## Login and recovery

Authenticator codes use the server's current thirty-second step and can be consumed only once, across staff login, deletion-only login and operator authorization. After enrollment/rotation or a recent login, wait for the next displayed code. Keep server/authenticator clocks synchronized. The login transaction rechecks the account's password, role, factor and generation before issuing a session, so a simultaneous reset/rotation cannot issue a stale authenticated session. Ordinary password resets also benefit from that current-state check.

The browser admin login and optional mobile staff-login form accept the six-digit code. They clear it after submission. The existing role/MFA API guard still controls administrative routes; choosing the mobile staff option grants no privilege.

For a lost authenticator, use `rotate` with the separately held one-use recovery code and target password; the replacement enrollment replaces that recovery hash. Alternatively, a different current ADMIN can authorize `recover` after independent case review. If every administrator loses both factors and recovery custody, keep ingress closed and escalate to the operator's controlled incident procedure; this tool has no email-only or universal bypass. Restoring old database snapshots can resurrect old factors/counters/recovery hashes: a restore must revoke sessions/tokens and establish fresh factor/recovery custody before reopening, alongside the still-required deletion-journal/restore work.

Tests use synthetic isolated databases, protected temporary files and local SMTP/mock AI only. They do not prove real operator identity review, private handoff, authenticator-device behavior, filesystem ACLs, encrypted vaults or production commissioning. Actual operational acceptance remains a release gate. See STATUS.md, SECURITY.md and DOCKER-VERIFICATION.md for current evidence.

## Completed software evidence

On 2026-10-17, 135 unit checks and 126 integration checks passed, along with TypeScript validation, API/admin builds and iOS/Android/web bundle exports. The final Linux/arm64 container run 5f41210c passed 28 international / 25 mainland groups, including the compiled CLI and real synthetic HTTP MFA login/replay denial, with all twenty-one migrations and 149 authored courses. Disposable containers, networks and volumes were removed. Final generated card images exactly match the previously inspected images. The local preview was migrated/refreshed, health returned 200 with AI_MODE=mock, and no real operator was enrolled. Private evidence stays under ignored .data/staff-*.log and .data/docker-smoke/5f41210c/.
