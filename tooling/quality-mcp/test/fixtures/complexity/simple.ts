export function add(a: number, b: number): number {
  return a + b;
}

export const normalize = (value: number): number => (value > 0 ? value : -value);

export class Greeter {
  constructor(private readonly name: string) {}

  greet(times: number): string {
    let message = '';
    for (let i = 0; i < times; i += 1) {
      message += `Hello ${this.name}`;
    }
    if (message.length === 0) {
      return 'Hello';
    }
    return message;
  }
}
