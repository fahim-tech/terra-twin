import warnings

import pytest
from fastapi.testclient import TestClient

from terratwin_api.config import settings
from terratwin_api.main import app

warnings.filterwarnings("ignore")

requires_data = pytest.mark.skipif(not (settings.data_dir / "manifest.json").is_file(),
                                   reason="research package not imported (scripts/import_research_package.py)")


@pytest.fixture(scope="session")
def client():
    return TestClient(app)
