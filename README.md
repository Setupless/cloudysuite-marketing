# cloudysuite.com

The marketing site for [CloudySuite](https://github.com/Setupless/cloudysuite). It is one static page in `public/`, served by a Cloudflare Worker that has static assets and no code.

## Run it locally

```sh
bun install
bun run dev
```

The page is at `http://localhost:8790`.

## Deploy it

`wrangler.jsonc` attaches the Worker to `cloudysuite.com` as a custom domain. To deploy, run `bunx wrangler login` once and then `bun run deploy`. The site has no build step, so the deploy uploads `public/` as it is.

The Worker has no code, so it can't redirect `www.cloudysuite.com` to the apex. To do that, add a Redirect Rule for `www.cloudysuite.com` in the Cloudflare dashboard.

## Change the page

- `public/index.html` holds all the copy. Every claim on the page comes from the CloudySuite README or from Cloudflare's pricing docs. Check the source before you change a claim.
- `public/styles.css` copies the product's colour roles from `src/styles/theme.css` in the CloudySuite repo. If the product's palette changes, copy the new values here too.
- `public/site.js` does two things. It updates every `[data-domain]` element as someone types a domain, and it runs the tabs in the Apps section. The page reads correctly without it.

## Update the screenshots

The images in `public/screens/` are the real product. `scripts/screenshots/run.ts` builds a fresh CloudySuite from a checkout, fills it with a sample organisation, and captures every screen in light and dark. [`scripts/screenshots/README.md`](scripts/screenshots/README.md) explains how to run it.

## Update the social image

`public/og.png` comes from `scripts/og/template.html`. To draw it again, run `scripts/og/render.sh`.
