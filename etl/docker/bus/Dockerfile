FROM openjdk:8u212-jre-alpine

ENV KAFKA_VERSION 2.5.0
ENV SCALA_VERSION 2.12
ENV KAFKA_NAME kafka_${SCALA_VERSION}-${KAFKA_VERSION}
ENV KAFKA_HOME /opt/kafka
ENV PATH=${PATH}:${KAFKA_HOME}/bin
ENV GLIBC_VERSION 2.32-r0

COPY scripts / /tmp/
COPY bin/${KAFKA_NAME}.tgz /tmp/
COPY bin/glibc-${GLIBC_VERSION}.apk /tmp/

RUN apk add --no-cache bash curl docker \
 && chmod a+x /tmp/*.sh \
 && mv /tmp/start-kafka.sh /tmp/broker-list.sh /tmp/create-topics.sh /tmp/versions.sh /usr/bin \
 && sync \
 && tar xfz /tmp/${KAFKA_NAME}.tgz -C /opt \
 && ln -s /opt/${KAFKA_NAME} ${KAFKA_HOME}

RUN apk add --no-cache --allow-untrusted /tmp/glibc-${GLIBC_VERSION}.apk \
 && rm -r /tmp/*

COPY config/log4j.properties /opt/kafka/config/
COPY config/server.properties /opt/kafka/config/
COPY config/zookeeper.properties /opt/kafka/config/

COPY bin/tini /tini
COPY bin/tini.asc /tini.asc
RUN apk add --no-cache tini

VOLUME ["/kafka"]

ENTRYPOINT ["/sbin/tini", "--"]

# Use "exec" form so that it runs as PID 1 (useful for graceful shutdown)
CMD ["start-kafka.sh"]