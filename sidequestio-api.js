// Supabase adapter for Sidequestio. The anon key is public by design; keep service-role keys out of client code.
var SIDEQUESTIO_SUPABASE_URL = "https://nweobflguknhrlxmpmbl.supabase.co";
var SIDEQUESTIO_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53ZW9iZmxndWtuaHJseG1wbWJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNTMyMDgsImV4cCI6MjA5NzgyOTIwOH0.rAlnufyBEu39RVUnvIR4sEtyg6g06LP13oCAlEc_rl0";

var SidequestioApi = (() => {
  if (!globalThis.supabase?.createClient) {
    console.warn("Supabase client did not load; Sidequestio will use local demo data.");
    return null;
  }

  const client = globalThis.supabase.createClient(SIDEQUESTIO_SUPABASE_URL, SIDEQUESTIO_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  async function getCurrentUser() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session?.user || null;
  }

  async function ensureUser() {
    const user = await getCurrentUser();
    if (!user) throw new Error("Log in first.");
    return user;
  }

  async function signUpWithPassword({ email, password, displayName }) {
    await client.auth.signOut();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: globalThis.location?.origin }
    });
    if (error) throw error;
    if (data.session && displayName?.trim()) await saveProfile(displayName);
    return { user: data.user, needsConfirmation: !data.session };
  }

  async function signInWithPassword({ email, password }) {
    await client.auth.signOut();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function getProfile() {
    const user = await ensureUser();
    const { data, error } = await client.from("profiles").select("id, display_name").eq("id", user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function saveProfile(displayName) {
    const user = await ensureUser();
    const cleanName = displayName.trim().replace(/\s+/g, " ").slice(0, 18);
    const { data, error } = await client.from("profiles").upsert({
      id: user.id,
      display_name: cleanName
    }, { onConflict: "id" }).select("id, display_name").single();
    if (error) throw error;
    return data;
  }

  async function getIdeas(sort = "hot") {
    let query = client.from("ideas_with_counts").select("*").eq("status", "active").limit(60);
    if (sort === "new") query = query.order("created_at", { ascending: false });
    else if (sort === "split") query = query.order("debate_score", { ascending: true }).order("created_at", { ascending: false });
    else query = query.order("hot_score", { ascending: false }).order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return data.map(normalizeIdeaRow);
  }

  async function getMyVotes() {
    const user = await getCurrentUser();
    if (!user) return {};
    const { data, error } = await client.from("votes").select("idea_id, vote").eq("user_id", user.id);
    if (error) throw error;
    return Object.fromEntries(data.map((row) => [row.idea_id, row.vote]));
  }

  async function createIdea({ title, description, tags }) {
    const user = await ensureUser();
    const { data, error } = await client.from("ideas").insert({
      user_id: user.id,
      title,
      description,
      tags,
      status: "active"
    }).select("id").single();
    if (error) throw error;
    return data;
  }

  async function reportIdea(ideaId, reason) {
    const user = await ensureUser();
    const { error } = await client.from("reports").insert({
      idea_id: ideaId,
      reporter_user_id: user.id,
      reason
    });
    if (error) throw error;
  }

  async function setVote(ideaId, vote) {
    const user = await ensureUser();
    if (!vote) {
      const { error } = await client.from("votes").delete().eq("idea_id", ideaId).eq("user_id", user.id);
      if (error) throw error;
      return;
    }

    const { error } = await client.from("votes").upsert({
      idea_id: ideaId,
      user_id: user.id,
      vote
    }, { onConflict: "idea_id,user_id" });
    if (error) throw error;
  }

  function normalizeIdeaRow(row) {
    return {
      id: row.id,
      title: row.title,
      description: row.description || "",
      category: row.tags?.[0] || "Wildcard",
      effort: row.tags?.[1] || "Low effort",
      tags: Array.isArray(row.tags) ? row.tags : [],
      createdAt: new Date(row.created_at).getTime(),
      userId: row.user_id || "",
      authorName: row.author_name || "guest",
      isMine: Boolean(row.is_mine),
      yes: Number(row.yes_count || 0),
      no: Number(row.no_count || 0)
    };
  }

  return { client, ensureUser, getCurrentUser, signUpWithPassword, signInWithPassword, signOut, getProfile, saveProfile, getIdeas, getMyVotes, createIdea, reportIdea, setVote };
})();

globalThis.SidequestioApi = SidequestioApi;
