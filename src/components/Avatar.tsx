import { initials } from "@/lib/format";

type Props = {
  name: string | null;
  size?: number;
  /** Ring colour, used when avatars overlap in a stack. */
  ring?: string;
  className?: string;
};

export function Avatar({ name, size = 34, ring, className = "" }: Props) {
  return (
    <span
      className={`flex flex-none items-center justify-center rounded-full bg-ink font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
      title={name ?? undefined}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ names, max = 4, ring = "#F4F3EF" }: { names: (string | null)[]; max?: number; ring?: string }) {
  return (
    <span className="flex pl-2">
      {names.slice(0, max).map((n, i) => (
        <Avatar key={i} name={n} size={30} ring={ring} className="-ml-2" />
      ))}
    </span>
  );
}
