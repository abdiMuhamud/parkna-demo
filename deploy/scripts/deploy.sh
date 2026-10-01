#!/usr/bin/env bash
# SUNU Park deployment, following SI/QA manual 2.5.1 and the usual /home/sdf layout. Run as root:
#
#   /home/sdf/deliverables/parkna-<version>/deploy/scripts/deploy.sh /home/sdf/deliverables/parkna-<version>.tar.gz
#
# Layout (same as the other applications on the server):
#   /home/sdf/parkna/                          application home: database.properties, config.properties, deploy-history
#   /home/sdf/deliverables/parkna-<v>.war      every delivered version (kept for rollback)
#   /home/sdf/deliverables/parkna-<v>/         the unpacked release package (scripts, docs, SQL, config templates)
#   /home/sdf/applications/parkna.war          the running version (Tomcat's context points at it)
#   /usr/share/nginx/html/parkna-web-v<v>/     every front-end version
#   /usr/share/nginx/html/parkna-web           -> the live front-end version (Nginx root)
#
# What it does:
#   1. unpacks the release and copies the WAR to deliverables/parkna-<version>.war
#   2. checks the configuration (moves a v0.2 installation to this layout the first time)
#   3. backs up the database (mysqldump, uses /root/.my.cnf) to /backup/parkna/
#   4. puts the new front end live (switches the parkna-web link)
#   5. stops Tomcat, puts the WAR in applications/, starts Tomcat
#   6. waits until /api/health answers; rollback.sh goes back one version
# Every path can be changed with the variables below (e.g. TOMCAT=/opt/tomcat-parkna deploy.sh ...).
set -euo pipefail

SDF_HOME=${SDF_HOME:-/home/sdf}
APP_HOME=${APP_HOME:-$SDF_HOME/parkna}
DELIVERABLES=${DELIVERABLES:-$SDF_HOME/deliverables}
APPS=${APPS:-$SDF_HOME/applications}
WEB_BASE=${WEB_BASE:-/usr/share/nginx/html}
WEB_NAME=${WEB_NAME:-parkna-web}
TOMCAT=${TOMCAT:-/opt/tomcat/current}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:8080/parkna/api/health}
BACKUP_DIR=${BACKUP_DIR:-/backup/parkna}
APP_OWNER=${APP_OWNER:-sdf:vivacom}
TOMCAT_STOP=${TOMCAT_STOP:-systemctl stop tomcat}
TOMCAT_START=${TOMCAT_START:-systemctl start tomcat}
NGINX_RELOAD=${NGINX_RELOAD:-eval nginx -t && systemctl reload nginx}
NGINX_CONF=${NGINX_CONF:-/etc/nginx}
TOMCAT_SCAN=${TOMCAT_SCAN:-/opt/*/conf/server.xml /opt/*/*/conf/server.xml}   # other Tomcats on this server
SKIP_DB_BACKUP=${SKIP_DB_BACKUP:-0}
WAIT_SECONDS=${WAIT_SECONDS:-120}
LEGACY=${LEGACY:-$SDF_HOME/applications/parkna}          # where v0.2 kept its WAR and conf/
LEGACY_WEB=${LEGACY_WEB:-/var/www/parkna/current}        # where v0.2 kept its front end

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
VERSION=$(cat "$REL/VERSION" 2>/dev/null || basename "$REL" | sed 's/^parkna-//')
WAR="$DELIVERABLES/parkna-$VERSION.war"
install -m 640 "$REL/parkna.war" "$WAR"
chown "$APP_OWNER" "$WAR" "$REL" 2>/dev/null || true
echo "Release $VERSION: $WAR"

