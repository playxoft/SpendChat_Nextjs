import { Logo } from "spendchat";

export function Default() {
  return <Logo />;
}

export function MarkOnly() {
  return <Logo showText={false} />;
}

export function Sizes() {
  return (
    <div className="flex flex-col gap-4">
      <Logo className="text-sm [&_svg]:size-5" />
      <Logo />
      <Logo className="text-xl [&_svg]:size-9" />
    </div>
  );
}
