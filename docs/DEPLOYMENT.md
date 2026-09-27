# ParkNa deployment runbook (Rocky Linux 9)

This runbook installs ParkNa on a Rocky Linux / RHEL 9 cloud server with the INNOVII standard stack. It follows the
SI/QA Training Manual v2.0: each step is **Installation → Configuration → Verification**, and a step is only done
when its verification passes. Commands run as root unless a step says otherwise. Replace `<values>` with your own.

```
                      Internet (drivers' phones, back-office browsers)
                                        │  443 (80 redirects)
┌───────────────────────────────────────┼──────────────────────────────────────────┐
│ Rocky 9 server                        ▼                                          │
│   Nginx ── /, /admin, /org, /driver/, /officer/ ──► /var/www/parkna/current      │
│     │                                               (front end, static files)    │
│     └── /api/* ──► 127.0.0.1:8080 Tomcat 10.1 (JDK 17), context /parkna          │
│                      parkna.war  (/home/sdf/applications/parkna/parkna.war)      │
│                      reads  /home/sdf/applications/parkna/conf/*.properties      │
│                      logs   /opt/tomcat/logs/{catalina.out,parkna.log,...}       │
│                        │ JDBC 3306              │ HTTP 13013 (optional)          │
│                        ▼                        ▼                                │
│                    MariaDB (parkna)        Kannel smsbox ──SMPP──► telco SMSC     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

| What | Where |
|---|---|
| Release packages as delivered | `/home/sdf/deliverables/parkna-<version>/` |
| Running WAR | `/home/sdf/applications/parkna/parkna.war` |
| Property files | `/home/sdf/applications/parkna/conf/database.properties`, `config.properties` |
| Front end (Nginx root) | `/var/www/parkna/current` → `releases/<version>` |
| Tomcat | `/opt/tomcat/current` → `install/apache-tomcat-10.1.x` |
| Logs | `/opt/tomcat/logs/` (Tomcat and ParkNa), `/var/log/nginx/`, `/var/log/mariadb/` |
| Database backups | `/backup/parkna/` |

The release package is `parkna-<version>.tar.gz` from the GitHub release (or `scripts/package-release.sh`). It holds
`parkna.war`, `frontend/`, `config/*.example`, `deploy/` (Nginx, Tomcat, Kannel files and scripts), `db/` (SQL) and these docs.

---

## 1. Server preparation (manual Module 1)

**Installation.** Rocky Linux 9, *Minimal Install*. Cloud VM of at least 2 vCPU / 4 GB RAM / 40 GB. Where you control the
disk layout, keep `/var` (MariaDB data, logs), `/opt` (Tomcat), `/home` (WARs) and `/backup` on their own LVM volumes (1.1.3).

**Configuration.**
```bash
dnf update -y
hostnamectl set-hostname parkna-app01
timedatectl set-timezone Africa/Banjul        # payment and SMS disputes are settled with timestamps
systemctl enable --now chronyd
dnf install -y tar curl wget rsync policycoreutils-python-utils

# accounts (1.3): Tomcat service user, application user, shared group
groupadd tomcat
useradd -s /bin/bash -m -d /opt/tomcat -g tomcat tomcat && passwd -d tomcat
groupadd vivacom
useradd -s /bin/bash -m -d /home/sdf -g vivacom sdf && passwd -d sdf
usermod -a -G vivacom tomcat

su - sdf -c "mkdir -p applications/parkna/conf deliverables logs"
chmod 2710 /home/sdf
chmod 2770 /home/sdf/applications /home/sdf/applications/parkna /home/sdf/applications/parkna/conf /home/sdf/logs
mkdir -p /var/www/parkna/releases /backup/parkna && chmod 700 /backup/parkna
```

**Verification.** `df -h` matches the plan, `timedatectl` shows Africa/Banjul and *synchronized: yes*, `id tomcat` lists `vivacom`.

## 2. MariaDB (manual 2.2)

**Installation.**
```bash
dnf install -y mariadb-server mariadb        # Rocky 9 ships 10.5; for 10.11: dnf module enable -y mariadb:10.11 first
systemctl enable --now mariadb
mysql_secure_installation                     # root password, remove test DB, no remote root
```

**Configuration.** One database and one user for ParkNa, never root (2.2.3):
```sql
mysql -u root -p
CREATE DATABASE parkna CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'parkna'@'127.0.0.1' IDENTIFIED BY '<strong-password>';
CREATE USER 'parkna'@'localhost' IDENTIFIED BY '<strong-password>';
GRANT ALL PRIVILEGES ON parkna.* TO 'parkna'@'127.0.0.1', 'parkna'@'localhost';
FLUSH PRIVILEGES;
```
ParkNa creates its tables itself on first start (`db.migrate=true`). If your DBA prefers to apply SQL by hand, run
`db/V*.sql` in order, set `db.migrate=false`, and the account only needs `SELECT, INSERT, UPDATE, DELETE`.

For the backup scripts, give root a client config:
```bash
cat > /root/.my.cnf <<'EOF'
[client]
user=root
password=<root-password>
EOF
chmod 600 /root/.my.cnf
```

**Verification.** `mysql -u parkna -p -h 127.0.0.1 parkna -e "SELECT 1;"` answers; `ss -tulpn | grep 3306` shows MariaDB on localhost.

## 3. Java 17 and Tomcat 10.1 (manual 2.3, 2.4)

ParkNa is built for **Java 17 and Tomcat 10.1** (Jakarta Servlet 6). It does not run on Tomcat 9.

**Installation.**
```bash
dnf install -y java-17-openjdk-headless
ls -d /usr/lib/jvm/jre-17*                    # note the path for JAVA_HOME (usually /usr/lib/jvm/jre-17)

su - tomcat
mkdir -p install tmp
cd install
# apache-tomcat-10.1.x.tar.gz from the deliverables repository (or https://tomcat.apache.org/download-10.cgi, check the sha512)
tar -xzf apache-tomcat-10.1.<x>.tar.gz
cd ~
ln -sfn install/apache-tomcat-10.1.<x> current
ln -sfn current/logs logs
rm -rf current/webapps/{ROOT,docs,examples,manager,host-manager}   # nothing else runs in this Tomcat
exit
```

**Configuration.**
```bash
REL=/home/sdf/deliverables/parkna-<version>       # unpack the release there first: tar xzf parkna-<version>.tar.gz -C /home/sdf/deliverables
# Tomcat listens on localhost only: Nginx is the only way in
sed -i 's#<Connector port="8080" protocol="HTTP/1.1"#<Connector port="8080" address="127.0.0.1" protocol="HTTP/1.1"#' /opt/tomcat/current/conf/server.xml
# startup options: where the property files are, memory
install -o tomcat -g tomcat -m 750 $REL/deploy/tomcat/setenv.sh /opt/tomcat/current/bin/setenv.sh
# the ParkNa context: runs the WAR from /home/sdf/applications/parkna
install -d -o tomcat -g tomcat /opt/tomcat/current/conf/Catalina/localhost
install -o tomcat -g tomcat -m 640 $REL/deploy/tomcat/parkna.xml /opt/tomcat/current/conf/Catalina/localhost/parkna.xml
# systemd unit (check JAVA_HOME in it against the path noted above)
cp $REL/deploy/tomcat/tomcat.service /etc/systemd/system/tomcat.service
systemctl daemon-reload && systemctl enable tomcat
```

**Verification.** `java -version` shows 17. Tomcat is started by the deploy script in step 6.

## 4. ParkNa property files

Both files live outside the WAR, so one build runs everywhere. Tomcat finds them through `-Dparkna.config.dir` in `setenv.sh`.

```bash
cd /home/sdf/applications/parkna/conf
cp $REL/config/database.properties.example database.properties
cp $REL/config/config.properties.example config.properties
vi database.properties                         # db.password = the password from step 2
vi config.properties                           # server.publicUrl, clock, SMS (below)
chown sdf:vivacom *.properties && chmod 640 *.properties
```

| File | Key settings |
|---|---|
| `database.properties` | `db.url=jdbc:mariadb://127.0.0.1:3306/parkna`, `db.username`, `db.password`, pool size, `db.migrate` |
| `config.properties` | `server.publicUrl` (the address people type into the apps), `api.allowedOrigins`, `clock.mode` (`demo` or `real`), `demo.controls.enabled`, `sms.gateway` (`simulated` or `kannel`) and the `sms.kannel.*` settings |

Any change needs `systemctl restart tomcat`. A missing or wrong setting stops the deployment with the reason in
`catalina.out` and `parkna.log` (e.g. `ParkNa failed to start: database.properties: db.url is required`).

## 5. Nginx, firewall, HTTPS (manual 2.6, 1.4.2)

**Installation.**
```bash
dnf install -y nginx
systemctl enable nginx
setsebool -P httpd_can_network_connect 1       # SELinux: allow Nginx to proxy to Tomcat (2.6.3)
firewall-cmd --permanent --add-service=http --add-service=https
firewall-cmd --reload
```
Port 8080 (Tomcat) and 3306 (MariaDB) stay closed. Limit SSH to office/VPN addresses.

**Configuration.**
```bash
mkdir -p /etc/nginx/snippets
cp $REL/deploy/nginx/parkna-locations.conf /etc/nginx/snippets/
# with a domain (normal case):
cp $REL/deploy/nginx/parkna.conf /etc/nginx/conf.d/parkna.conf
sed -i 's/parkna.example.gm/<your-domain>/g' /etc/nginx/conf.d/parkna.conf
# certificate: Let's Encrypt (the domain's DNS must point at this server), or copy the supplied files to the paths in parkna.conf
dnf install -y epel-release && dnf install -y certbot
# Nginx is not running yet, so certbot can use port 80 itself; renewals stop and start Nginx around it
certbot certonly --standalone -d <your-domain> --pre-hook "systemctl stop nginx" --post-hook "systemctl start nginx"
```
No domain yet? Use `parkna-http.conf` instead (plain HTTP by IP address) and remove the default `server { }` block from
`/etc/nginx/nginx.conf`. Switch to HTTPS as soon as the domain exists.

**Verification.** `nginx -t` says *syntax is ok*; then `systemctl start nginx`.

## 6. Deploy ParkNa (manual 2.5.1)

```bash
/home/sdf/deliverables/parkna-<version>/deploy/scripts/deploy.sh /home/sdf/deliverables/parkna-<version>.tar.gz
```
The script stages the release, backs up the database, keeps the running WAR and front end as the rollback point, puts
the front end live, swaps the WAR (Tomcat stop/start) and waits until ParkNa answers `/api/health`. On the first
deployment ParkNa creates the tables and loads the pilot's starting data.

**Verification (post-deployment checklist, manual 2.5.3):**
- `grep ParkNa /opt/tomcat/logs/catalina.out | tail` ends with `ParkNa is running`, and no stack traces.
- `curl -s https://<your-domain>/api/health` → `{"ok":true,"database":"up",...}` (through Nginx, not only on 8080).
- `https://<your-domain>/admin` shows the back office, and `/org` the organisation portal.
- A test payment in the driver app appears in the back office within a second or two (proves the live updates work through Nginx).
- `/home/sdf/deliverables/parkna-prev.war` exists (rollback point), and the rollback steps are in the change record.

## 7. Connect the apps

Install the APKs from the GitHub release. On first start each app asks for the server address: enter
`https://<your-domain>` **including `https://`** and tap Connect. To change it later: **Account → Change server**
(driver) or **menu → Change server** (officer line).

## 8. SMS through Kannel (optional, manual 2.1)

With `sms.gateway=simulated` the SMS only appear in the apps and portals. To send and receive real SMS on the short code:
1. Install Kannel as in manual 2.1 (same server or the SMS gateway node).
2. Add the two groups from `deploy/kannel/parkna-sms.conf` to `kannel.conf` and set the password. Restart Kannel.
3. In `config.properties`: `sms.gateway=kannel` and the same `sms.kannel.username` / `sms.kannel.password`, the sender ID the operator approved (`sms.kannel.from`), and on a separate gateway node, `sms.kannel.sendsmsUrl=http://sms-gw:13013/cgi-bin/sendsms` and its address in `sms.mo.allowedIps`. On a separate node, also open 8080 to that node only (`firewall-cmd --permanent --add-rich-rule='rule family=ipv4 source address=<gw-ip> port port=8080 protocol=tcp accept'`) and bind the Tomcat connector to the HeartBeat address instead of 127.0.0.1.
4. `systemctl restart tomcat`.

**Verification.** Send `HELP` to the short code from a test phone: `/opt/tomcat/logs/parkna.log` shows
`Incoming SMS from +220...` and `parkna-sms.log` shows `SMS to +220... accepted by Kannel (HTTP 202: 0: Accepted for delivery)`.
Then follow the message in Kannel's `access_core.log`. Incoming SMS never pass through Nginx (it answers 403 on `/api/sms/`).

## 9. Daily operations (manual Module 3)

| Log | What is in it |
|---|---|
| `/opt/tomcat/logs/catalina.out` | Tomcat and everything ParkNa writes: startup, configuration summary, errors |
| `/opt/tomcat/logs/parkna.log` | ParkNa only: every action (`driver.pay num=7012345 -> ok (14 ms)`), refused actions with the reason, database problems. Daily files, 30 days kept |
| `/opt/tomcat/logs/parkna-sms.log` | SMS gateway: each SMS accepted or rejected by Kannel. 90 days kept |
| `/opt/tomcat/logs/localhost_access_log.*.txt` | Every HTTP request Tomcat served |
| `/var/log/nginx/parkna.access.log`, `parkna.error.log` | Requests from the internet, proxy errors (502 = Tomcat down) |
| `/var/log/mariadb/mariadb.log` | Database start-up and errors |

- Health: `curl -s http://127.0.0.1:8080/parkna/api/health` (add it to Grafana/monitoring; 503 means the database is down).
- Status: `systemctl status tomcat nginx mariadb`.
- More detail while investigating: uncomment `-Dparkna.log.level=DEBUG` in `setenv.sh` and restart Tomcat.
- Nightly backup (manual 1.5.5): `crontab -e` as root:
  `0 2 * * * /home/sdf/deliverables/parkna-<version>/deploy/scripts/backup-db.sh >> /backup/parkna/backup.log 2>&1`
- Only **one** ParkNa may run against a database. A second Tomcat pointed at the same database refuses to start
  (`Another ParkNa server is already running on this database`).

| Symptom | Look at |
|---|---|
| Apps say "Can't reach the ParkNa server" | `curl -I https://<domain>/api/ping`; Nginx error log; `systemctl status tomcat` |
| 502 Bad Gateway | Tomcat is down or still starting: `catalina.out` |
| 403 from Nginx on /api | SELinux boolean `httpd_can_network_connect` (step 5) |
| Back office does not update live | the `/api/events` block in the Nginx snippet (buffering must be off) |
| Deployment fails at start-up | first ParkNa ERROR line in `parkna.log` (usually a property file or the database password) |

## 10. Upgrades and rollback

Upgrade: copy the new `parkna-<version>.tar.gz` to `/home/sdf/deliverables/` and run `deploy.sh` with it. Database changes
come as numbered migrations inside the WAR (`db/V2__...sql`, ...) and run on start-up; the deploy script backs up the
database first.

Rollback: `deploy/scripts/rollback.sh` puts back the previous WAR and front end. If the new version changed the database
(a new migration), also restore the pre-deploy dump before starting the old version:
```bash
systemctl stop tomcat
gunzip -c /backup/parkna/pre-deploy-<timestamp>-parkna.sql.gz | mysql parkna
deploy/scripts/rollback.sh
```

## 11. Before real use (go-live checklist)

- `demo.controls.enabled=false` (the demo clock bar and **Reset demo**, which deletes everything, stop working).
- `clock.mode=real` so the service follows the real date and time in Banjul.
- HTTPS only (`parkna.conf`), `api.allowedOrigins=https://<domain>,http://localhost`.
- Strong, unique passwords in `database.properties` and Kannel; property files `chmod 640`.
- **Sign-in for the back office is not built yet.** In this version anyone who can reach the server can open
  `/admin` and act as an administrator. Until accounts are added, keep the server private: restrict 443 to known
  addresses in firewalld or Nginx (`allow`/`deny`), or put the back office behind the office VPN.
- Payments are simulated (every number starts with 5,000 GMD per provider). Real Wave, Afrimoney, APS and QMoney integrations are still to be built.
