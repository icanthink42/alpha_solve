import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CellListComponent } from './components/cell-list/cell-list.component';
import { PluginManagerComponent } from './components/plugin-manager/plugin-manager.component';
import { Project, Cell, CellSerializer, Plugin } from './models';
import { PythonExecutorService } from './services/python-executor.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CellListComponent, PluginManagerComponent, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('alpha_solve');
  protected project: Project;
  protected selectedCell = signal<Cell | null>(null);
  protected sidebarWidth = signal(this.getInitialSidebarWidth());
  protected isEditingProjectName = signal(false);
  private isResizing = false;
  protected plugins = signal<Plugin[]>([]);
  protected isLoadingPlugins = signal(false);
  protected pluginError = signal<string | null>(null);
  protected isPluginManagerOpen = signal(false);
  protected pluginUrls = signal<string[]>([]);

  constructor(private pythonExecutor: PythonExecutorService) {
    // Initialize with sample project data
    this.project = this.createSampleProject();

    // Load plugin URLs from cookies
    this.loadPluginUrlsFromCookies();

    // Initialize plugin system
    this.initializePlugins().then(() => {
      // After plugins are loaded, update the first cell
      this.updateFirstCell();
    });

    // Handle window resize to update sidebar width responsively
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        if (!this.isResizing) {
          this.sidebarWidth.set(this.getInitialSidebarWidth());
        }
      });
    }
  }

  private getInitialSidebarWidth(): number {
    if (typeof window === 'undefined') {
      return 320;
    }
    // On mobile (width <= 768px), use 100% width
    // On desktop, use 50% width
    const isMobile = window.innerWidth <= 768;
    return isMobile ? window.innerWidth : window.innerWidth * 0.5;
  }

  private async initializePlugins(): Promise<void> {
    this.isLoadingPlugins.set(true);
    this.pluginError.set(null);

    try {
      console.log('Loading plugins...');

      // Load plugins from saved URLs
      const loadedPlugins: Plugin[] = [];
      for (const url of this.pluginUrls()) {
        try {
          const plugin = await Plugin.loadFromGit(url);
          loadedPlugins.push(plugin);
        } catch (error: any) {
          console.error(`Failed to load plugin from ${url}:`, error);
        }
      }

      this.plugins.set(loadedPlugins);

      // Initialize Python executor with loaded plugins
      await this.pythonExecutor.initialize(this.plugins());

      console.log('Plugins loaded successfully:', this.plugins());
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

  /**
   * Load plugin URLs from cookies
   */
  private loadPluginUrlsFromCookies(): void {
    if (typeof document === 'undefined') {
      return;
    }

    const cookies = document.cookie.split(';');
    const pluginCookie = cookies.find(c => c.trim().startsWith('pluginUrls='));

    if (pluginCookie) {
      const value = pluginCookie.split('=')[1];
      try {
        this.pluginUrls.set(JSON.parse(decodeURIComponent(value)));
      } catch (error) {
        console.error('Failed to parse plugin URLs from cookies:', error);
        this.setDefaultPluginUrls();
      }
    } else {
      // No cookie found, set default plugin
      this.setDefaultPluginUrls();
    }
  }

  /**
   * Set default plugin URLs and save to cookies
   */
  private setDefaultPluginUrls(): void {
    const defaultUrls = [
      'https://github.com/icanthink42/alpha_solve_analytical.git'
    ];
    this.pluginUrls.set(defaultUrls);
    this.savePluginUrlsToCookies();
  }

  /**
   * Save plugin URLs to cookies
   */
  private savePluginUrlsToCookies(): void {
    if (typeof document === 'undefined') {
      return;
    }

    const value = encodeURIComponent(JSON.stringify(this.pluginUrls()));
    // Set cookie to expire in 1 year
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    document.cookie = `pluginUrls=${value}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;
  }

  /**
   * Open the plugin manager
   */
  protected openPluginManager(): void {
    this.isPluginManagerOpen.set(true);
  }

  /**
   * Close the plugin manager
   */
  protected closePluginManager(): void {
    this.isPluginManagerOpen.set(false);
  }

  /**
   * Handle adding a new plugin URL
   */
  protected async onAddPluginUrl(url: string): Promise<void> {
    // Add URL to list
    const urls = [...this.pluginUrls(), url];
    this.pluginUrls.set(urls);
    this.savePluginUrlsToCookies();

    // Reload plugins
    await this.initializePlugins();

    // Update all cells with new plugin functions
    await this.updateFirstCell();
  }

  /**
   * Handle removing a plugin URL
   */
  protected async onRemovePluginUrl(url: string): Promise<void> {
    const urls = this.pluginUrls().filter(u => u !== url);
    this.pluginUrls.set(urls);
    this.savePluginUrlsToCookies();

    // Reload plugins
    await this.initializePlugins();

    // Update all cells after plugin removal
    await this.updateFirstCell();
  }
}
