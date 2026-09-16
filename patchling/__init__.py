"""patchling: natural-language code transformation as a library.

The LLM-backed API (generate_diff, smartapply, ...) loads lazily so offline
modules such as patchling.mutate import with zero third-party dependencies.
"""
from __future__ import annotations

__all__ = ['generate_diff', 'smartapply', 'load_project_files',
           'build_environment', 'save_files']

_LAZY = {
    'generate_diff': '.core',
    'smartapply': '.core',
    'load_project_files': '.core',
    'build_environment': '.core',
    'save_files': '.core',
}


def __getattr__(name: str):
    if name in _LAZY:
        import importlib

        mod = importlib.import_module(_LAZY[name], __name__)
        return getattr(mod, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
