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
