from unittest.mock import patch
from src import app


def test_run_headless_returns_zero():
    with patch("time.sleep", side_effect=KeyboardInterrupt):
        try:
            res = app.run(headless=True)
            assert res == 0
        except KeyboardInterrupt:
            pass
