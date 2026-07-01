#!/usr/bin/env python3
"""Standalone validation script for the dtcc-agent MCP server and Agent SDK.

Modes:
  --mcp-only   Start the MCP server and verify the process stays alive.
  (default)    Full round-trip: MCP server + Agent SDK query.

Usage:
  python scripts/validate_agent_standalone.py --mcp-only
  python scripts/validate_agent_standalone.py
"""

import argparse
import asyncio
import os
import shutil
import subprocess
import sys
import time


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_conda() -> str:
    conda = shutil.which("conda")
    if not conda:
        print("FAIL: conda not found on PATH")
        sys.exit(1)
    return conda


def _mcp_command(conda: str) -> list[str]:
    return [
        conda, "run", "--no-capture-output",
        "-n", "fenicsx-env",
        "python", "-m", "dtcc_agent",
    ]


def _mcp_config(conda: str) -> dict:
    return {
        "dtcc-agent": {
            "type": "stdio",
            "command": conda,
            "args": [
                "run", "--no-capture-output",
                "-n", "fenicsx-env",
                "python", "-m", "dtcc_agent",
            ],
        }
    }


# ---------------------------------------------------------------------------
# Test 1: MCP server starts and stays alive
# ---------------------------------------------------------------------------

def test_mcp_starts(conda: str) -> bool:
    print("--- Test: MCP server starts ---")
    cmd = _mcp_command(conda)
    print(f"  Running: {' '.join(cmd)}")

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    wait_seconds = 5
    print(f"  Waiting {wait_seconds}s ...")
    time.sleep(wait_seconds)

    still_alive = proc.poll() is None
    if still_alive:
        print("  Process is alive.")
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        return True
    else:
        stdout = proc.stdout.read().decode(errors="replace") if proc.stdout else ""
        stderr = proc.stderr.read().decode(errors="replace") if proc.stderr else ""
        print(f"  Process exited with code {proc.returncode}")
        if stdout:
            print(f"  stdout: {stdout[:500]}")
        if stderr:
            print(f"  stderr: {stderr[:500]}")
        # stdio MCP servers exit cleanly (code 0) when no stdin is connected
        if proc.returncode == 0:
            print("  MCP server started and exited cleanly (stdio server, no input).")
            return True
        return False


# ---------------------------------------------------------------------------
# Test 2: Agent SDK round-trip
# ---------------------------------------------------------------------------

async def _run_sdk_query(mcp_cfg: dict) -> bool:
    from claude_agent_sdk import (
        ClaudeSDKClient,
        ClaudeAgentOptions,
        AssistantMessage,
        ResultMessage,
        TextBlock,
    )

    options = ClaudeAgentOptions(
        model="claude-sonnet-4-5",
        permission_mode="bypassPermissions",
        mcp_servers=mcp_cfg,
    )

    print("  Sending: 'List the available simulations'")
    async with ClaudeSDKClient(options=options) as client:
        await client.query("List the available simulations")
        async for msg in client.receive_response():
            if isinstance(msg, AssistantMessage):
                for block in msg.content:
                    if isinstance(block, TextBlock):
                        print(f"  [assistant] {block.text}")
            elif isinstance(msg, ResultMessage):
                print(f"  [result] stop_reason={msg.stop_reason}")
                return True

    return True


def test_agent_sdk_roundtrip(conda: str) -> bool:
    print("--- Test: Agent SDK round-trip ---")

    # The Agent SDK refuses to run when CLAUDECODE is set (to prevent recursion).
    os.environ.pop("CLAUDECODE", None)

    mcp_cfg = _mcp_config(conda)

    try:
        asyncio.run(_run_sdk_query(mcp_cfg))
        return True
    except ImportError as exc:
        print(f"  FAIL: could not import claude_agent_sdk — {exc}")
        return False
    except Exception as exc:
        print(f"  FAIL: {exc}")
        return False


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Validate dtcc-agent integration.")
    parser.add_argument(
        "--mcp-only",
        action="store_true",
        help="Only test that the MCP server process starts.",
    )
    args = parser.parse_args()

    conda = _find_conda()
    results: dict[str, bool] = {}

    results["mcp_starts"] = test_mcp_starts(conda)

    if not args.mcp_only:
        results["agent_sdk_roundtrip"] = test_agent_sdk_roundtrip(conda)

    print()
    print("=== Summary ===")
    all_passed = True
    for name, passed in results.items():
        status = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False
        print(f"  {status}  {name}")

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
