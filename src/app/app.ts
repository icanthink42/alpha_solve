import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CellListComponent } from './components/cell-list/cell-list.component';
import { Project, Cell, CellSerializer, Plugin } from './models';
import { PythonExecutorService } from './services/python-executor.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CellListComponent, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('alpha_solve');
  protected project: Project;
  protected selectedCell = signal<Cell | null>(null);
  protected sidebarWidth = signal(320);
  protected isEditingProjectName = signal(false);
  private isResizing = false;
  protected plugins: Plugin[] = [];
  protected isLoadingPlugins = signal(false);
  protected pluginError = signal<string | null>(null);

  constructor(private pythonExecutor: PythonExecutorService) {
    // Initialize with sample project data
    this.project = this.createSampleProject();

    // Initialize plugin system
    this.initializePlugins().then(() => {
      // After plugins are loaded, update the first cell
      this.updateFirstCell();
    });
  }

  private async initializePlugins(): Promise<void> {
    this.isLoadingPlugins.set(true);
    this.pluginError.set(null);

    try {
      console.log('Loading plugins...');

      // Load test plugin from git
      const analyticalPlugin = await Plugin.loadFromGit(
        'https://github.com/icanthink42/alpha_solve_analytical.git'
      );

      this.plugins = [analyticalPlugin];

      // Initialize Python executor with loaded plugins
      await this.pythonExecutor.initialize(this.plugins);

      console.log('Plugins loaded successfully:', this.plugins);
      console.log('Available functions:', this.pythonExecutor.getAvailableFunctions());
    } catch (error: any) {
      console.error('Failed to load plugins:', error);
      this.pluginError.set(error.message || 'Failed to load plugins');
    } finally {
      this.isLoadingPlugins.set(false);
    }
  }

  private createSampleProject(): Project {
    const project = Project.create('My Project');

    return project;
  }

  protected onCellSelected(cell: Cell): void {
    this.selectedCell.set(cell);
    console.log('Selected cell:', cell);
  }

  protected onResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.isResizing = true;
    document.addEventListener('mousemove', this.onResize.bind(this));
    document.addEventListener('mouseup', this.onResizeEnd.bind(this));
  }

  private onResize(event: MouseEvent): void {
    if (!this.isResizing) return;
    const newWidth = event.clientX;
    if (newWidth >= 200) {
      this.sidebarWidth.set(newWidth);
    }
  }

  private onResizeEnd(): void {
    this.isResizing = false;
    document.removeEventListener('mousemove', this.onResize.bind(this));
    document.removeEventListener('mouseup', this.onResizeEnd.bind(this));
  }

  protected startEditingProjectName(): void {
    this.isEditingProjectName.set(true);
  }

  protected finishEditingProjectName(): void {
    this.isEditingProjectName.set(false);
    this.project.updatedAt = new Date();
  }

  protected onProjectNameKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      this.finishEditingProjectName();
    }
  }

  protected downloadProject(): void {
    const json = this.project.toString();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.project.name || 'project'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected uploadProject(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        this.project = Project.fromString(json);
      } catch (error) {
        console.error('Failed to load project:', error);
        alert('Failed to load project. Please make sure the file is valid.');
      }
    };
    reader.readAsText(file);

    // Reset input so the same file can be uploaded again
    input.value = '';
  }

  protected triggerFileUpload(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event) => this.uploadProject(event);
    input.click();
  }

  /**
   * Update the first cell in the project
   */
  private async updateFirstCell(): Promise<void> {
    if (!this.pythonExecutor.isReady()) {
      return;
    }

    const firstCell = this.findFirstCell(this.project.cells);
    if (firstCell) {
      try {
        await this.project.updateContext(firstCell.id, this.pythonExecutor);
      } catch (error) {
        console.error('Failed to update first cell:', error);
      }
    }
  }

  /**
   * Find the first cell recursively (goes into folders)
   */
  private findFirstCell(cells: Cell[]): Cell | null {
    if (cells.length === 0) return null;

    const firstCell = cells[0];
    if (firstCell.type === 'folder' && firstCell.cells.length > 0) {
      return this.findFirstCell(firstCell.cells);
    }

    return firstCell;
  }

  /**
   * Trigger context update for a cell
   */
  async onCellUpdated(cellId: string): Promise<void> {
    if (!this.pythonExecutor.isReady()) {
      return;
    }

    try {
      await this.project.updateContext(cellId, this.pythonExecutor);
    } catch (error) {
      console.error('Failed to update cell context:', error);
    }
  }
}
