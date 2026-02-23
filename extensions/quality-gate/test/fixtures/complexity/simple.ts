/**
 * Simple TypeScript fixture for complexity analysis tests.
 *
 * This file contains straightforward functions with low cyclomatic complexity.
 */

export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export function isPositive(n: number): boolean {
  return n > 0;
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
