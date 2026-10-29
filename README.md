# Jorge Luis Borges

A site about Jorge Luis Borges, made by a reader, hosted on Vercel at [jorgeluisborges.org](https://jorgeluisborges.org). Plain HTML, CSS, and JavaScript. No build step.

The home page is a walk through a pale, endless space. A letter about Borges floats ahead of you on ivory paper. Short quotations from his work hang at every depth around you, assembling out of pixels and dissolving again. His voice, from the 1976 interview on "A fondo", plays softly a few seconds in; looking down, its transcript lies on the ground at your feet, with the words already said inked in. On phones, the left thumb walks, the right side looks, and tapping the letter opens it as a page.

`/credits` lists every work, recording, typeface, texture, and library the site uses, who owns it, and why we use it. Keep it up to date when adding any of these.

Borges' work is still under copyright, so keep quotations brief rather than full poems or long passages.

## Files

- `index.html`: the walk's page, its controls, and its styles.
- `exhibit.js`: the scene: the letter, walking and looking, collisions, shadows, the voice, and the touch controls. Tuning constants are at the top.
- `sky.js`: the quotations floating around you.
- `standing.js`: the quotations standing at eye level, which you bump into and walk around.
- `transcript.js`: the transcript on the ground.
- `fragments.js`: the quotations and their sources, shared by the walk and `/credits`.
- `audio/`: the interview (whole, and a fifteen-minute cut for phones) and its timed transcript, generated with Whisper.
- `textures/`: the paper's normal map, from ambientCG (CC0).
- `og.png`: the link preview image, the opening of the letter.
- `credits/index.html` and `background.js`: the rights and credits page, with quotations assembling behind the text.
- `vercel.json`: redirects the page's old address, `/derechos`, to `/credits`.

## Run locally

Seeking in the audio needs a server that supports range requests:

```bash
npx http-server -p 43123 -c-1
```

Open http://127.0.0.1:43123.

## Deploy on Vercel

Pushes to `main` deploy to production. To deploy by hand, from this folder, logged into the Vercel account that owns the domain:

```bash
npx vercel --prod
```
