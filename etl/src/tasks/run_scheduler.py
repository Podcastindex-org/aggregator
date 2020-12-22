#!/usr/bin/env python
import logging.config
from itertools import cycle
from time import sleep

from bus import Bus
from config import Config
from model import Feed
from persistence.repository import Repository
from tasks.base import BaseTask


class RunSchedulerTask(BaseTask):
    @staticmethod
    def run():
        config = Config()
        repository = Repository.provide()
        bus = Bus.provide()

        feeds = repository.read(Feed)

        for feed in cycle(feeds):
            bus.send(feed)
            logging.info(f"Feed {feed.url} is scheduled for processing")

            sleep(config.tasks.run_scheduler.interval_seconds)


if __name__ == "__main__":
    task = RunSchedulerTask()
    task.run()
