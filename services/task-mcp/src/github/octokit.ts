import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";

const ExtendedOctokit = Octokit.plugin(retry, throttling);
export type GithubOctokit = InstanceType<typeof ExtendedOctokit>;

interface AppAuthEnv {
  GH_APP_ID?: string;
  GH_APP_INSTALLATION_ID?: string;
  GH_APP_PRIVATE_KEY?: string;
}

function hasAppAuth(env: NodeJS.ProcessEnv): env is Required<AppAuthEnv> {
  return Boolean(env.GH_APP_ID && env.GH_APP_INSTALLATION_ID && env.GH_APP_PRIVATE_KEY);
}

function normalizePrivateKey(key: string): string {
  return key.includes("-----BEGIN") ? key.replace(/\\n/g, "\n") : key;
}

export function createOctokit(): GithubOctokit {
  const env = process.env;

  const throttleHandlers = {
    onRateLimit: (retryAfter: number, options: any, _octokit: GithubOctokit, retryCount: number) => {
      if (retryCount < 3) {
        return true;
      }
      console.warn(`GitHub rate limit reached for ${options.method} ${options.url}`);
      return false;
    },
    onSecondaryRateLimit: (retryAfter: number, options: any) => {
      console.warn(`GitHub secondary rate limit triggered for ${options.method} ${options.url}`);
      return true;
    }
  };

  if (hasAppAuth(env)) {
    return new ExtendedOctokit({
      authStrategy: createAppAuth,
      auth: {
        appId: env.GH_APP_ID!,
        installationId: env.GH_APP_INSTALLATION_ID!,
        privateKey: normalizePrivateKey(env.GH_APP_PRIVATE_KEY!)
      },
      request: { timeout: 15000 },
      retry: { doNotRetry: [400, 401, 404] },
      throttle: throttleHandlers
    });
  }

  const token = env.GITHUB_TOKEN ?? env.PR_TOKEN;
  if (!token) {
    throw new Error("Missing GitHub credentials: provide GitHub App variables or GITHUB_TOKEN/PR_TOKEN");
  }

  return new ExtendedOctokit({
    auth: token,
    request: { timeout: 15000 },
    retry: { doNotRetry: [400, 401, 404] },
    throttle: throttleHandlers
  });
}
