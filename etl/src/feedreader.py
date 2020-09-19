#!/usr/bin/env python
import logging.config

import requests
from requests.exceptions import ReadTimeout, ConnectionError
from urllib3.exceptions import ReadTimeoutError

from config import Config
from model import FeedReadingResult, FailedFeedReadingResult, SuccessfulFeedReadingResult, Feed


class FeedReader(object):
    @staticmethod
    def provide() -> "FeedReader":
        config = Config()

        feeder = FeedReader(
            timeout_seconds=config.feeder.timeout_seconds
        )

        return feeder

    def __init__(self, timeout_seconds: int):
        self._timeout_seconds = timeout_seconds

    def read(self, feed: Feed) -> FeedReadingResult:
        try:
            response = requests.get(
                feed.url,
                timeout=self._timeout_seconds
            )
        except ConnectionResetError:
            message = f"Connection reset by peer while reading {feed.url} feed"
            logging.error(message)

            return FailedFeedReadingResult(feed.id, None, message)
        except (ReadTimeout, ReadTimeoutError):
            message = f"There was a timeout error while reading {feed.url} feed"
            logging.error(message)

            return FailedFeedReadingResult(feed.id, None, message)
        except ConnectionError:
            message = f"There was a connection error while reading {feed.url} feed"
            logging.error(message)

            return FailedFeedReadingResult(feed.id, None, message)

        try:
            feed_response = response.text

            return SuccessfulFeedReadingResult(
                feed.id,
                feed_response
            )
        except Exception as err:
            logging.error(f"There was an unexpected error while parsing {feed.url} feed", err)
            raise
