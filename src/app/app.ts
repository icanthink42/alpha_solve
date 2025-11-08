import { Component, signal, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CellListComponent } from './components/cell-list/cell-list.component';
import { PluginManagerComponent } from './components/plugin-manager/plugin-manager.component';
import { Project, Cell, CellSerializer, Plugin, PacketFactory } from './models';
import { PythonExecutorService } from './services/python-executor.service';
import { PacketManagerService } from './services/packet-manager.service';
import { PacketHandlerService } from './services/packet-handler.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CellListComponent, PluginManagerComponent, FormsModule, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild(CellListComponent) cellListComponent!: CellListComponent;
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

  // Share functionality
  protected isShareModalOpen = signal(false);
  protected shareLink = signal<string>('');
  protected isConnecting = signal(false);
  protected isConnected = signal(false);
  protected connectionError = signal<string | null>(null);
  protected userName = signal<string>('');
  private subscriptions: Subscription[] = [];

  // Track cell states for change detection
  private cellStates = new Map<string, string>();
  private isProcessingIncomingPacket = false;

  constructor(
    private pythonExecutor: PythonExecutorService,
    private packetManager: PacketManagerService,
    private packetHandler: PacketHandlerService
  ) {
    // Initialize with sample project data
    this.project = this.createSampleProject();

    // Load plugin URLs from cookies
    this.loadPluginUrlsFromCookies();

    // Set up packet handler with current project
    this.packetHandler.setProject(this.project);

    // Subscribe to WebSocket connection status
    this.subscriptions.push(
      this.packetManager.connectionStatus$.subscribe(status => {
        this.isConnected.set(status);
        if (status) {
          this.isConnecting.set(false);
          this.connectionError.set(null);
        }
      })
    );

    // Subscribe to WebSocket errors
    this.subscriptions.push(
      this.packetManager.errors$.subscribe(error => {
        this.connectionError.set(error);
        this.isConnecting.set(false);
      })
    );

    // Subscribe to incoming project sync events
    this.subscriptions.push(
      this.packetHandler.projectSync$.subscribe(event => {
        this.isProcessingIncomingPacket = true;

        this.project = event.project;
        this.packetHandler.setProject(this.project);

        // Rebuild cell state cache for the new project
        this.rebuildCellStateCache();

        this.isProcessingIncomingPacket = false;
      })
    );

    // Subscribe to incoming cell update events
    this.subscriptions.push(
      this.packetHandler.cellUpdate$.subscribe(event => {
        // Set flag to prevent sending packets for incoming updates
        this.isProcessingIncomingPacket = true;

        // Update our cell state cache to reflect the incoming change
        const cell = this.project.findCell(event.cellId);
        if (cell) {
          this.updateCellStateCache(cell);
        }

        // Force UI update by creating a new cells array reference
        // This triggers Angular's change detection
        this.forceUIUpdate();

        this.isProcessingIncomingPacket = false;
      })
    );

    // Subscribe to incoming cell move events
    this.subscriptions.push(
      this.packetHandler.cellMove$.subscribe(event => {
        // Set flag to prevent sending packets for incoming updates
        this.isProcessingIncomingPacket = true;

        // Force UI update
        this.forceUIUpdate();

        this.isProcessingIncomingPacket = false;
      })
    );

    // Subscribe to incoming cell create events
    this.subscriptions.push(
      this.packetHandler.cellCreate$.subscribe(event => {
        // Set flag to prevent sending packets for incoming updates
        this.isProcessingIncomingPacket = true;

        // Rebuild cache since cells array changed
        this.rebuildCellStateCache();

        // Force UI update
        this.forceUIUpdate();

        this.isProcessingIncomingPacket = false;
      })
    );

    // Subscribe to incoming cell delete events
    this.subscriptions.push(
      this.packetHandler.cellDelete$.subscribe(event => {
        // Set flag to prevent sending packets for incoming updates
        this.isProcessingIncomingPacket = true;

        // Remove from cache
        this.cellStates.delete(event.cellId);

        // Force UI update
        this.forceUIUpdate();

        this.isProcessingIncomingPacket = false;
      })
    );

    // Load username from localStorage
    if (typeof localStorage !== 'undefined') {
      const savedName = localStorage.getItem('userName');
      if (savedName) {
        this.userName.set(savedName);
      }
    }

    // Check for share link parameters and auto-connect
    this.checkAndConnectFromUrl();

    // Initialize plugin system
    this.initializePlugins().then(() => {
      // After plugins are loaded, update the first cell
      this.updateFirstCell();

      // Initialize cell state cache
      this.rebuildCellStateCache();
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

  ngAfterViewInit(): void {
    // Focus the first cell after the view is initialized
    if (this.cellListComponent) {
      const firstCell = this.findFirstCell(this.project.cells);
      if (firstCell) {
        setTimeout(() => {
          this.cellListComponent.focusCell(firstCell);
        }, 0);
      }
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
    } catch (error: any) {
      console.error('Failed to load plugins:', error);
      this.pluginError.set(error.message || 'Failed to load plugins');
    } finally {
      this.isLoadingPlugins.set(false);
    }
  }

  private createSampleProject(): Project {
    const project = Project.create('My Project');
    project.addCell(CellSerializer.createEquationCell(''));

    return project;
  }

  protected onCellSelected(cell: Cell): void {
    this.selectedCell.set(cell);
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
   * Trigger context update for a cell and send update packet if changed
   */
  async onCellUpdated(cellId: string): Promise<void> {
    if (!this.pythonExecutor.isReady()) {
      return;
    }

    // Get the cell to check if it changed
    const cell = this.project.findCell(cellId);
    if (!cell) {
      return;
    }

    // Check if cell actually changed
    const hasChanged = this.hasCellChanged(cell);

    try {
      await this.project.updateContext(cellId, this.pythonExecutor);

      // Update cell state cache
      this.updateCellStateCache(cell);

      // Send CellUpdate packet if cell changed and we're connected
      // Don't send if we're processing an incoming packet (to avoid loops)
      if (hasChanged && this.isConnected() && !this.isProcessingIncomingPacket) {
        this.sendCellUpdatePacket(cell);
      }
    } catch (error) {
      console.error('Failed to update cell context:', error);
    }
  }

  /**
   * Check if a cell has changed compared to cached state
   */
  private hasCellChanged(cell: Cell): boolean {
    const currentState = this.serializeCellState(cell);
    const cachedState = this.cellStates.get(cell.id);

    return cachedState !== currentState;
  }

  /**
   * Serialize cell state for comparison
   */
  private serializeCellState(cell: Cell): string {
    if (cell.type === 'equation') {
      return JSON.stringify({
        type: cell.type,
        latex: cell.latex,
        dropdownSelections: cell.dropdownSelections
      });
    } else if (cell.type === 'note') {
      return JSON.stringify({
        type: cell.type,
        content: cell.content
      });
    } else if (cell.type === 'folder') {
      return JSON.stringify({
        type: cell.type,
        name: cell.name
      });
    }
    return '';
  }

  /**
   * Update cell state cache
   */
  private updateCellStateCache(cell: Cell): void {
    const state = this.serializeCellState(cell);
    this.cellStates.set(cell.id, state);
  }

  /**
   * Rebuild cell state cache for all cells in project
   */
  private rebuildCellStateCache(): void {
    this.cellStates.clear();
    this.cacheCellStates(this.project.cells);
  }

  /**
   * Recursively cache cell states
   */
  private cacheCellStates(cells: Cell[]): void {
    for (const cell of cells) {
      this.updateCellStateCache(cell);
      if (cell.type === 'folder') {
        this.cacheCellStates(cell.cells);
      }
    }
  }

  /**
   * Send a CellUpdate packet to the server
   */
  private sendCellUpdatePacket(cell: Cell): void {
    try {
      const serializedCell = CellSerializer.serialize(cell);
      const packet = PacketFactory.createCellUpdate(cell.id, serializedCell);

      this.packetManager.sendPacket(packet);
    } catch (error) {
      console.error('[App] Failed to send cell update packet:', error);
    }
  }

  /**
   * Force UI update by creating new array references
   * This triggers Angular's change detection for cells
   */
  private forceUIUpdate(): void {
    // Create a shallow copy of the cells array
    // This creates a new reference that Angular will detect
    this.project.cells = this.project.cells.slice();
  }

  /**
   * Find the parent folder ID for a given cell array
   */
  private findParentFolderId(parentArray: Cell[]): string | undefined {
    if (parentArray === this.project.cells) {
      return undefined;
    }

    const findParentFolder = (cells: Cell[]): string | undefined => {
      for (const cell of cells) {
        if (cell.type === 'folder' && cell.cells === parentArray) {
          return cell.id;
        }
        if (cell.type === 'folder') {
          const found = findParentFolder(cell.cells);
          if (found) return found;
        }
      }
      return undefined;
    };

    return findParentFolder(this.project.cells);
  }

  /**
   * Handle cell creation and send packet
   */
  onCellCreated(event: { cell: Cell; index: number; parentArray: Cell[] }): void {
    // Don't send packet if we're processing an incoming packet
    if (this.isProcessingIncomingPacket || !this.isConnected()) {
      return;
    }

    const parentCellId = this.findParentFolderId(event.parentArray);

    // Send packet
    const serializedCell = CellSerializer.serialize(event.cell);
    const packet = PacketFactory.createCellCreate(serializedCell, event.index, parentCellId);
    this.packetManager.sendPacket(packet);

    // Update cache
    this.updateCellStateCache(event.cell);
  }

  /**
   * Handle cell deletion and send packet
   */
  onCellDeleted(event: { cellId: string; parentArray: Cell[] }): void {
    // Don't send packet if we're processing an incoming packet
    if (this.isProcessingIncomingPacket || !this.isConnected()) {
      return;
    }

    const parentCellId = this.findParentFolderId(event.parentArray);

    // Send packet
    const packet = PacketFactory.createCellDelete(event.cellId, parentCellId);
    this.packetManager.sendPacket(packet);

    // Remove from cache
    this.cellStates.delete(event.cellId);
  }

  /**
   * Handle cell move and send packet
   */
  onCellMoved(event: { cellId: string; fromIndex: number; toIndex: number; parentArray: Cell[] }): void {
    // Don't send packet if we're processing an incoming packet
    if (this.isProcessingIncomingPacket || !this.isConnected()) {
      return;
    }

    // Send packet
    const packet = PacketFactory.createCellMove(event.cellId, event.fromIndex, event.toIndex);
    this.packetManager.sendPacket(packet);
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

  /**
   * Open share modal
   */
  protected openShareModal(): void {
    this.isShareModalOpen.set(true);
  }

  /**
   * Close share modal
   */
  protected closeShareModal(): void {
    this.isShareModalOpen.set(false);
  }

  /**
   * Get WebSocket server URL based on environment
   */
  private getServerUrl(): string {
    if (typeof window === 'undefined') {
      return 'ws://localhost:8080';
    }

    // In production (deployed on Vercel), use the production WebSocket server
    // In development (localhost), use local WebSocket server
    const isLocalhost = window.location.hostname === 'localhost' ||
                        window.location.hostname === '127.0.0.1' ||
                        window.location.hostname === '';

    return isLocalhost ? 'ws://localhost:8080' : 'wss://api-alphasolve.neelema.net';
  }

  /**
   * Connect to server and share project
   */
  protected async shareProject(): Promise<void> {
    const name = this.userName().trim();
    if (!name) {
      this.connectionError.set('Please enter your name');
      return;
    }

    // Save username to localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('userName', name);
    }

    this.isConnecting.set(true);
    this.connectionError.set(null);

    try {
      const userId = this.getUserId();
      const serverUrl = this.getServerUrl();

      // Connect to WebSocket server
      this.packetManager.connect({
        name: name,
        projectId: this.project.id,
        userId: userId,
        url: serverUrl
      });

      // Wait a bit for connection to establish
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (this.isConnected()) {
        // Send project sync packet
        const syncPacket = PacketFactory.createProjectSync(this.project.toJSON());
        this.packetManager.sendPacket(syncPacket);

        // Generate shareable link (server URL is auto-detected based on environment)
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4200';
        const link = `${baseUrl}?projectId=${this.project.id}`;
        this.shareLink.set(link);
      }
    } catch (error) {
      console.error('Failed to share project:', error);
      this.connectionError.set('Failed to connect to server');
      this.isConnecting.set(false);
    }
  }

  /**
   * Disconnect from server
   */
  protected disconnectFromServer(): void {
    this.packetManager.disconnect();
    this.shareLink.set('');
  }

  /**
   * Copy share link to clipboard
   */
  protected async copyShareLink(): Promise<void> {
    const link = this.shareLink();
    if (!link) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        alert('Link copied to clipboard!');
      }
    } catch (error) {
      console.error('Failed to copy link:', error);
      alert('Failed to copy link');
    }
  }

  /**
   * Check URL for share parameters and auto-connect if present
   */
  private checkAndConnectFromUrl(): void {
    if (typeof window === 'undefined' || typeof URLSearchParams === 'undefined') {
      return;
    }

    try {
      const params = new URLSearchParams(window.location.search);
      const projectId = params.get('projectId');

      if (projectId) {
        // Wait a bit for initialization, then connect
        setTimeout(() => {
          // Prompt for name if not saved
          if (!this.userName()) {
            const name = prompt('Enter your name to join the collaboration:');
            if (name && name.trim()) {
              this.userName.set(name.trim());
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem('userName', name.trim());
              }
            } else {
              return;
            }
          }

          // Connect to the server using environment-detected URL
          const userId = this.getUserId();
          const serverUrl = this.getServerUrl();
          this.isConnecting.set(true);

          this.packetManager.connect({
            name: this.userName(),
            projectId: projectId,
            userId: userId,
            url: serverUrl
          });

          // Wait for connection and project sync
          setTimeout(() => {
            if (this.isConnected()) {
              this.shareLink.set(window.location.href);
            } else {
              this.connectionError.set('Failed to connect to server. Make sure the server is running.');
            }
            this.isConnecting.set(false);
          }, 2000);
        }, 500);
      }
    } catch (error) {
      console.error('[App] Failed to parse share link parameters:', error);
    }
  }

  /**
   * Get or create a user ID
   */
  private getUserId(): string {
    if (typeof localStorage !== 'undefined') {
      let userId = localStorage.getItem('userId');
      if (!userId) {
        userId = crypto.randomUUID();
        localStorage.setItem('userId', userId);
      }
      return userId;
    }
    return crypto.randomUUID();
  }

  /**
   * Clean up on component destruction
   */
  ngOnDestroy(): void {
    // Unsubscribe from all subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());

    // Disconnect from WebSocket
    this.packetManager.disconnect();
  }
}