# 2. configuration ----------------------------------------------------------
say "Checking the configuration"
# another Tomcat (e.g. SDF on Tomcat 8.5) that deploys everything in $APPS would also try to start parkna.war
for sx in $TOMCAT_SCAN; do
  [ -f "$sx" ] || continue
  [ "$(readlink -f "$sx")" = "$(readlink -f "$TOMCAT/conf/server.xml")" ] && continue
  if grep -q "appBase=\"$APPS/\?\"" "$sx" && ! grep -q 'deployIgnore="[^"]*parkna' "$sx"; then
    [ "${ALLOW_SHARED_APPBASE:-0}" = "1" ] || fail "$sx deploys every WAR in $APPS, so that Tomcat would also try to run parkna.war.
  Add deployIgnore=\"^parkna.*\" to its <Host ... appBase=\"$APPS\"> element and restart it in a maintenance
  window (see docs/DEPLOYMENT.md, section 12), then run this script again."
  fi
done

mkdir -p "$APP_HOME"
if [ ! -f "$APP_HOME/database.properties" ] && [ -f "$LEGACY/conf/database.properties" ]; then
  cp -p "$LEGACY/conf/"*.properties "$APP_HOME/"
  echo "  moved the v0.2 property files from $LEGACY/conf to $APP_HOME"
fi
[ -f "$APP_HOME/database.properties" ] || fail "$APP_HOME/database.properties missing: copy $REL/config/database.properties.example there and fill it in"
[ -f "$APP_HOME/config.properties" ]   || fail "$APP_HOME/config.properties missing: copy $REL/config/config.properties.example there and fill it in"
chown -R "$APP_OWNER" "$APP_HOME" 2>/dev/null || true
chmod 750 "$APP_HOME"; chmod 640 "$APP_HOME"/*.properties

# SUNU Park's Tomcat: where the property files are (setenv.sh) and which WAR to run (conf/Catalina/localhost/parkna.xml)
SETENV="$TOMCAT/bin/setenv.sh"
if [ -f "$SETENV" ] && grep -q "parkna.config.dir=" "$SETENV"; then
  sed -i "s#-Dparkna.config.dir=[^ \"]*#-Dparkna.config.dir=$APP_HOME#" "$SETENV"
else
  cp "$REL/deploy/tomcat/setenv.sh" "$SETENV"
  sed -i "s#-Dparkna.config.dir=[^ \"]*#-Dparkna.config.dir=$APP_HOME#" "$SETENV"
  echo "  installed $SETENV"
fi
echo "  $SETENV reads $APP_HOME; Tomcat runs $APPS/parkna.war"

# Nginx serves $WEB_BASE/$WEB_NAME: fix SUNU Park's own snippet if it still points at the v0.2 folder
NGX=$(grep -rls "root *$LEGACY_WEB" "$NGINX_CONF" 2>/dev/null || true)
for f in $NGX; do
  sed -i "s#root *$LEGACY_WEB;#root  $WEB_BASE/$WEB_NAME;#" "$f"
  echo "  $f now serves $WEB_BASE/$WEB_NAME"
done
grep -rqs "$WEB_BASE/$WEB_NAME" "$NGINX_CONF" || echo "  WARNING: no Nginx file serves $WEB_BASE/$WEB_NAME yet (root in parkna-locations.conf)"

# 3. database backup ---------------------------------------------------------
if [ "$SKIP_DB_BACKUP" != "1" ]; then
  DB=$(sed -n 's#^db.url=.*/\([^/?]*\).*#\1#p' "$APP_HOME/database.properties")
  say "Backing up database '$DB'"
  mkdir -p "$BACKUP_DIR"
  OUT="$BACKUP_DIR/pre-deploy-$(date +%Y%m%d-%H%M%S)-$DB.sql.gz"
  mysqldump --single-transaction --routines "$DB" | gzip > "$OUT"
  echo "Saved $OUT ($(du -h "$OUT" | cut -f1))"
fi

# rollback point: the version running now (the first time, the v0.2 installation)
HIST="$APP_HOME/deploy-history"
if [ ! -s "$HIST" ]; then
  RUN=""; for w in "$APPS/parkna.war" "$LEGACY/parkna.war"; do [ -f "$w" ] && { RUN=$w; break; }; done
  if [ -n "$RUN" ]; then
    cp -p "$RUN" "$DELIVERABLES/parkna-before-$VERSION.war"
    PWEB=-; for w in "$WEB_BASE/$WEB_NAME" "$LEGACY_WEB"; do [ -e "$w" ] && { PWEB=$(readlink -f "$w"); break; }; done
    echo "$(date '+%F %T') previous $DELIVERABLES/parkna-before-$VERSION.war $PWEB" >> "$HIST"
  fi
