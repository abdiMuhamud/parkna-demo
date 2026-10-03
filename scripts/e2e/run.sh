#!/bin/bash
# SUNU Park browser tests: runs the real server (Tomcat + the WAR + a fresh MariaDB database, demo mode) behind a small
# Node server that does Nginx's job (frontend/dist, /api -> Tomcat), then the Playwright scripts in scripts/e2e/tests/
# in order. Every script exits non-zero on a regression; screenshots go to backend/target/e2e/shots.
#
#   scripts/e2e/run.sh              build the WAR and the frontend, then run every test
#   scripts/e2e/run.sh 2-simulator  only the tests whose file name contains "2-simulator"
#   scripts/e2e/run.sh --prepare    only download Tomcat (the Claude session hook does this)
#
# Needs: Java 17+, Maven, Node 18+ with Playwright (global or local) and Chromium, MariaDB.
#   MYSQL_ADMIN   how to reach MariaDB as an administrator (default: mysql; CI: mysql -h127.0.0.1 -uroot -p...)
#   SKIP_BUILD=1  reuse backend/target/parkna.war and frontend/dist
#   E2E_PORT / TOMCAT_PORT   default 8188 / 8190
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT=$PWD
TOMCAT_VERSION=10.1.60
CACHE=${XDG_CACHE_HOME:-$HOME/.cache}/sunu-park
CATALINA_HOME=$CACHE/apache-tomcat-$TOMCAT_VERSION
E2E_PORT=${E2E_PORT:-8188}
TOMCAT_PORT=${TOMCAT_PORT:-8190}
WORK=$ROOT/backend/target/e2e
MYSQL_ADMIN=${MYSQL_ADMIN:-mysql}

prepare() {
  [ -x "$CATALINA_HOME/bin/catalina.sh" ] && return
  mkdir -p "$CACHE"
  echo "Downloading Tomcat $TOMCAT_VERSION..."
  curl -fsSL "https://archive.apache.org/dist/tomcat/tomcat-10/v$TOMCAT_VERSION/bin/apache-tomcat-$TOMCAT_VERSION.tar.gz" | tar -xz -C "$CACHE"
}
prepare
[ "${1:-}" = "--prepare" ] && exit 0

if [ "${SKIP_BUILD:-}" != "1" ]; then
  echo "== Building the WAR and the frontend"
  (cd backend && mvn -B -q -DskipTests package 2>&1 | grep -v "^Picked up JAVA_TOOL_OPTIONS" || true)
  node scripts/build-frontend.js >/dev/null
fi
[ -f backend/target/parkna.war ] || { echo "backend/target/parkna.war is missing" >&2; exit 1; }

echo "== A fresh database and server (demo mode)"
rm -rf "$WORK"; mkdir -p "$WORK/conf" "$WORK/logs" "$WORK/shots" "$WORK/base"
$MYSQL_ADMIN -e "DROP DATABASE IF EXISTS parkna_e2e; CREATE DATABASE parkna_e2e CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS 'parkna_test'@'%' IDENTIFIED BY 'test-pass'; GRANT ALL PRIVILEGES ON parkna_e2e.* TO 'parkna_test'@'%';
  CREATE USER IF NOT EXISTS 'parkna_test'@'localhost' IDENTIFIED BY 'test-pass'; GRANT ALL PRIVILEGES ON parkna_e2e.* TO 'parkna_test'@'localhost'; FLUSH PRIVILEGES;"
cat > "$WORK/conf/database.properties" <<P
db.url=jdbc:mariadb://127.0.0.1:3306/parkna_e2e
db.username=parkna_test
db.password=test-pass
P
cat > "$WORK/conf/config.properties" <<P
app.mode=demo
server.publicUrl=http://127.0.0.1:$E2E_PORT
sms.gateway=simulated
auth.otp.showCodeInApp=true
payments.mode=simulated
demo.controls.enabled=true
P
B=$WORK/base
cp -r "$CATALINA_HOME/conf" "$B/conf"; mkdir -p "$B/webapps" "$B/logs" "$B/temp" "$B/work"
sed -i -e "s/port=\"8080\"/port=\"$TOMCAT_PORT\" address=\"127.0.0.1\"/" -e "s/port=\"8005\"/port=\"-1\"/" "$B/conf/server.xml"
cp backend/target/parkna.war "$B/webapps/parkna.war"
export CATALINA_HOME CATALINA_BASE=$B CATALINA_PID=$WORK/tomcat.pid
export CATALINA_OPTS="-Dparkna.config.dir=$WORK/conf -Dparkna.log.dir=$WORK/logs -Xmx768m -Dfile.encoding=UTF-8 -Duser.timezone=Africa/Banjul"

SERVE_PID=
cleanup() {
  [ -n "$SERVE_PID" ] && kill "$SERVE_PID" 2>/dev/null || true
  "$CATALINA_HOME/bin/catalina.sh" stop 5 -force >/dev/null 2>&1 || true
}
trap cleanup EXIT
"$CATALINA_HOME/bin/catalina.sh" start >/dev/null
node scripts/e2e/serve.js "$E2E_PORT" "http://127.0.0.1:$TOMCAT_PORT/parkna" > "$WORK/logs/serve.log" 2>&1 &
SERVE_PID=$!
BASE=http://127.0.0.1:$E2E_PORT
for _ in $(seq 1 120); do curl -fs -m2 "$BASE/api/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fs "$BASE/api/health" >/dev/null || { echo "The server did not start:" >&2; tail -40 "$WORK/logs/parkna.log" "$B/logs/catalina.out" 2>/dev/null >&2; exit 1; }
ADMIN_PW=$(grep -oE "Password: [A-Za-z0-9]+" "$WORK/logs/parkna.log" | tail -1 | cut -d" " -f2)
echo "   up: $(curl -s "$BASE/api/health")"

fail=0
for t in scripts/e2e/tests/*.js; do
  case "$t" in *"${1:-}"*) ;; *) continue ;; esac
  echo "== $(basename "$t" .js)"
  if BASE=$BASE ADMIN_PW=$ADMIN_PW OUT=$WORK/shots node "$t"; then echo "   passed"; else echo "   FAILED" >&2; fail=1; fi
  curl -s -X POST -H "Content-Type: application/json" -d '{"what":"reset"}' "$BASE/api/sim/clock" >/dev/null || true
done
[ "$fail" = 0 ] && echo "Browser tests passed (screenshots: backend/target/e2e/shots)" || { echo "Browser tests FAILED (screenshots and logs: backend/target/e2e)" >&2; exit 1; }
