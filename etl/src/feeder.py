#!/usr/bin/env python
import logging.config

import feedparser
import requests
from requests.exceptions import ReadTimeout, ConnectionError
from urllib3.exceptions import ReadTimeoutError

from config import Config
from model import FeedReadingResult, FailedFeedReadingResult, SuccessfulFeedReadingResult


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

    def read(self, feed_url: str) -> FeedReadingResult:
        try:
            response = requests.get(
                feed_url,
                timeout=self._timeout_seconds
            )
        except ConnectionResetError:
            message = f"Connection reset by peer while reading {feed_url} feed"
            logging.error(message)

            return FailedFeedReadingResult(feed_url, message)
        except (ReadTimeout, ReadTimeoutError):
            message = f"There was a timeout error while reading {feed_url} feed"
            logging.error(message)

            return FailedFeedReadingResult(feed_url, message)
        except ConnectionError:
            message = f"There was a connection error while reading {feed_url} feed"
            logging.error(message)

            return FailedFeedReadingResult(feed_url, message)

        try:
            feed_dict = feedparser.parse(response.text)

            title = feed_dict["feed"]["title"]
            entries = [entry["title"] for entry in feed_dict["entries"]]

            return SuccessfulFeedReadingResult(
                feed_url,
                title,
                entries
            )
        except Exception as err:
            logging.error(f"There was an unexpected error while parsing {feed_url} feed", err)
            raise
