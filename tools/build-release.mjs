import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const release = {
  repository: "minwoo19930301/book-to-exam",
  commit: git("rev-parse", "HEAD"),
  sourceBranch: git("branch", "--show-current"),
  dirty: Boolean(git("status", "--porcelain", "--untracked-files=normal")),
  builtAt: new Date().toISOString(),
};
writeFileSync("public/release.json", JSON.stringify(release, null, 2) + "\n");
console.log(`Release ${release.commit.slice(0, 12)}${release.dirty ? " (local changes)" : ""}`);
