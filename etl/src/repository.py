#!/usr/bin/env python
import json
import os
from typing import List

from config import Config
from model import FeedReadingResult


class Repository(object):
    @staticmethod
    def provide() -> "Repository":
        config = Config()

        repository = Repository(
            config.persistence.feed_urls_file_path,
            config.persistence.results_dir_path
        )

        return repository

    def __init__(self, feed_urls_file_path: str, results_dir_path: str):
        self._feed_urls_file_path = feed_urls_file_path
        self._results_dir_path = results_dir_path

    def read_feed_urls(self) -> List[str]:
        with open(self._feed_urls_file_path) as feed_urls_file:
            content = feed_urls_file.read()
            feed_urls = json.loads(content)

            return feed_urls

    def write_feed_metadata(self, id: int, feed_reading_result: FeedReadingResult):
        out_file_path = os.path.join(self._results_dir_path, f"{id}.json")

        out_dir_path = os.path.dirname(out_file_path)
        if not os.path.exists(out_dir_path):
            os.makedirs(out_dir_path, exist_ok=True)

        with open(out_file_path, "w") as out_file:
            feed_json = str(feed_reading_result)
            out_file.write(feed_json)
