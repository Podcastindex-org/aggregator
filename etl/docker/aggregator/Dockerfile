# this images is built using docker buils, not docker/docker-compose.yml file

FROM ubuntu:bionic

RUN apt update
RUN apt install -y sudo vim curl git python3 python3-pip

COPY docker/aggregator/requirements.txt /tmp
RUN pip3 install -r /tmp/requirements.txt

RUN useradd -G root,sudo -m podcastindex && \
    echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

USER podcastindex

COPY src/ /usr/local/src/aggregator/
COPY alembic/ /usr/local/src/aggregator/alembic
COPY data/ /var/aggregator/data
COPY docker/aggregator/secrets/ /etc/aggregator/secrets
COPY aggregator.conf /etc/aggregator/aggregator.conf
COPY aggregator.logging.conf /etc/aggregator/aggregator.logging.conf
COPY alembic.ini /etc/aggregator/alembic.ini

WORKDIR /usr/local/src/aggregator

ENV PYTHONPATH "/usr/local/src/aggregator"

ENV AGGREGATOR__CONFIG_FILE_PATH "/etc/aggregator/aggregator.conf"
ENV AGGREGATOR__LOG_CONFIG_FILE_PATH "/etc/aggregator/aggregator.logging.conf"
ENV AGGREGATOR__DATA_DIR "/var/aggregator/data"
ENV AGGREGATOR__SECRETS_DIR "/etc/aggregator/secrets"
ENV ALEMBIC_CONFIG "/etc/aggregator/alembic.ini"

ENTRYPOINT ["python3", "-u"]
