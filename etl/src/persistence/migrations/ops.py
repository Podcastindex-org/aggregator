import os

from config import Config


def execute(sql, op, split: str = False, split_char: str = ";"):
    connection = op.get_bind()
    if split:
        for statement in sql.split(split_char):
            statement = statement.strip()
            if len(statement) > 0:
                connection.execute(statement)
    else:
        connection.execute(sql)


def upgrade(revision, op):
    config = Config()
    migrations_dir = config.persistence.migrations.migrations_dir
    migration_path = os.path.join(migrations_dir, f"{revision}_upgrade.sql")

    with open(migration_path) as migrations_file:
        upgrade_sql = migrations_file.read()
        execute(upgrade_sql, op)


def downgrade(revision, op):
    config = Config()
    migrations_dir = config.persistence.migrations.migrations_dir
    migration_path = os.path.join(migrations_dir, f"{revision}_downgrade.sql")

    with open(migration_path) as migration_file:
        downgrade_sql = migration_file.read()
        execute(downgrade_sql, op)
