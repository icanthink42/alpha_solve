"""
SymPy Tools for Alpha Solve

Provides utility functions for working with SymPy in Alpha Solve plugins.
This module is automatically loaded when a plugin uses the 'sympy' library.
"""

import re
from sympy import sympify, symbols, Eq, sqrt, sin, cos, tan, ln, log, exp, pi, E
from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application


def from_latex(latex_str: str):
    """
    Convert a LaTeX string to a SymPy expression.
    Custom parser that handles common LaTeX math notation without antlr4.

    Args:
        latex_str: LaTeX string representing a mathematical expression

    Returns:
        SymPy expression

    Example:
        >>> expr = from_latex(r"x^2 + 2x + 1")
        >>> expr
        x**2 + 2*x + 1
    """
    if not latex_str or not latex_str.strip():
        raise ValueError("Empty LaTeX string")

    # Remove extra whitespace
    latex_str = latex_str.strip()

    # Convert LaTeX to Python-like expression
    expr_str = _latex_to_sympy_str(latex_str)

    # Check if it's an equation (contains =)
    if '=' in expr_str:
        parts = expr_str.split('=', 1)
        left = parse_expr(parts[0], transformations=(standard_transformations + (implicit_multiplication_application,)))
        right = parse_expr(parts[1], transformations=(standard_transformations + (implicit_multiplication_application,)))
        return Eq(left, right)
    else:
        return parse_expr(expr_str, transformations=(standard_transformations + (implicit_multiplication_application,)))


def _latex_to_sympy_str(latex: str) -> str:
    """
    Convert LaTeX math notation to a SymPy-parseable string.
    """
    # Remove \left, \right, and other formatting commands
    latex = re.sub(r'\\left|\\right', '', latex)

    # Replace fractions: \frac{a}{b} -> (a)/(b)
    # Limit iterations to prevent infinite loops
    for _ in range(10):
        if r'\frac' not in latex:
            break
        latex = re.sub(r'\\frac\{([^{}]*)\}\{([^{}]*)\}', r'((\1)/(\2))', latex)

    # Replace square roots: \sqrt{x} -> sqrt(x)
    latex = re.sub(r'\\sqrt\{([^{}]*)\}', r'sqrt(\1)', latex)

    # Replace exponents: ^ -> **
    latex = latex.replace('^', '**')

    # Handle \cdot as multiplication
    latex = latex.replace(r'\cdot', '*')
    latex = latex.replace(r'\times', '*')

    # Handle common functions
    latex = re.sub(r'\\sin', 'sin', latex)
    latex = re.sub(r'\\cos', 'cos', latex)
    latex = re.sub(r'\\tan', 'tan', latex)
    latex = re.sub(r'\\ln', 'ln', latex)
    latex = re.sub(r'\\log', 'log', latex)
    latex = re.sub(r'\\exp', 'exp', latex)

    # Handle constants
    latex = re.sub(r'\\pi', 'pi', latex)
    latex = latex.replace('π', 'pi')
    latex = re.sub(r'\\e\b', 'E', latex)

    # Handle exponents with braces: x**{2} -> x**2
    latex = re.sub(r'\*\*\{([^{}]*)\}', r'**(\1)', latex)

    # Remove remaining backslashes for simple cases
    latex = re.sub(r'\\([a-zA-Z]+)', r'\1', latex)

    # Clean up spaces
    latex = latex.strip()

    return latex


def to_latex(expr):
    """
    Convert a SymPy expression to LaTeX string.

    Args:
        expr: SymPy expression

    Returns:
        LaTeX string representation

    Example:
        >>> from sympy import symbols
        >>> x = symbols('x')
        >>> expr = x**2 + 2*x + 1
        >>> to_latex(expr)
        'x^{2} + 2 x + 1'
    """
    from sympy import latex
    return latex(expr)

