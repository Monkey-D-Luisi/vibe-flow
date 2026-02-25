declare module 'picomatch' {
  type Matcher = (input: string) => boolean;
  export default function picomatch(pattern: string): Matcher;
}

declare module 'typhonjs-escomplex' {
  interface EscomplexAnalyzer {
    analyzeModule(source: string): unknown;
  }

  const analyzer: EscomplexAnalyzer;
  export default analyzer;
}
