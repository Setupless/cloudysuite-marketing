# Product screenshots

`run.ts` builds a fresh CloudySuite, fills it with a small landscape architecture studio, and writes the site's screenshots to `public/screens/`. Every picture is the real product, driven through its own pages.

## Run it

```sh
cd scripts/screenshots && bun install && cd ../..
bun scripts/screenshots/run.ts --product /path/to/cloudysuite
```

It needs Bun, Git, ImageMagick 7 (`magick`), and Chromium 1248 for Playwright 1.64 in `~/.cache/ms-playwright`. If Chromium is missing, run `bunx playwright-core@1.64.0 install chromium-headless-shell`. Ports 8787 and 8799 must be free.

A run takes a few minutes. It exits 0 only when every file is written and checked.

| Option      | Default                              | What it is                                   |
| ----------- | ------------------------------------ | -------------------------------------------- |
| `--product` | none                                 | A CloudySuite checkout. Its committed `HEAD` is used. |
| `--work`    | `$TMPDIR/cloudysuite-screenshots`    | Where the run keeps its clone, state, and logs. |
| `--out`     | `public/screens`                     | Where the WebP files go.                     |

## What it does

1. Clones the checkout's `HEAD` into the work folder, then installs and builds it there. It never builds in, or writes to, the checkout you pass. The clone is reused while `HEAD` stays the same.
2. Deletes the last run's Wrangler state and starts `wrangler dev` on 8787 and a fake Cloudflare API on 8799.
3. Runs the setup wizard against the fake API for the domain `example.com`, and captures its domain step.
4. Invites seven people through the People page, reads each invite link from the email `wrangler dev` writes to disk, and accepts it. Most people add a passkey with a virtual authenticator.
5. Imports mail with Mail's own `.mbox` import, which keeps each message's date, then moves it to the Inbox, labels it, and marks some unread, as a person would.
6. Makes the Studio team calendar and imports `.ics` files into it and into Maya's calendar.
7. Makes the Projects team folder, its folders, and its files. Each file is uploaded by the person who would have made it.
8. Captures each screen in light and dark at 2x, then stops every process it started, also when it fails or is interrupted.

## Dates

Fixture dates are placeholders filled at run time, so the calendar always shows the current week and the inbox is always fresh. `templates.ts` lists them. Mail lands only in working hours, Monday to Friday, in `Australia/Melbourne`, counted back from the moment of the run. A run on a weekday afternoon shows today's mail with times, and a run at night or at the weekend shows the last working days with dates. Files in Storage show the time they were uploaded, which is the time of the run.

## Fixtures

- `maya-inbox.mbox` and `studio-inbox.mbox` hold the mail.
- `studio.ics`, `maya.ics`, and `riverbend-invite.ics` hold the events. The invitation goes inside an email.
- `files.ts` draws the pictures and PDFs with ImageMagick at run time, so the repository holds recipes rather than megabytes.
- `Planting schedule rev C.xlsx` is a small real spreadsheet.

Every address is `@example.com`, or a reserved name such as `accounts@kiln-supply.example`.

## When it fails

The error names the step. Pictures of every open page at that moment, `wrangler.log`, and `fake-cloudflare.log` are in `<work>/logs`. The last run's state stays in `<work>/state` until the next run, so you can start `wrangler dev --persist-to <work>/state` in `<work>/product` and look around.
