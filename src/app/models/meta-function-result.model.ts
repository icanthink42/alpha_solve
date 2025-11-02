/**
 * Result returned from a meta function
 */
export class MetaFunctionResult {
  index: number;
  name: string;
  useResult: boolean;

  constructor(index: number, name: string, useResult: boolean = true) {
    this.index = index;
    this.name = name;
    this.useResult = useResult;
  }

  /**
   * Deserialize MetaFunctionResult from JSON
   */
  static fromJSON(data: any): MetaFunctionResult {
    return new MetaFunctionResult(
      data.index,
      data.name,
      data.use_result !== undefined ? data.use_result : (data.useResult !== undefined ? data.useResult : true)
    );
  }

  /**
   * Serialize to JSON
   */
  toJSON(): object {
    return {
      index: this.index,
      name: this.name,
      useResult: this.useResult
    };
  }
}

