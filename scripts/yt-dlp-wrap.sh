#!/bin/bash
# Fixed yt-dlp wrapper for signage server
export PATH="/usr/bin:/bin:/home/ccampos/.bun/bin:/home/ccampos/.local/bin"
export PYTHONPATH="/home/ccampos/.local/lib/python3.12/site-packages:/home/ccampos/.local/lib/python3.11/site-packages"
exec /home/ccampos/.local/bin/yt-dlp --js-runtimes node --remote-components ejs:github "$@"
