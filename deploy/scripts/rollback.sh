#!/usr/bin/env bash
# ParkNa rollback: puts back the WAR and front end saved by the last deploy.sh run. Run as root.
# The database is NOT rolled back automatically; if the new version changed data you need to undo, restore the
# pre-deploy dump from /backup/parkna (see docs/DEPLOYMENT.md, "Rolling back").
set -euo pipefail
fail() { echo "FAILED: $*" >&2; exit 1; }

APP_DIR=${APP_DIR:-/home/sdf/applications/parkna}
DELIVERABLES=${DELIVERABLES:-/home/sdf/deliverables}
WEB_ROOT=${WEB_ROOT:-/var/www/parkna}
TOMCAT=${TOMCAT:-/opt/tomcat/current}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:8080/parkna/api/health}
APP_OWNER=${APP_OWNER:-sdf:vivacom}
TOMCAT_STOP=${TOMCAT_STOP:-systemctl stop tomcat}
TOMCAT_START=${TOMCAT_START:-systemctl start tomcat}
WAIT_SECONDS=${WAIT_SECONDS:-120}

[ -f "$DELIVERABLES/parkna-prev.war" ] || { echo "No rollback WAR at $DELIVERABLES/parkna-prev.war" >&2; exit 1; }

if [ -f "$DELIVERABLES/parkna-prev-frontend" ]; then
  PREV=$(cat "$DELIVERABLES/parkna-prev-frontend")
  ln -sfn "$PREV" "$WEB_ROOT/current.new" && mv -Tf "$WEB_ROOT/current.new" "$WEB_ROOT/current"
  echo "Front end back to $PREV"
fi

$TOMCAT_STOP || echo "  (Tomcat was not running)"
for i in $(seq 1 60); do curl -s -o /dev/null "$HEALTH_URL" || break; sleep 1; done   # wait until the old Tomcat has really stopped
curl -s -o /dev/null "$HEALTH_URL" && fail "Tomcat is still answering on $HEALTH_URL after stopping; stop it first"
install -m 640 "$DELIVERABLES/parkna-prev.war" "$APP_DIR/parkna.war"
chown "$APP_OWNER" "$APP_DIR/parkna.war" 2>/dev/null || true
rm -rf "$TOMCAT/webapps/parkna" "$TOMCAT/work/Catalina/localhost/parkna"
$TOMCAT_START

for i in $(seq 1 "$WAIT_SECONDS"); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then echo "Rolled back: $(curl -fsS "$HEALTH_URL")"; exit 0; fi
  sleep 1
done
tail -n 60 "$TOMCAT/logs/catalina.out" 2>/dev/null || true
echo "Previous version did not come up either: see the log above" >&2
exit 1
