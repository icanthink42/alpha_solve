import { Injectable } from '@angular/core';
import { loadPyodide, type PyodideInterface } from 'pyodide';
import {
  Plugin,
  CellSolutionFunction,
  CellFunctionInput,
  CellFunctionResult,
  MetaFunctionResult
} from '../models';

export interface PythonExecutionResult {
  output: string;
  error?: string;
  result?: CellFunctionResult | MetaFunctionResult;
}

@Injectable({
  providedIn: 'root'
})
export class PythonExecutorService {
  private pyodide: PyodideInterface | null = null;
  private isInitialized = false;
  private plugins: Plugin[] = [];
  private functionMap: Map<string, CellSolutionFunction> = new Map();

  constructor() {}

  /**
   * Initialize the Python environment with a list of plugins
   */
  async initialize(plugins: Plugin[]): Promise<void> {
    if (this.isInitialized) {
      console.warn('Python executor already initialized. Reinitializing...');
    }

    // Store plugins
    this.plugins = plugins;
    this.functionMap.clear();

    // Collect all Python libraries from plugins
    const librariesToLoad = new Set<string>();
    for (const plugin of plugins) {
      if (plugin.pythonLibraries) {
        for (const lib of plugin.pythonLibraries) {
          librariesToLoad.add(lib);
        }
      }
    }

    // Load Pyodide if not already loaded
    if (!this.pyodide) {
      console.log('Loading Pyodide...');
      this.pyodide = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
      });
      console.log('Pyodide loaded successfully');

      // Load Python libraries first (before alpha_solve library)
      if (librariesToLoad.size > 0) {
        try {
          const libArray = Array.from(librariesToLoad);
          console.log(`Loading Python libraries: ${libArray.join(', ')}`);
          await this.pyodide.loadPackage(libArray);
          console.log('Python libraries loaded successfully');

          // Load additional tools for specific libraries
          if (libArray.includes('sympy')) {
            await this.loadSympyTools();
          }
        } catch (error) {
          console.error('Failed to load Python libraries:', error);
          throw new Error(`Library loading failed: ${error}`);
        }
      }

