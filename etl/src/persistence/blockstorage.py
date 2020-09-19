import json
from io import BytesIO
from typing import Tuple, Any

import dill
from minio import Minio

from config import Config


class BlockStorageCredentials(object):
    @staticmethod
    def read(credentials_file_path: str):
        with open(credentials_file_path) as credentials_file:
            credentials = json.load(credentials_file)

            return BlockStorageCredentials(**credentials)

    def __init__(self, address: str, access_key: str, secret_key: str):
        self.address = address
        self.access_key = access_key
        self.secret_key = secret_key

    def astuple(self) -> Tuple[str, str, str]:
        return (
            self.address,
            self.access_key,
            self.secret_key
        )


class BlockStorage(object):
    @classmethod
    def provide(cls) -> "BlockStorage":
        config = Config()

        return BlockStorage(
            config.persistence.block_storage.bucket_name,
            config.persistence.block_storage.credentials_file_path
        )

    def __init__(self, bucket_name: str, credentials_file_path: str):
        self._bucket_name = bucket_name
        self._credentials = BlockStorageCredentials.read(credentials_file_path)

    def _client(self) -> Minio:
        (address, access_key, secret_key) = self._credentials.astuple()

        client = Minio(
            address,
            access_key=access_key,
            secret_key=secret_key,
            secure=False
        )

        return client

    def put(self, key: str, obj: Any):
        client = self._client()

        if not client.bucket_exists(self._bucket_name):
            client.make_bucket(self._bucket_name)

        byte_array = dill.dumps(obj)
        stream = BytesIO(byte_array)

        client.put_object(
            self._bucket_name,
            key,
            stream,
            length=len(byte_array)
        )

    def get(self, key: str) -> Any:
        client = self._client()

        response = client.get_object(
            self._bucket_name,
            key
        )

        byte_array = response.read()
        obj = dill.loads(byte_array)

        return obj
