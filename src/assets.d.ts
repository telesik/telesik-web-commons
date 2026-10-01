// Аудиозаписи подключаются как ресурсы сборщика: импорт даёт адрес файла.
declare module '*.m4a' {
  const url: string;
  export default url;
}
declare module '*.wav' {
  const url: string;
  export default url;
}
