# `/.well-known/` static assets

Files in this directory are served verbatim at the matching URL on both
hosts (`my.goodtunes.music` and `admin.goodtunes.music`) by the route in
`server/routes.ts`.

## `apple-developer-domain-association.txt`

Apple's Sign-In service fetches this file to verify ownership of each
domain listed under the Services ID's **Web Authentication Configuration**
in the Apple Developer portal.

To activate Apple Sign-In on a new host:

1. In the Apple Developer portal, open **Identifiers → Services IDs →
   `io.GoGoods.music` → Configure**.
2. Add the host (e.g. `my.goodtunes.music`) under **Domains and
   Subdomains** and **save**. Apple offers a `Download` button for the
   verification file.
3. Replace the body of `apple-developer-domain-association.txt` in this
   directory with the exact bytes Apple gave you (no trailing newline
   surgery — keep the file byte-identical).
4. Deploy. Apple's verifier should flip the domain to **Verified**
   within a few minutes.

The route prefers this file over the `APPLE_DOMAIN_ASSOCIATION` env var
so dropping a new file here is enough — no secret-manager edits needed.
The file ships with a sentinel placeholder; the route detects the
sentinel and falls back to the env var until the real bytes are
committed.
