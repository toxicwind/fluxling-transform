"""Path-traversal guard must hold (audit 2026-10-31: fork had dropped upstream's UnsafePathError)."""
import os, tempfile
from patchling.applydiff import apply_diff, UnsafePathError


def test_traversal_refused(tmp_path):
    evil = (
        "diff --git a/../../evil.py b/../../evil.py\n"
        "new file mode 100644\n"
        "--- /dev/null\n"
        "+++ b/../../evil.py\n"
        "+pwned\n"
    )
    assert apply_diff(str(tmp_path), evil) is False
    assert not os.path.exists(tmp_path / "evil.py")


def test_absolute_style_escape_refused(tmp_path):
    evil = (
        "diff --git a/../../../etc/passwd b/../../../etc/passwd\n"
        "new file mode 100644\n"
        "--- /dev/null\n"
        "+++ b/../../../etc/passwd\n"
        "+pwned\n"
    )
    assert apply_diff(str(tmp_path), evil) is False


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
