import { Button, GithubIcon } from "spendchat";

export function Sizes() {
  return (
    <div className="flex items-center gap-4">
      <GithubIcon className="size-4" />
      <GithubIcon className="size-6" />
      <GithubIcon className="size-8" />
    </div>
  );
}

export function InButton() {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm">
        <GithubIcon />
        Star on GitHub
      </Button>
      <Button variant="ghost" size="icon" aria-label="GitHub">
        <GithubIcon />
      </Button>
    </div>
  );
}
