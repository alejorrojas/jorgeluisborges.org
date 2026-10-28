# Jorge Luis Borges

A one-page tribute to Jorge Luis Borges, hosted on Vercel at [jorgeluisborges.org](https://jorgeluisborges.org). Plain HTML, CSS, and JavaScript. No build step.

Behind the text, a canvas holds short quotations from Borges, each with its source, set at the same size as the page text. They sit almost in the background color around the reading column (beside it, above it, and below it, cut off by the page edges where needed) and fade out before reaching it. The mouse carries a small light, about one line tall, that turns the letters it passes a very light gray. Each fragment assembles itself out of pixels and, after a while, breaks back into pixels before a different one assembles, sometimes in the same place, sometimes somewhere else.

Borges' work is still under copyright, so keep these to brief quotations rather than full poems or long passages.

## Files

- `index.html`: the page and the tribute text.
- `fragments.js`: the background quotations and their sources. Add or remove entries here.
- `background.js`: the canvas: layout, the light, and the pixel assembly and dissolve. Timing, light size, and visibility are constants at the top of the file.

When the system asks for reduced motion, fragments fade in and out instead of assembling from pixels.

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
