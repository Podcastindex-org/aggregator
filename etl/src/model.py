import json

from typing import List, Optional


class FeedReadingResult(object):
    def __init__(self, url: str, title: Optional[str], entries: Optional[List[str]], successful: bool, message: Optional[str]):
        self.url = url
        self.title = title
        self.entries = entries
        self.successful = successful
        self.message = message

    def __repr__(self):
        if self.successful:
            feed_dict = {
                "url": self.url,
                "title": self.title,
                "successful": self.successful,
                "entries": self.entries
            }
        else:
            feed_dict = {
                "url": self.url,
                "successful": self.successful,
                "message": self.message
            }

        return json.dumps(feed_dict, indent=4)


class SuccessfulFeedReadingResult(FeedReadingResult):
    def __init__(self, url: str, title: str, entries: List[str], message: Optional[str] = ""):
        super().__init__(
            url,
            title,
            entries,
            successful=True,
            message=message
        )


class FailedFeedReadingResult(FeedReadingResult):
    def __init__(self, url: str, message: Optional[str] = "Unknown error"):
        super().__init__(
            url,
            title=None,
            entries=None,
            successful=False,
            message=message
        )
