# Observed ClamAV 1.5.5 image with bundled signatures; update this digest deliberately.
FROM node:24-alpine AS node
FROM clamav/clamav:stable@sha256:64e30c0bf976198024deb3dc6d5cfe2485fb969c0f73549ba0fdb364b9469614
USER root
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN printf '\nStreamMaxLength 11M\nMaxScanSize 25M\nMaxFileSize 11M\nMaxThreads 2\nAlertEncrypted yes\n' >> /etc/clamav/clamd.conf
COPY --chown=clamav:clamav protocol.mjs server.mjs start.sh /app/
ENV PORT=8080 TZ=UTC FRESHCLAM_CHECKS=12 CLAMD_STARTUP_TIMEOUT=210
USER clamav
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--", "/bin/sh", "/app/start.sh"]
