"""smartapply path rescue (session 2026-10-31: LLM emitted garbage temp-path headers; smartapply created a phantom file instead of matching content)."""
from patchling.core import smartapply


BAD_DIFF = (
    " a/tmp/tmp01jiembh b/tmp/tmp01jiembh\n"
    "--- a/tmp/tmp01jiembh\n"
    "+++ b/tmp/tmp01jiembh\n"
    "@@ -1,2 +1,2 @@\n"
    "-def add(a, b):\n"
    "+def add(a=0, b=0):\n"
    "     return a + b\n"
)


def test_garbage_path_rescued_by_content(monkeypatch):
    """Unresolvable diff path + removal lines matching one file → apply there, no phantom."""
    monkeypatch.setattr('patchling.core.call_llm_for_apply_with_think_tool_available',
                        lambda path, original, patch, model, **kw: patch)
    files = {'calc.py': 'def add(a, b):\n    return a + b\n', 'readme.md': '# calc\n'}
    out = smartapply(BAD_DIFF, dict(files))
    assert 'tmp/' not in ''.join(out.keys()), f"phantom file created: {list(out)}"
    assert 'def add(a=0, b=0)' in out['calc.py']


def test_exact_path_still_wins(monkeypatch):
    """Existing file referenced by its real (prefixed) path resolves exactly."""
    monkeypatch.setattr('patchling.core.call_llm_for_apply_with_think_tool_available',
                        lambda path, original, patch, model, **kw: patch)
    files = {'calc.py': 'def add(a, b):\n    return a + b\n'}
    diff = ("diff --git a/calc.py b/calc.py\n"
            "--- a/calc.py\n"
            "+++ b/calc.py\n"
            "@@ -1,2 +1,2 @@\n"
            "-def add(a, b):\n"
            "+def add(a, b=0):\n")
    out = smartapply(diff, dict(files))
    assert list(out) == ['calc.py']
    assert 'def add(a, b=0)' in out['calc.py']


def test_genuinely_new_file_not_clobbered(monkeypatch):
    """Path matching nothing and content matching nothing stays a new file."""
    monkeypatch.setattr('patchling.core.call_llm_for_apply_with_think_tool_available',
                        lambda path, original, patch, model, **kw: patch)
    files = {'calc.py': 'def add(a, b):\n    return a + b\n'}
    diff = ("--- /dev/null\n"
            "+++ b/newmod.py\n"
            "@@ -0,0 +1,1 @@\n"
            "+print('hi')\n")
    out = smartapply(diff, dict(files))
    assert 'newmod.py' in out
    assert out['calc.py'] == files['calc.py']
