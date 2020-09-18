#!/usr/bin/env python
import json
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
    if feed is None:
        logging.warning(f"Was not able to read RSS feed {feed_url}")
        continue

    logging.info(f"Got fresh data for {feed_url}")

    print(f"Feed title: {feed['feed']['title']}")
    for entry in feed["entries"]:
        print(f"Feed entry: {entry['title']}")

    out_file_path = f"data/out/{idx}.json"

    out_dir_path = os.path.dirname(out_file_path)
    if not os.path.exists(out_dir_path):
        os.makedirs(out_dir_path, exist_ok=True)

    with open(out_file_path, "w") as out_file:
        feed_json = json.dumps(feed, indent=4)
        out_file.write(feed_json)
