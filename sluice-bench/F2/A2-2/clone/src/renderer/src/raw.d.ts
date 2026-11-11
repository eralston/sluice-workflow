declare module '*.txt?raw' {
  const text: string;
  export default text;
}

declare module '*.png?url' {
  const url: string;
  export default url;
}
