import { Cell, SerializableCell, CellSerializer, EquationCell } from './cell.model';
import { PythonExecutorService } from '../services/python-executor.service';
import { Context, createCellFunctionInput, createContext } from './context.model';
import { MetaFunctionResult } from './meta-function-result.model';
import { CellFunctionResult } from './cell-function-result.model';

/**
 * Main project class containing a list of cells
 */
export class Project {
  id: string;
  name: string;
  cells: Cell[];
  createdAt: Date;
  updatedAt: Date;

  constructor(
    name: string = 'Untitled Project',
    cells: Cell[] = [],
    id?: string,
    createdAt?: Date,
    updatedAt?: Date
  ) {
    this.id = id || crypto.randomUUID();
    this.name = name;
    this.cells = cells;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();
  }

  /**
   * Add a cell to the project
   */
  addCell(cell: Cell): void {
    this.cells.push(cell);
    this.updatedAt = new Date();
  }

  /**
   * Remove a cell by ID
   */
  removeCell(cellId: string): boolean {
    const index = this.cells.findIndex((c) => c.id === cellId);
    if (index !== -1) {
      this.cells.splice(index, 1);
      this.updatedAt = new Date();
      return true;
    }
    return false;
  }

  /**
   * Find a cell by ID (searches recursively in folders)
   */
  findCell(cellId: string): Cell | null {
    return this.findCellRecursive(this.cells, cellId);
  }

