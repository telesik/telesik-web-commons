// Узкий шим вместо @types/node: полные типы node открыли бы node-глобалы
// (process, Buffer…) и каталогу src/ — а код пакета обязан оставаться чисто
// браузерным (tsconfig: types пуст). Тестам, бегущим в node под vitest,
// нужен ровно readFileSync для чтения исходников.
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
}
