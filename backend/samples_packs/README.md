# External Sample Packs

Drop third-party WAV packs here to give agents distinct sonic identities.

## Folder structure

Each pack should be in its own directory:

```text
backend/samples_packs/
  landr/
    bass/
    drums/
    cowbell/
    vocals/
    melody/
    fx/
  bandlab/
    bass/
    drums/
    ...
  lunatic/
    ...
```

Only categories that exist will be used.

## How agents select packs

- `dna.sample_pack = "core"`: use `backend/samples` only
- `dna.sample_pack = "landr"`: prefer `backend/samples_packs/landr`
- `dna.sample_pack = "landr,bandlab"`: use both
- `dna.sample_pack = "any"`: use all available packs

## Notes

- Keep license terms of each pack.
- Avoid direct melody copying from copyrighted tracks.
- Use references as style inspiration, then mutate/proceduralize patterns.
