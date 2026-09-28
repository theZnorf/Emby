# Installing Multi-Tag Search on TrueNAS (custom Docker Compose app)

This guide is for Emby Server running on TrueNAS SCALE (24.10 "Electric Eel"
or newer) as a **custom app defined by a Docker Compose YAML file**, using
the official `emby/embyserver` image. It was tested with Emby Server
**4.10.0.3**.

An Emby plugin is a single file, `MultiTagSearch.dll`. Emby loads every DLL in
`/config/plugins` inside the container when it starts. Installing therefore
means getting the DLL into that folder and restarting the app.

- [1. Get the DLL](#1-get-the-dll)
- [2. Put the DLL on a dataset](#2-put-the-dll-on-a-dataset)
- [3. Add it to the app](#3-add-it-to-the-app) (compose mount, recommended, or plain copy)
- [4. Check that it works](#4-check-that-it-works)
- [Updating](#updating) · [Uninstalling](#uninstalling) · [Troubleshooting](#troubleshooting)

Paths below use `/mnt/tank/apps/emby/...` as an example. Replace them with
your own pool and datasets.

---

## 1. Get the DLL

Pick one of these.

### A. Download it from GitHub (no build tools needed)

The repository has a GitHub Actions workflow
(`.github/workflows/multitagsearch.yml`) that builds the plugin.

- **Release (permanent link):** push a tag named `multitagsearch-v<version>`,
  e.g. `multitagsearch-v1.1.0`. The workflow attaches `MultiTagSearch.dll` to a
  GitHub release, which you can download straight from the TrueNAS shell:

  ```sh
  curl -L -o MultiTagSearch.dll \
    https://github.com/theZnorf/Emby/releases/download/multitagsearch-v1.1.0/MultiTagSearch.dll
  ```

- **Build artifact:** every push that changes `MultiTagSearch/` also runs the
  workflow. Open the repository on GitHub → **Actions** → *Multi-Tag Search
  plugin* → latest run → **Artifacts** → `MultiTagSearch`. You get a zip
  containing the DLL. Artifacts need a GitHub login and expire after 90 days.

If Actions is disabled on your fork, enable it under **Settings → Actions**.

### B. Build it on TrueNAS with Docker

The TrueNAS shell (System → Shell, or SSH) has Docker, so you can build with
the official .NET SDK image without installing anything:

```sh
cd /mnt/tank/apps/emby
git clone --branch claude/emby-multi-tag-search-ostqeu --depth 1 https://github.com/theZnorf/Emby.git emby-src
cd emby-src/MultiTagSearch
sudo docker run --rm -v "$PWD":/src -w /src mcr.microsoft.com/dotnet/sdk:8.0 \
  dotnet build -c Release -o out
ls -l out/MultiTagSearch.dll
```

(Use `main` or another branch once the plugin has been merged there.)

### C. Build it on any other computer

With the .NET SDK (8.0 or newer), run `dotnet build -c Release -o out` in the
`MultiTagSearch` folder, or use the same `docker run` command as in B. Then
copy `out/MultiTagSearch.dll` to the NAS (SMB share, `scp`, …).

---

## 2. Put the DLL on a dataset

Keep the DLL in its own folder, separate from Emby's config, so it is easy to
find and replace:

```sh
sudo mkdir -p /mnt/tank/apps/emby/plugins-custom
sudo cp MultiTagSearch.dll /mnt/tank/apps/emby/plugins-custom/
sudo chmod 644 /mnt/tank/apps/emby/plugins-custom/MultiTagSearch.dll
```

The file only has to be **readable** by the user Emby runs as (the `UID` /
`GID` in your compose file; `568` is TrueNAS's default `apps` user). Mode
`644` covers that.

---

## 3. Add it to the app

### Option 1 (recommended): mount the DLL in the compose file

Mounting the file keeps the plugin under your control. It survives app
updates and redeploys, and Emby can't change it.

1. **Apps** → select your Emby app → **Edit**. This opens the YAML editor
   for custom apps.
2. Under `volumes:` of the Emby service, add **one line** that mounts the DLL
   into the container's plugin folder, read-only:

   ```yaml
         - /mnt/tank/apps/emby/plugins-custom/MultiTagSearch.dll:/config/plugins/MultiTagSearch.dll:ro
   ```

3. Save. TrueNAS redeploys the app.

A complete example:

```yaml
services:
  emby:
    image: emby/embyserver:4.10.0.3
    container_name: emby
    restart: unless-stopped
    environment:
      - UID=568          # user Emby runs as (TrueNAS "apps" user)
      - GID=568
      - GIDLIST=568      # extra groups, e.g. for GPU access or media shares
      - TZ=Europe/Vienna
    ports:
      - "8096:8096"
    volumes:
      - /mnt/tank/apps/emby/config:/config
      - /mnt/tank/media/movies:/mnt/movies
      # Multi-Tag Search plugin
      - /mnt/tank/apps/emby/plugins-custom/MultiTagSearch.dll:/config/plugins/MultiTagSearch.dll:ro
```

Keep your existing ports, media mounts and hardware options (e.g.
`devices: - /dev/dri:/dev/dri`) as they are. Only the last volume line is new.

> On startup the image tries to `chown` everything under `/config`. Because
> the DLL is mounted read-only, the log shows one line like
> `chown: /config/plugins/MultiTagSearch.dll: Read-only file system`.
> This is harmless: Emby starts and loads the plugin normally.

### Option 2: copy the DLL into Emby's config dataset

If you'd rather not touch the YAML, put the file straight into the plugin
folder of the dataset you mount as `/config`, then restart the app:

```sh
sudo cp MultiTagSearch.dll /mnt/tank/apps/emby/config/plugins/
sudo chown 568:568 /mnt/tank/apps/emby/config/plugins/MultiTagSearch.dll   # your UID:GID
```

Then **Apps** → Emby → **Restart**.

To find the host path of `/config`, open the app's YAML (Edit) and look for
the `...:/config` volume line.

---

## 4. Check that it works

1. **Manage Emby Server → Plugins** should list **Multi-Tag Search 1.x**.
2. Open the page in either of these places:
   - admins: **Manage Emby Server → Advanced → Tag Search**
   - every user: gear icon → **App Settings → Tag Search**
   - direct link: `http://<nas-ip>:8096/web/index.html#!/configurationpage?name=multitagsearch`
3. If the page doesn't appear, check the log (**Manage Emby Server → Logs →
   embyserver.txt**) for:

   ```
   Info App: Loading MultiTagSearch, Version=1.x.0.0 ... from /config/plugins/MultiTagSearch.dll
   ```

---

## Updating

1. Get the new `MultiTagSearch.dll` (step 1).
2. Overwrite the old file (in `plugins-custom/` for Option 1, or in
   `config/plugins/` for Option 2).
3. Restart the app (**Apps** → Emby → **Restart**). Emby only loads plugins at
   startup.
4. In the browser, reload the page with Ctrl+F5 so it picks up the new version.

Updating Emby itself (changing the `image:` tag) does not remove the plugin.
After a big Emby update, check that the Tag Search page still works.

## Uninstalling

- **Option 1:** remove the volume line from the YAML and save.
- **Option 2:** delete `config/plugins/MultiTagSearch.dll` and restart the app.

The plugin stores no settings or data. Collections and playlists you created
with it are normal Emby collections and playlists, and they stay.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Plugin not listed | Wrong path, or the DLL was mounted as a *directory*. This happens when the host file didn't exist when the app started: Docker then creates an empty folder in its place. Delete that folder, copy the real DLL there, and redeploy. |
| `Permission denied` in the log | The DLL isn't readable by Emby's `UID`/`GID`. Run `chmod 644` on it. |
| Menu entry missing, but the plugin is listed | Reload the web app (Ctrl+F5). Native TV and mobile apps don't show plugin pages; use a browser or the direct link. |
| "Play" shows a playback error | This is decided by Emby's normal playback and transcoding, not by the plugin. Try playing the same item from its own page; if that also fails, look at Emby's transcoding and hardware acceleration settings. |
