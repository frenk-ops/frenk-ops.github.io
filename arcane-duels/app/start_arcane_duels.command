#!/bin/bash
cd "$(dirname "$0")"
python3 tools/arcane_server.py --port 8000 --open
