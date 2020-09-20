#!/usr/bin/env python
import logging.config

import alembic.config

from persistence.repository import Repository
from tasks.base import BaseTask


class DropDatabaseTask(BaseTask):
    @staticmethod
    def run():
        repository = Repository.provide()

        if repository.schema_exists("podcastindex"):
            logging.info("Downgrading a database to it's initial state")

            repository.truncate_all()
            logging.info("Removed all data from a database")

            alembicArgs = [
                'downgrade',
                'base'
            ]

            alembic.config.main(argv=alembicArgs)

            logging.info("Database has been truncated and rolled back to initial state")
        else:
            logging.info("No podcastindex schema. This database might have been already truncated")


if __name__ == "__main__":
    task = DropDatabaseTask()
    task.run()
