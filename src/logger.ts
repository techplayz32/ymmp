import chalk from "chalk";

type ChalkColor = (text: string) => string;

export class Logger {
  private scope: string;

  constructor(scope: string) {
    this.scope = scope;
  }

  private formatMessage(
    level: string,
    colorFn: ChalkColor,
    ...args: any[]
  ): void {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] [${level}] (${this.scope})`;
    // @ts-ignore - chalk types can be tricky with ESM/CJS interop in some setups
    console.log(colorFn(prefix), ...args);
  }

  log(...args: any[]): void {
    this.formatMessage("LOG", chalk.white, ...args);
  }

  info(...args: any[]): void {
    this.formatMessage("INFO", chalk.blue, ...args);
  }

  success(...args: any[]): void {
    this.formatMessage("SUCCESS", chalk.green, ...args);
  }

  warn(...args: any[]): void {
    this.formatMessage("WARN", chalk.yellow, ...args);
  }

  error(...args: any[]): void {
    this.formatMessage("ERROR", chalk.red, ...args);
  }

  debug(...args: any[]): void {
    if (process.env.DEBUG) {
      this.formatMessage("DEBUG", chalk.gray, ...args);
    }
  }
}
