"""base

Revision ID: 7f3204996d57
Revises: 
Create Date: 2020-07-15 13:18:33.356604

"""
from alembic import op
from persistence.migrations import ops


# revision identifiers, used by Alembic.
revision = '7f3204996d57'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    ops.upgrade(revision, op)


def downgrade():
    ops.downgrade(revision, op)
