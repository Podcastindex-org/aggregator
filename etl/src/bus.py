import json
from typing import Tuple, Any

import dill
from kafka import KafkaProducer, KafkaConsumer

from config import Config


class BusCredentials(object):
    @staticmethod
    def read(credentials_file_path: str):
        with open(credentials_file_path) as credentials_file:
            credentials = json.load(credentials_file)

            return BusCredentials(**credentials)

    def __init__(self, address: str, port: int):
        self.address = address
        self.port = port

    def astuple(self) -> Tuple[str, int]:
        return (
            self.address,
            self.port
        )


class Bus(object):
    @classmethod
    def provide(cls) -> "Bus":
        config = Config()

        return Bus(
            config.bus.topic,
            config.bus.credentials_file_path
        )

    def __init__(self, topic: str, credentials_file_path: str):
        self._topic = topic
        self._credentials = BusCredentials.read(credentials_file_path)
        self._default_encoding = "utf-8"

    def _producer(self) -> KafkaProducer:
        (address, port) = self._credentials.astuple()
        producer = KafkaProducer(bootstrap_servers=f"{address}:{port}")

        return producer

    def _consumer(self) -> KafkaConsumer:
        (address, port) = self._credentials.astuple()
        consumer = KafkaConsumer(
            self._topic,
            bootstrap_servers=f"{address}:{port}"
        )

        return consumer

    def send(self, message: Any):
        message_bytes = dill.dumps(message)

        self._producer().send(
            self._topic,
            message_bytes
        )

    def __iter__(self):
        for message_record in self._consumer():
            message = dill.loads(message_record.value)
            yield message
