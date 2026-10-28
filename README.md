# Jorge Luis Borges

A one-page tribute to Jorge Luis Borges, hosted on Vercel at [jorgeluisborges.org](https://jorgeluisborges.org). Plain HTML, CSS, and JavaScript. No build step.

Behind the text, a canvas holds short quotations from Borges, each with its source. They sit in the background color, denser toward the window edges and fading out before the reading column. Moving the mouse lights them up faintly. Every few seconds one breaks apart into pixels, drifts off, and another writes itself in, sometimes in the same place, sometimes somewhere else. One quotation is always kept off screen so each rewrite brings in a different one.

Borges' work is still under copyright, so keep these to brief quotations rather than full poems or long passages.

## Files

- `index.html`: the page and the tribute text.
- `fragments.js`: the background quotations and their sources. Add or remove entries here.
- `background.js`: the canvas: layout, the light, the pixel dissolve, and the typing. Timing and visibility are constants at the top of the file.

The background turns off on narrow screens, where there are no side margins, and uses a fade instead of the pixel dissolve when the system asks for reduced motion.

## Run locally

```bash
python3 -m http.server 43123
```

Open http://127.0.0.1:43123.

## Deploy on Vercel

From this folder, logged into the Vercel account that owns the domain:

```bash
npx vercel --prod
npx vercel domains add jorgeluisborges.org
```

Or import the GitHub repository in the Vercel dashboard with the "Other" framework preset and no build command, then attach the domain to the project.
