# tools

Build-time helpers. Nothing here is deployed: the Vercel project's root
directory is `site/`, so this directory never reaches the edge.

## Regenerating the social card

`site/og.png` is the image that renders when a link to the site is pasted into
Zulip, LinkedIn, Slack, or an email client. It is generated from
`og-template.html` rather than drawn by hand, so a claim on the card can be
traced to a source the same way a measure package can.

The template uses the fonts vendored in `site/fonts/`, so regeneration does not
depend on Google Fonts being reachable.

```bash
python3 -m http.server 8080 &            # from the repository root
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --virtual-time-budget=6000 \
  --screenshot="site/og.png" \
  "http://127.0.0.1:8080/tools/og-template.html"
kill %1
```

The output must be 1200x630. Check it with `file site/og.png` before committing.

Any count stated on the card has to be a count the site itself already states.
The card currently says 52 CC0 CMS eCQM packages, which matches
`measures/cms-fhir-2026/` and the status table in `site/index.html`. If that
number changes, both change together.
