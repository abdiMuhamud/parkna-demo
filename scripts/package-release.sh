#!/usr/bin/env bash
# Builds the release a server installs: dist/parkna-<version>.tar.gz containing
#   parkna.war          the back end, for Tomcat
#   frontend/           the Nginx document root
#   config/             database.properties.example, config.properties.example
#   deploy/             Nginx, Tomcat, Kannel files and the deploy/rollback/backup scripts
#   db/                 the SQL migrations (for a DBA who applies them by hand)
#   docs/  VERSION
# Usage: scripts/package-release.sh [build-number]     (needs Node.js, Java 17 and Maven)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BUILD=${1:-local}
cd "$ROOT"

node scripts/build-frontend.js
if [ "${SKIP_WAR_BUILD:-0}" != "1" ]; then (cd backend && mvn -q -B package -DskipTests); fi
BASE=$(sed -n 's#^  <version>\(.*\)</version>#\1#p' backend/pom.xml | head -1)
VERSION="$BASE-b$BUILD"
NAME="parkna-$VERSION"
OUT="$ROOT/dist/$NAME"

rm -rf "$OUT" && mkdir -p "$OUT/config" "$OUT/db"
cp backend/target/parkna.war "$OUT/"
cp -a frontend/dist "$OUT/frontend"
cp config/*.example "$OUT/config/"
cp -a deploy "$OUT/deploy"
cp -a docs "$OUT/docs"
cp backend/src/main/resources/db/migration/*.sql "$OUT/db/"
echo "$VERSION" > "$OUT/VERSION"
tar czf "$ROOT/dist/$NAME.tar.gz" -C "$ROOT/dist" "$NAME"
echo "$ROOT/dist/$NAME.tar.gz"
