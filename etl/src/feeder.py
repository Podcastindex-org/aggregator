#!/usr/bin/env python
import logging.config
from typing import Optional, Dict

import feedparser
import requests
from requests.exceptions import ReadTimeout, ConnectionError
from urllib3.exceptions import ReadTimeoutError

from config import Config


class Feeder(object):
    @staticmethod
    def provide() -> "Feeder":
        config = Config()

        feeder = Feeder(
            timeout_seconds=config.feeder.timeout_seconds
        )

        return feeder

    def __init__(self, timeout_seconds: int):
        self._timeout_seconds = timeout_seconds

    def read(self, feed_url: str) -> Optional[Dict]:
        try:
            response = requests.get(
                feed_url,
                timeout=self._timeout_seconds
            )
        except ConnectionResetError:
            logging.error(f"Connection reset by peer while reading {feed_url} feed")
            return None
        except (ReadTimeout, ReadTimeoutError):
            logging.error(f"There was a timeout error while reading {feed_url} feed")
            return None
        except ConnectionError:
            logging.error(f"There was a connection error while reading {feed_url} feed")
            return None

        try:
            feed = feedparser.parse(response.text)
        except Exception as err:
            logging.error(f"There was an unexpected error while parsing {feed_url} feed", err)
            raise

        return feed
