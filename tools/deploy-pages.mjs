import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("status", "--porcelain", "--untracked-files=normal")) {
  throw new Error("Commit the reviewed changes before deploying an identifiable release.");
}
const commit = git("rev-parse", "HEAD");
const branch = git("branch", "--show-current");
const remoteCommit = branch && git("ls-remote", "--heads", "origin", `refs/heads/${branch}`).split(/\s+/)[0];
if (remoteCommit !== commit) throw new Error("Push this branch's current commit before deploying.");
execFileSync("npm", ["run", "build"], { stdio: "inherit" });
execFileSync("npx", ["wrangler", "pages", "deploy", "dist", "--project-name", "bookvideotoexam",
  "--branch", "main", "--commit-hash", commit, "--commit-dirty=false"], { stdio: "inherit" });
execFileSync(process.execPath, ["tools/verify-deployment.mjs", "https://bookvideotoexam.pages.dev", commit], { stdio: "inherit" });
