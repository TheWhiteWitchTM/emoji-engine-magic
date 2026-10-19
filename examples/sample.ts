function greet(name: string): string {
  return "Hello, " + name;
}

class Box {
  private n: number = 0;

  constructor(start: number) {
    this.n = start;
  }

  label(): string {
    return "n=" + this.n;
  }
}

const box = new Box(3);
console.log(greet("Ada"));
console.log(box.label());
