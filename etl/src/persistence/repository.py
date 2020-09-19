from typing import List, Type

import pandas as pd

from config import Config
from model import Model, FeedReadingResult, SuccessfulFeedReadingResult, Channel, Episode, Feed
from persistence.db import Db
from persistence.postgres import Postgres


class Repository(object):
    @classmethod
    def provide(cls) -> "Repository":
        config = Config()

        db = Postgres(
            config.persistence.repository.credentials_file_path
        )

        return cls(db)

    def __init__(self, db: Db):
        self._db = db

    @property
    def connection_string(self) -> str:
        return self._db.get_connection_string()

    def select(self, query):
        return self._db.select(query)

    def execute(self, sql: str):
        return self._db.execute(sql)

    def schema_exists(self, schema_name: str) -> bool:
        return self._db.schema_exists(schema_name)

    def count(self, schema_name: str, table_name: str) -> int:
        return self._db.count(schema_name, table_name)

    def truncate(self, model_cls: Type[Model]):
        schema_name = model_cls.schema_name()
        table_name = model_cls.table_name()

        self._db.truncate(schema_name, table_name)

    def truncate_all(self):
        self.truncate(FeedReadingResult)
        self.truncate(Episode)
        self.truncate(Channel)
        self.truncate(Feed)

    def read(self, model_cls: Type[Model]):
        schema_name = model_cls.schema_name()
        table_name = model_cls.table_name()

        sql = f"select * from {schema_name}.{table_name}"

        return self._db.select_as_model(
            sql,
            parser_fn=model_cls.from_params
        )

    def write(self, objects: List[Model]):
        assert any(objects), "List of objects to be written cannot be empty"

        schema_name = objects[0].schema_name()
        table_name = objects[0].table_name()

        vars_to_write = [vars(obj) for obj in objects]
        df = pd.DataFrame(vars_to_write)

        self._db.upsert(
            df,
            schema_name=schema_name,
            table_name=table_name
        )
