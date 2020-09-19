#!/usr/bin/env python
from kafka import KafkaConsumer

consumer = KafkaConsumer(
    "podcastindex",
    bootstrap_servers="localhost:9092"
)

for msg in consumer:
    print(msg)
