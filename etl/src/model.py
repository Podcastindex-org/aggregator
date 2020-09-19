import re
import uuid
from typing import Optional, Any, Dict, List

import feedparser


class Model(object):
    @classmethod
    def schema_name(cls) -> str:
        return "podcastindex"

    @classmethod
    def table_name(cls) -> str:
        # taken from stackoverflow - https://stackoverflow.com/questions/1175208/elegant-python-function-to-convert-camelcase-to-snake-case
        class_name = cls.__name__
        table_name = re.sub(r'(?<!^)(?=[A-Z])', '_', class_name).lower()

        return table_name

    @classmethod
    def from_params(cls, parameters: Dict[str, Any]) -> "Model":
        primary_key = None

        if "id" in parameters:
            primary_key = parameters["id"]
            del parameters["id"]

        obj = cls(**parameters)
        obj.set_id(primary_key)

        return obj

    def __init__(self, id: Optional[int]):
        self.id = id

    def set_id(self, value: int):
        self.id = value


class Feed(Model):
    def __init__(self, url: str):
        super(Feed, self).__init__(id=None)

        self.url = url


class Channel(Model):
    def __init__(self, feed_id: int, title: str):
        super(Channel, self).__init__(id=None)

        self.feed_id = feed_id
        self.title = title


class Episode(Model):
    def __init__(self, channel_id: Optional[int], title: str):
        super(Episode, self).__init__(id=None)

        self.channel_id = channel_id
        self.title = title


class FeedReadingResult(Model):
    @classmethod
    def table_name(cls) -> str:
        return "feed_reading_result"

    def __init__(self, feed_id: int, content_key: Optional[str], successful: bool, message: Optional[str]):
        super(FeedReadingResult, self).__init__(id=None)

        self.feed_id = feed_id
        self.content_key = content_key or str(uuid.uuid4())
        self.successful = successful
        self.message = message


class SuccessfulFeedReadingResult(FeedReadingResult):
    def __init__(self, feed_id: int):
        super().__init__(
            feed_id,
            content_key=None,
            successful=True,
            message=None
        )


class FailedFeedReadingResult(FeedReadingResult):
    def __init__(self, feed_id: int, message: Optional[str] = "Unknown error"):
        super().__init__(
            feed_id,
            content_key=None,
            successful=False,
            message=message
        )


class FeedContent(object):
    def __init__(self, feed_id: int, content: str):
        self._feed_id = feed_id
        self._content = content

    @property
    def channel(self) -> Channel:
        feed_dict = feedparser.parse(self._content)

        channel = Channel(
            feed_id=self._feed_id,
            title=feed_dict["feed"]["title"]
        )

        return channel

    @property
    def episodes(self) -> List[Episode]:
        feed_dict = feedparser.parse(self._content)

        episodes = []
        for entry in feed_dict["entries"]:
            episode = Episode(
                channel_id=None,
                title=entry["title"]
            )

            episodes.append(episode)

        return episodes
