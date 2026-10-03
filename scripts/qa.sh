#!/bin/bash
# SUNU Park fast QA: what to run before every push (the browser tests are scripts/e2e/run.sh).
#   1. syntax check of every JavaScript file (apps, portals, shared, scripts)
#   2. records runs of the JavaScript engine (frontend/shared/engine.js) for the parity tests
#   3. the back-end tests: parity (Java engine == JS engine), privacy views, USSD menu, security and the MariaDB
#      round trip (these two only when MariaDB answers with the parkna_test user, as in CI and Claude sessions)
# QA_RUNS / QA_STEPS: random parity runs and steps per run (default 3 x 1000, CI uses the same).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/3 JavaScript syntax"
n=0
while IFS= read -r f; do node --check "$f"; n=$((n + 1)); done < <(git ls-files '*.js' | grep -v '^apps/.*/www/assets/')
echo "   $n files OK"

echo "== 2/3 Parity runs of the JavaScript engine"
rm -rf backend/target/parity
node scripts/parity/generate.js backend/target/parity "${QA_RUNS:-3}" "${QA_STEPS:-1000}"

echo "== 3/3 Back-end tests"
DB=()
if mysql -h127.0.0.1 -uparkna_test -ptest-pass -e "SELECT 1" parkna_test >/dev/null 2>&1; then
  DB=(-Dtest.db.url=jdbc:mariadb://127.0.0.1:3306/parkna_test -Dtest.db.password=test-pass)
else
  echo "   MariaDB (parkna_test / test-pass) not reachable: the database and security tests are skipped"
fi
rm -rf backend/target/surefire-reports
(cd backend && mvn -B test -Dparity.dir="$PWD/target/parity" "${DB[@]}" > target/qa-maven.log 2>&1) || true
fail=0
ls backend/target/surefire-reports/TEST-*.xml >/dev/null 2>&1 || { tail -40 backend/target/qa-maven.log >&2; echo "QA FAILED: the back end did not build or no test ran" >&2; exit 1; }
for f in backend/target/surefire-reports/TEST-*.xml; do
  line=$(grep -o 'name="[^"]*" time="[^"]*" tests="[0-9]*" errors="[0-9]*" skipped="[0-9]*" failures="[0-9]*"' "$f" | head -1 | sed 's/ time="[^"]*"//')
  echo "   $line"
  echo "$line" | grep -q 'errors="0" skipped="[0-9]*" failures="0"' || fail=1
done
[ "$fail" = 0 ] && echo "QA passed" || { grep -E "FAIL|expected|Tests run:.*Fail" backend/target/qa-maven.log | head -20 >&2; echo "QA FAILED (full log: backend/target/qa-maven.log)" >&2; exit 1; }
