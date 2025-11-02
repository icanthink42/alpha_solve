"""
Alpha Solve Python Library

This module provides Python classes that mirror the TypeScript models
used in the Alpha Solve application. Use these when writing plugin functions.
"""

from typing import List, Optional, Dict, Any
from dataclasses import dataclass, asdict
import json


@dataclass
class Variable:
    """
    Variable class representing a named value with a type
    """
    name: str
    type: str  # 'numerical' or 'analytical'
    value: str

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> 'Variable':
        """Create a Variable from a dictionary"""
        return Variable(
            name=data['name'],
            type=data['type'],
            value=data['value']
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert Variable to dictionary"""
        return asdict(self)

    @staticmethod
    def create_numerical(name: str, value: str) -> 'Variable':
        """Create a numerical variable"""
        return Variable(name=name, type='numerical', value=value)

    @staticmethod
    def create_analytical(name: str, value: str) -> 'Variable':
        """Create an analytical variable"""
        return Variable(name=name, type='analytical', value=value)


@dataclass
class Context:
    """
    Context object containing variables
    """
    variables: List[Variable]

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> 'Context':
        """Create a Context from a dictionary"""
        variables = [Variable.from_dict(v) for v in data.get('variables', [])]
        return Context(variables=variables)

    def to_dict(self) -> Dict[str, Any]:
        """Convert Context to dictionary"""
        return {
            'variables': [v.to_dict() for v in self.variables]
        }

    def get_variable(self, name: str) -> Optional[Variable]:
        """Get a variable by name"""
        for var in self.variables:
            if var.name == name:
                return var
        return None

    def add_variable(self, variable: Variable) -> None:
        """Add a variable to the context"""
        self.variables.append(variable)

    def remove_variable(self, name: str) -> bool:
        """Remove a variable by name"""
        for i, var in enumerate(self.variables):
            if var.name == name:
                self.variables.pop(i)
                return True
        return False


@dataclass
class CellFunctionInput:
    """
    Input structure passed to cell solution functions
    """
    cell: Dict[str, Any]
    context: Context

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> 'CellFunctionInput':
        """Create CellFunctionInput from a dictionary"""
        return CellFunctionInput(
            cell=data['cell'],
            context=Context.from_dict(data['context'])
        )

    @staticmethod
    def from_json(json_str: str) -> 'CellFunctionInput':
        """Create CellFunctionInput from a JSON string"""
        data = json.loads(json_str)
        return CellFunctionInput.from_dict(data)

    def to_dict(self) -> Dict[str, Any]:
        """Convert CellFunctionInput to dictionary"""
        return {
            'cell': self.cell,
            'context': self.context.to_dict()
        }


@dataclass
class CellFunctionResult:
    """
    Result returned from a cell solution function
    """
    visible_solutions: Optional[List[str]] = None
    new_context: Optional[Context] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert CellFunctionResult to dictionary"""
        result = {}
        if self.visible_solutions is not None:
            result['visible_solutions'] = self.visible_solutions
        if self.new_context is not None:
            result['new_context'] = self.new_context.to_dict()
        return result

    def to_json(self) -> str:
        """Convert CellFunctionResult to JSON string"""
        return json.dumps(self.to_dict())


@dataclass
class MetaFunctionResult:
    """
    Result returned from a meta function
    """
    index: int
    name: str
    use_result: bool = True

    def to_dict(self) -> Dict[str, Any]:
        """Convert MetaFunctionResult to dictionary"""
        return {
            'index': self.index,
            'name': self.name,
            'use_result': self.use_result
        }

    def to_json(self) -> str:
        """Convert MetaFunctionResult to JSON string"""
        return json.dumps(self.to_dict())


# Helper functions

def create_context(variables: Optional[List[Variable]] = None) -> Context:
    """Create a new context with optional variables"""
    return Context(variables=variables or [])


def parse_input(json_str: str) -> CellFunctionInput:
    """
    Parse JSON input string into CellFunctionInput
    This is the main function to use at the start of your plugin functions
    """
    return CellFunctionInput.from_json(json_str)

