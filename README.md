# telesik-web-commons

Shared web code of telesik domino games ([Dofodo](https://github.com/telesik/dofodo),
[Mexican Train Domino Game](https://github.com/telesik/mexican-train)): modules
without a game name. Consumed as a git submodule (`commons/`), imported by module
path — there is no package entry point.

Общий веб-код домино-игр telesik: модули без имени игры. Подключается
git-подмодулем (`commons/`), импорт — по пути модуля, точки входа пакета нет.

## Modules · Модули

| Module | Since | What it does |
|---|---|---|
| `src/tiles.ts` | 0.1.0 (from dofodo) | Double-six domino set: canonical tile ids (`"hi-lo"`), parsing table, `isDouble`, `pipSum`, `hasValue`, `otherValue`, `fullSet` |
| `src/rng.ts` | 0.1.0 (from dofodo) | Deterministic PRNG (mulberry32): `nextFloat`, `nextInt`, Fisher–Yates `shuffle`, `seedFromCrypto` — a round is reproducible from its seed |
| `src/html.ts` | 0.2.0 (from dofodo) | `esc` — HTML escaping for UI templates |
| `src/lcg.ts` | 0.2.0 (from dofodo) | Tiny deterministic generator for cosmetic randomness (pile layout, sound noise, test policies) — not for dealing |
| `src/icons.ts` | 0.2.0 (from dofodo) | Shared icons: the settings gear |
| `src/tile-svg.ts` | 0.2.0 (from dofodo) | Domino tiles as SVG: face, back (the game emblem is a parameter), shared gradient/shadow defs, tile placement on the table grid, standalone `<svg>` wrapper for hands and the boneyard |
| `src/i18n.ts` | 0.2.0 (from dofodo) | Localisation mechanics: `createI18n({ dicts, locales, initial, fallback })` → `L`, `getLocale`, `setLocale`, `detectLocale`; autonym table. Dictionaries and the set of languages belong to the game |
| `src/howto.ts` | 0.2.0 (from dofodo) | “How to play” frame: slide overlay, first-run question, scene building blocks on tile graphics. Slides, texts and logo belong to the game; CSS classes come from the game's stylesheet |

## Rules for a module · Требования к модулю

- No game name, no game rules, no game assets; whatever differs between games
  comes in as parameters.
- 100 % unit-test coverage — lines, branches, functions (blocking threshold in
  `vitest.config.ts`).
- Semver, a tag per version; a consumer moves its submodule pointer with a
  deliberate commit and runs its own regression.
- Only code that is already public goes here.

## Commands · Команды

```
npm install
npm test            # vitest
npm run coverage    # with the 100 % threshold
npm run typecheck   # tsc --noEmit
```

Licence: [CC BY 4.0](LICENSE.md) · Author: **Alexey Kiselyov**.
