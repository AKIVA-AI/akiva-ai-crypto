#!/usr/bin/env python3
"""
FreqTrade Production Setup Script

This script validates and prepares FreqTrade for production trading.

Usage:
    python scripts/setup_freqtrade.py --validate
    python scripts/setup_freqtrade.py --backtest BaseStrategy
    python scripts/setup_freqtrade.py --dry-run BaseStrategy
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))


def check_freqtrade_installed() -> bool:
    """Check if FreqTrade is properly installed."""
    try:
        import freqtrade
        from freqtrade.strategy import IStrategy

        print(f"✅ FreqTrade version: {freqtrade.__version__}")
        return True
    except ImportError as e:
        print(f"❌ FreqTrade not installed: {e}")
        print("\nInstall with: pip install freqtrade")
        return False


def check_talib_installed() -> bool:
    """Check if TA-Lib is properly installed."""
    try:
        import talib

        print(f"✅ TA-Lib available")
        return True
    except ImportError:
        print("❌ TA-Lib not installed")
        print("\nInstall TA-Lib:")
        print("  - Windows: pip install TA-Lib (may need wheel)")
        print("  - Linux: sudo apt-get install libta-lib-dev && pip install TA-Lib")
        print("  - Mac: brew install ta-lib && pip install TA-Lib")
        return False


def validate_strategies() -> bool:
    """Validate all strategies in the strategies directory."""
    from app.freqtrade.strategy_manager import StrategyManager, is_freqtrade_available

    if not is_freqtrade_available():
        print("❌ Cannot validate strategies - FreqTrade not available")
        return False

    manager = StrategyManager()
    strategies = manager.discover_strategies()

    print(f"\n📋 Found {len(strategies)} strategies")

    all_valid = True
    for name in strategies:
        print(f"\n--- Validating: {name} ---")

        if manager.load_strategy(name):
            validation = manager.validate_strategy(name)

            if validation["valid"]:
                print(f"  ✅ Valid")
            else:
                print(f"  ❌ Invalid")
                all_valid = False

            for error in validation["errors"]:
                print(f"  ❌ Error: {error}")

            for warning in validation["warnings"]:
                print(f"  ⚠️  Warning: {warning}")
        else:
            print(f"  ❌ Failed to load")
            all_valid = False

    return all_valid


def run_backtest(strategy_name: str, config_path: str = None):
    """Run a backtest for a strategy."""
    config = config_path or "data/freqtrade/config/config.json"

    cmd = [
        "freqtrade",
        "backtesting",
        "--config",
        config,
        "--strategy",
        strategy_name,
        "--timerange",
        "20231201-20240101",
        "-v",
    ]

    print(f"\n🧪 Running backtest for {strategy_name}")
    print(f"   Command: {' '.join(cmd)}")

    subprocess.run(cmd, cwd=Path(__file__).parent.parent)


def run_dry_run(strategy_name: str, config_path: str = None):
    """Run strategy in dry-run mode."""
    config = config_path or "data/freqtrade/config/config.json"

    cmd = [
        "freqtrade",
        "trade",
        "--config",
        config,
        "--strategy",
        strategy_name,
        "--dry-run",
        "-v",
    ]

    print(f"\n🏃 Starting dry-run for {strategy_name}")
    print(f"   Command: {' '.join(cmd)}")
    print("   Press Ctrl+C to stop\n")

    subprocess.run(cmd, cwd=Path(__file__).parent.parent)


def main():
    parser = argparse.ArgumentParser(description="FreqTrade Production Setup")
    parser.add_argument(
        "--validate", action="store_true", help="Validate all strategies"
    )
    parser.add_argument("--backtest", type=str, help="Run backtest for strategy")
    parser.add_argument("--dry-run", type=str, help="Run strategy in dry-run mode")
    parser.add_argument("--config", type=str, help="Path to config file")

    args = parser.parse_args()

    print("=" * 60)
    print("  Enterprise Crypto - FreqTrade Setup")
    print("=" * 60)

    # Always check dependencies
    ft_ok = check_freqtrade_installed()
    ta_ok = check_talib_installed()

    if not ft_ok or not ta_ok:
        print("\n❌ Missing dependencies - cannot proceed")
        sys.exit(1)

    if args.validate:
        if validate_strategies():
            print("\n✅ All strategies valid!")
        else:
            print("\n❌ Some strategies have issues")
            sys.exit(1)

    elif args.backtest:
        run_backtest(args.backtest, args.config)

    elif args.dry_run:
        run_dry_run(args.dry_run, args.config)

    else:
        # Default: show status
        print("\n📊 Strategy Status:")
        validate_strategies()
        print("\n" + "=" * 60)
        print("Commands:")
        print("  --validate        Validate all strategies")
        print("  --backtest NAME   Run backtest for strategy")
        print("  --dry-run NAME    Run strategy in paper trading mode")


if __name__ == "__main__":
    main()
