declare module 'omelette' {
  interface CompletionData {
    before: string;
    fragment: number;
    line: string;
    reply: (words: string[] | Promise<string[]>) => void;
  }

  type CompletionCallback = (data: CompletionData) => string[] | void;

  interface Omelette {
    on(event: string, handler: (data: CompletionData) => void): this;
    onAsync(event: string, handler: (data: CompletionData) => void): this;
    tree(objectTree: Record<string, unknown>): this;
    next(handler: () => void): this;
    init(): void;
    setupShellInitFile(initFile?: string): void;
    cleanupShellInitFile(initFile?: string): void;
  }

  function omelette(
    template: TemplateStringsArray | string,
    ...args: (string[] | CompletionCallback)[]
  ): Omelette;

  export = omelette;
}
