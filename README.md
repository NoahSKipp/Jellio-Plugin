# Jellio

A Jellyfin plugin that replaces the web client's own rendering with a Nuvio
lookalike, look and behavior both, backed entirely by remote sources. No
local media is assumed; content, search and streams come from Stremio
addons through [Gelato](https://github.com/lostb1t/Gelato), resolved
against debrid and usenet backends.

This is a ground up rebuild of [NoahSKipp/Jellio](https://github.com/NoahSKipp/Jellio),
which reskins native jellyfin-web with injected CSS/JS. This codebase
instead follows [JMSFusion](https://github.com/G-grbz/Jellyfin-MonWUI-Plugin)'s
real architecture: its own auth/session runtime, independent of native
`ApiClient` state, and its own directly rendered screens fed by direct
fetch calls, not by waiting on native components to render. See `CLAUDE.md`
for the full reasoning.

## Status

Early scaffold. The plugin host (patches its own bootstrap script into
index.html, same mechanism the original Jellio uses) and the auth/session
runtime are in place. Screens are being built one at a time, starting with
Home; an unmigrated route still falls back to native jellyfin-web
rendering underneath.

## Install

Jellio expects a Gelato-backed library to already exist, it has no local
media or metadata pipeline of its own.

1. Run Jellyfin 10.11 or newer.
2. Add `https://raw.githubusercontent.com/NoahSKipp/Jellio-Plugin/refs/heads/gh-pages/repository.json`
   to your plugin repositories.
3. Install Jellio from the catalog and restart the server.

## Building

```
dotnet build Jellio.sln
```

## License

GPL-3.0, see `LICENSE`.
