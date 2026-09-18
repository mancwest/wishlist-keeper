import React, { useState, useEffect, useCallback, useRef } from "react";

const SUPABASE_URL = "https://tlkzuuovqqdvniytpgni.supabase.co";
const SUPABASE_KEY = "sb_publishable_5KM1-wSwj-00TlvCBJoMDw_iRselgOk";
const TABLE = "wishlist_items";

const PEOPLE = {
  tony: { name: "Tony", accent: "#128C7E", accent2: "#4FD1C5", emoji: "🌻" },
  sarah: { name: "Sarah", accent: "#D6336C", accent2: "#F783AC", emoji: "🌸" },
};
const OTHER = { tony: "sarah", sarah: "tony" };
const REFRESH_MS = 15000;

function normalizeLink(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "https://" + trimmed;
}

async function supa(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? " — " + text : ""}`);
  }
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [myItems, setMyItems] = useState([]);
  const [theirItems, setTheirItems] = useState([]);
  const [view, setView] = useState("mine");
  const [form, setForm] = useState({ name: "", link: "", note: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    setReady(true);
  }, []);

  const loadMine = useCallback(async (person) => {
    const rows = await supa(
      `${TABLE}?owner=eq.${person}&select=id,name,link,note,created_at&order=created_at.desc`
    );
    setMyItems(rows || []);
  }, []);

  const loadTheirs = useCallback(async (person) => {
    const rows = await supa(
      `${TABLE}?owner=eq.${person}&select=id,name,link,note,created_at,claimed_by&order=created_at.desc`
    );
    setTheirItems(rows || []);
  }, []);

  const refreshAll = useCallback(async () => {
    if (!currentUser) return;
    try {
      await Promise.all([loadMine(currentUser), loadTheirs(OTHER[currentUser])]);
      setError("");
    } catch (e) {
      setError("Couldn't reach the server — " + (e && e.message ? e.message : "unknown error"));
    }
  }, [currentUser, loadMine, loadTheirs]);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    refreshAll().finally(() => setLoading(false));
    pollRef.current = setInterval(refreshAll, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [currentUser, refreshAll]);

  function chooseUser(person) {
    setCurrentUser(person);
  }

  function switchUser() {
    setCurrentUser(null);
    setView("mine");
    setMyItems([]);
    setTheirItems([]);
  }

  async function addItem() {
    if (submitting) return;
    setError("");
    if (!form.name.trim()) {
      setError("Give it a name before adding it to your list.");
      return;
    }
    const payload = {
      owner: currentUser,
      name: form.name.trim(),
      link: normalizeLink(form.link),
      note: form.note.trim(),
    };
    setSubmitting(true);
    try {
      await supa(TABLE, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(payload),
      });
      setForm({ name: "", link: "", note: "" });
      await loadMine(currentUser);
    } catch (e) {
      setError("Couldn't save that — " + (e && e.message ? e.message : "unknown error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeItem(id) {
    try {
      await supa(`${TABLE}?id=eq.${id}`, { method: "DELETE" });
      setMyItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError("Couldn't remove that — " + (e && e.message ? e.message : "unknown error"));
    }
  }

  async function toggleClaim(item) {
    const isMine = item.claimed_by === currentUser;
    const patch = isMine
      ? { claimed_by: null, claimed_at: null }
      : { claimed_by: currentUser, claimed_at: new Date().toISOString() };
    setTheirItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, claimed_by: patch.claimed_by } : i))
    );
    try {
      await supa(`${TABLE}?id=eq.${item.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
    } catch (e) {
      setError("Couldn't save that change — " + (e && e.message ? e.message : "unknown error"));
      loadTheirs(OTHER[currentUser]);
    }
  }

  if (!ready) {
    return (
      <div style={styles.root}>
        <StyleBlock />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div style={styles.root}>
        <StyleBlock />
        <div style={styles.pickWrap}>
          <p style={styles.groovyRow}>☮️ 🌈 ✌️</p>
          <p style={styles.eyebrow}>wishlist keeper</p>
          <h1 style={styles.pickTitle}>Who's checking in, groovy one?</h1>
          <div style={styles.pickRow}>
            {Object.keys(PEOPLE).map((p) => (
              <button
                key={p}
                onClick={() => chooseUser(p)}
                style={{
                  ...styles.pickTile,
                  borderColor: PEOPLE[p].accent,
                  background: `linear-gradient(160deg, #fff 60%, ${PEOPLE[p].accent2}33)`,
                }}
              >
                <span style={styles.pickEmoji}>{PEOPLE[p].emoji}</span>
                <span style={{ ...styles.pickName, color: PEOPLE[p].accent }}>
                  {PEOPLE[p].name}
                </span>
              </button>
            ))}
          </div>
          <p style={styles.pickHint}>
            🤫 Your own list stays private to you until it's given. What you pick from
            the other list stays private from them.
          </p>
        </div>
      </div>
    );
  }

  const other = OTHER[currentUser];
  const list = view === "mine" ? myItems : theirItems;
  const me = PEOPLE[currentUser];
  const partner = PEOPLE[other];

  return (
    <div style={styles.root}>
      <StyleBlock />
      <div style={styles.app}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>{me.emoji} wishlist keeper</p>
            <h1 style={{ ...styles.name, color: me.accent }}>{me.name}</h1>
          </div>
          <button onClick={switchUser} style={styles.switchBtn}>
            🔄 switch
          </button>
        </header>

        <nav style={styles.tabs}>
          <button
            onClick={() => setView("mine")}
            style={{
              ...styles.tab,
              ...(view === "mine"
                ? { ...styles.tabActive, background: me.accent, color: "#fff" }
                : {}),
            }}
          >
            🎁 My list
          </button>
          <button
            onClick={() => setView("theirs")}
            style={{
              ...styles.tab,
              ...(view === "theirs"
                ? { ...styles.tabActive, background: partner.accent, color: "#fff" }
                : {}),
            }}
          >
            💝 {partner.name}'s list
          </button>
        </nav>

        {error && <p style={styles.errorText}>⚠️ {error}</p>}
        {loading && <p style={styles.emptyText}>✨ loading the good vibes…</p>}

        {!loading && view === "mine" && (
          <section>
            <div style={{ ...styles.form, borderColor: me.accent2 }}>
              <p style={styles.formLabel}>✨ Add something you'd like</p>
              <input
                style={styles.input}
                placeholder="What is it?"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                style={styles.input}
                placeholder="🔗 Link (optional)"
                value={form.link}
                onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
              />
              <input
                style={styles.input}
                placeholder="📝 Size, colour, anything to note (optional)"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addItem()}
              />
              <button
                type="button"
                onClick={addItem}
                disabled={submitting}
                style={{
                  ...styles.addBtn,
                  background: `linear-gradient(135deg, ${me.accent}, ${me.accent2})`,
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "✨ adding…" : "➕ Add to list"}
              </button>
            </div>

            {list.length === 0 ? (
              <p style={styles.emptyText}>
                🌼 Nothing on your list yet — add the first thing you're hoping for.
              </p>
            ) : (
              list.map((item) => (
                <div key={item.id} style={{ ...styles.row, borderLeftColor: me.accent }}>
                  <div style={styles.rowMain}>
                    <p style={styles.itemName}>🎁 {item.name}</p>
                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        style={{ ...styles.itemLink, color: me.accent }}
                      >
                        🔗 view link
                      </a>
                    )}
                    {item.note && <p style={styles.itemNote}>📝 {item.note}</p>}
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    style={styles.removeBtn}
                    title="Remove once you've received it"
                  >
                    📦 received
                  </button>
                </div>
              ))
            )}
          </section>
        )}

        {!loading && view === "theirs" && (
          <section>
            {list.length === 0 ? (
              <p style={styles.emptyText}>🌼 {partner.name} hasn't added anything yet.</p>
            ) : (
              list.map((item) => {
                const claimedByMe = item.claimed_by === currentUser;
                const claimedBySomeoneElse = item.claimed_by && item.claimed_by !== currentUser;
                return (
                  <div key={item.id} style={{ ...styles.row, borderLeftColor: partner.accent }}>
                    <div style={styles.rowMain}>
                      <p style={styles.itemName}>🎁 {item.name}</p>
                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          style={{ ...styles.itemLink, color: partner.accent }}
                        >
                          🔗 view link
                        </a>
                      )}
                      {item.note && <p style={styles.itemNote}>📝 {item.note}</p>}
                    </div>
                    <button
                      onClick={() => toggleClaim(item)}
                      disabled={claimedBySomeoneElse}
                      style={{
                        ...styles.claimBtn,
                        ...(claimedByMe
                          ? {
                              background: `linear-gradient(135deg, ${partner.accent}, ${partner.accent2})`,
                              color: "#fff",
                              borderColor: partner.accent,
                            }
                          : {}),
                        ...(claimedBySomeoneElse ? styles.claimBtnDisabled : {}),
                      }}
                    >
                      {claimedByMe ? "✅ you've got this" : claimedBySomeoneElse ? "🙅 spoken for" : "🎁 I'll get this"}
                    </button>
                  </div>
                );
              })
            )}
            <p style={styles.pickHint}>
              🤫 {partner.name} can't see what's claimed — pick freely.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function StyleBlock() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Quicksand:wght@400;500;600;700&display=swap');
    `}</style>
  );
}

const styles = {
  root: {
    minHeight: "100%",
    background:
      "radial-gradient(circle at 12% 18%, rgba(255,183,39,0.35), transparent 42%)," +
      "radial-gradient(circle at 88% 12%, rgba(214,51,108,0.28), transparent 42%)," +
      "radial-gradient(circle at 15% 88%, rgba(23,163,152,0.28), transparent 45%)," +
      "radial-gradient(circle at 92% 85%, rgba(108,63,166,0.25), transparent 45%)," +
      "#FFF8ED",
    fontFamily: "'Quicksand', sans-serif",
    color: "#3A2E1F",
    display: "flex",
    justifyContent: "center",
  },
  app: { width: "100%", maxWidth: 440, padding: "28px 20px 60px", boxSizing: "border-box" },
  pickWrap: { width: "100%", maxWidth: 440, padding: "48px 24px", boxSizing: "border-box", textAlign: "center" },
  groovyRow: { fontSize: 26, margin: "0 0 6px", letterSpacing: 4 },
  eyebrow: { fontSize: 13, letterSpacing: "0.04em", color: "#9C8A6B", margin: "0 0 4px", fontWeight: 600, textTransform: "uppercase" },
  pickTitle: { fontFamily: "'Fredoka', sans-serif", fontWeight: 600, fontSize: 30, margin: "0 0 28px", color: "#3A2E1F" },
  pickRow: { display: "flex", gap: 16, justifyContent: "center", marginBottom: 24 },
  pickTile: {
    flex: 1,
    padding: "26px 12px",
    borderRadius: 24,
    border: "2.5px solid",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 6px 0 rgba(0,0,0,0.06)",
  },
  pickEmoji: { fontSize: 34 },
  pickName: { fontFamily: "'Fredoka', sans-serif", fontSize: 20, fontWeight: 600 },
  pickHint: { fontSize: 13, color: "#9C8A6B", lineHeight: 1.6, marginTop: 18 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 },
  name: { fontFamily: "'Fredoka', sans-serif", fontWeight: 700, fontSize: 32, margin: "2px 0 0" },
  switchBtn: {
    background: "#fff",
    border: "2px solid #E8DFCB",
    color: "#6B5B3E",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    padding: "8px 14px",
    borderRadius: 999,
    fontFamily: "'Quicksand', sans-serif",
  },
  tabs: { display: "flex", gap: 10, marginBottom: 22, background: "#F3EAD6", padding: 6, borderRadius: 999 },
  tab: {
    flex: 1,
    background: "transparent",
    border: "none",
    borderRadius: 999,
    padding: "10px 8px",
    fontSize: 14,
    fontWeight: 600,
    color: "#8A7A5C",
    cursor: "pointer",
    fontFamily: "'Quicksand', sans-serif",
  },
  tabActive: { boxShadow: "0 3px 0 rgba(0,0,0,0.08)" },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 22,
    background: "#fff",
    border: "2px dashed",
    borderRadius: 20,
    padding: 16,
  },
  formLabel: { fontSize: 14, color: "#6B5B3E", margin: "0 0 2px", fontWeight: 700 },
  input: {
    border: "2px solid #EEE3CC",
    borderRadius: 14,
    background: "#FFFDF8",
    padding: "10px 14px",
    fontSize: 15,
    fontFamily: "'Quicksand', sans-serif",
    color: "#3A2E1F",
    outline: "none",
  },
  addBtn: {
    marginTop: 6,
    border: "none",
    color: "#fff",
    padding: "13px 16px",
    borderRadius: 999,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Fredoka', sans-serif",
    boxShadow: "0 4px 0 rgba(0,0,0,0.12)",
  },
  emptyText: { color: "#9C8A6B", fontSize: 14, lineHeight: 1.6, padding: "12px 0", textAlign: "center" },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: "16px 16px",
    marginBottom: 12,
    background: "#fff",
    borderRadius: 16,
    borderLeft: "6px solid",
    boxShadow: "0 3px 10px rgba(58,46,31,0.06)",
  },
  rowMain: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: 700, margin: "0 0 4px", fontFamily: "'Fredoka', sans-serif" },
  itemLink: { fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 4, fontWeight: 600 },
  itemNote: { fontSize: 13, color: "#8A7A5C", margin: 0, lineHeight: 1.5 },
  removeBtn: {
    flexShrink: 0,
    background: "#FFF8ED",
    border: "2px solid #EEE3CC",
    color: "#6B5B3E",
    borderRadius: 999,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Quicksand', sans-serif",
  },
  claimBtn: {
    flexShrink: 0,
    background: "#fff",
    border: "2px solid #EEE3CC",
    color: "#3A2E1F",
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Quicksand', sans-serif",
    whiteSpace: "nowrap",
  },
  claimBtnDisabled: { opacity: 0.5, cursor: "not-allowed" },
  errorText: { color: "#D6336C", fontSize: 13, marginBottom: 12, fontWeight: 600 },
};
