/**
 * Type of variable value
 */
export type VariableType = 'numerical' | 'analytical';

/**
 * Variable class representing a named value with a type
 */
export class Variable {
  name: string;
  type: VariableType;
  value: string;

  constructor(name: string, type: VariableType, value: string) {
    this.name = name;
    this.type = type;
    this.value = value;
  }

  /**
   * Serialize variable to JSON
   */
  toJSON(): object {
    return {
      name: this.name,
      type: this.type,
      value: this.value
    };
  }

  /**
   * Create a variable from JSON data
   */
  static fromJSON(data: any): Variable {
    return new Variable(data.name, data.type, data.value);
  }

  /**
   * Create a numerical variable
   */
  static createNumerical(name: string, value: string): Variable {
    return new Variable(name, 'numerical', value);
  }

  /**
   * Create an analytical variable
   */
  static createAnalytical(name: string, value: string): Variable {
    return new Variable(name, 'analytical', value);
  }
}

/**
 * Context object that gets passed to plugin functions
 */
export interface Context {
  variables: Variable[];
}

/**
 * Serialize context to JSON
 */
export function serializeContext(context: Context): any {
  return {
    variables: context.variables.map(v => v.toJSON())
  };
}

/**
 * Deserialize context from JSON
 */
export function deserializeContext(data: any): Context {
  const variables = (data.variables || []).map((v: any) => Variable.fromJSON(v));
  return { variables };
}

/**
 * Input structure passed to cell solution functions
 */
export interface CellFunctionInput {
  cell: any; // The cell object (can be any cell type)
  context: Context;
}

/**
 * Create a new context with variables
 */
export function createContext(variables: Variable[] = []): Context {
  return {
    variables: [...variables]
  };
}

/**
 * Create cell function input from cell and context
 */
export function createCellFunctionInput(cell: any, context: Context): CellFunctionInput {
  return {
    cell,
    context
  };
}

