PROJECT_ID := podcastindex

SRC_PATH := $(shell pwd)/src:${PYTHONPATH}

PYTHON_DEV_SHELL := PYTHONPATH=$(SRC_PATH) poetry run
ALEMBIC_SHELL := PYTHONPATH=$(SRC_PATH) poetry run alembic

MINIO_URL := https://dl.min.io/server/minio/release/linux-amd64/minio
TINI_URL := https://github.com/krallin/tini/releases/download/v0.19.0/tini
TINIASC_URL := https://github.com/krallin/tini/releases/download/v0.19.0/tini.asc
POSTGRES_URL := https://ftp.postgresql.org/pub/source/v12.3/postgresql-12.3.tar.bz2
KAFKA_URL := http://apache.mirror.amaze.com.au/kafka/2.5.0/kafka_2.12-2.5.0.tgz
GLIBC_URL := https://github.com/sgerrand/alpine-pkg-glibc/releases/download/2.32-r0/glibc-2.32-r0.apk

.PHONY: help init shell revision build up up-services down ensure-db drop-db import-feeds run-scheduler run-worker test flake8

help:
	@cat $(MAKEFILE_LIST)\
		| grep -e "^[a-zA-Z0-9_\-]*: *.*## *"\
		| awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

init: ## Initialize virtual environment
	pip install poetry
	poetry install

shell: ## Run python shell
	$(PYTHON_DEV_SHELL) python

revision: ## Create Alembic database revision (requires name parameter to be initialized)
	@[ "${name}" ] || ( echo "Revision name is not set"; exit 1 )
	echo "Creating new Alembic database revision $(name)"
	$(ALEMBIC_SHELL) revision -m $(name)

build: ## Build Docker images
	# downloading binaries here as opposed to a Dockerfile to speed up subsequent image builds
	# blockstorage
	-wget -nc $(MINIO_URL) --directory-prefix=docker/blockstorage/bin
	-wget -nc $(TINI_URL) --directory-prefix=docker/blockstorage/bin
	-wget -nc $(TINIASC_URL) --directory-prefix=docker/blockstorage/bin
	# database
	-wget -nc $(POSTGRES_URL) --directory-prefix=docker/database/bin
	-wget -nc $(TINI_URL) --directory-prefix=docker/database/bin
	-wget -nc $(TINIASC_URL) --directory-prefix=docker/database/bin
	# bus
	-wget -nc $(KAFKA_URL) --directory-prefix=docker/bus/bin
	-wget -nc $(GLIBC_URL) --directory-prefix=docker/bus/bin
	-wget -nc $(TINI_URL) --directory-prefix=docker/bus/bin
	-wget -nc $(TINIASC_URL) --directory-prefix=docker/bus/bin
	# compose
	docker-compose -p $(PROJECT_ID) -f docker/docker-compose.yaml build

up: ## Provision local Docker cluster
	docker-compose -p $(PROJECT_ID) -f docker/docker-compose.yaml up -d

down: ## Tear down local Docker cluster
	docker-compose -p $(PROJECT_ID) -f docker/docker-compose.yaml down

ensure-db: ## Create or upgrade a database instance
	$(PYTHON_DEV_SHELL) python src/tasks/ensure_db.py

drop-db: ## Create or upgrade a database instance
	$(PYTHON_DEV_SHELL) python src/tasks/drop_db.py

import-feeds: ## Import feed urls from json file to a database
	$(PYTHON_DEV_SHELL) python src/tasks/import_feeds.py

run-scheduler: ## Run aggregation scheduler
	$(PYTHON_DEV_SHELL) python src/tasks/run_scheduler.py

run-worker: ## Run crawling and parsing worker
	$(PYTHON_DEV_SHELL) python src/tasks/run_worker.py

test: ## Run automatic tests
	$(PYTHON_TEST_SHELL) python -m unittest discover -v

flake8: ## Check basic code style conventions
	$(PYTHON_DEV_SHELL) python -m flake8 --ignore=E501,W504 --builtins="unicode" src
	$(PYTHON_DEV_SHELL) python -m flake8 --ignore=E501,W504 test
