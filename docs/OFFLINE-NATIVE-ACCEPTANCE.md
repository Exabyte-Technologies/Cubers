# Native offline learning and public recovery acceptance

Checked on 2026-10-28 with the current [scanner-fix development packages](DEVELOPMENT-BUILDS.md#current-artifacts). These checks add runtime evidence to [offline learning](OFFLINE-LEARNING.md); they do not change app code, APIs, saved learning rules or production activation gates.

## Isolation

A separate local PostgreSQL database received all 47 migrations and 149 authored bilingual lessons. It contains only a uniquely named synthetic adult account. Redis database 15 was checked empty before reserving it for this run. The test API used port 3100, mock AI, disabled public-release/mainland activation flags and no live provider key. The browser used its own origin on port 8181. Main account credentials and saved user history were not used.

## Public pages and local email

- Signed-out Support and account-deletion information render in English and Chinese, including the supplied operator name, address and support contact.
- Simulated HTTP failure produces a document error and **Try again**. Resetting the simulation and retrying restores the complete deletion document without authentication.
- Browser warning/error capture is empty for the checked pages; the prior raw-text-under-View warning did not recur.
- A synthetic registration sends verification to the local SMTP capture only. Opening that actual email link in the browser and explicitly confirming verifies the account. Repeating confirmation rejects the already-used token.

No support email was sent to a person, password changed, or real account deleted. This checks document/retry and verification rendering, not staffed support, full password recovery or the complete deletion process.

![Recovered public deletion information](../artifacts/screenshots/cubers-public-deletion-retry-20261028.png)

## Installed Android offline exercise

The standalone ARM64 APK ran in the owned Android 36 `CubersReviewAndroid36` emulator. Its three development origins were temporarily set to the isolated API through the app's settings.

The synthetic account signed in and downloaded **Meet your cube / 认识魔方与转动记号** into native private storage. With API transport simulated offline, four user-paced demonstration turns solved the downloaded virtual drill. The UI explicitly reported that no progress or result was submitted.

After the session interruption the emulator and app process were stopped. On reopening the emulator, there was no Cubers Dev process; opening it from the app drawer created a new process. The isolated API was still stopped, and the app offered the downloaded library while protecting online content. The same unexpired lesson survived, opened in Chinese and rendered its virtual cube. A manual turn updated the cube and its six face maps. Resetting network simulation, restarting only the test API and selecting **Try again** restored the saved synthetic session.

The before-download, after-download, after-offline-solve and after-cold-start snapshots all contain **zero Progress, LessonSession and Attempt records**. The downloaded/offline/cold snapshots are byte-identical. Local practice did not earn server credit.

![Local drill solved without submitting progress](../artifacts/screenshots/cubers-offline-solved-android-20261028.png)

![Chinese downloaded lesson after a cold restart](../artifacts/screenshots/cubers-offline-cold-android-zh-20261028.png)

## Reminder checks

The setting begins off. Explicit enablement shows Android's permission prompt; declining leaves it off with an explanatory message and no owned scheduled alarms. Enabling after permission creates exactly seven dated local alarms. Read-only Android diagnostics confirm a quiet channel with no sound or vibration. The cold launch while the account is unavailable clears owned alarms; reconnecting the same saved account renews the saved preference without another permission prompt.

The first delivery observation was interrupted because the emulator shut down before its due time. A second reminder scheduled for 13:17 appeared in Android’s notification tray. The OS record places delivery at 13:17:21, with no sound or vibration; this is one observed emulator delivery, not a timing guarantee. Opening the notification returned to Cubers. Turning reminders off removed all owned pending alarms.

![Actual delivered local reminder](../artifacts/screenshots/cubers-reminder-delivered-android-20261028.png)

The development app was returned to ordinary signed-out operation with all three emulator origins restored to `http://10.0.2.2:3000` and network simulation reset. Only the synthetic account’s server sessions were revoked; its isolated API was stopped. The fixture database and reserved Redis namespace remain identified in the private run record for subsequent acceptance work. Main LAN services stay running.

## Remaining acceptance

Physical-phone camera/cube recognition, iPhone offline/reminder runtime, device reboot/timezone/DST/cache eviction, OS-specific delivery delays, screen-reader acceptance, signed-out native invitation/email continuation, photo/video selection and the original production/operator/legal gates remain open. This emulator exercise is not physical-device or production acceptance. Current source validation remains the scanner milestone's **472 passing tests** and workspace type checks; no app source changed in this acceptance run.
