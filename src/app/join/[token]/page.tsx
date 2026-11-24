import { Logo } from "@/components/Logo";
import { AvatarStack } from "@/components/Avatar";
import { createClient } from "@/lib/supabase/server";
import { formatDateRange, roleLabel } from "@/lib/format";
import { JoinForm } from "./JoinForm";

type Preview = {
  trip_id: string;
  trip_name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  inviter_name: string | null;
  role: "editor" | "viewer";
  uses_left: number;
  member_names: (string | null)[];
  status: "ok" | "revoked" | "expired" | "used_up";
};

const STATUS_TEXT: Record<Exclude<Preview["status"], "ok">, string> = {
  revoked: "This invite link was turned off. Ask for a new one.",
  expired: "This invite link has expired. Ask for a new one.",
  used_up: "This invite link has been used up. Ask for a new one.",
};

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const [{ data: rows }, { data: auth }] = await Promise.all([
    supabase.rpc("get_invite_preview", { p_token: token }),
    supabase.auth.getUser(),
  ]);
  const invite = (rows as Preview[] | null)?.[0];

  let myName: string | null = null;
  let alreadyMember = false;
  if (auth.user && invite) {
    const [{ data: profile }, { data: membership }] = await Promise.all([
      supabase.from("profiles").select("name").eq("id", auth.user.id).maybeSingle(),
      supabase.from("trip_members").select("role").eq("trip_id", invite.trip_id).eq("user_id", auth.user.id).maybeSingle(),
    ]);
    myName = profile?.name ?? null;
    alreadyMember = !!membership;
  }

  return (
    <main className="flex min-h-dvh flex-col gap-7 px-6 pt-[calc(24px+env(safe-area-inset-top))] pb-10">
      <Logo />

      {!invite ? (
        <div className="mt-5 flex flex-col gap-2">
          <h1 className="text-[32px] leading-[1.05] font-bold tracking-[-0.02em]">Link not found</h1>
          <p className="text-[15px] text-muted">Check you copied the whole link, or ask for a new one.</p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-1.5">
            <span className="text-[15px] text-muted">{invite.inviter_name ?? "Someone"} invited you to</span>
            <h1 className="text-[40px] leading-none font-bold tracking-[-0.03em] break-words">{invite.trip_name}</h1>
            <span className="text-[15px] text-muted">
              {[invite.destination, formatDateRange(invite.start_date, invite.end_date)].filter(Boolean).join(" · ")}
            </span>
          </div>

          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5">
            <div className="flex items-center gap-2.5">
              <AvatarStack names={invite.member_names} ring="#FFFFFF" />
              <span className="text-sm">
                {invite.member_names.length} {invite.member_names.length === 1 ? "person" : "people"} in this trip
              </span>
            </div>
            <div className="flex justify-between border-t border-line pt-2.5 text-[13px] text-muted">
              <span>You&apos;ll join as</span>
              <span className="font-mono font-semibold text-ink">{roleLabel(invite.role)}</span>
            </div>
            <div className="flex justify-between text-[13px] text-muted">
              <span>Link</span>
              <span className="font-mono text-ink">
                {invite.status === "ok" ? `${invite.uses_left} ${invite.uses_left === 1 ? "use" : "uses"} left` : "not valid"}
              </span>
            </div>
          </div>

          {invite.status !== "ok" && !alreadyMember ? (
            <p className="mt-auto text-center text-sm text-pretty text-bad">{STATUS_TEXT[invite.status]}</p>
          ) : (
            <JoinForm
              token={token}
              tripId={invite.trip_id}
              tripName={invite.trip_name}
              defaultName={myName ?? ""}
              hasSession={!!auth.user}
              alreadyMember={alreadyMember}
            />
          )}
        </>
      )}
    </main>
  );
}
