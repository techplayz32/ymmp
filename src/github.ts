import axios from "axios";
import { ConfigManager } from "./config.js";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface ReleaseMetadata {
  name: string;
  published_at: string;
  assets: ReleaseAsset[];
}

export class GitHubService {
  private config: ConfigManager;

  constructor(config: ConfigManager) {
    this.config = config;
  }

  private getHeaders(tokenOverride?: string) {
    const token =
      tokenOverride ||
      this.config.get("githubToken") ||
      process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      "User-Agent": "YMMP-CLI/1.0.0",
      Accept: "application/vnd.github.v3+json",
    };

    if (token) {
      headers["Authorization"] = `token ${token}`;
    }
    return headers;
  }

  async getLatestRelease(tokenOverride?: string): Promise<ReleaseMetadata> {
    const url =
      "https://api.github.com/repos/TheKing-OfTime/YandexMusicModClient/releases/latest";
    try {
      const response = await axios.get(url, {
        headers: this.getHeaders(tokenOverride),
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 403) {
        throw new Error(
          "GitHub Rate Limit Exceeded. Run 'ymmp config set token <your_token>' or use --token.",
        );
      }
      if (error.response?.status === 404) {
        throw new Error(
          "Release not found. The repository might be private or changed.",
        );
      }
      throw error;
    }
  }

  async downloadStream(url: string, tokenOverride?: string) {
    return axios.get(url, {
      responseType: "stream",
      headers: this.getHeaders(tokenOverride),
    });
  }
}
