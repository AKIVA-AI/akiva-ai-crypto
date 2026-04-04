"""
control_plane — Control-plane adapters for Enterprise Crypto.

Bridges the multi-agent trading system (META-DECISION veto, signal/execution
agents) to the Akiva execution-contracts and policy-runtime packages.

Guard pattern: _HAS_CONTROL_PLANE is True when both framework packages are
installed.  The agent orchestrator checks this flag before wiring.
"""

try:
    import akiva_execution_contracts  # noqa: F401
    import akiva_policy_runtime  # noqa: F401

    _HAS_CONTROL_PLANE = True
except ImportError:
    _HAS_CONTROL_PLANE = False


def _require_control_plane() -> None:
    """Raise if control-plane packages are not available."""
    if not _HAS_CONTROL_PLANE:
        raise ImportError(
            "control_plane requires akiva-execution-contracts and "
            "akiva-policy-runtime.  Install them with:\n"
            "  pip install -e ../akiva-ai-framework/packages/execution-contracts "
            "-e ../akiva-ai-framework/packages/policy-runtime"
        )
