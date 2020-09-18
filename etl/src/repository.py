#!/usr/bin/env python
import json
from typing import List

from config import Config


class Repository(object):
    @staticmethod
    def provide() -> "Repository":
        config = Config()

        repository = Repository(
            config.persistence.feed_urls_file_path
        )

        return repository

    def __init__(self, feed_urls_file_path: str):
        self._feed_urls_file_path = feed_urls_file_path

    def select_feed_urls(self) -> List[str]:
        with open(self._feed_urls_file_path) as feed_urls_file:
            content = feed_urls_file.read()
            feed_urls = json.loads(content)

            return feed_urls
