#!/usr/bin/env python
import logging.config

from feedreader import FeedReader
from model import Feed
from persistence.repository import Repository

logging.config.fileConfig("aggregator.logging.conf")

repository = Repository.provide()
feeder = FeedReader.provide()

feeds = repository.read(Feed)

for feed in feeds:
    feed_reading_result = feeder.read(feed)

    if feed_reading_result.successful:
        logging.info(f"Successfully read fresh metadata from {feed.url} feed")
    else:
        logging.info(f"There was some issue reading data from {feed.url} feed. {feed_reading_result.message}")

    repository.write([feed_reading_result])
    logging.info(f"Saved {feed.url} feed reading result to a database")
