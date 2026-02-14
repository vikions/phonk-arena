# Lunatic Pack Import Map

Source pack seen in your screenshot:

- `808s`
- `Cowbells`
- `Drum Hits`
- `Drum Loops`
- `FX`
- `Melodic Loops`

Copy them like this:

- `808s` -> `backend/samples_packs/lunatic/bass/`
- `Cowbells` -> `backend/samples_packs/lunatic/cowbell/`
- `Drum Hits` -> `backend/samples_packs/lunatic/drums/hits/`
- `Drum Loops` -> `backend/samples_packs/lunatic/drums/loops/`
- `FX` -> `backend/samples_packs/lunatic/fx/`
- `Melodic Loops` -> `backend/samples_packs/lunatic/melody/`

Ignore:

- `.DS_Store`
- preview/full track WAV (`BVKER - Lunatic Phonk.wav`)
- image/jpg files

Notes:

- `vocals` can stay empty for this pack (`backend/samples_packs/lunatic/vocals/`).
- The generator now scans subfolders recursively, so `drums/hits` and `drums/loops` both work.
