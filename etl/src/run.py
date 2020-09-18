#!/usr/bin/env python
import logging.config
import os

from feeder import Feeder
from repository import Repository

logging.config.fileConfig("aggregator.logging.conf")

repository = Repository.provide()
feeder = Feeder.provide()

feed_urls = repository.select_feed_urls()

for idx, feed_url in enumerate(feed_urls):
    logging.info(f"Processing {feed_url}")

    feed = feeder.read(feed_url)
    if not feed.successful:
        logging.warning(f"Failed to read RSS feed {feed_url}")
        continue

    logging.info(f"Got fresh data for {feed_url}")

    out_file_path = f"data/out/{idx}.json"

    out_dir_path = os.path.dirname(out_file_path)
    if not os.path.exists(out_dir_path):
        os.makedirs(out_dir_path, exist_ok=True)

    with open(out_file_path, "w") as out_file:
        feed_json = str(feed)
        print(feed_json)

        out_file.write(feed_json)
