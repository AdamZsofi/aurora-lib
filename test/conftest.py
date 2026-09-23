"""Shared test setup. Keeps every test away from the real machine.

pytest imports this file before any test module. The top-level code below
therefore runs before `main` computes its config and state paths.
"""

import os
import shutil
import socket
import tempfile
from pathlib import Path

import pytest

# 1. Sandbox: point home and all XDG folders into one temporary folder, so
#    Aurora and papis resolve every config, state and cache path in there.
SANDBOX = Path(tempfile.mkdtemp(prefix="aurora-test-")).resolve()
for var, name in [("HOME", "home"), ("XDG_CONFIG_HOME", "config"),
                  ("XDG_STATE_HOME", "state"), ("XDG_CACHE_HOME", "cache"),
                  ("XDG_DATA_HOME", "data")]:
    os.environ[var] = str(SANDBOX / name)
for var in ["AURORA_DEFAULT_VAULT", "AURORA_DEFAULT_LIBRARY", "AURORA_SINGLE_LIBRARY",
            "AURORA_DOCKER", "PAPIS_CONFIG_DIR", "PAPIS_CACHE_DIR"]:
    os.environ.pop(var, None)

import main  # noqa: E402
import papis.config  # noqa: E402
import papis.database  # noqa: E402
import papis.utils  # noqa: E402

# 2. Tripwire: stop the whole run if any state path escaped the sandbox.
_state_paths = {
    "Aurora config": main.AURORA_CONFIG_FILE,
    "UI state": main.UI_STATE_FILE,
    "papis config": main.AURORA_PAPIS_CONFIG_DIR,
    "papis cache": papis.utils.get_cache_home(),
}
_escaped = {name: str(path) for name, path in _state_paths.items()
            if not Path(path).resolve().is_relative_to(SANDBOX)}


def pytest_sessionstart(session):
    if _escaped:
        pytest.exit(f"Refusing to run: state paths outside the test sandbox {SANDBOX}: "
                    f"{_escaped}", returncode=3)


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(SANDBOX, ignore_errors=True)


# 3. No network, unless a test is marked `live`.
@pytest.fixture(autouse=True)
def _no_network(request, monkeypatch):
    if request.node.get_closest_marker("live"):
        return
    real_connect = socket.socket.connect

    def guarded_connect(sock, address):
        if sock.family in (socket.AF_INET, socket.AF_INET6):
            raise RuntimeError(f"Network access is blocked in tests: {address!r}")
        return real_connect(sock, address)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)


# 4. Record app launches instead of opening windows on the test machine.
@pytest.fixture(autouse=True)
def launched(monkeypatch):
    calls = []

    def launch_obsidian(path=None, debug=False):
        calls.append(("obsidian", path))
        return True, {"method": "test-stub"}

    def open_with_default_app(path):
        calls.append(("default-app", str(path)))

    def browser_open(uri, *args, **kwargs):
        calls.append(("browser", uri))
        return True

    monkeypatch.setattr(main, "_launch_obsidian", launch_obsidian)
    monkeypatch.setattr(main, "_open_with_default_app", open_with_default_app)
    monkeypatch.setattr(main.webbrowser, "open", browser_open)
    return calls


def _reset_papis():
    papis.config.CURRENT_LIBRARY = None
    papis.config.reset_configuration()
    papis.database.clear_cached()


# 5. Fresh Aurora and papis state for one test.
@pytest.fixture
def aurora(tmp_path, monkeypatch):
    """Give the test its own config, state and papis folders under tmp_path.

    Returns tmp_path. Create the test's vault inside it.
    """
    state = tmp_path / "state"
    monkeypatch.setattr(main, "AURORA_CONFIG_FILE", tmp_path / "config" / "config.json")
    monkeypatch.setattr(main, "UI_STATE_FILE", state / "ui-state.json")
    monkeypatch.setattr(main, "AURORA_PAPIS_CONFIG_DIR", state / "papis")
    monkeypatch.setenv("PAPIS_CONFIG_DIR", str(state / "papis"))
    monkeypatch.setenv("PAPIS_CACHE_DIR", str(tmp_path / "papis-cache"))
    _reset_papis()
    yield tmp_path
    _reset_papis()


@pytest.fixture
def client(aurora):
    """An API client for the app, running on the test's fresh state."""
    from fastapi.testclient import TestClient

    with TestClient(main.app) as test_client:
        yield test_client
