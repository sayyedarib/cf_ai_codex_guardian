/**
 * Thin GitHub REST client: just the three calls a review needs.
 * The token is optional; without it only public repos work (60 req/hour).
 */
import type { PullRequestRef } from "../shared/schemas";

const API = "https://api.github.com";

export interface PullRequestFile {
  path: string;
  status: string;
  /** Unified diff for the file. Missing for binary or very large files. */
  patch?: string;
}

export interface PullRequestData {
  title: string;
  headSha: string;
  files: PullRequestFile[];
  /** True if the PR has more files than we fetched. */
  truncated: boolean;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "GitHubError";
  }

  /** 4xx errors (except rate limits) won't succeed on retry. */
  get retryable(): boolean {
    return this.status >= 500 || this.status === 429 || this.status === 403;
  }
}

export class GitHubClient {
  constructor(
    private readonly token?: string,
    private readonly maxFiles = 60
  ) {}

  get canWrite(): boolean {
    return !!this.token;
  }

  async getPullRequest(pr: PullRequestRef): Promise<PullRequestData> {
    const base = `/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`;
    const meta = await this.request<{ title: string; head: { sha: string } }>(
      base
    );

    const files: PullRequestFile[] = [];
    const perPage = 100;
    for (let page = 1; files.length < this.maxFiles; page++) {
      const batch = await this.request<
        { filename: string; status: string; patch?: string }[]
      >(`${base}/files?per_page=${perPage}&page=${page}`);
      files.push(
        ...batch.map((f) => ({
          path: f.filename,
          status: f.status,
          patch: f.patch
        }))
      );
      if (batch.length < perPage) break;
    }

    return {
      title: meta.title,
      headSha: meta.head.sha,
      files: files.slice(0, this.maxFiles),
      truncated: files.length > this.maxFiles
    };
  }

  /** Posts a top-level PR comment and returns its URL. Requires a token. */
  async postComment(pr: PullRequestRef, body: string): Promise<string> {
    const comment = await this.request<{ html_url: string }>(
      `/repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments`,
      { method: "POST", body: JSON.stringify({ body }) }
    );
    return comment.html_url;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "codex-guardian",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (init.body) headers["Content-Type"] = "application/json";

    const res = await fetch(`${API}${path}`, { ...init, headers });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new GitHubError(
        `GitHub ${init.method ?? "GET"} ${path} failed (${res.status}): ${detail.slice(0, 200)}`,
        res.status
      );
    }
    return (await res.json()) as T;
  }
}
