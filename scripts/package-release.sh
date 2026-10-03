#!/usr/bin/env bash
# Builds the release a server installs: dist/parkna-<version>.tar.gz containing
#   parkna.war          the back end, for Tomcat
#   frontend/           the Nginx document root (home page, admin, org, police, terms, privacy, SMS simulator)
#   config/             database.properties.example, config.properties.example
#   deploy/             Nginx, Tomcat, Kannel files and the deploy/rollback/backup scripts
#   db/                 the SQL migrations (for a DBA who applies them by hand)
#   docs/  VERSION
# Usage: scripts/package-release.sh [version]     (needs Node.js, Java 17 and Maven)
#   version: the release number, e.g. 1.1.14 (the GitHub build uses the VERSION file + its build number);
#   without it: <VERSION file>-local
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
VERSION=${1:-$(tr -d '[:space:]' < VERSION)-local}
export PARKNA_VERSION="$VERSION"

node scripts/build-frontend.js
if [ "${SKIP_WAR_BUILD:-0}" != "1" ]; then (cd backend && mvn -q -B package -DskipTests -Dparkna.version="$VERSION"); fi
NAME="parkna-$VERSION"
OUT="$ROOT/dist/$NAME"

rm -rf "$OUT" && mkdir -p "$OUT/config" "$OUT/db"
cp backend/target/parkna.war "$OUT/"
cp -a frontend/dist "$OUT/frontend"
# drivers and parking attendants use the Android apps and SMS/USSD only: the browser copies of the two apps
# (frontend/dist/driver, /officer) are for the automated tests, not for the server
rm -rf "$OUT/frontend/driver" "$OUT/frontend/officer"
cp config/*.example "$OUT/config/"
cp -a deploy "$OUT/deploy"
cp -a docs "$OUT/docs"
cp backend/src/main/resources/db/migration/*.sql "$OUT/db/"
echo "$VERSION" > "$OUT/VERSION"
tar czf "$ROOT/dist/$NAME.tar.gz" -C "$ROOT/dist" "$NAME"
echo "$ROOT/dist/$NAME.tar.gz"
