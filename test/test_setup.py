"""Smoke tests for setting up a library through the API.

They also check where Aurora keeps its files. Portable settings go into the
vault. Machine-specific config and state go into Aurora's own folders.
"""

import json
from pathlib import Path

import pytest

import main

pytestmark = pytest.mark.integration


@pytest.fixture
def vault(aurora):
    vault = aurora / "vault"
    vault.mkdir()
    return vault


def setup_library(client, vault):
    response = client.post("/api/setup", json={"path": str(vault), "library": "papers"})
    assert response.status_code == 200, response.text
    return response.json()


def test_setup_creates_an_empty_library_inside_the_vault(client, vault):
    library_path = Path(setup_library(client, vault)["library_path"])
    assert library_path == vault / "papers"
    assert library_path.is_dir()

    response = client.get("/api/papers")
    assert response.status_code == 200, response.text
    assert response.json()["papers"] == []


def test_setup_keeps_machine_config_out_of_the_vault(client, vault):
    setup_library(client, vault)

    vault_config = json.loads((vault / ".aurora-lib.json").read_text())
    assert vault_config["library_dir"] == "papers"
    # Portable: the vault config names no absolute path of this machine.
    assert str(vault) not in json.dumps(vault_config)

    machine_config = json.loads(main.AURORA_CONFIG_FILE.read_text())
    assert machine_config["vault_path"] == str(vault)
    assert (main.AURORA_PAPIS_CONFIG_DIR / "config").is_file()


def test_ui_state_is_saved_in_the_state_folder(client):
    state = {"tabs": ["abc123"], "activeTab": "abc123"}
    client.post("/api/ui-state", json=state).raise_for_status()

    assert json.loads(main.UI_STATE_FILE.read_text()) == state
    assert client.get("/api/ui-state").json()["state"] == state
