"""Path-traversal guard tests (audit 2026-10-31: fork had lost UnsafePathError; re-added, disableable)."""
import os
from fluxling.applydiff import apply_diff


def _evil(levels):
    rel = "../" * levels + "evil.py"
    return (
        f"diff --git a/{rel} b/{rel}\n"
        "new file mode 100644\n"
        "--- /dev/null\n"
        f"+++ b/{rel}\n"
        "+pwned\n"
    )


def test_traversal_refused(tmp_path):
    assert apply_diff(str(tmp_path), _evil(2)) is False
    assert not os.path.exists(tmp_path / "evil.py")


def test_absolute_style_escape_refused(tmp_path):
    assert apply_diff(str(tmp_path), _evil(5)) is False


def test_legit_patch_still_applies(tmp_path):
    (tmp_path / "app.py").write_text("def hello():\n    pass\n")
    good = (
        "diff --git a/app.py b/app.py\n"
        "--- a/app.py\n"
        "+++ b/app.py\n"
        "@@ -1,2 +1,3 @@\n"
        " def hello():\n"
        "-    pass\n"
        '+    print("hi")\n'
    )
    assert apply_diff(str(tmp_path), good) is True
    assert 'print("hi")' in (tmp_path / "app.py").read_text()


def test_guard_disableable_via_param(tmp_path, monkeypatch):
    # one level up: lands inside the pytest run dir (tmp_path.parent)
    outside = tmp_path.parent
    stale = outside / "evil.py"
    if stale.exists():
        stale.unlink()
    assert apply_diff(str(tmp_path), _evil(1), allow_unsafe_paths=True) is True
    assert stale.exists()
    stale.unlink()
    monkeypatch.setenv("GPTDIFF_ALLOW_UNSAFE_PATHS", "1")
    assert apply_diff(str(tmp_path), _evil(1)) is True
    assert stale.exists()
    stale.unlink()
