from src import app


def test_run_headless_returns_zero():
    assert app.run(headless=True) == 0
