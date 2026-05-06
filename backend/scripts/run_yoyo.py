import os
from pathlib import Path

from yoyo import get_backend, read_migrations


def sqlite_url_from_env() -> str:
    sqlite_path = os.environ.get("SQLITE_PATH")
    if sqlite_path:
        return f"sqlite:///{Path(sqlite_path).resolve()}"

    cwd = Path.cwd()
    if cwd.name == "backend":
        db_path = cwd / "data" / "dialogs.sqlite"
    else:
        db_path = cwd / "backend" / "data" / "dialogs.sqlite"

    return f"sqlite:///{db_path.resolve()}"


def migrations_dir_from_env() -> Path:
    configured = os.environ.get("YOYO_MIGRATIONS_DIR")
    if configured:
        return Path(configured).resolve()

    cwd = Path.cwd()
    if cwd.name == "backend":
        return (cwd / "migrations").resolve()

    return (cwd / "backend" / "migrations").resolve()


def main() -> None:
    backend = get_backend(sqlite_url_from_env())
    migrations = read_migrations(str(migrations_dir_from_env()))

    with backend.lock():
        backend.apply_migrations(backend.to_apply(migrations))


if __name__ == "__main__":
    main()