      // Load the alpha_solve library
      await this.loadAlphaSolveLibrary();
    } else {
      // If Pyodide already loaded, just load any new libraries
      if (librariesToLoad.size > 0) {
        try {
          const libArray = Array.from(librariesToLoad);
          console.log(`Loading Python libraries: ${libArray.join(', ')}`);
          await this.pyodide.loadPackage(libArray);
          console.log('Python libraries loaded successfully');

          // Load additional tools for specific libraries
          if (libArray.includes('sympy')) {
            await this.loadSympyTools();
          }
        } catch (error) {
          console.error('Failed to load Python libraries:', error);
          throw new Error(`Library loading failed: ${error}`);
        }
      }
    }

    // Combine all plugin Python code
    const combinedCode = plugins
      .map(plugin => plugin.pythonCode)
      .filter(code => code && code.trim())
      .join('\n\n');

    // Execute the combined plugin code to set up the environment
    if (combinedCode) {
      try {
        await this.pyodide.runPythonAsync(combinedCode);
        console.log(`Loaded ${plugins.length} plugin(s) successfully`);
      } catch (error) {
        console.error('Failed to execute plugin code:', error);
        throw new Error(`Plugin initialization failed: ${error}`);
      }
    }

    // Build function map from all plugins
    for (const plugin of plugins) {
      for (const func of plugin.cellSolutionFunctions) {
        this.functionMap.set(func.functionName, func);
      }
    }

    console.log(`Registered ${this.functionMap.size} cell solution function(s)`);
    this.isInitialized = true;
  }

  /**
   * Load the alpha_solve Python library into Pyodide
   */
  private async loadAlphaSolveLibrary(): Promise<void> {
    if (!this.pyodide) return;

    try {
      // Fetch the Python library from the public folder
      const response = await fetch('/python/alpha_solve.py');
      if (!response.ok) {
        throw new Error(`Failed to fetch alpha_solve.py: ${response.statusText}`);
      }

      const libraryCode = await response.text();
      await this.pyodide.runPythonAsync(libraryCode);
      console.log('Alpha Solve Python library loaded successfully');
    } catch (error) {
      console.error('Failed to load alpha_solve library:', error);
      throw error;
    }
  }

  /**
   * Load the sympy_tools Python library into Pyodide
   */
  private async loadSympyTools(): Promise<void> {
    if (!this.pyodide) return;

    try {
      // Fetch the SymPy tools library from the public folder
      const response = await fetch('/python/sympy_tools.py');
      if (!response.ok) {
        throw new Error(`Failed to fetch sympy_tools.py: ${response.statusText}`);
      }

      const libraryCode = await response.text();
      await this.pyodide.runPythonAsync(libraryCode);
      console.log('SymPy tools library loaded successfully');
    } catch (error) {
      console.error('Failed to load sympy_tools library:', error);
      throw error;
    }
  }

  /**
   * Call a cell solution function by name
   */
  async callFunction(functionName: string, input: CellFunctionInput): Promise<PythonExecutionResult> {
    if (!this.isInitialized || !this.pyodide) {
      return {
        output: '',
        error: 'Python executor not initialized. Call initialize() first.'
      };
    }

    const func = this.functionMap.get(functionName);
    if (!func) {
      return {
        output: '',
        error: `Function '${functionName}' not found in loaded plugins`
      };
    }

    try {
      // Convert input to Python-compatible format and call function
      const inputJson = JSON.stringify(input);

      // Set the JSON as a Python variable to avoid escaping issues
      this.pyodide.globals.set('input_json_str', inputJson);

      const code = `
import json

# Parse input using alpha_solve library
input_data = parse_input(input_json_str)

# Call the function
result = ${functionName}(input_data)

# Convert result to dict and return as JSON
json.dumps(result.to_dict() if hasattr(result, 'to_dict') else result)
      `;

      const resultJson = await this.pyodide.runPythonAsync(code);
      const resultData = JSON.parse(resultJson);
      const result = CellFunctionResult.fromJSON(resultData);

      return {
        output: resultJson,
        result
      };
    } catch (error: any) {
      return {
        output: '',
        error: error.message || String(error)
      };
    }
  }

  /**
   * Call a meta function associated with a cell solution function
   */
  async callMetaFunction(functionName: string, input: CellFunctionInput): Promise<PythonExecutionResult> {
    if (!this.isInitialized || !this.pyodide) {
      return {
        output: '',
        error: 'Python executor not initialized. Call initialize() first.'
      };
    }

    const func = this.functionMap.get(functionName);
    if (!func) {
      return {
        output: '',
        error: `Function '${functionName}' not found in loaded plugins`
      };
    }

    try {
      // Convert input to Python-compatible format and call meta function
      const inputJson = JSON.stringify(input);

      // Set the JSON as a Python variable to avoid escaping issues
      this.pyodide.globals.set('input_json_str', inputJson);

      const code = `
import json

# Parse input using alpha_solve library
input_data = parse_input(input_json_str)

# Call the meta function
result = ${func.metaFunctionName}(input_data)

# Convert result to dict and return as JSON
json.dumps(result.to_dict() if hasattr(result, 'to_dict') else result)
      `;

      const resultJson = await this.pyodide.runPythonAsync(code);
      const resultData = JSON.parse(resultJson);
      const result = MetaFunctionResult.fromJSON(resultData);

      return {
        output: resultJson,
        result
      };
    } catch (error: any) {
      return {
        output: '',
        error: error.message || String(error)
      };
    }
  }

  /**
   * Execute arbitrary Python code
   */
  async execute(code: string): Promise<PythonExecutionResult> {
    if (!this.isInitialized || !this.pyodide) {
      return {
        output: '',
        error: 'Python executor not initialized. Call initialize() first.'
      };
    }

    try {
      const result = await this.pyodide.runPythonAsync(code);
      return {
        output: result !== undefined && result !== null ? String(result) : ''
      };
    } catch (error: any) {
      return {
        output: '',
        error: error.message || String(error)
      };
    }
  }

  /**
   * Get all loaded plugins
   */
  getPlugins(): Plugin[] {
    return [...this.plugins];
  }

  /**
   * Get all available cell solution functions
   */
  getAvailableFunctions(): CellSolutionFunction[] {
    return Array.from(this.functionMap.values());
  }

  /**
   * Check if a function is available
   */
  hasFunction(functionName: string): boolean {
    return this.functionMap.has(functionName);
  }

  /**
   * Check if the executor is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.pyodide !== null;
  }

  /**
   * Reset the executor (clears all loaded plugins and state)
   */
  async reset(): Promise<void> {
    this.plugins = [];
    this.functionMap.clear();
    this.isInitialized = false;
    // Note: We keep pyodide loaded for performance
  }
}
