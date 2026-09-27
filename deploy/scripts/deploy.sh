#!/usr/bin/env bash
# ParkNa deployment, following SI/QA manual 2.5.1: stage, keep a rollback point, swap, start, verify.
# Run as root on the application server:
#
#   deploy/scripts/deploy.sh /home/sdf/deliverables/parkna-0.2.0-b15.tar.gz
#
# What it does:
#   1. unpacks the release into /home/sdf/deliverables/parkna-<version>/
#   2. backs up the database (mysqldump, uses /root/.my.cnf) to /backup/parkna/
#   3. keeps the running WAR and front end as the rollback point
#   4. puts the new front end live for Nginx (/var/www/parkna/current)
#   5. stops Tomcat, swaps the WAR, clears the exploded folder, starts Tomcat
#   6. waits until /api/health answers; if not, shows the logs and tells you how to roll back
# Paths can be changed with the variables below (e.g. APP_DIR=... deploy.sh ...).
set -euo pipefail

APP_DIR=${APP_DIR:-/home/sdf/applications/parkna}
DELIVERABLES=${DELIVERABLES:-/home/sdf/deliverables}
WEB_ROOT=${WEB_ROOT:-/var/www/parkna}
TOMCAT=${TOMCAT:-/opt/tomcat/current}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:8080/parkna/api/health}
BACKUP_DIR=${BACKUP_DIR:-/backup/parkna}
APP_OWNER=${APP_OWNER:-sdf:vivacom}
TOMCAT_STOP=${TOMCAT_STOP:-systemctl stop tomcat}
TOMCAT_START=${TOMCAT_START:-systemctl start tomcat}
SKIP_DB_BACKUP=${SKIP_DB_BACKUP:-0}
WAIT_SECONDS=${WAIT_SECONDS:-120}

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mFAILED: %s\033[0m\n' "$*" >&2; exit 1; }

[ $# -eq 1 ] || fail "usage: $0 <parkna-release.tar.gz | unpacked release folder>"
PKG=$1

# 1. stage ------------------------------------------------------------------
say "Staging $PKG"
mkdir -p "$DELIVERABLES"
if [ -d "$PKG" ]; then
  REL=$(cd "$PKG" && pwd)
else
  [ -f "$PKG" ] || fail "$PKG not found"
  TOP=$(tar tzf "$PKG" | sed -n "1s#/.*##p")
  tar xzf "$PKG" -C "$DELIVERABLES"
  REL="$DELIVERABLES/$TOP"
fi
[ -f "$REL/parkna.war" ] || fail "$REL/parkna.war missing"
[ -f "$REL/frontend/index.html" ] || fail "$REL/frontend/index.html missing"
VERSION=$(cat "$REL/VERSION" 2>/dev/null || basename "$REL")
echo "Release $VERSION in $REL"

[ -f "$APP_DIR/conf/database.properties" ] || fail "$APP_DIR/conf/database.properties missing: copy $REL/config/database.properties.example there and fill it in"
[ -f "$APP_DIR/conf/config.properties" ]   || fail "$APP_DIR/conf/config.properties missing: copy $REL/config/config.properties.example there and fill it in"

# 2. database backup -------------------------------------------------------
if [ "$SKIP_DB_BACKUP" != "1" ]; then
  DB=$(sed -n 's#^db.url=.*/\([^/?]*\).*#\1#p' "$APP_DIR/conf/database.properties")
  say "Backing up database '$DB'"
  mkdir -p "$BACKUP_DIR"
  OUT="$BACKUP_DIR/pre-deploy-$(date +%Y%m%d-%H%M%S)-$DB.sql.gz"
  mysqldump --single-transaction --routines "$DB" | gzip > "$OUT"
  echo "Saved $OUT ($(du -h "$OUT" | cut -f1))"
fi

# 3. rollback point ---------------------------------------------------------
say "Keeping the running version as the rollback point"
if [ -f "$APP_DIR/parkna.war" ]; then
  cp -p "$APP_DIR/parkna.war" "$DELIVERABLES/parkna-prev.war"
  echo "  $DELIVERABLES/parkna-prev.war"
fi
if [ -L "$WEB_ROOT/current" ]; then
  readlink "$WEB_ROOT/current" > "$DELIVERABLES/parkna-prev-frontend"
  echo "  front end: $(cat "$DELIVERABLES/parkna-prev-frontend")"
fi

# 4. front end (Nginx) -----------------------------------------------------
say "Putting the front end live"
DEST="$WEB_ROOT/releases/$VERSION"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$REL/frontend/." "$DEST/"
chmod -R u=rwX,go=rX "$DEST"
command -v restorecon >/dev/null && restorecon -R "$WEB_ROOT" || true
ln -sfn "releases/$VERSION" "$WEB_ROOT/current.new" && mv -Tf "$WEB_ROOT/current.new" "$WEB_ROOT/current"
echo "  $WEB_ROOT/current -> releases/$VERSION"

# 5. back end (Tomcat) -----------------------------------------------------
say "Swapping the WAR (Tomcat restarts)"
$TOMCAT_STOP || echo "  (Tomcat was not running)"
for i in $(seq 1 60); do curl -s -o /dev/null "$HEALTH_URL" || break; sleep 1; done   # wait until the old Tomcat has really stopped
curl -s -o /dev/null "$HEALTH_URL" && fail "Tomcat is still answering on $HEALTH_URL after stopping; stop it first"
install -m 640 "$REL/parkna.war" "$APP_DIR/parkna.war"
chown "$APP_OWNER" "$APP_DIR/parkna.war" 2>/dev/null || true
rm -rf "$TOMCAT/webapps/parkna" "$TOMCAT/work/Catalina/localhost/parkna"
$TOMCAT_START

# 6. verify ----------------------------------------------------------------
say "Waiting for ParkNa to answer on $HEALTH_URL"
for i in $(seq 1 "$WAIT_SECONDS"); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "  $(curl -fsS "$HEALTH_URL")"
    say "ParkNa $VERSION is live"
    echo "Check next: the start-up lines in $TOMCAT/logs/catalina.out, then the post-deployment checklist in docs/DEPLOYMENT.md."
    echo "Roll back with: $(dirname "$0")/rollback.sh"
    exit 0
  fi
  sleep 1
done
echo "---- last lines of catalina.out ----"; tail -n 60 "$TOMCAT/logs/catalina.out" 2>/dev/null || true
fail "ParkNa did not come up within ${WAIT_SECONDS}s. Read the log above; roll back with $(dirname "$0")/rollback.sh"
