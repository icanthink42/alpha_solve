import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

declare const MathQuill: any;

@Component({
  selector: 'app-mathquill-input',
  imports: [],
  template: `
    <div class="mathquill-container">
      <div #mathquillField class="mathquill-input"></div>
    </div>
  `,
  styleUrl: './mathquill-input.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MathQuillInputComponent),
      multi: true,
    },
  ],
})
export class MathQuillInputComponent implements AfterViewInit, OnDestroy, ControlValueAccessor {
  @ViewChild('mathquillField', { static: false }) mathquillField!: ElementRef;
  @Input() latex: string = '';
  @Output() latexChange = new EventEmitter<string>();
  @Output() keydownEvent = new EventEmitter<KeyboardEvent>();

  private mathField: any;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private initAttempts = 0;
  private maxAttempts = 50;
  private isInitializing = true;

  ngAfterViewInit(): void {
    this.waitForMathQuillAndInitialize();
  }

  ngOnDestroy(): void {
    if (this.mathField) {
      this.mathField.revert();
    }
  }

  private waitForMathQuillAndInitialize(): void {
    if (typeof MathQuill !== 'undefined') {
      this.initializeMathQuill();
    } else if (this.initAttempts < this.maxAttempts) {
      this.initAttempts++;
      setTimeout(() => this.waitForMathQuillAndInitialize(), 100);
    } else {
      console.error('MathQuill failed to load after maximum attempts');
    }
  }

  private initializeMathQuill(): void {
    const MQ = MathQuill.getInterface(2);
    this.mathField = MQ.MathField(this.mathquillField.nativeElement, {
      spaceBehavesLikeTab: true,
      autoCommands: 'pi theta phi sigma alpha beta gamma delta epsilon zeta eta iota kappa lambda mu nu xi omicron rho tau upsilon chi psi omega sqrt sum prod int',
      autoOperatorNames: 'sin cos tan sec csc cot sinh cosh tanh sech csch coth arcsin arccos arctan arcsec arccsc arccot log ln lg exp det dim ker gcd lcm min max sup inf lim limsup liminf arg deg hom Pr',
      handlers: {
        edit: () => {
          if (this.isInitializing) {
            return;
          }
          const latex = this.mathField.latex();
          this.latex = latex;
          this.latexChange.emit(latex);
          this.onChange(latex);
        },
      },
    });

    if (this.latex) {
      this.mathField.latex(this.latex);
    }

    // Add keyboard event listener
    this.mathquillField.nativeElement.addEventListener('keydown', (event: KeyboardEvent) => {
      this.keydownEvent.emit(event);
    });

    // Allow changes after initialization is complete
    setTimeout(() => {
      this.isInitializing = false;
    }, 0);
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    this.latex = value || '';
    if (this.mathField) {
      this.mathField.latex(this.latex);
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    // Handle disabled state if needed
  }
}