fi

# 4. front end (Nginx) -----------------------------------------------------
say "Putting the front end live"
DEST="$WEB_BASE/$WEB_NAME-v$VERSION"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$REL/frontend/." "$DEST/"
chown -R root:root "$DEST"; chmod -R u=rwX,go=rX "$DEST"
command -v restorecon >/dev/null && restorecon -R "$DEST" || true
[ -e "$WEB_BASE/$WEB_NAME" ] && [ ! -L "$WEB_BASE/$WEB_NAME" ] && mv "$WEB_BASE/$WEB_NAME" "$WEB_BASE/$WEB_NAME-old-$(date +%s)"
ln -sfn "$WEB_NAME-v$VERSION" "$WEB_BASE/$WEB_NAME.new" && mv -Tf "$WEB_BASE/$WEB_NAME.new" "$WEB_BASE/$WEB_NAME"
echo "  $WEB_BASE/$WEB_NAME -> $WEB_NAME-v$VERSION"
if [ -n "$NGX" ]; then $NGINX_RELOAD; fi

# 5. back end (Tomcat) -----------------------------------------------------
say "Swapping the WAR (Tomcat restarts)"
$TOMCAT_STOP || echo "  (Tomcat was not running)"
for i in $(seq 1 60); do curl -s -o /dev/null "$HEALTH_URL" || break; sleep 1; done   # wait until the old Tomcat has really stopped
curl -s -o /dev/null "$HEALTH_URL" && fail "Tomcat is still answering on $HEALTH_URL after stopping; stop it first"
install -m 640 "$WAR" "$APPS/parkna.war"
# written only now, while Tomcat is stopped: a running Tomcat would redeploy at once and miss the WAR
mkdir -p "$TOMCAT/conf/Catalina/localhost"
printf '<?xml version="1.0" encoding="UTF-8"?>\n<!-- SUNU Park: written by deploy.sh. Runs the WAR in %s. -->\n<Context docBase="%s/parkna.war" unpackWAR="true" />\n' "$APPS" "$APPS" \
  > "$TOMCAT/conf/Catalina/localhost/parkna.xml"
chown "$APP_OWNER" "$APPS/parkna.war" 2>/dev/null || true
rm -rf "$TOMCAT/webapps/parkna" "$TOMCAT/work/Catalina/localhost/parkna"
if [ -d "$LEGACY" ]; then                     # v0.2 folder: keep it out of applications/ (it held the property files)
  mv "$LEGACY" "$DELIVERABLES/parkna-v0.2-folder-$(date +%s)"
  echo "  moved the v0.2 folder $LEGACY to $DELIVERABLES"
fi
echo "$(date '+%F %T') $VERSION $WAR $DEST" >> "$HIST"
$TOMCAT_START

# 6. verify ----------------------------------------------------------------
say "Waiting for SUNU Park to answer on $HEALTH_URL"
for i in $(seq 1 "$WAIT_SECONDS"); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "  $(curl -fsS "$HEALTH_URL")"
    say "SUNU Park $VERSION is live"
    echo "Check next: the start-up lines in $TOMCAT/logs/catalina.out, then the post-deployment checklist in docs/DEPLOYMENT.md."
    echo "Roll back with: $(dirname "$0")/rollback.sh   (history in $HIST)"
    exit 0
  fi
  sleep 1
done
echo "---- last lines of catalina.out ----"; tail -n 60 "$TOMCAT/logs/catalina.out" 2>/dev/null || true
fail "SUNU Park did not come up within ${WAIT_SECONDS}s. Read the log above; roll back with $(dirname "$0")/rollback.sh"
