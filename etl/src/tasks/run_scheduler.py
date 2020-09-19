#!/usr/bin/env python
from time import sleep

from kafka import KafkaProducer

producer = KafkaProducer(bootstrap_servers="localhost:9092")

for _ in range(100):
    sleep(5)
    producer.send('podcastindex', b'Here goes feed URL')
    print("Sent a message to podcastindex")
