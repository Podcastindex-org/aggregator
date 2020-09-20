#!/usr/bin/env python
import logging.config
import os

import alembic.config
from sqlalchemy import create_engine

from persistence.repository import Repository
from tasks.base import BaseTask


class EnsureDatabaseTask(BaseTask):
    @staticmethod
    def run():
        repository = Repository.provide()

        try:
            repository.execute("select 1")
        except Exception:
            logging.info("Was not able to run a test query. Possibly due to missing DB. Attempting to create one now")

            try:
                connection_str = repository.connection_string
                [connection_str, database_name] = connection_str.rsplit("/", 1)
            except Exception:
                logging.error(
                    f"Was not able to split connection string into "
                    f"connection string and database name: {repository.connection_string}"
                )
                raise

            try:
                engine = create_engine(connection_str, isolation_level="AUTOCOMMIT")
                engine.execute(f"create database {database_name}")

                logging.info(f"Database {database_name} has been successfully created")
            except Exception:
                logging.error(
                    "Was not able to create a database. "
                    "Possibly due to insufficient permissions"
                )
                raise

        alembic_args = [
            'upgrade',
            'head'
        ]

        alembic.config.main(argv=alembic_args)

        logging.info("Database exists and updated to use the latest schema definition")


if __name__ == "__main__":
    task = EnsureDatabaseTask()
    task.run()
