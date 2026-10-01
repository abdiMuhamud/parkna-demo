#!/usr/bin/env bash
# Nightly SUNU Park database backup to /backup (SI/QA manual 1.5.5). Credentials come from /root/.my.cnf.
# Copy it once:  install -m 750 deploy/scripts/backup-db.sh /home/sdf/parkna/backup-db.sh
# crontab -e (as root):   0 2 * * *  /home/sdf/parkna/backup-db.sh >> /backup/parkna/backup.log 2>&1
set -euo pipefail
DB=${DB:-parkna}
BACKUP_DIR=${BACKUP_DIR:-/backup/parkna}
KEEP_DAYS=${KEEP_DAYS:-14}
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/$DB-$(date +%Y%m%d-%H%M).sql.gz"
mysqldump --single-transaction --routines "$DB" | gzip > "$OUT"
find "$BACKUP_DIR" -name "$DB-*.sql.gz" -mtime +"$KEEP_DAYS" -delete
echo "$(date '+%F %T') backup $OUT $(du -h "$OUT" | cut -f1)"
