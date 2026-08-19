---
name: GitHub mirror deploy-key rebuild
description: Rebuilding the one-line mirror deploy key secret into a valid OpenSSH PEM — fold newline gotcha.
---
The mirror deploy-key secret is ONE line (newlines became spaces). Rebuild: strip BEGIN/END markers, `tr -d ' \n\r\t'`, `fold -w 70`, re-add markers, chmod 600.

**Gotcha:** when the base64 body length isn't a multiple of 70, `fold`'s last line has NO trailing newline, so the `-----END OPENSSH PRIVATE KEY-----` marker glues onto it → `Load key: error in libcrypto`. Always emit a newline after `fold` before the END marker (or validate with `ssh-keygen -y -f` before pushing).

**How to apply:** any time a push fails with "error in libcrypto" after rebuilding the key, check `tail -2` of the key file for a glued END marker.

## Aug 19 2026 — secret PEM flattened to ONE line with SPACES
The stored deploy-key secret came back as a single line: the PEM's newlines
became literal spaces (13 of them), no `\n` sequences at all. `printf '%s\n'`
fixes nothing here. Rebuild = regex out the BEGIN/END headers, strip spaces
from the base64 body, re-wrap at 70 chars, re-add headers + trailing newline
(python textwrap), then `ssh-keygen -y` to validate. Also /tmp/gh/ dies with
the shell env — recreate key AND known_hosts (ssh-keyscan) before any push.
