import json
import logging
from typing import List, Tuple, Callable

import pandas as pd
from pandas import DataFrame
from sqlalchemy import create_engine

from model import Model


class DbCredentials(object):
    @staticmethod
    def read(credentials_file_path: str):
        with open(credentials_file_path) as credentials_file:
            credentials = json.load(credentials_file)

            return DbCredentials(**credentials)

    def __init__(self, address: str, port: int, database: str, user: str, password: str):
        self.database = database
        self.address = address
        self.user = user
        self.password = password
        self.port = port

    def astuple(self) -> Tuple[str, str, str, str, int]:
        return (
            self.database,
            self.address,
            self.user,
            self.password,
            self.port
        )


class Db(object):
    def __init__(self, credentials_file_path: str):
        self._credentials = DbCredentials.read(credentials_file_path)
        self._connection_str = None

    def get_connection_string(self) -> str:
        raise NotImplementedError("get_connection_string method has not been implemented")

    def _engine(self):
        if self._connection_str is None:
            self._connection_str = self.get_connection_string()

        return create_engine(self._connection_str)

    def schema_exists(self, schema_name: str) -> bool:
        try:
            sql = f"""
                select 1
                from information_schema.schemata
                where schema_name = '{schema_name}'
            """

            result = self._engine() \
                .execute(sql) \
                .fetchone()

            return result is not None
        except Exception:
            logging.exception(f"There was an issue checking if schema {schema_name} exists")
            raise

    def count(self, schema_name: str, table_name: str) -> int:
        try:
            sql = f"""
                select count(*)
                from {schema_name}.{table_name}
            """

            (num,) = self._engine().execute(sql).fetchone()

            return int(num)
        except Exception:
            logging.exception(f"There was an issue counting number of rows in {schema_name}.{table_name} table")
            raise

    def count_custom(self, sql: str) -> int:
        try:
            (num,) = self._engine().execute(sql).fetchone()

            return int(num)
        except Exception:
            logging.exception("There was an issue counting number with custom SQL query")
            raise

    def execute(self, sql: str):
        try:
            engine = self._engine()
            connection = engine.connect()
            transaction = connection.begin()
        except Exception:
            logging.exception("There was an issue starting new execute transaction")
            raise

        try:
            connection.execute(sql)

            transaction.commit()
        except Exception:
            transaction.rollback()

            logging.exception(f"There was an issue executing sql query:\n{sql}")
            raise
        finally:
            connection.close()

    def select(self, sql: str) -> DataFrame:
        try:
            with self._engine().connect() as connection:
                df = pd.read_sql(sql, connection)

                enforce_integer_ids = {col: 'int64' for col in df.columns if col == 'id' or col.endswith("_id")}
                df = df.astype(
                    dtype=enforce_integer_ids,
                    errors="ignore"
                )

                return df
        except Exception:
            logging.exception(f"There was an issue selecting data as a Pandas data frame:\n{sql}")
            raise

    def select_as_model(self, sql: str, parser_fn: Callable[..., Model]) -> List[Model]:
        df = self.select(sql)

        objects = []

        for index, row in df.iterrows():
            values = row.to_dict()
            obj = parser_fn(values)
            objects.append(obj)

        return objects

    def truncate(self, schema_name, table_name: str):
        try:
            engine = self._engine()
            connection = engine.connect()
            transaction = None
        except Exception:
            logging.error("There was an issue connecting to a database")
            raise

        try:
            transaction = connection.begin()

            sql = f"truncate table {schema_name}.{table_name} cascade"

            self._engine().execute(sql)

            transaction.commit()
        except Exception:
            if transaction is not None:
                transaction.rollback()

            logging.exception(f"There was an issue truncating {table_name} table")
            raise
        finally:
            connection.close()

    def upsert(self, data: pd.DataFrame, schema_name: str, table_name: str, action: str = "ignore"):
        raise NotImplementedError("Upsert method is not implemented")

    def append(self, data: pd.DataFrame, schema_name: str, table_name: str):
        if len(data) == 0:
            return

        try:
            engine = self._engine()
            connection = engine.connect()
            transaction = None
        except Exception:
            logging.error("There was an issue connecting to a database")
            raise

        try:
            transaction = connection.begin()

            # we assume, that for classes, where primary key columns is present, but is not set explicitely
            # it should be generated by a database identity trigger on insert
            if "id" in data and data["id"].count() < len(data):
                data = data.drop("id", axis=1)

            data.to_sql(
                f"{table_name}",
                self._engine(),
                schema=schema_name,
                chunksize=10000,
                if_exists='append',
                index=False,
                method=None
            )

            transaction.commit()
        except Exception:
            if transaction is not None:
                transaction.rollback()

            logging.error(f"There was an issue appending {len(data)} rows to {schema_name}.{table_name} table")
            raise
        finally:
            connection.close()
