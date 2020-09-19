FROM alpine:3.12

ENV MINIO_UPDATE off

EXPOSE 9000

COPY bin/minio /usr/bin/minio
COPY bin/docker-entrypoint.sh /usr/bin/docker-entrypoint.sh
RUN chmod +x /usr/bin/minio

RUN  \
     apk add --no-cache ca-certificates 'curl>7.61.0' 'su-exec>=0.2' && \
     echo 'hosts: files mdns4_minimal [NOTFOUND=return] dns mdns4' >> /etc/nsswitch.conf]

COPY bin/tini /tini
COPY bin/tini.asc /tini.asc
RUN apk add --no-cache tini

ENTRYPOINT ["/sbin/tini", "--"]

VOLUME ["/data"]

CMD ["/usr/bin/docker-entrypoint.sh", "minio", "server", "/data"]