  private findCellRecursive(cells: Cell[], cellId: string): Cell | null {
    for (const cell of cells) {
      if (cell.id === cellId) {
        return cell;
      }
      if (cell.type === 'folder') {
        const found = this.findCellRecursive(cell.cells, cellId);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  /**
   * Serialize the project to JSON-compatible object
   */
  toJSON(): SerializableProject {
    return {
      id: this.id,
      name: this.name,
      cells: this.cells.map((c) => CellSerializer.serialize(c)),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }

  /**
   * Serialize the project to a JSON string
   */
  toString(): string {
    return JSON.stringify(this.toJSON(), null, 2);
  }

  /**
   * Create a Project instance from a JSON object
   */
  static fromJSON(data: SerializableProject): Project {
    const cells = data.cells.map((c) => CellSerializer.deserialize(c));
    return new Project(
      data.name,
      cells,
      data.id,
      new Date(data.createdAt),
      new Date(data.updatedAt)
    );
  }

  /**
   * Create a Project instance from a JSON string
   */
  static fromString(json: string): Project {
    const data = JSON.parse(json) as SerializableProject;
    return Project.fromJSON(data);
  }

  /**
   * Create a new empty project
   */
  static create(name: string = 'Untitled Project'): Project {
    return new Project(name);
  }

  /**
   * Clone the project (deep copy)
   */
  clone(): Project {
    return Project.fromJSON(this.toJSON());
  }

  /**
   * Update context for a cell and propagate to subsequent cells
   */
  async updateContext(cellId: string, pythonExecutor: PythonExecutorService): Promise<void> {
    // Find the cell and its parent array
    const result = this.findCellWithParent(this.cells, cellId);
    if (!result) {
      throw new Error(`Cell with ID ${cellId} not found`);
    }

    const { cell, parentArray, index } = result;

    // Process starting from the found cell
    await this.propagateContext(parentArray, index, pythonExecutor);

    this.updatedAt = new Date();
  }

  /**
   * Propagate context through cells starting at a given index
   * When encountering folders, process both inside the folder and after it
   */
  private async propagateContext(
    cells: Cell[],
    startIndex: number,
    pythonExecutor: PythonExecutorService
  ): Promise<void> {
    // Get initial context from the previous cell (if any)
    let currentContext = this.getPreviousCellContext(cells, startIndex);

    for (let i = startIndex; i < cells.length; i++) {
      const currentCell = cells[i];

      if (currentCell.type === 'equation') {
        // Update equation cell with the current context
        currentContext = await this.updateCellContext(currentCell, currentContext, pythonExecutor);
      } else if (currentCell.type === 'folder') {
        // Process cells inside the folder with the current context
        await this.propagateContextWithContext(currentCell.cells, 0, currentContext, pythonExecutor);
        // Continue processing cells after the folder with the same context (context doesn't expand out)
      }
      // Note cells are skipped
    }
  }

  /**
   * Propagate context through cells with a given starting context
   */
  private async propagateContextWithContext(
    cells: Cell[],
    startIndex: number,
    context: Context,
    pythonExecutor: PythonExecutorService
  ): Promise<void> {
    let currentContext = context;

    for (let i = startIndex; i < cells.length; i++) {
      const currentCell = cells[i];

      if (currentCell.type === 'equation') {
        currentContext = await this.updateCellContext(currentCell, currentContext, pythonExecutor);
      } else if (currentCell.type === 'folder') {
        await this.propagateContextWithContext(currentCell.cells, 0, currentContext, pythonExecutor);
      }
    }
  }

  /**
   * Get the context from the previous cell
   */
  private getPreviousCellContext(cells: Cell[], currentIndex: number): Context {
    for (let i = currentIndex - 1; i >= 0; i--) {
      const prevCell = cells[i];
      if (prevCell.type === 'equation' && prevCell.context) {
        return prevCell.context;
      }
    }
    // Return empty context if no previous cell
    return createContext();
  }

  /**
   * Update context for a single equation cell
   * Returns the new context after processing this cell
   */
  private async updateCellContext(cell: EquationCell, inputContext: Context, pythonExecutor: PythonExecutorService): Promise<Context> {
    // Get all available functions
    const availableFunctions = pythonExecutor.getAvailableFunctions();

    if (availableFunctions.length === 0) {
      return inputContext;
    }

    // Call meta function for each available function
    const metaResults: { result: MetaFunctionResult; functionName: string }[] = [];

    for (const func of availableFunctions) {
      try {
        const input = createCellFunctionInput(cell, inputContext);
        const execResult = await pythonExecutor.callMetaFunction(func.functionName, input);

        if (execResult.result) {
          metaResults.push({
            result: execResult.result as MetaFunctionResult,
            functionName: func.functionName
          });
        }
      } catch (error) {
        console.warn(`Failed to call meta function for ${func.functionName}:`, error);
      }
    }

    if (metaResults.length === 0) {
      return inputContext;
    }

    // Filter out functions that returned use_result=False
    const usableResults = metaResults.filter(mr => mr.result.useResult);

    if (usableResults.length === 0) {
      // No functions want to be used, propagate context without modification
      cell.context = inputContext;
      return inputContext;
    }

    // Sort by index and choose the top one (lowest index)
    usableResults.sort((a, b) => a.result.index - b.result.index);
    const selectedFunction = usableResults[0];

    // Run the selected function to get new context
    try {
      const input = createCellFunctionInput(cell, inputContext);
      const execResult = await pythonExecutor.callFunction(selectedFunction.functionName, input);

      if (execResult.result) {
        const cellResult = execResult.result as CellFunctionResult;

        // Update cell context if new context is provided
        let newContext = inputContext;
        if (cellResult.newContext) {
          cell.context = cellResult.newContext;
          newContext = cellResult.newContext;
        } else {
          cell.context = inputContext;
        }

        // Update visible solutions if provided
        if (cellResult.visibleSolutions) {
          cell.solutions = cellResult.visibleSolutions;
        }

        cell.updatedAt = new Date();
        return newContext;
      }
    } catch (error) {
      console.error(`Failed to execute function ${selectedFunction.functionName}:`, error);
    }

    return inputContext;
  }

  /**
   * Find a cell and return it with its parent array and index
   */
  private findCellWithParent(
    cells: Cell[],
    cellId: string
  ): { cell: Cell; parentArray: Cell[]; index: number } | null {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];

      if (cell.id === cellId) {
        return { cell, parentArray: cells, index: i };
      }

      if (cell.type === 'folder') {
        const found = this.findCellWithParent(cell.cells, cellId);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }
}

/**
 * Serializable representation of a project
 */
export interface SerializableProject {
  id: string;
  name: string;
  cells: SerializableCell[];
  createdAt: string;
  updatedAt: string;
}

