# Podcastindex aggregator ETLs

Extract, transform, load (ETL) components of podcastindex aggregator. 
Implements baseline functions for reading and persisting RSS feeds' metadata.

## Prerequisites
1. Linux (tested with Ubuntu 18.04)
2. python 3.6.1 or higher, pip3.
3. make.
4. Docker (tested with version 19.03.6).

## Getting started
Following command sequence will provision a local Docker cluster with a few auxiliary services and will run a single RSS feed reading and parsing session:
1. `make up` - build and provision Docker containers running Postgres DB and a Minio block storage service. Run `docker ps -a` to see a list of running docker containers.
1. `make ensure-db` - create a database, schemas and tables nesessary to store feeds related metadata.
1. `make import-feeds` - populate database with a list of sample RSS feed urls. See [feeds.json](data/feeds.json).
1. `make run-aggregator` - launch RSS feed crawler and parser. Results will be written to a Postgres DB and Minio block storage.
1. `make down` - destroy local Docker cluster.

## Main entry points
|Entry point|Command|Comments|
|:---|:---|:---|
|ensure-db|`make ensure-db`|Create or upgrade a database instance|
|drop-db|`make drop-db`|Create or upgrade a database instance|
|import-feeds|`make import-feeds`|Import feed urls from json file to a database|
|run-aggregator|`make run-aggregator`|Launch RSS feed crawler and parser|

## Other terminal commands
Run `make help` or `make` to get them.
```
init                           Initialize virtual environment
shell                          Run python shell
revision                       Create Alembic database revision (requires name parameter to be initialized)
build                          Build Docker images
up                             Provision local Docker cluster
down                           Tear down local Docker cluster
ensure-db                      Create or upgrade a database instance
drop-db                        Create or upgrade a database instance
import-feeds                   Import feed urls from json file to a database
run-aggregator                 Launch RSS feed crawler and parser
test                           Run automatic tests
flake8                         Check basic code style conventions
```