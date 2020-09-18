#!/usr/bin/env python
import json
import logging.config
import os

import feedparser
import requests
from requests.exceptions import ReadTimeout, ConnectionError
from urllib3.exceptions import ReadTimeoutError

logging.config.fileConfig("aggregator.logging.conf")

feeds_file_path = "data/feeds.json"

with open(feeds_file_path) as feeds_file:
    content = feeds_file.read()
    feed_urls = json.loads(content)

    for idx, feed_url in enumerate(feed_urls):
        logging.info(f"Processing {feed_url}")

        try:
            response = requests.get(feed_url, timeout=5)
        except ConnectionResetError:
            logging.error(f"Connection reset by peer while reading {feed_url} feed")
            continue
        except (ReadTimeout, ReadTimeoutError):
            logging.error(f"There was a timeout error while reading {feed_url} feed")
            continue
        except ConnectionError:
            logging.error(f"There was a connection error while reading {feed_url} feed")
            continue

        try:
            feed = feedparser.parse(response.text)
        except Exception as err:
            logging.error(f"There was an unexpected error while parsing {feed_url} feed", err)
            raise

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
