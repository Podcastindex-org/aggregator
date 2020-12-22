import logging
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from persistence.repository import Repository


def run_migrations():
    log_config_file_path = "aggregator.logging.conf"

    if "AGGREGATOR__LOG_CONFIG_FILE_PATH" in os.environ:
        log_config_file_path = os.environ["AGGREGATOR__LOG_CONFIG_FILE_PATH"]

    logging.config.fileConfig(log_config_file_path)

    repository = Repository.provide()

    connection_str = repository.connection_string
    engine = create_engine(connection_str)

    with engine.connect() as connection:
        version_schema = "alembic"

        if not repository.schema_exists(version_schema):
            repository.execute(f"create schema {version_schema}")

        context.configure(
            connection=connection,
            version_table_schema=version_schema,
            version_table="version"
        )

        with context.begin_transaction():
            context.run_migrations()


run_migrations()
