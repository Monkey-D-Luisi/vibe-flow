export function compare(a: number, b: number): string {
  switch (true) {
    case a > b:
      return 'greater';
    case a === b:
      return 'equal';
    default:
      return 'less';
  }
}

export function compute(value: number): number {
  let result = value;
  while (result > 0) {
    if (result % 2 === 0) {
      result -= 2;
    } else if (result % 3 === 0) {
      result -= 3;
    } else {
      result -= 1;
    }
  }
  return result;
}
