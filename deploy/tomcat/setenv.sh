# ParkNa: Tomcat startup options. Copy to /opt/tomcat/current/bin/setenv.sh (owner tomcat, chmod 750).
# Tomcat reads this file on every start.

# Where database.properties and config.properties are
CATALINA_OPTS="$CATALINA_OPTS -Dparkna.config.dir=/home/sdf/applications/parkna/conf"

# Memory: the pilot needs little; raise -Xmx on a busy server
CATALINA_OPTS="$CATALINA_OPTS -Xms256m -Xmx768m"

CATALINA_OPTS="$CATALINA_OPTS -Dfile.encoding=UTF-8 -Duser.timezone=Africa/Banjul"

# Logs: parkna.log and parkna-sms.log go to Tomcat's logs folder (/opt/tomcat/logs) unless you set a folder:
# CATALINA_OPTS="$CATALINA_OPTS -Dparkna.log.dir=/home/sdf/logs/parkna"
# More detail while investigating a problem (DEBUG also logs every simulated SMS):
# CATALINA_OPTS="$CATALINA_OPTS -Dparkna.log.level=DEBUG"

export CATALINA_OPTS
