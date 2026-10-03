---
name: release
description: Ship the current work of SUNU Park (parkna-demo) - checks, push, PR, merge, wait for the GitHub release, then give the APK links and the server upgrade commands. Use when the user says "open the pr and merge", "release it" or asks for the upgrade commands of new work.
---

# Release SUNU Park

1. **Checks.** Run `scripts/qa.sh`, then `scripts/e2e/run.sh` (or `SKIP_BUILD=1 scripts/e2e/run.sh` right after a
   build). Fix anything red first; never skip or weaken a test to get green. For UI work, look at the screenshots in
   `backend/target/e2e/shots`.
2. **Commit and push** the session's branch (author `abdiMuhamud <a.abdi.muhamud@gmail.com>`, the attribution lines
   the session asks for, no model names): `git push -u origin <branch>`.
3. **Wait for CI on the branch** (GitHub Actions "Build SUNU Park": back end, apps, browser tests). If red, read the
   failed job's log, fix, push again.
4. **PR**: create it into `main` with a short summary written for the user (what changed for drivers, attendants,
   staff; the checks that ran). If GitHub reports a merge conflict, merge `origin/main` into the branch (no rebase),
   re-run the checks, push.
5. **Merge** with squash once CI is green (pass the expected head SHA).
6. **Reset the branch** to the new main: `git fetch origin main && git checkout -B <branch> origin/main &&
   git push --force-with-lease origin <branch>`.
7. **Wait for the release**: the main build publishes `v<VERSION>.<run number>` with `parkna-<v>.tar.gz`,
   `SUNU-Park-Driver-<v>-test.apk` and `SUNU-Park-Officer-<v>-test.apk` (about 3 minutes). Use a scheduled check-in
   instead of polling with sleep.
8. **Tell the user**: the release link, both APK links, and the upgrade commands from CLAUDE.md with `<v>` filled
   in, plus whether there is a database migration or a new setting, and how to roll back.
