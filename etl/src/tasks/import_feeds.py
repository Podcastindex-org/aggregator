#!/usr/bin/env python
import json
import logging.config

from config import Config
from model import Feed
from persistence.repository import Repository

logging.config.fileConfig("aggregator.logging.conf")

config = Config()

repository = Repository.provide()

if config.tasks.import_feeds.truncate:
    repository.truncate(Feed)

feeds_file_path = config.tasks.import_feeds.feeds_file_path
with open(feeds_file_path) as feeds_file:
    feeds_json = feeds_file.read()

    feed_urls = json.loads(feeds_json)
    logging.info(f"Found {len(feed_urls)} feed urls in a {feeds_file_path} file")

    feeds = [Feed(feed_url) for feed_url in feed_urls]

    repository.write(feeds)

    logging.info(f"Saved {len(feeds)} feed urls to a database")
