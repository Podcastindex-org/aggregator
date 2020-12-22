#!/usr/bin/env python
import logging.config
from typing import Tuple, Optional

import requests
from requests.exceptions import ReadTimeout, ConnectionError
from urllib3.exceptions import ReadTimeoutError

from config import Config
from model import FeedReadingResult, FailedFeedReadingResult, SuccessfulFeedReadingResult, Feed, FeedContent


class FeedReader(object):
    @staticmethod
    def provide() -> "FeedReader":
        config = Config()

        feeder = FeedReader(
            timeout_seconds=config.feed_reader.timeout_seconds
        )

        return feeder

    def __init__(self, timeout_seconds: int):
        self._timeout_seconds = timeout_seconds

    def read(self, feed: Feed) -> Tuple[FeedReadingResult, Optional[FeedContent]]:
        try:
            response = requests.get(
                feed.url,
                timeout=self._timeout_seconds
            )
        except ConnectionResetError:
            message = f"Connection reset by peer while reading {feed.url} feed"
            logging.error(message)

            return FailedFeedReadingResult(feed.id, message), None
        except (ReadTimeout, ReadTimeoutError):
            message = f"There was a timeout error while reading {feed.url} feed"
            logging.error(message)

            return FailedFeedReadingResult(feed.id, message), None
        except ConnectionError:
            message = f"There was a connection error while reading {feed.url} feed"
            logging.error(message)

            return FailedFeedReadingResult(feed.id, message), None

        try:
            return SuccessfulFeedReadingResult(feed.id), FeedContent(feed.id, response.text)
        except Exception as err:
            logging.error(f"There was an unexpected error while parsing {feed.url} feed", err)
            raise
