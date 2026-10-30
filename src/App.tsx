import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase } from "./lib/supabase";
import type { ConversationSummary, Filters, Message, NearbySitter, Point, Profile, SitterListing, Verdict } from "./lib/types";
import { errorText, getPosition, toast, useLocalState } from "./lib/util";
import { AuthScreen, NewPasswordScreen } from "./screens/Auth";
import { Onboarding } from "./screens/Onboarding";
import { SitterForm } from "./screens/SitterForm";
import { SwipeScreen } from "./screens/Swipe";
import { ExploreScreen } from "./screens/Explore";
import { ChatsScreen } from "./screens/Chats";
import { ChatScreen } from "./screens/Chat";
import { ProfileScreen } from "./screens/Profile";
import { FiltersBar } from "./components/FiltersBar";
import { SitterDetails, type SitterSummary } from "./components/SitterDetails";
import { AdminScreen } from "./screens/Admin";

export default function App() {
  return configured ? <Root /> : <SetupNeeded />;
}

function SetupNeeded() {
  return (
    <div className="screen center">
      <div className="auth">
        <h1 className="logo">בייבי<span>סוויפ</span></h1>
        <p className="lead">האפליקציה עוד לא מחוברת לשרת.</p>
        <p className="small">צריך להגדיר את VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY. ההוראות המלאות נמצאות ב-README.</p>
        <a className="primary" href="demo.html">לגרסת הדוגמה</a>
      </div>
    </div>
  );
}

function Root() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(false);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [listing, setListing] = useState<SitterListing | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  const load = useCallback(async () => {
    if (!uid) { setProfile(undefined); return; }
    const { data: p, error } = await supabase.from("profiles").select("id, role, display_name, verified_at").eq("id", uid).maybeSingle();
    if (error) { toast(errorText(error)); return; }
    if (p?.role === "sitter") {
      const { data: l } = await supabase.from("sitters").select("*").eq("id", uid).maybeSingle();
      setListing((l as SitterListing) ?? null);
    } else setListing(null);
    setProfile((p as Profile) ?? null);
  }, [uid]);
  useEffect(() => { load(); }, [load]);

  if (session === undefined) return <Splash />;
  if (recovery) return <NewPasswordScreen onDone={() => { setRecovery(false); toast("הסיסמה עודכנה"); }} />;
  if (!session) return <AuthScreen />;
  if (profile === undefined) return <Splash />;
  if (profile === null) {
    // Google sign-ins carry the person's name; email sign-ups start empty.
    const meta = session.user.user_metadata ?? {};
    const suggested = String(meta.full_name ?? meta.name ?? "").trim().split(/\s+/)[0] ?? "";
    return <Onboarding userId={session.user.id} suggestedName={suggested} onDone={load} />;
  }
  if (profile.role === "sitter" && !listing) {
    return <div className="screen scroll"><SitterForm userId={profile.id} name={profile.display_name} initial={null} onSaved={load} /></div>;
  }
  return <Main profile={profile} email={session.user.email ?? ""} listing={listing} reload={load} />;
}

function Splash() {
  return <div className="screen center"><h1 className="logo">בייבי<span>סוויפ</span></h1></div>;
}

type Tab = "swipe" | "map" | "chats" | "profile" | "admin";
interface Loc extends Point { label: string }
const DEFAULT_FILTERS: Filters = { maxKm: 5, maxPrice: 80, nowOnly: false, sort: "dist" };

