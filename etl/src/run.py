#!/usr/bin/env python
import logging.config

from feeder import Feeder
from repository import Repository

logging.config.fileConfig("aggregator.logging.conf")

repository = Repository.provide()
feeder = Feeder.provide()

feed_urls = repository.read_feed_urls()

for idx, feed_url in enumerate(feed_urls):
    logging.info(f"Processing {feed_url}")

    feed = feeder.read(feed_url)
    if not feed.successful:
        logging.warning(f"Failed to read RSS feed {feed_url}")
    else:
        logging.info(f"Got fresh data for {feed_url}")
        print(feed)

    repository.write_feed_metadata(idx, feed)
