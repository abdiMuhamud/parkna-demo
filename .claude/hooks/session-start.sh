#!/bin/bash
# SUNU Park: prepares a Claude Code on the web session so the full QA runs at once:
#   MariaDB (installed if missing, started, with the parkna_test user and databases the tests use),
#   the Maven dependencies (cached with the container), the frontend build and Tomcat for the browser tests.
# Safe to run again: every step checks first. Local machines are left alone.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

# ---- MariaDB ------------------------------------------------------------------------------------------------
if ! command -v mysqld >/dev/null 2>&1; then
  echo "Installing MariaDB..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null
  apt-get install -y -qq mariadb-server >/dev/null
fi
if ! mysqladmin ping >/dev/null 2>&1; then
  mkdir -p /run/mysqld && chown mysql:mysql /run/mysqld 2>/dev/null || true
  (nohup mysqld_safe --user=mysql >/dev/null 2>&1 &)
  for _ in $(seq 1 60); do mysqladmin ping >/dev/null 2>&1 && break; sleep 1; done
fi
mysqladmin ping >/dev/null 2>&1 || { echo "MariaDB did not start" >&2; exit 1; }
# the same user and password as the GitHub build (DatabaseRoundTripTest, SecurityTest, the browser tests)
mysql <<'SQL'
CREATE DATABASE IF NOT EXISTS parkna_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'parkna_test'@'localhost' IDENTIFIED BY 'test-pass';
CREATE USER IF NOT EXISTS 'parkna_test'@'127.0.0.1' IDENTIFIED BY 'test-pass';
GRANT ALL PRIVILEGES ON `parkna\_%`.* TO 'parkna_test'@'localhost';
GRANT ALL PRIVILEGES ON `parkna\_%`.* TO 'parkna_test'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

# ---- Maven: download everything the build and the tests need (cached with the container) ----------------------
(cd backend && mvn -B -q -DskipTests package >/dev/null)

# ---- the frontend and Tomcat for the browser tests --------------------------------------------------------------
node scripts/build-frontend.js >/dev/null
scripts/e2e/run.sh --prepare

# ---- for this session's commands ---------------------------------------------------------------------------------
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PARKNA_TEST_DB_ARGS="-Dtest.db.url=jdbc:mariadb://127.0.0.1:3306/parkna_test -Dtest.db.password=test-pass"' >> "$CLAUDE_ENV_FILE"
fi
echo "SUNU Park session ready: MariaDB up, Maven dependencies cached, frontend built. Run scripts/qa.sh and scripts/e2e/run.sh."
