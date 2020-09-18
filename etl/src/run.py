import json

feeds_file_path = "data/feeds.json"

with open(feeds_file_path) as feeds_file:
    content = feeds_file.read()
    feed_urls = json.loads(content)

    for idx, feed_url in enumerate(feed_urls):
        print(f"{idx}: {feed_url}")
