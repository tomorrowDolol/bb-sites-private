#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_ROOT="$ROOT_DIR/sites"
DST_ROOT="$HOME/.bb-browser/sites"

mkdir -p "$DST_ROOT"

for SRC_DIR in "$SRC_ROOT"/*; do
  if [ ! -d "$SRC_DIR" ]; then
    continue
  fi

  PLATFORM_NAME="$(basename "$SRC_DIR")"
  DST_DIR="$DST_ROOT/$PLATFORM_NAME"

  if [ -L "$DST_DIR" ]; then
    unlink "$DST_DIR"
  fi

  if [ -e "$DST_DIR" ] && [ ! -d "$DST_DIR" ]; then
    echo "安装失败：目标已存在且不是目录 -> $DST_DIR" >&2
    echo "请先手动处理该路径，再重新执行。" >&2
    exit 1
  fi

  mkdir -p "$DST_DIR"
  cp "$SRC_DIR"/*.js "$DST_DIR"/
  echo "已复制本地 adapter 到：$DST_DIR"
done
