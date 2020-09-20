#!/usr/bin/env python
import logging.config
from time import sleep

from bus import Bus
from config import Config
from feedreader import FeedReader
from model import Channel
from persistence.blockstorage import BlockStorage
from persistence.repository import Repository
from tasks.base import BaseTask


class RunWorkerTask(BaseTask):
    @staticmethod
    def run():
        config = Config()
        repository = Repository.provide()
        feed_reader = FeedReader.provide()
        block_storage = BlockStorage.provide()
        bus = Bus.provide()

        for feed in bus:
            logging.info(f"Processing {feed.url} feed")

            feed_reading_result, feed_content = feed_reader.read(feed)

            feed_id = feed_reading_result.feed_id

            repository.execute(f"delete from podcastindex.feed_reading_result where feed_id = {feed_id}")

            repository.write([feed_reading_result])

            logging.info(f"Saved {feed.url} feed reading result to a database")

            if feed_reading_result.successful and feed_content is not None:
                block_storage.put(
                    feed_reading_result.content_key,
                    feed_content
                )

                # will also remove all linked episodes due to on delete cascade
                repository.execute(f"delete from podcastindex.channel where feed_id = {feed_id}")

                channel = feed_content.channel
                repository.write([channel])
                [channel] = [channel for channel in repository.read(Channel) if channel.feed_id == feed_id]

                episodes = feed_content.episodes
                for episode in episodes:
                    episode.channel_id = channel.id

                repository.write(episodes)

                logging.info(f"Successfully read fresh metadata from {feed.url} feed")
            else:
                logging.info(f"There was an issue reading data from {feed.url} feed. {feed_reading_result.message}")

            sleep(config.tasks.run_worker.interval_seconds)


if __name__ == "__main__":
    task = RunWorkerTask()
    task.run()
