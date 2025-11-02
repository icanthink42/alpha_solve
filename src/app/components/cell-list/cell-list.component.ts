import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Cell, EquationCell, NoteCell, FolderCell, CellSerializer } from '../../models';
import { MathQuillInputComponent } from '../mathquill-input/mathquill-input.component';
import { LatexRendererComponent } from '../latex-renderer/latex-renderer.component';

@Component({
  selector: 'app-cell-list',
  imports: [CommonModule, FormsModule, MathQuillInputComponent, LatexRendererComponent],
  templateUrl: './cell-list.component.html',
  styleUrl: './cell-list.component.css',
})
export class CellListComponent {
  @Input() cells: Cell[] = [];
  @Output() cellSelected = new EventEmitter<Cell>();
  @Output() cellUpdated = new EventEmitter<string>();

  expandedFolders = new Set<string>();
  draggedCell: Cell | null = null;
  draggedFromParent: Cell[] | null = null;
  dropTargetId: string | null = null;
  dropAtEndTarget: string | null = null;

  onLatexChange(cell: EquationCell, newLatex: string, parentArray: Cell[]): void {
    // Check for cell type conversion keywords
    if (newLatex.toLowerCase() === 'folder') {
      this.convertToFolder(cell, parentArray);
      return;
    } else if (newLatex.toLowerCase() === 'note') {
      this.convertToNote(cell, parentArray);
      return;
    }

    cell.latex = newLatex;
    cell.updatedAt = new Date();

    // Emit cell updated event
    this.cellUpdated.emit(cell.id);
  }

  onNoteChange(cell: NoteCell, newContent: string): void {
    cell.content = newContent;
    cell.updatedAt = new Date();

    // Emit cell updated event
    this.cellUpdated.emit(cell.id);
  }

  onFolderNameChange(cell: FolderCell, newName: string): void {
    cell.name = newName;
    cell.updatedAt = new Date();

    // Emit cell updated event
    this.cellUpdated.emit(cell.id);
  }

  toggleFolder(folderId: string): void {
    if (this.expandedFolders.has(folderId)) {
      this.expandedFolders.delete(folderId);
    } else {
      this.expandedFolders.add(folderId);
    }
  }

  isFolderExpanded(folderId: string): boolean {
    return this.expandedFolders.has(folderId);
  }

  asEquationCell(cell: Cell): EquationCell {
    return cell as EquationCell;
  }

  asNoteCell(cell: Cell): NoteCell {
    return cell as NoteCell;
  }

  asFolderCell(cell: Cell): FolderCell {
    return cell as FolderCell;
  }

  onDragStart(event: DragEvent, cell: Cell, parentArray: Cell[]): void {
    this.draggedCell = cell;
    this.draggedFromParent = parentArray;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/html', cell.id);
    }
  }

  onDragOver(event: DragEvent, targetCell?: Cell): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    if (targetCell) {
      this.dropTargetId = targetCell.id;
    }
  }

  onDragOverEnd(event: DragEvent, endZoneId: string): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dropAtEndTarget = endZoneId;
  }

  onDragLeave(event: DragEvent): void {
    this.dropTargetId = null;
  }

  onDragLeaveEnd(event: DragEvent): void {
    this.dropAtEndTarget = null;
  }

  onDrop(event: DragEvent, targetCell: Cell, targetParentArray: Cell[]): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.draggedCell || !this.draggedFromParent) return;

    // Remove from original position
    const draggedIndex = this.draggedFromParent.indexOf(this.draggedCell);
    if (draggedIndex > -1) {
      this.draggedFromParent.splice(draggedIndex, 1);
    }

    // Insert at new position
    const targetIndex = targetParentArray.indexOf(targetCell);
    targetParentArray.splice(targetIndex, 0, this.draggedCell);

    this.draggedCell = null;
    this.draggedFromParent = null;
    this.dropTargetId = null;
  }

  onDragEnd(): void {
    this.draggedCell = null;
    this.draggedFromParent = null;
    this.dropTargetId = null;
    this.dropAtEndTarget = null;
  }

  onDropAtEnd(event: DragEvent, targetParentArray: Cell[]): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.draggedCell || !this.draggedFromParent) return;

    // Remove from original position
    const draggedIndex = this.draggedFromParent.indexOf(this.draggedCell);
    if (draggedIndex > -1) {
      this.draggedFromParent.splice(draggedIndex, 1);
    }

    // Add to end of list
    targetParentArray.push(this.draggedCell);

    this.draggedCell = null;
    this.draggedFromParent = null;
    this.dropTargetId = null;
    this.dropAtEndTarget = null;
  }

  getEndZoneId(prefix: string): string {
    return `${prefix}-end`;
  }

  addNewCell(parentArray: Cell[]): void {
    const newCell = CellSerializer.createEquationCell('');
    parentArray.push(newCell);
  }

  onCellKeyDown(event: KeyboardEvent, cell: Cell, parentArray: Cell[]): void {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.isCellEmpty(cell)) {
        event.preventDefault();
        this.deleteCell(cell, parentArray);
      }
    }
  }

  isCellEmpty(cell: Cell): boolean {
    switch (cell.type) {
      case 'equation':
        return !cell.latex || cell.latex.trim() === '';
      case 'note':
        return !cell.content || cell.content.trim() === '';
      case 'folder':
        return !cell.name || cell.name.trim() === '';
      default:
        return false;
    }
  }

  deleteCell(cell: Cell, parentArray: Cell[]): void {
    const index = parentArray.indexOf(cell);
    if (index === -1) return;

    // If it's a folder, move its children up
    if (cell.type === 'folder') {
      const folderCell = cell as FolderCell;
      // Remove the folder
      parentArray.splice(index, 1);
      // Insert all children at the same position
      parentArray.splice(index, 0, ...folderCell.cells);
    } else {
      // Just remove the cell
      parentArray.splice(index, 1);
    }
  }

  convertToFolder(cell: Cell, parentArray: Cell[]): void {
    const index = parentArray.indexOf(cell);
    if (index === -1) return;

    const folderCell = CellSerializer.createFolderCell('');
    folderCell.id = cell.id; // Keep the same ID
    folderCell.createdAt = cell.createdAt;
    folderCell.updatedAt = new Date();

    parentArray.splice(index, 1, folderCell);

    // Auto-expand the newly created folder
    this.expandedFolders.add(folderCell.id);
  }

  convertToNote(cell: Cell, parentArray: Cell[]): void {
    const index = parentArray.indexOf(cell);
    if (index === -1) return;

    const noteCell = CellSerializer.createNoteCell('');
    noteCell.id = cell.id; // Keep the same ID
    noteCell.createdAt = cell.createdAt;
    noteCell.updatedAt = new Date();

    parentArray.splice(index, 1, noteCell);
  }
}
