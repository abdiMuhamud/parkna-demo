#!/usr/bin/env bash
# SUNU Park rollback: goes back to the version deployed before the current one (from /home/sdf/parkna/deploy-history).
# Run as root, with the same variables you give deploy.sh (TOMCAT, HEALTH_URL, TOMCAT_STOP, TOMCAT_START).
# The database is NOT rolled back: if the new version changed it, restore the pre-deploy dump from /backup/parkna
# first (docs/DEPLOYMENT.md, section 10).
set -euo pipefail
fail() { echo "FAILED: $*" >&2; exit 1; }

SDF_HOME=${SDF_HOME:-/home/sdf}
APP_HOME=${APP_HOME:-$SDF_HOME/parkna}
APPS=${APPS:-$SDF_HOME/applications}
WEB_BASE=${WEB_BASE:-/usr/share/nginx/html}
WEB_NAME=${WEB_NAME:-parkna-web}
TOMCAT=${TOMCAT:-/opt/tomcat/current}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:8080/parkna/api/health}
APP_OWNER=${APP_OWNER:-sdf:vivacom}
TOMCAT_STOP=${TOMCAT_STOP:-systemctl stop tomcat}
TOMCAT_START=${TOMCAT_START:-systemctl start tomcat}
WAIT_SECONDS=${WAIT_SECONDS:-120}
HIST="$APP_HOME/deploy-history"

[ -f "$HIST" ] && [ "$(wc -l < "$HIST")" -ge 2 ] || fail "nothing to roll back to in $HIST"
# lines: <date> <time> <version> <war> <front-end folder>
read -r _ _ CUR _ _ < <(tail -n 1 "$HIST")
read -r _ _ PREV PWAR PWEB < <(tail -n 2 "$HIST" | head -n 1)
[ -f "$PWAR" ] || fail "$PWAR (version $PREV) is missing"
echo "Rolling back from $CUR to $PREV"

if [ "$PWEB" != "-" ] && [ -d "$PWEB" ]; then
  ln -sfn "$PWEB" "$WEB_BASE/$WEB_NAME.new" && mv -Tf "$WEB_BASE/$WEB_NAME.new" "$WEB_BASE/$WEB_NAME"
  echo "Front end back to $PWEB"
fi

$TOMCAT_STOP || echo "  (Tomcat was not running)"
for i in $(seq 1 60); do curl -s -o /dev/null "$HEALTH_URL" || break; sleep 1; done   # wait until the old Tomcat has really stopped
curl -s -o /dev/null "$HEALTH_URL" && fail "Tomcat is still answering on $HEALTH_URL after stopping; stop it first"
install -m 640 "$PWAR" "$APPS/parkna.war"
chown "$APP_OWNER" "$APPS/parkna.war" 2>/dev/null || true
rm -rf "$TOMCAT/webapps/parkna" "$TOMCAT/work/Catalina/localhost/parkna"
sed -i '$d' "$HIST"                         # the rolled-back version leaves the history
$TOMCAT_START

for i in $(seq 1 "$WAIT_SECONDS"); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then echo "Rolled back to $PREV: $(curl -fsS "$HEALTH_URL")"; exit 0; fi
  sleep 1
done
tail -n 60 "$TOMCAT/logs/catalina.out" 2>/dev/null || true
echo "The previous version did not come up either: see the log above" >&2
exit 1
