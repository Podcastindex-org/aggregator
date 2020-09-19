FROM alpine:3.12

ENV KAFKA_VERSION 2.5.0
ENV SCALA_VERSION 2.12

ENV TINI_VERSION v0.19.0

LABEL name="kafka" version=${KAFKA_VERSION}

COPY bin/kafka_${SCALA_VERSION}-${KAFKA_VERSION}.tgz /tmp/kafka.tgz

RUN apk add --no-cache openjdk8-jre bash docker coreutils su-exec
RUN apk add --no-cache -t .build-deps curl ca-certificates jq \
  && mkdir -p /opt \
  && tar -xzf /tmp/kafka.tgz -C /opt \
  && mv /opt/kafka_${SCALA_VERSION}-${KAFKA_VERSION} /opt/kafka \
  && adduser -DH -s /sbin/nologin kafka \
  && chown -R kafka: /opt/kafka \
  && rm -rf /tmp/* \
  && apk del --purge .build-deps

ENV PATH /sbin:/opt/kafka/bin/:$PATH

WORKDIR /opt/kafka

VOLUME ["/tmp/kafka-logs"]

EXPOSE 9092 2181

COPY config/log4j.properties /opt/kafka/config/
COPY config/server.properties /opt/kafka/config/
COPY config/zookeeper.properties /opt/kafka/config/
COPY bin/docker-entrypoint.sh /docker-entrypoint.sh
COPY scripts /

COPY bin/tini /tini
COPY bin/tini.asc /tini.asc
RUN apk add --no-cache tini

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["/docker-entrypoint.sh", "kafka-server-start.sh", "config/server.properties"]