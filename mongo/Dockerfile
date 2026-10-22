FROM mongo:7.0

# Init scripts run once, only when the mongo-data volume is empty
COPY --chown=mongodb:mongodb init/ /docker-entrypoint-initdb.d/

# Run as the image's built-in non-root user (plan checklist: non-root USER)
USER mongodb

EXPOSE 27017
