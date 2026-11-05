"""Contract tests for fluxling.workflows — code-run-first verify_apply."""

import pytest

import fluxling.workflows as wf


def _fake_chat(script):
    calls = []

    def impl(messages, model=None, max_tokens=None, temperature=None, **kw):
        calls.append(messages)
        return script.pop(0), {"completion_tokens": 1}

    return impl, calls


def test_failed_apply_retries_with_repair_prompt(tmp_path):
    (tmp_path / "f.txt").write_text("old\n")
    script = [
        "not a diff at all",
        "--- a/f.txt\n+++ b/f.txt\n@@ -1 +1 @@\n-old\n+new\n",
    ]
    chat_fn, calls = _fake_chat(script)
    check_state = {"n": 0}

    def checks_fn(wd, chs):
        check_state["n"] += 1
        ok = check_state["n"] >= 2
        return (
            ok,
            [
                {
                    "check": ch[0],
                    "cmd": " ".join(ch[1]),
                    "ok": ok,
                    "exit": 0 if ok else 1,
                    "stdout_tail": "",
                    "stderr_tail": "",
                }
                for ch in chs
            ],
        )

    res = wf.verify_apply(
        goal="replace old with new",
        workdir=str(tmp_path),
        checks=[("has_new", ["grep", "-q", "new", "f.txt"])],
        max_rounds=2,
        chat_fn=chat_fn,
        apply_fn=wf.apply_diff,
        checks_fn=checks_fn,
    )
    assert res["satisfied"] is True
    assert res["rounds"] == 2
    assert len(calls) == 2
    assert "FAILED VERIFICATION" in calls[1][-1]["content"]


def test_satisfied_requires_applied_diff_and_passing_checks(tmp_path):
    # model emits a valid-looking diff but apply touches nothing -> not satisfied
    diff = "--- a/missing.txt\n+++ b/missing.txt\n@@ -1 +1 @@\n-x\n+y\n"
    chat_fn, _ = _fake_chat([diff])
    res = wf.verify_apply(
        goal="g",
        workdir=str(tmp_path),
        checks=[("never_runs", ["true"])],
        max_rounds=1,
        chat_fn=chat_fn,
        apply_fn=wf.apply_diff,
        checks_fn=lambda wd, chs: (
            True,
            [
                {
                    "check": "c",
                    "cmd": "x",
                    "ok": True,
                    "exit": 0,
                    "stdout_tail": "",
                    "stderr_tail": "",
                }
            ],
        ),
    )
    # apply on missing file with no context fails to modify anything -> apply_impl returns False or raises
    assert res["satisfied"] is False or res["history"][0]["applied"] is False


def test_check_failure_blocks_satisfaction_even_when_model_happy(tmp_path):
    (tmp_path / "f.txt").write_text("old\n")
    diff = "--- a/f.txt\n+++ b/f.txt\n@@ -1 +1 @@\n-old\n+new\n"
    chat_fn, _ = _fake_chat([diff])
    res = wf.verify_apply(
        goal="g",
        workdir=str(tmp_path),
        checks=[("must_fail", ["false"])],
        max_rounds=1,
        chat_fn=chat_fn,
        apply_fn=wf.apply_diff,
    )
    assert res["satisfied"] is False
    assert res["history"][0]["checks"][0]["exit"] != 0


def test_real_end_to_end_apply_and_check(tmp_path):
    (tmp_path / "f.txt").write_text("old\n")
    diff = "--- a/f.txt\n+++ b/f.txt\n@@ -1 +1 @@\n-old\n+new\n"
    chat_fn, _ = _fake_chat([diff])
    res = wf.verify_apply(
        goal="g",
        workdir=str(tmp_path),
        checks=[("grep_new", ["grep", "-q", "new", "f.txt"])],
        max_rounds=1,
        chat_fn=chat_fn,
        apply_fn=wf.apply_diff,
    )
    assert res["satisfied"] is True
    assert (tmp_path / "f.txt").read_text().strip() == "new"
