FROM alpine:3.20
RUN apk add --no-cache postgresql17-client bash curl tar gzip findutils tzdata coreutils
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
# Cron entry — daily at 02:30 UTC. Override via BACKUP_CRON env if you want.
RUN mkdir -p /etc/crontabs && \
    echo "30 2 * * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root
CMD ["sh", "-c", "echo '[backup] starting crond'; touch /var/log/backup.log; crond -f -L /dev/stdout & tail -F /var/log/backup.log"]
