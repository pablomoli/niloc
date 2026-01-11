import re

import pytest
from sqlalchemy import event
from sqlalchemy.pool import StaticPool

from app import app as flask_app
from models import db, User, Job


def _regexp_replace(value, pattern, replacement, flags="g"):
    if value is None:
        return None
    re_flags = 0
    if flags and "i" in flags:
        re_flags |= re.IGNORECASE
    return re.sub(pattern, replacement, str(value), flags=re_flags)


def _add_regexp_replace(conn, _):
    if hasattr(conn, "create_function"):
        conn.create_function("regexp_replace", 4, _regexp_replace)


@pytest.fixture()
def app():
    flask_app.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI="sqlite://",
        SQLALCHEMY_ENGINE_OPTIONS={
            "connect_args": {"check_same_thread": False},
            "poolclass": StaticPool,
        },
    )

    with flask_app.app_context():
        if hasattr(db, "engines"):
            for engine in db.engines.values():
                engine.dispose()
            db.engines.clear()
        engine = db.get_engine(app=flask_app)
        event.listen(engine, "connect", _add_regexp_replace)
        db.drop_all()
        db.create_all()

        user = User(username="tester", name="Test User", password="x")
        db.session.add(user)
        db.session.commit()
        flask_app.config["TEST_USER_ID"] = user.id

    yield flask_app

    with flask_app.app_context():
        engine = db.get_engine(app=flask_app)
        event.remove(engine, "connect", _add_regexp_replace)
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def auth_client(client, app):
    user_id = app.config["TEST_USER_ID"]
    with client.session_transaction() as session:
        session["user_id"] = user_id
    return client
