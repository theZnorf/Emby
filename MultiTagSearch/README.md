# Multi-Tag Search (Emby plugin)

Emby's built-in tag filter shows items that have **any** of the selected tags.
This plugin adds a **Tag Search** page that finds items with **all** of the
selected tags. You can also exclude tags.

Clicking a result opens Emby's normal item page, so playback uses Emby's own
player. The plugin only serves the page: all searching goes through the
standard Emby REST API as the logged-in user, so library access and parental
controls still apply.

Tested on Emby Server **4.10.0.3** (the `emby/embyserver` Docker image).

## Features

- **Must have all of**: tags the item must have (switch *Match* to *Any* for Emby's usual OR behaviour).
- **Must not have any of**: tags that rule an item out.
- Tag suggestions from your library, matched case-insensitively.
- Filters for type (Movies, Series, Episodes, …) and library, plus sorting.
- The search is kept when you open an item and come back.
- **Play / Shuffle** all results, or only the ticked ones, in Emby's own player.
  The queue follows the on-screen sort order.
- **Add to collection / Add to playlist** for all or ticked results, using
  Emby's own dialog (choose an existing one or create a new one). Collections
  and playlists then show up in every Emby app, TV and mobile included.
- **Select all / Clear selection**. Tick single items with the circle in the
  top-left corner of a poster.

## Where to find it

- **Admins:** Manage Emby Server → *Advanced* → **Tag Search**
- **All users:** gear icon → App Settings → **Tag Search**
- **Direct link:** `http://<server>:8096/web/index.html#!/configurationpage?name=multitagsearch`

The page is part of the Emby web app, so it works in browsers and in apps that
wrap the web app. Native TV and mobile apps don't show plugin pages.

## Build

With the .NET SDK installed:

```sh
dotnet build -c Release -o out
```

Or without installing .NET:

```sh
docker run --rm -v "$PWD":/src -w /src mcr.microsoft.com/dotnet/sdk:8.0 dotnet build -c Release -o out
```

The plugin is `out/MultiTagSearch.dll`.

## Install

Copy `MultiTagSearch.dll` into Emby's `plugins` folder (`/config/plugins`
inside the container) and restart Emby.

For TrueNAS custom apps (Docker Compose), see
**[INSTALL-TrueNAS.md](INSTALL-TrueNAS.md)**. It also explains how to get a
prebuilt DLL from GitHub Actions.

## How it works

For an "all tags" search the page asks the server how many items each tag has
(`/Users/{id}/Items?TagIds=…&Limit=0`), loads only the items of the rarest tag,
and keeps those that also have every other required tag and none of the
excluded ones.
