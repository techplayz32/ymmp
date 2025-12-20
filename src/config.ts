import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface ConfigData {
  githubToken?: string;
  customPath?: string;
  lastUpdateCheck?: number;
}

export class ConfigManager {
  private configPath: string;
  private data: ConfigData;

  constructor() {
    this.configPath = path.join(os.homedir(), ".ymmp-config.json");
    this.data = this.load();
  }

  private load(): ConfigData {
    if (!fs.existsSync(this.configPath)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
    } catch {
      return {};
    }
  }

  public get<K extends keyof ConfigData>(key: K): ConfigData[K] {
    return this.data[key];
  }

  public set<K extends keyof ConfigData>(key: K, value: ConfigData[K]): void {
    this.data[key] = value;
    this.save();
  }

  private save(): void {
    fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2));
  }

  public getPath(): string {
    return this.configPath;
  }
}