function Main({ profile, email, listing, reload }: { profile: Profile; email: string; listing: SitterListing | null; reload: () => void }) {
  const isParent = profile.role === "parent";
  const [tab, setTab] = useState<Tab>(isParent ? "swipe" : "chats");
  const [loc, setLoc] = useLocalState<Loc | null>("bs:loc", null);
  const [filters, setFilters] = useLocalState<Filters>("bs:filters", DEFAULT_FILTERS);
  const [all, setAll] = useState<NearbySitter[]>([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [convs, setConvs] = useState<ConversationSummary[]>([]);
  const [open, setOpen] = useState<ConversationSummary | null>(null);
  const [savedVersion, setSavedVersion] = useState(0);
  const [details, setDetails] = useState<SitterSummary | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { supabase.rpc("is_admin").then(({ data }) => setIsAdmin(Boolean(data))); }, []);
  const openRef = useRef<string | null>(null);
  openRef.current = open?.id ?? null;

  // ---- search ----
  const search = useCallback(async () => {
    if (!isParent || !loc) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("nearby_sitters", {
      p_lat: loc.lat, p_lng: loc.lng, p_max_km: filters.maxKm, p_max_price: filters.maxPrice, p_now_only: false,
    });
    setLoading(false);
    if (error) { toast(errorText(error)); return; }
    setAll((data ?? []) as NearbySitter[]);
  }, [isParent, loc?.lat, loc?.lng, filters.maxKm, filters.maxPrice]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = window.setTimeout(search, 300); return () => window.clearTimeout(t); }, [search]);

  const deck = useMemo(() => all
    .filter((s) => !s.my_verdict && (!filters.nowOnly || s.available_now) && (!filters.verifiedOnly || s.verified))
    .sort((a, b) =>
      filters.sort === "price" ? a.hourly_price - b.hourly_price || a.distance_km - b.distance_km
      : filters.sort === "rating" ? (Number(b.rating_avg ?? 0) - Number(a.rating_avg ?? 0)) || b.rating_count - a.rating_count || a.distance_km - b.distance_km
      : a.distance_km - b.distance_km),
  [all, filters.nowOnly, filters.verifiedOnly, filters.sort]);
  const openDetails = (id: string) => { const s = all.find((x) => x.id === id); if (s) setDetails(s); };

  const setVerdictLocal = (id: string, v: Verdict | null) => setAll((list) => list.map((s) => (s.id === id ? { ...s, my_verdict: v } : s)));

  async function decide(id: string, v: Verdict) {
    setVerdictLocal(id, v);
    setHistory((h) => [...h.filter((x) => x !== id), id]);
    const { error } = await supabase.from("swipes").upsert({ parent_id: profile.id, sitter_id: id, verdict: v });
    if (error) { setVerdictLocal(id, null); toast(errorText(error)); return; }
    if (v === "like") { toast(`${all.find((s) => s.id === id)?.display_name ?? ""} נשמר/ה. אפשר לשלוח הודעה מ״שיחות״`); setSavedVersion((n) => n + 1); }
  }
  async function unsave(id: string) {
    const { error } = await supabase.from("swipes").delete().eq("parent_id", profile.id).eq("sitter_id", id);
    if (error) { toast(errorText(error)); return; }
    setVerdictLocal(id, null);
    setHistory((h) => h.filter((x) => x !== id));
  }
  async function undo() {
    const id = history[history.length - 1];
    if (!id) return;
    await unsave(id);
    setSavedVersion((n) => n + 1);
  }
  async function resetPasses() {
    const { error } = await supabase.from("swipes").delete().eq("parent_id", profile.id).eq("verdict", "pass");
    if (error) { toast(errorText(error)); return; }
    setHistory([]);
    search();
  }
  async function locate() {
    try {
      const p = await getPosition();
      setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, label: "המיקום הנוכחי שלך" });
    } catch {
      toast("אין גישה למיקום. בחרו את המיקום שלכם על המפה");
      setTab("map");
    }
  }
  useEffect(() => { if (isParent && !loc) locate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- conversations ----
  const refreshConvs = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_conversations");
    if (!error) setConvs((data ?? []) as ConversationSummary[]);
  }, []);
  useEffect(() => {
    refreshConvs();
    // RLS limits this stream to messages in the user's own conversations.
    const ch = supabase
      .channel("inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        refreshConvs();
        if (m.sender_id !== profile.id && openRef.current !== m.conversation_id) toast("הודעה חדשה");
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refreshConvs, profile.id]);

  async function messageSitter(id: string) {
    const s = all.find((x) => x.id === id);
    if (s && s.my_verdict !== "like") await decide(id, "like");
    const { data: convId, error } = await supabase.rpc("start_conversation", { p_sitter: id });
    if (error) { toast(errorText(error)); return; }
    const { data } = await supabase.rpc("my_conversations");
    const list = (data ?? []) as ConversationSummary[];
    setConvs(list);
    const c = list.find((x) => x.id === convId);
    if (c) { setOpen(c); setTab("chats"); }
  }

  const unread = convs.reduce((n, c) => n + c.unread, 0);
  const inChat = tab === "chats" && open;

  return (
    <div className={"app" + (inChat ? " in-chat" : "")} dir="rtl">
      {!inChat && (
        <header>
          <div className="brand">
            <h1 className="logo">בייבי<span>סוויפ</span></h1>
            {isParent && (
              <button className="chip-btn" type="button" onClick={locate}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
                <span className="loc-text">{loc?.label ?? "מצא אותי"}</span>
              </button>
            )}
          </div>
          {isParent && (tab === "swipe" || tab === "map") && (
            <FiltersBar filters={filters} onChange={setFilters} count={all.filter((s) => (!filters.nowOnly || s.available_now) && (!filters.verifiedOnly || s.verified)).length} />
          )}
        </header>
      )}
      <main>
        {tab === "swipe" && isParent && (
          <SwipeScreen deck={deck} loading={loading} hasLocation={!!loc} canUndo={history.length > 0}
            onDecide={decide} onUndo={undo} onLocate={locate} onResetPasses={resetPasses}
            hasPasses={all.some((s) => s.my_verdict === "pass")} onOpenDetails={openDetails}
            onOpenMap={(id) => { setSelected(id ?? null); setTab("map"); }} />
        )}
        {tab === "map" && isParent && (
          <ExploreScreen loc={loc} filters={filters} all={all} selectedId={selected} onSelect={setSelected}
            onSetLocation={(p) => { setLoc({ ...p, label: "נקודה שבחרתם על המפה" }); toast("המיקום עודכן"); }}
            onLike={(id) => decide(id, "like")} onMessage={messageSitter} onOpenDetails={openDetails} />
        )}
        {tab === "chats" && (open
          ? <ChatScreen key={open.id} conv={open} me={profile.id} onBack={() => setOpen(null)} onChanged={refreshConvs}
              onOpenReviews={open.other_role === "sitter" ? () => setDetails({ id: open.other_id, display_name: open.other_name }) : undefined} />
          : <ChatsScreen role={profile.role} convs={convs} onOpen={setOpen} onMessageSitter={messageSitter} onUnsave={unsave} savedVersion={savedVersion} />)}
        {tab === "profile" && <ProfileScreen profile={profile} email={email} listing={listing} verified={!!profile.verified_at} onChanged={reload} />}
        {tab === "admin" && isAdmin && <AdminScreen />}
      </main>
      {details && (
        <SitterDetails sitter={details} me={profile.id} role={profile.role} isAdmin={isAdmin} onClose={() => setDetails(null)}
          onMessage={isParent && !(tab === "chats" && open) ? () => { const id = details.id; setDetails(null); messageSitter(id); } : undefined} />
      )}
      {!inChat && (
        <nav className="tabs" role="tablist">
          {isParent && <TabButton tab="swipe" cur={tab} set={setTab} label="החלקה" icon={<><rect x="5" y="3" width="14" height="18" rx="3" /></>} />}
          {isParent && <TabButton tab="map" cur={tab} set={setTab} label="מפה" icon={<><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></>} />}
          <TabButton tab="chats" cur={tab} set={(t) => { setOpen(null); setTab(t); }} label="שיחות" badge={unread} icon={<path d="M4 5h16v11H9l-5 4z" />} />
          <TabButton tab="profile" cur={tab} set={setTab} label="פרופיל" icon={<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>} />
          {isAdmin && <TabButton tab="admin" cur={tab} set={setTab} label="ניהול" icon={<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />} />}
        </nav>
      )}
    </div>
  );
}

function TabButton({ tab, cur, set, label, icon, badge }: { tab: Tab; cur: Tab; set: (t: Tab) => void; label: string; icon: React.ReactNode; badge?: number }) {
  return (
    <button type="button" role="tab" aria-selected={tab === cur} onClick={() => set(tab)}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{icon}</svg>
      <span>{label}{badge ? <span className="count">{badge}</span> : null}</span>
    </button>
  );
}
