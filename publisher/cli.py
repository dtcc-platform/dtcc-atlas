"""
CLI interface for the publisher module.

Usage:
    python -m publisher download <order-id> [--output DIR]
    python -m publisher publish <order-dir> [--output DIR] [--layers LAYER,...]
    python -m publisher list [--published-dir DIR]
"""

import argparse
import sys
from pathlib import Path

from .downloader import download_order, DEFAULT_OUTPUT_DIR
from .extractor import extract_and_publish, list_published_datasets, DEFAULT_PUBLISHED_DIR


def cmd_download(args):
    """Download a Geotorget order."""
    output_dir = Path(args.output) if args.output else DEFAULT_OUTPUT_DIR

    print(f"Downloading order: {args.order_id}")
    print(f"Output directory: {output_dir}")
    print()

    try:
        order_dir = download_order(
            args.order_id,
            output_dir=output_dir,
            max_workers=args.workers
        )
        print()
        print(f"Order downloaded to: {order_dir}")

        if args.publish:
            print()
            print("Publishing datasets...")
            published_dir = Path(args.published_dir) if args.published_dir else DEFAULT_PUBLISHED_DIR
            datasets = extract_and_publish(
                order_dir,
                published_dir=published_dir,
                on_progress=print
            )
            print()
            print(f"Published {len(datasets)} datasets: {', '.join(datasets)}")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_publish(args):
    """Publish datasets from a downloaded order."""
    order_dir = Path(args.order_dir)
    if not order_dir.exists():
        print(f"Error: Order directory not found: {order_dir}", file=sys.stderr)
        sys.exit(1)

    published_dir = Path(args.output) if args.output else DEFAULT_PUBLISHED_DIR
    layers = args.layers.split(",") if args.layers else None

    print(f"Publishing from: {order_dir}")
    print(f"Output directory: {published_dir}")
    if layers:
        print(f"Layers: {', '.join(layers)}")
    print()

    try:
        datasets = extract_and_publish(
            order_dir,
            published_dir=published_dir,
            layers=layers,
            on_progress=print
        )
        print()
        print(f"Published {len(datasets)} datasets:")
        for name in datasets:
            print(f"  - {name}")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_list(args):
    """List published datasets."""
    published_dir = Path(args.published_dir) if args.published_dir else DEFAULT_PUBLISHED_DIR

    datasets = list_published_datasets(published_dir)

    if not datasets:
        print("No published datasets found.")
        return

    print(f"Published datasets ({len(datasets)}):")
    print()
    for ds in datasets:
        print(f"  {ds['name']}")
        print(f"    Title: {ds.get('title', 'N/A')}")
        print(f"    Type: {ds.get('type', 'N/A')}")
        print(f"    Source: {ds.get('source', 'N/A')}")
        print()


def main():
    parser = argparse.ArgumentParser(
        description="Publisher CLI for Lantmateriet Geotorget data",
        prog="python -m publisher"
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Download command
    download_parser = subparsers.add_parser(
        "download",
        help="Download a Geotorget order"
    )
    download_parser.add_argument(
        "order_id",
        help="UUID of the Geotorget order"
    )
    download_parser.add_argument(
        "--output", "-o",
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})"
    )
    download_parser.add_argument(
        "--workers", "-w",
        type=int,
        default=4,
        help="Number of parallel download workers (default: 4)"
    )
    download_parser.add_argument(
        "--publish", "-p",
        action="store_true",
        help="Publish datasets after downloading"
    )
    download_parser.add_argument(
        "--published-dir",
        help=f"Published directory (default: {DEFAULT_PUBLISHED_DIR})"
    )
    download_parser.set_defaults(func=cmd_download)

    # Publish command
    publish_parser = subparsers.add_parser(
        "publish",
        help="Publish datasets from a downloaded order"
    )
    publish_parser.add_argument(
        "order_dir",
        help="Path to the downloaded order directory"
    )
    publish_parser.add_argument(
        "--output", "-o",
        help=f"Published directory (default: {DEFAULT_PUBLISHED_DIR})"
    )
    publish_parser.add_argument(
        "--layers", "-l",
        help="Comma-separated list of layers to publish (default: all)"
    )
    publish_parser.set_defaults(func=cmd_publish)

    # List command
    list_parser = subparsers.add_parser(
        "list",
        help="List published datasets"
    )
    list_parser.add_argument(
        "--published-dir",
        help=f"Published directory (default: {DEFAULT_PUBLISHED_DIR})"
    )
    list_parser.set_defaults(func=cmd_list)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()
