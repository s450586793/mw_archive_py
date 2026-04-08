#!/bin/sh
set -eu

mkdir -p /app/config /app/data /app/logs /app/watch /app/organize

if [ -f /app/config.json ] && [ ! -f /app/config/config.json ]; then
  cp /app/config.json /app/config/config.json
fi
if [ -f /app/tokens.json ] && [ ! -f /app/config/tokens.json ]; then
  cp /app/tokens.json /app/config/tokens.json
fi
if [ -f /app/cookie.txt ] && [ ! -f /app/config/cookie.txt ]; then
  cp /app/cookie.txt /app/config/cookie.txt
fi
if [ -f /app/gallery_flags.json ] && [ ! -f /app/config/gallery_flags.json ]; then
  cp /app/gallery_flags.json /app/config/gallery_flags.json
fi

ln -sf /app/config/config.json /app/config.json
ln -sf /app/config/tokens.json /app/tokens.json
ln -sf /app/config/cookie.txt /app/cookie.txt
ln -sf /app/config/gallery_flags.json /app/gallery_flags.json

exec "$@"
