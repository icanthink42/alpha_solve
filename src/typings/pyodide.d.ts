declare module 'pyodide' {
  export interface PyodideInterface {
    runPython(code: string): any;
    runPythonAsync(code: string): Promise<any>;
    loadPackage(packages: string | string[]): Promise<void>;
    globals: any;
  }

  export interface LoadPyodideOptions {
    indexURL?: string;
    fullStdLib?: boolean;
    stdin?: () => string;
    stdout?: (msg: string) => void;
    stderr?: (msg: string) => void;
  }

  export function loadPyodide(options?: LoadPyodideOptions): Promise<PyodideInterface>;
}

