import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Sidebar } from "../components/layout/Sidebar";
import { SectionCard } from "../components/layout/SectionCard";
import { FormField } from "../components/forms/FormField";
import { PreviewPanel } from "../components/preview/PreviewPanel";
import { RichTextEditor } from "../components/forms/RichTextEditor";
import { useFirestoreSubscription } from "../hooks/useFirestoreSubscription";
import {
  collections,
  contentDocs,
  deleteTeam,
  deleteCollectionItem,
  deletePoster,
  deleteTestimonialVideo,
  restorePreviousState,
  saveTeam,
  saveCollectionItem,
  saveContentDoc,
  saveSettingsDoc,
  seedAdminContentIfNeeded,
  settingsDocs,
  subscribeActivity,
  subscribeCollection,
  subscribeTeams,
  subscribeVisibleTeams,
  subscribeContentDoc,
  subscribePosters,
  subscribeRuleVersions,
  subscribeSettingsDoc,
  subscribeSponsorLeads,
  subscribeVideos,
  updateTeamFields,
  updatePoster,
  updateRegistrationStatus,
  updateTestimonialVideo,
  uploadPosterImage,
  uploadTestimonialVideo
} from "../services/contentService";
import {
  defaultCategories,
  defaultEventsContent,
  defaultJudges,
  defaultRulesContent,
  defaultSeasonContent,
  defaultVotingContent
} from "../data/defaultContent";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function useDebouncedValue(value, delay = 220) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeoutId);
  }, [delay, value]);

  return debouncedValue;
}

function formatDate(value) {
  if (!value) return "-";
  if (typeof value?.toDate === "function") return value.toDate().toLocaleString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function promptOverwrite() {
  return true;
}

const CATEGORY_META = [
  { key: "adult-group", short: "AG", label: "Adult Group" },
  { key: "kids-group", short: "KG", label: "Kids Group" },
  { key: "kids-solo", short: "KS", label: "Kids Solo" },
  { key: "open-solo", short: "OS", label: "Open Solo" }
];

const DEFAULT_UI_CONTROLS = {
  showVotes: false,
  showLeaderboard: true,
  registrationOpen: true,
  showInterestButton: true,
  registrationClosedMessage: "AUDITIONS OPEN ON 20th APRIL",
};
const DEFAULT_EVENT_SIGNALS = { partyBlast: null };

function normalizeCategory(value) {
  const input = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  if (!input) return "";

  const found = CATEGORY_META.find((item) => item.key === input || item.short.toLowerCase() === input);
  return found?.key || input;
}

function resolveCategoryLabel(value) {
  const normalized = normalizeCategory(value);
  return CATEGORY_META.find((item) => item.key === normalized)?.label || String(value || "BOTD");
}

function rankTeams(teams = []) {
  return [...teams]
    .filter((team) => team.approved !== false)
    .filter((team) => team.isVisible !== false)
    .sort((left, right) => {
      const voteDifference = Number(right.votes || 0) - Number(left.votes || 0);
      if (voteDifference !== 0) return voteDifference;
      return String(left.name || "").localeCompare(String(right.name || ""));
    })
    .map((team, index) => ({ ...team, rank: index + 1, categoryLabel: resolveCategoryLabel(team.categoryId) }));
}

function buildLeaderboardColumns(teams = []) {
  return CATEGORY_META.map((category) => {
    const items = rankTeams(teams).filter((team) => normalizeCategory(team.categoryId) === category.key);
    return { ...category, items };
  });
}

function sortRows(rows, sortKey, direction) {
  const sorted = [...rows].sort((left, right) => {
    const leftValue = left?.[sortKey];
    const rightValue = right?.[sortKey];

    if (typeof leftValue === "number" || typeof rightValue === "number") {
      return Number(leftValue || 0) - Number(rightValue || 0);
    }

    return String(leftValue || "").localeCompare(String(rightValue || ""));
  });

  return direction === "asc" ? sorted : sorted.reverse();
}

function normalizeRegistrationStatus(value) {
  const input = String(value || "").toLowerCase();
  if (input === "approved" || input === "rejected" || input === "pending") {
    return input;
  }
  return "pending";
}

function getRegistrationFolderLabel(row) {
  return row?.folderName
    ? String(row.folderName).replace(/_/g, " ")
    : String(row?.name || "Registration");
}

function getRegistrationAssets(row) {
  const media = row?.media || {};
  const assets = [];

  if (row?.pdfUrl) {
    assets.push({
      key: "pdf",
      label: row.pdfName || "registration.pdf",
      url: row.pdfUrl,
      type: "PDF",
    });
  }

  if (row?.videoUrl) {
    assets.push({
      key: "video",
      label: media?.video?.name || "dance_video",
      url: row.videoUrl,
      type: "Video",
    });
  }

  if (row?.audioUrl) {
    assets.push({
      key: "audio",
      label: media?.audio?.name || "audio",
      url: row.audioUrl,
      type: "Audio",
    });
  }

  (media?.photos || []).forEach((item, index) => {
    if (!item?.url) return;
    assets.push({
      key: `photo-${index}`,
      label: item.name || `photo_${index + 1}`,
      url: item.url,
      type: "Photo",
    });
  });

  (media?.documents || []).forEach((item, index) => {
    if (!item?.url) return;
    assets.push({
      key: `document-${index}`,
      label: item.name || `document_${index + 1}`,
      url: item.url,
      type: "Document",
    });
  });

  return assets;
}

function groupRegistrationsByFolder(rows = []) {
  const grouped = rows.reduce((accumulator, item) => {
    const key = item.folderName || item.name || item.id;
    if (!accumulator[key]) {
      accumulator[key] = [];
    }
    accumulator[key].push(item);
    return accumulator;
  }, {});

  return Object.entries(grouped)
    .map(([folderKey, items]) => ({
      folderKey,
      folderLabel: getRegistrationFolderLabel(items[0]),
      items: [...items].sort((left, right) => {
        const leftSeconds = left?.createdAt?.seconds || 0;
        const rightSeconds = right?.createdAt?.seconds || 0;
        return rightSeconds - leftSeconds;
      }),
    }))
    .sort((left, right) => left.folderLabel.localeCompare(right.folderLabel));
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [activeSection, setActiveSection] = useState("season");
  const [snackbar, setSnackbar] = useState(null);
  const actor = user?.email || "admin";

  useEffect(() => {
    if (!snackbar) return undefined;
    const timeoutId = window.setTimeout(() => setSnackbar(null), 2800);
    return () => window.clearTimeout(timeoutId);
  }, [snackbar]);

  function notify(message, tone = "info") {
    setSnackbar({ id: Date.now(), message, tone });
  }

  const teamsState = useFirestoreSubscription(
    (onData, onError) => subscribeVisibleTeams(onData, onError),
    []
  );
  const activityState = useFirestoreSubscription(
    (onData, onError) => subscribeActivity(onData, onError),
    []
  );
  const uiControlsState = useFirestoreSubscription(
    (onData, onError) => subscribeSettingsDoc(settingsDocs.uiControls, DEFAULT_UI_CONTROLS, onData, onError),
    DEFAULT_UI_CONTROLS
  );
  const votingState = useFirestoreSubscription(
    (onData, onError) => subscribeContentDoc(contentDocs.voting, onData, onError),
    defaultVotingContent
  );

  useEffect(() => {
    seedAdminContentIfNeeded(actor).catch(() => {
      setSnackbar({ id: Date.now(), message: "Could not initialize admin data. Please try again.", tone: "error" });
    });
  }, [actor]);

  const rankedTeams = useMemo(() => rankTeams(teamsState.data || []), [teamsState.data]);
  const totalVotes = useMemo(
    () => rankedTeams.reduce((sum, team) => sum + Number(team.votes || 0), 0),
    [rankedTeams]
  );
  const visibilitySummary = useMemo(
    () => [
      uiControlsState.data?.showVotes ? "Votes live" : "Votes hidden",
      uiControlsState.data?.showLeaderboard ? "Leaderboard live" : "Leaderboard hidden",
      uiControlsState.data?.registrationOpen ? "Registration open" : "Registration closed",
      votingState.data?.votingOpen ? "Voting open" : "Voting closed"
    ],
    [uiControlsState.data, votingState.data]
  );

  return (
    <div className="dashboard-shell">
      <Sidebar activeSection={activeSection} onChange={setActiveSection} onLogout={logout} />
      <main className="dashboard-main page-fade-in">
        <header className="dashboard-header premium-header">
          <div>
            <p className="eyebrow">Admin Access</p>
            <h1>BOTD Control Panel</h1>
            <p className="muted">
              Manage live BOTD website content, voting controls, and submissions in real time.
            </p>
            <div className="header-status-row">
              {visibilitySummary.map((item) => (
                <span key={item} className="header-chip">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="header-badge">Signed in as {actor}</div>
        </header>

        <section className="stat-grid">
          <StatCard title="Teams" value={rankedTeams.length} detail="Approved and visible performers" loading={teamsState.loading} />
          <StatCard title="Votes" value={totalVotes} detail="Total verified votes" loading={teamsState.loading} />
          <StatCard title="Changes" value={(activityState.data || []).length} detail="Recent admin updates" loading={activityState.loading} />
          <StatCard title="Vote Count" value={uiControlsState.data?.showVotes ? "On" : "Off"} detail="Public display setting" loading={uiControlsState.loading} />
        </section>

        {activeSection === "season" ? <SeasonSection actor={actor} /> : null}
        {activeSection === "categories" ? <CategoriesSection actor={actor} /> : null}
        {activeSection === "teams" ? <TeamsJudgesSection actor={actor} notify={notify} /> : null}
        {activeSection === "events" ? <EventsSection actor={actor} /> : null}
        {activeSection === "posters" ? <PostersSection actor={actor} notify={notify} /> : null}
        {activeSection === "videos" ? <VideosSection actor={actor} notify={notify} /> : null}
        {activeSection === "registration" ? <RegistrationSection actor={actor} notify={notify} /> : null}
        {activeSection === "voting" ? <VotingSection actor={actor} notify={notify} /> : null}
        {activeSection === "sponsors" ? <SponsorsSection actor={actor} /> : null}
        {activeSection === "rules" ? <RulesSection actor={actor} /> : null}
        {activeSection === "data" ? <DataHubSection notify={notify} /> : null}
        {activeSection === "activity" ? <ActivitySection actor={actor} /> : null}
      </main>
      <Snackbar notice={snackbar} onDismiss={() => setSnackbar(null)} />
    </div>
  );
}

function SeasonSection({ actor }) {
  const { data, loading, error } = useFirestoreSubscription(
    (onData, onError) => subscribeContentDoc(contentDocs.season, onData, onError),
    defaultSeasonContent
  );
  const seasonsState = useFirestoreSubscription(
    (onData, onError) => subscribeCollection(collections.seasons, onData, onError),
    []
  );
  const [draft, setDraft] = useState(defaultSeasonContent);
  const [lastSaved, setLastSaved] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setDraft(clone(data));
  }, [data]);

  async function handleSave() {
    if (!promptOverwrite()) return;
    setSaving(true);
    try {
      await saveContentDoc(contentDocs.season, draft, actor, "Updated season page content", data);
      setLastSaved({ type: "doc", section: contentDocs.season, targetId: contentDocs.season, previousValue: data });
    } finally {
      setSaving(false);
    }
  }

  async function handleUndo() {
    if (!lastSaved?.previousValue) return;
    await restorePreviousState({ ...lastSaved, actor });
  }

  async function createSeasonSnapshot() {
    const seasonName = draft.hero?.title || `Season ${Date.now()}`;
    const snapshot = {
      id: `season-${Date.now()}`,
      name: seasonName,
      title: draft.hero?.title || seasonName,
      isActive: false,
      content: clone(draft)
    };
    await saveCollectionItem(collections.seasons, snapshot, actor, `Created season snapshot ${seasonName}`, null);
  }

  async function applySeasonSnapshot(snapshot) {
    if (!snapshot?.content) return;
    setDraft(clone(snapshot.content));
    await saveContentDoc(contentDocs.season, snapshot.content, actor, `Applied season snapshot ${snapshot.name}`, data);
    setLastSaved({ type: "doc", section: contentDocs.season, targetId: contentDocs.season, previousValue: data });
  }

  if (loading) return <SectionSkeleton blocks={2} />;
  if (error) return <div className="section-card form-error">{error}</div>;

  return (
    <SectionCard
      title="Season Page Control"
      subtitle="Refine the full season experience with per-field edits and live visual preview."
      actions={
        <>
          <button type="button" className="ghost-button" onClick={() => setDraft(clone(data || defaultSeasonContent))}>
            Cancel
          </button>
          <button type="button" className="ghost-button" onClick={handleUndo} disabled={!lastSaved}>
            Undo Last Change
          </button>
          <button type="button" className="primary-button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="ghost-button" onClick={createSeasonSnapshot}>
            Create Season
          </button>
        </>
      }
    >
      <div className="grid-two">
        <div className="stack-lg">
          <FormField label="Header Eyebrow">
            <input value={draft.hero.eyebrow} onChange={(event) => setDraft((current) => ({ ...current, hero: { ...current.hero, eyebrow: event.target.value } }))} />
          </FormField>
          <FormField label="Season Title">
            <input value={draft.hero.title} onChange={(event) => setDraft((current) => ({ ...current, hero: { ...current.hero, title: event.target.value } }))} />
          </FormField>
          <FormField label="Season Subtitle">
            <textarea rows={3} value={draft.hero.subtitle} onChange={(event) => setDraft((current) => ({ ...current, hero: { ...current.hero, subtitle: event.target.value } }))} />
          </FormField>
          <FormField label="Banner Image URL / Path">
            <input value={draft.hero.bannerImage} onChange={(event) => setDraft((current) => ({ ...current, hero: { ...current.hero, bannerImage: event.target.value } }))} />
          </FormField>
          <div className="stack-md">
            <div className="section-inline-head">
              <h3>Hero Meta Cards</h3>
              <span className="muted">Edit each label and value individually</span>
            </div>
            {draft.hero.meta.map((item, index) => (
              <div key={item.id} className="inline-edit-row">
                <input value={item.label} onChange={(event) => setDraft((current) => {
                  const next = clone(current.hero.meta);
                  next[index].label = event.target.value;
                  return { ...current, hero: { ...current.hero, meta: next } };
                })} />
                <input value={item.value} onChange={(event) => setDraft((current) => {
                  const next = clone(current.hero.meta);
                  next[index].value = event.target.value;
                  return { ...current, hero: { ...current.hero, meta: next } };
                })} />
              </div>
            ))}
          </div>
          <FormField label="About Season Title">
            <input value={draft.aboutBox.title} onChange={(event) => setDraft((current) => ({ ...current, aboutBox: { ...current.aboutBox, title: event.target.value } }))} />
          </FormField>
          <FormField label="About Season Content">
            <textarea rows={4} value={draft.aboutBox.content} onChange={(event) => setDraft((current) => ({ ...current, aboutBox: { ...current.aboutBox, content: event.target.value } }))} />
          </FormField>
          <div className="stack-md">
            <h3>Season Content Boxes</h3>
            {draft.categoryFeeBoxes.map((box, index) => (
              <div key={box.id} className="editor-block inset-card">
                <FormField label="Box Title">
                  <input value={box.title} onChange={(event) => setDraft((current) => {
                    const next = clone(current.categoryFeeBoxes);
                    next[index].title = event.target.value;
                    return { ...current, categoryFeeBoxes: next };
                  })} />
                </FormField>
                <FormField label="Description">
                  <textarea rows={2} value={box.description} onChange={(event) => setDraft((current) => {
                    const next = clone(current.categoryFeeBoxes);
                    next[index].description = event.target.value;
                    return { ...current, categoryFeeBoxes: next };
                  })} />
                </FormField>
                <FormField label="Image">
                  <input value={box.image} onChange={(event) => setDraft((current) => {
                    const next = clone(current.categoryFeeBoxes);
                    next[index].image = event.target.value;
                    return { ...current, categoryFeeBoxes: next };
                  })} />
                </FormField>
                <FormField label="Button Label">
                  <input value={box.buttonLabel} onChange={(event) => setDraft((current) => {
                    const next = clone(current.categoryFeeBoxes);
                    next[index].buttonLabel = event.target.value;
                    return { ...current, categoryFeeBoxes: next };
                  })} />
                </FormField>
                <FormField label="Button Link">
                  <input value={box.buttonHref} onChange={(event) => setDraft((current) => {
                    const next = clone(current.categoryFeeBoxes);
                    next[index].buttonHref = event.target.value;
                    return { ...current, categoryFeeBoxes: next };
                  })} />
                </FormField>
              </div>
            ))}
          </div>
        </div>
        <PreviewPanel title="Season Page Preview">
          <p className="preview-eyebrow">{draft.hero.eyebrow}</p>
          <h2>{draft.hero.title}</h2>
          <p>{draft.hero.subtitle}</p>
          <div className="preview-image">{draft.hero.bannerImage || "No banner set"}</div>
          <div className="preview-meta-grid">
            {draft.hero.meta.map((item) => (
              <div key={item.id} className="preview-meta-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          <h3>{draft.aboutBox.title}</h3>
          <p>{draft.aboutBox.content}</p>
        </PreviewPanel>
      </div>
      <div className="snapshot-strip">
        <div className="section-inline-head">
          <h3>Saved Seasons</h3>
          <span className="muted">{seasonsState.loading ? "Loading..." : `${seasonsState.data.length} saved`}</span>
        </div>
        <div className="snapshot-grid">
          {seasonsState.data.length ? seasonsState.data.map((season) => (
            <article key={season.id} className="snapshot-card">
              <strong>{season.name || season.title || "Untitled Season"}</strong>
              <span>{season.isActive ? "Active season" : "Saved season"}</span>
              <div className="button-row">
                <button type="button" className="mini-button" onClick={() => applySeasonSnapshot(season)}>
                  Apply
                </button>
                <button type="button" className="danger-button" onClick={() => deleteCollectionItem(collections.seasons, season, actor)}>
                  Delete
                </button>
              </div>
            </article>
          )) : <p className="muted">No data available.</p>}
        </div>
      </div>
    </SectionCard>
  );
}

function CategoriesSection({ actor }) {
  const { data, loading, error } = useFirestoreSubscription(
    (onData, onError) => subscribeCollection(collections.categories, onData, onError),
    defaultCategories
  );
  const [lastSaved, setLastSaved] = useState(null);

  async function saveItem(item, previousValue) {
    if (!promptOverwrite()) return;
    await saveCollectionItem(collections.categories, item, actor, `Updated category ${item.name}`, previousValue);
    setLastSaved({ type: "collection", section: collections.categories, targetId: item.id, previousValue });
  }

  async function addCategory() {
    const item = {
      id: `cat-${Date.now()}`,
      code: "NEW",
      name: "New Category",
      description: "",
      image: "",
      isActive: true
    };
    await saveCollectionItem(collections.categories, item, actor, "Added category", null);
  }

  async function removeCategory(item) {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    await deleteCollectionItem(collections.categories, item, actor);
  }

  if (loading) return <SectionSkeleton blocks={3} />;
  if (error) return <div className="section-card form-error">{error}</div>;

  return (
    <SectionCard
      title="Categories Management"
      subtitle="Control category naming, imagery, descriptions, and website visibility."
      actions={
        <>
          <button type="button" className="ghost-button" onClick={() => lastSaved && restorePreviousState({ ...lastSaved, actor })} disabled={!lastSaved}>
            Undo Last Change
          </button>
          <button type="button" className="primary-button" onClick={addCategory}>
            Add Category
          </button>
        </>
      }
    >
      <div className="stack-lg">
        {data.map((item) => (
          <EditableCollectionCard
            key={item.id}
            title={item.name}
            item={item}
            fields={[
              { key: "code", label: "Code" },
              { key: "name", label: "Category Name" },
              { key: "description", label: "Description", multiline: true },
              { key: "image", label: "Image" }
            ]}
            toggleField="isActive"
            toggleLabel="Visible on website"
            onSave={saveItem}
            onDelete={removeCategory}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function TeamsJudgesSection({ actor, notify }) {
  const teamsState = useFirestoreSubscription(
    (onData, onError) => subscribeTeams(onData, onError),
    []
  );
  const judgesState = useFirestoreSubscription(
    (onData, onError) => subscribeCollection(collections.judges, onData, onError),
    defaultJudges
  );
  const [lastSaved, setLastSaved] = useState(null);
  const [query, setQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [actionBusy, setActionBusy] = useState("");
  const debouncedQuery = useDebouncedValue(query);

  async function saveTeamItem(item, previousValue) {
    if (!promptOverwrite()) return;
    setActionBusy(`${item.id}:save`);
    try {
      await saveTeam(item, actor, `Updated team ${item.name}`, previousValue);
      setLastSaved({ type: "collection", section: collections.teams, targetId: item.id, previousValue });
      notify?.(`${item.name || "Team"} saved.`, "success");
    } catch (error) {
      notify?.(error?.message || "Failed to save team.", "error");
    } finally {
      setActionBusy("");
    }
  }

  async function addContestant() {
    const category = CATEGORY_META[0];
    const id = `team-${Date.now()}`;
    const item = {
      id,
      name: "New Team",
      city: "Bangalore",
      categoryId: category.short,
      image: "",
      bio: "",
      buttonLabel: "",
      buttonHref: "",
      votes: 0,
      sortOrder: (teamsState.data || []).length + 1,
      approved: true,
      isVisible: true
    };

    setActionBusy("add");
    try {
      await saveTeam(item, actor, "Added team", null);
      notify?.("New team added. Edit the details and save when ready.", "success");
    } catch (error) {
      notify?.("Could not add team. Please try again.", "error");
    } finally {
      setActionBusy("");
    }
  }

  async function toggleTeamField(item, field, value) {
    const busyKey = `${item.id}:${field}`;
    setActionBusy(busyKey);
    try {
      await updateTeamFields(
        item.id,
        { [field]: Boolean(value) },
        actor,
        `${field === "approved" ? "Updated approval for" : "Updated visibility for"} ${item.name}`,
        item
      );
      notify?.(`${item.name || "Team"} ${field === "approved" ? (value ? "approved" : "unapproved") : (value ? "visible" : "hidden")}.`, "success");
    } catch (error) {
      notify?.(error?.message || "Failed to update team.", "error");
    } finally {
      setActionBusy("");
    }
  }

  async function saveJudge(item, previousValue) {
    if (!promptOverwrite()) return;
    await saveCollectionItem(collections.judges, item, actor, `Updated judge ${item.name}`, previousValue);
    setLastSaved({ type: "collection", section: collections.judges, targetId: item.id, previousValue });
  }

  async function setAllTeamsVisibility(nextVisibility) {
    if (!promptOverwrite()) return;

    const items = teamsState.data || [];
    setActionBusy("bulk:visible");
    try {
      await Promise.all(
        items.map((item) =>
          updateTeamFields(
            item.id,
            { visible: nextVisibility },
            actor,
            `${nextVisibility ? "Unhid" : "Hid"} team ${item.name}`,
            item
          )
        )
      );
      notify?.(nextVisibility ? "All teams unhidden successfully." : "All teams hidden successfully.", "success");
    } catch (error) {
      notify?.(error?.message || "Failed to update all team visibility.", "error");
    } finally {
      setActionBusy("");
    }
  }

  async function removeTeam(item) {
    if (!window.confirm(`Delete ${item.name || "this team"}?`)) return;
    setActionBusy(`${item.id}:delete`);
    try {
      await deleteTeam(item, actor);
      notify?.(`${item.name || "Team"} deleted.`, "success");
    } catch (error) {
      notify?.(error?.message || "Failed to delete team.", "error");
    } finally {
      setActionBusy("");
    }
  }

  const groupedTeams = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase();
    return CATEGORY_META.map((category) => ({
      ...category,
      items: (teamsState.data || []).filter((item) => {
        const matchesCategory = normalizeCategory(item.categoryId) === category.key;
        const matchesQuery = !normalizedQuery || [item.name, item.city, item.categoryId]
          .some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
        const isVisible = item.isVisible !== false;
        const matchesVisibility = visibilityFilter === "all"
          ? true
          : visibilityFilter === "visible"
            ? isVisible
            : !isVisible;
        return matchesCategory && matchesQuery && matchesVisibility;
      })
    }));
  }, [teamsState.data, debouncedQuery, visibilityFilter]);

  const allTeamsVisible = useMemo(
    () => (teamsState.data || []).length > 0 && (teamsState.data || []).every((item) => item.isVisible !== false),
    [teamsState.data]
  );

  if (teamsState.loading || judgesState.loading) return <SectionSkeleton blocks={4} />;
  if (teamsState.error || judgesState.error) return <div className="section-card form-error">{teamsState.error || judgesState.error}</div>;

  return (
    <div className="stack-lg">
      <SectionCard
        title="Teams Control"
        subtitle="Edit every contestant individually, grouped by category for faster scanning."
        actions={
          <>
            <div className="table-toolbar">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search teams..."
                aria-label="Search teams"
              />
              <select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)} aria-label="Filter team visibility">
                <option value="all">All Teams</option>
                <option value="visible">Visible</option>
                <option value="hidden">Hidden</option>
              </select>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setAllTeamsVisibility(!allTeamsVisible)}
              disabled={!(teamsState.data || []).length || actionBusy === "bulk:visible"}
            >
              {actionBusy === "bulk:visible" ? "Updating..." : allTeamsVisible ? "Hide All Teams" : "Unhide All Teams"}
            </button>
            <button type="button" className="ghost-button" disabled={!lastSaved} onClick={() => lastSaved && restorePreviousState({ ...lastSaved, actor })}>
              Undo Last Change
            </button>
            <button type="button" className="primary-button" onClick={addContestant} disabled={actionBusy === "add"}>
              {actionBusy === "add" ? "Adding..." : "Add Contestant"}
            </button>
          </>
        }
      >
        <div className="stack-lg">
          {groupedTeams.map((group) => (
            <div key={group.key} className="stack-md">
              <div className="section-inline-head">
                <h3>{group.label}</h3>
                <span className="muted">{group.items.length} teams</span>
              </div>
              <div className="collection-grid">
                {group.items.map((item) => (
                  <EditableCollectionCard
                    key={item.id}
                    title={item.name}
                    item={item}
                    fields={[
                      { key: "name", label: "Name" },
                      { key: "city", label: "City" },
                      { key: "categoryId", label: "Category Code" },
                      { key: "image", label: "Image" },
                      { key: "bio", label: "Bio", multiline: true },
                      { key: "buttonLabel", label: "Button Label" },
                      { key: "buttonHref", label: "Button Link" },
                      { key: "votes", label: "Votes", type: "number" }
                    ]}
                    liveToggles={[
                      {
                        key: "approved",
                        label: "Approved",
                        checked: item.approved !== false,
                        disabled: actionBusy === `${item.id}:approved`,
                        onChange: (value) => toggleTeamField(item, "approved", value)
                      },
                      {
                        key: "visible",
                        label: "Show team on website",
                        checked: item.isVisible !== false,
                        disabled: actionBusy === `${item.id}:visible`,
                        onChange: (value) => toggleTeamField(item, "visible", value)
                      }
                    ]}
                    onSave={saveTeamItem}
                    onDelete={removeTeam}
                    saving={actionBusy === `${item.id}:save`}
                    deleting={actionBusy === `${item.id}:delete`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Judges Control" subtitle="Update judge name, designation, image, biography, and visibility.">
        <div className="collection-grid">
          {judgesState.data.map((item) => (
            <EditableCollectionCard
              key={item.id}
              title={item.name}
              item={item}
              fields={[
                { key: "name", label: "Name" },
                { key: "designation", label: "Designation" },
                { key: "image", label: "Image" },
                { key: "bio", label: "Bio", multiline: true }
              ]}
              toggleField="isVisible"
              toggleLabel="Visible on season page"
              onSave={saveJudge}
            />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function EventsSection({ actor }) {
  const { data, loading, error } = useFirestoreSubscription(
    (onData, onError) => subscribeContentDoc(contentDocs.events, onData, onError),
    defaultEventsContent
  );
  const [draft, setDraft] = useState(defaultEventsContent);
  const [lastSaved, setLastSaved] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setDraft(clone(data));
  }, [data]);

  async function save() {
    if (!promptOverwrite()) return;
    setSaving(true);
    try {
      await saveContentDoc(contentDocs.events, draft, actor, "Updated events page content", data);
      setLastSaved({ type: "doc", section: contentDocs.events, targetId: contentDocs.events, previousValue: data });
    } finally {
      setSaving(false);
    }
  }

  function moveStage(index, direction) {
    const next = clone(draft.stages);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= next.length) return;
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    next.forEach((item, orderIndex) => {
      item.order = orderIndex + 1;
    });
    setDraft((current) => ({ ...current, stages: next }));
  }

  if (loading) return <SectionSkeleton blocks={2} />;
  if (error) return <div className="section-card form-error">{error}</div>;

  return (
    <SectionCard
      title="Event Page Control"
      subtitle="Manage the hero, supporting banner, stage journey, ordering, and live notes."
      actions={
        <>
          <button type="button" className="ghost-button" onClick={() => setDraft(clone(data || defaultEventsContent))}>
            Cancel
          </button>
          <button type="button" className="ghost-button" onClick={() => lastSaved && restorePreviousState({ ...lastSaved, actor })} disabled={!lastSaved}>
            Undo Last Change
          </button>
          <button type="button" className="primary-button" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <div className="grid-two">
        <div className="stack-lg">
          <FormField label="Hero Title">
            <input value={draft.hero.title} onChange={(event) => setDraft((current) => ({ ...current, hero: { ...current.hero, title: event.target.value } }))} />
          </FormField>
          <FormField label="Hero Subtitle">
            <textarea rows={2} value={draft.hero.subtitle} onChange={(event) => setDraft((current) => ({ ...current, hero: { ...current.hero, subtitle: event.target.value } }))} />
          </FormField>
          <FormField label="Hero Description">
            <textarea rows={3} value={draft.hero.description} onChange={(event) => setDraft((current) => ({ ...current, hero: { ...current.hero, description: event.target.value } }))} />
          </FormField>
          <FormField label="Hero Image">
            <input value={draft.hero.image} onChange={(event) => setDraft((current) => ({ ...current, hero: { ...current.hero, image: event.target.value } }))} />
          </FormField>
          <div className="stack-md">
            <div className="section-inline-head">
              <h3>Stages</h3>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setDraft((current) => ({
                  ...current,
                  stages: [
                    ...current.stages,
                    {
                      id: `stage-${Date.now()}`,
                      order: current.stages.length + 1,
                      title: "New Stage",
                      description: "",
                      status: "Upcoming",
                      image: "",
                      enabled: true
                    }
                  ]
                }))}
              >
                Add Stage
              </button>
            </div>
            {draft.stages.map((stage, index) => (
              <div key={stage.id} className="editor-block inset-card">
                <div className="split-row">
                  <h4>{stage.title || `Stage ${index + 1}`}</h4>
                  <div className="button-row">
                    <button type="button" className="mini-button" onClick={() => moveStage(index, -1)}>
                      Up
                    </button>
                    <button type="button" className="mini-button" onClick={() => moveStage(index, 1)}>
                      Down
                    </button>
                  </div>
                </div>
                <FormField label="Stage Title">
                  <input value={stage.title} onChange={(event) => setDraft((current) => {
                    const next = clone(current.stages);
                    next[index].title = event.target.value;
                    return { ...current, stages: next };
                  })} />
                </FormField>
                <FormField label="Description">
                  <textarea rows={3} value={stage.description} onChange={(event) => setDraft((current) => {
                    const next = clone(current.stages);
                    next[index].description = event.target.value;
                    return { ...current, stages: next };
                  })} />
                </FormField>
                <FormField label="Status">
                  <input value={stage.status} onChange={(event) => setDraft((current) => {
                    const next = clone(current.stages);
                    next[index].status = event.target.value;
                    return { ...current, stages: next };
                  })} />
                </FormField>
                <FormField label="Media Image">
                  <input value={stage.image} onChange={(event) => setDraft((current) => {
                    const next = clone(current.stages);
                    next[index].image = event.target.value;
                    return { ...current, stages: next };
                  })} />
                </FormField>
                <label className="checkbox-field">
                  <input type="checkbox" checked={stage.enabled} onChange={(event) => setDraft((current) => {
                    const next = clone(current.stages);
                    next[index].enabled = event.target.checked;
                    return { ...current, stages: next };
                  })} />
                  <span>Enabled on website</span>
                </label>
              </div>
            ))}
          </div>
        </div>
        <PreviewPanel title="Event Journey Preview">
          <h2>{draft.hero.title}</h2>
          <p>{draft.hero.subtitle}</p>
          <div className="preview-stage-list">
            {draft.stages.filter((stage) => stage.enabled).map((stage) => (
              <div key={stage.id} className="preview-stage">
                <strong>{stage.order}. {stage.title}</strong>
                <span>{stage.status}</span>
                <p>{stage.description}</p>
              </div>
            ))}
          </div>
        </PreviewPanel>
      </div>
    </SectionCard>
  );
}

function PostersSection({ actor, notify }) {
  const { data, loading, error } = useFirestoreSubscription(
    (onData, onError) => subscribePosters(onData, onError),
    []
  );
  const [posterFiles, setPosterFiles] = useState([]);
  const [posterOrder, setPosterOrder] = useState(1);
  const [posterActive, setPosterActive] = useState(true);
  const [busyId, setBusyId] = useState("");
  const posters = data || [];

  useEffect(() => {
    const nextOrder = posters.length
      ? Math.max(...posters.map((item) => Number(item.order || 0))) + 1
      : 1;
    setPosterOrder(nextOrder);
  }, [posters]);

  async function handleUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!posterFiles.length) {
      notify?.("Choose one or more poster images before uploading.", "error");
      return;
    }

    setBusyId("upload");
    try {
      await Promise.all(
        posterFiles.map((file, index) =>
          uploadPosterImage(file, {
            actor,
            order: Number(posterOrder || 1) + index,
            isActive: posterActive
          })
        )
      );
      setPosterFiles([]);
      form.reset();
      notify?.(`${posterFiles.length} poster${posterFiles.length > 1 ? "s" : ""} uploaded successfully.`, "success");
    } catch (uploadError) {
      notify?.(uploadError.message || "Poster upload failed.", "error");
    } finally {
      setBusyId("");
    }
  }

  async function handlePosterUpdate(item, partial) {
    setBusyId(item.id);
    try {
      await updatePoster({ ...item, ...partial }, actor, item);
      notify?.("Poster updated.", "success");
    } catch (updateError) {
      notify?.(updateError.message || "Poster update failed.", "error");
    } finally {
      setBusyId("");
    }
  }

  async function handleDelete(item) {
    if (!window.confirm("Delete this poster?")) {
      return;
    }

    setBusyId(item.id);
    try {
      await deletePoster(item, actor);
      notify?.("Poster deleted.", "success");
    } catch (deleteError) {
      notify?.(deleteError.message || "Poster delete failed.", "error");
    } finally {
      setBusyId("");
    }
  }

  if (loading) return <SectionSkeleton blocks={2} />;
  if (error) return <div className="section-card form-error">{error}</div>;

  return (
    <div className="stack-lg">
      <SectionCard
        title="Event Poster Management"
        subtitle="Upload one or many posters and arrange the Events page vertical slider."
      >
        <form className="poster-upload-card" onSubmit={handleUpload}>
          <FormField label="Poster Images">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setPosterFiles(Array.from(event.target.files || []))}
            />
          </FormField>
          <FormField label="Display Order">
            <input
              type="number"
              min="1"
              value={posterOrder}
              onChange={(event) => setPosterOrder(Number(event.target.value || 1))}
            />
          </FormField>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={posterActive}
              onChange={(event) => setPosterActive(event.target.checked)}
            />
            <span>Active on website</span>
          </label>
          <button type="submit" className="primary-button" disabled={busyId === "upload"}>
            {busyId === "upload" ? "Uploading..." : posterFiles.length > 1 ? `Upload ${posterFiles.length} Posters` : "Upload Poster"}
          </button>
          {posterFiles.length ? (
            <p className="muted poster-upload-summary">
              Selected: {posterFiles.map((file) => file.name).join(", ")}
            </p>
          ) : null}
        </form>
      </SectionCard>

      <SectionCard
        title="Live Posters"
        subtitle="Upload, hide, show, and reorder event posters."
      >
        <div className="poster-admin-grid">
          {posters.length ? posters.map((item) => (
            <article key={item.id} className="poster-admin-card">
              <img src={item.imageUrl} alt="BOTD event poster" loading="lazy" />
              <div className="poster-admin-body">
                <div>
                  <strong>{item.originalName || item.id}</strong>
                  <p className="muted">{item.isActive !== false ? "Active" : "Hidden"} · Order {Number(item.order || 0)}</p>
                </div>
                <FormField label="Order">
                  <input
                    type="number"
                    min="1"
                    defaultValue={Number(item.order || 0)}
                    onBlur={(event) => {
                      const nextOrder = Number(event.target.value || 0);
                      if (nextOrder !== Number(item.order || 0)) {
                        handlePosterUpdate(item, { order: nextOrder });
                      }
                    }}
                  />
                </FormField>
                <div className="button-row">
                  <button
                    type="button"
                    className={`switch ${item.isActive !== false ? "is-on" : ""}`}
                    onClick={() => handlePosterUpdate(item, { isActive: item.isActive === false })}
                    disabled={busyId === item.id}
                    aria-pressed={item.isActive !== false}
                    title="Toggle poster visibility"
                  >
                    <span className="switch-thumb" />
                  </button>
                  <span className="muted">{item.isActive !== false ? "Visible" : "Hidden"}</span>
                </div>
                <div className="button-row">
                  <a className="ghost-button" href={item.imageUrl} target="_blank" rel="noreferrer">
                    View
                  </a>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => handleDelete(item)}
                    disabled={busyId === item.id}
                  >
                    {busyId === item.id ? "Working..." : "Delete"}
                  </button>
                </div>
              </div>
            </article>
          )) : (
            <p className="muted">No data available.</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function VideosSection({ actor, notify }) {
  const { data, loading, error } = useFirestoreSubscription(
    (onData, onError) => subscribeVideos(onData, onError),
    []
  );
  const [videoFiles, setVideoFiles] = useState([]);
  const [videoOrder, setVideoOrder] = useState(1);
  const [videoActive, setVideoActive] = useState(true);
  const [busyId, setBusyId] = useState("");
  const videos = data || [];

  useEffect(() => {
    const nextOrder = videos.length
      ? Math.max(...videos.map((item) => Number(item.order || 0))) + 1
      : 1;
    setVideoOrder(nextOrder);
  }, [videos]);

  async function handleUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!videoFiles.length) {
      notify?.("Choose one or more testimonial videos before uploading.", "error");
      return;
    }

    setBusyId("upload");
    try {
      await Promise.all(
        videoFiles.map((file, index) =>
          uploadTestimonialVideo(file, {
            actor,
            order: Number(videoOrder || 1) + index,
            isActive: videoActive
          })
        )
      );
      setVideoFiles([]);
      form.reset();
      notify?.(`${videoFiles.length} video${videoFiles.length > 1 ? "s" : ""} uploaded successfully.`, "success");
    } catch (uploadError) {
      notify?.(uploadError.message || "Video upload failed.", "error");
    } finally {
      setBusyId("");
    }
  }

  async function handleVideoUpdate(item, partial) {
    setBusyId(item.id);
    try {
      await updateTestimonialVideo({ ...item, ...partial }, actor, item);
      notify?.("Video updated.", "success");
    } catch (updateError) {
      notify?.(updateError.message || "Video update failed.", "error");
    } finally {
      setBusyId("");
    }
  }

  async function handleDelete(item) {
    if (!window.confirm("Delete this testimonial video?")) {
      return;
    }

    setBusyId(item.id);
    try {
      await deleteTestimonialVideo(item, actor);
      notify?.("Video deleted.", "success");
    } catch (deleteError) {
      notify?.(deleteError.message || "Video delete failed.", "error");
    } finally {
      setBusyId("");
    }
  }

  if (loading) return <SectionSkeleton blocks={2} />;
  if (error) return <div className="section-card form-error">{error}</div>;

  return (
    <div className="stack-lg">
      <SectionCard
        title="Manage Testimonials Videos"
        subtitle="Upload and arrange videos shown in the About page testimonial slider."
      >
        <form className="poster-upload-card" onSubmit={handleUpload}>
          <FormField label="Testimonial Videos">
            <input
              type="file"
              accept="video/mp4,video/*"
              multiple
              onChange={(event) => setVideoFiles(Array.from(event.target.files || []))}
            />
          </FormField>
          <FormField label="Display Order">
            <input
              type="number"
              min="1"
              value={videoOrder}
              onChange={(event) => setVideoOrder(Number(event.target.value || 1))}
            />
          </FormField>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={videoActive}
              onChange={(event) => setVideoActive(event.target.checked)}
            />
            <span>Active on website</span>
          </label>
          <button type="submit" className="primary-button" disabled={busyId === "upload"}>
            {busyId === "upload" ? "Uploading..." : videoFiles.length > 1 ? `Upload ${videoFiles.length} Videos` : "Upload Video"}
          </button>
          {videoFiles.length ? (
            <p className="muted poster-upload-summary">
              Selected: {videoFiles.map((file) => file.name).join(", ")}
            </p>
          ) : null}
        </form>
      </SectionCard>

      <SectionCard
        title="Live Testimonial Videos"
        subtitle="Upload, hide, show, and reorder testimonial videos."
      >
        <div className="poster-admin-grid">
          {videos.length ? videos.map((item) => (
            <article key={item.id} className="poster-admin-card video-admin-card">
              <video src={item.videoUrl} controls preload="metadata" />
              <div className="poster-admin-body">
                <div>
                  <strong>{item.originalName || item.id}</strong>
                  <p className="muted">{item.isActive !== false ? "Active" : "Hidden"} · Order {Number(item.order || 0)}</p>
                </div>
                <FormField label="Order">
                  <input
                    type="number"
                    min="1"
                    defaultValue={Number(item.order || 0)}
                    onBlur={(event) => {
                      const nextOrder = Number(event.target.value || 0);
                      if (nextOrder !== Number(item.order || 0)) {
                        handleVideoUpdate(item, { order: nextOrder });
                      }
                    }}
                  />
                </FormField>
                <div className="button-row">
                  <button
                    type="button"
                    className={`switch ${item.isActive !== false ? "is-on" : ""}`}
                    onClick={() => handleVideoUpdate(item, { isActive: item.isActive === false })}
                    disabled={busyId === item.id}
                    aria-pressed={item.isActive !== false}
                    title="Toggle video visibility"
                  >
                    <span className="switch-thumb" />
                  </button>
                  <span className="muted">{item.isActive !== false ? "Visible" : "Hidden"}</span>
                </div>
                <div className="button-row">
                  <a className="ghost-button" href={item.videoUrl} target="_blank" rel="noreferrer">
                    View
                  </a>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => handleDelete(item)}
                    disabled={busyId === item.id}
                  >
                    {busyId === item.id ? "Working..." : "Delete"}
                  </button>
                </div>
              </div>
            </article>
          )) : (
            <p className="muted">No data available.</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function RegistrationSection({ actor, notify }) {
  const uiControlsState = useFirestoreSubscription(
    (onData, onError) => subscribeSettingsDoc(settingsDocs.uiControls, DEFAULT_UI_CONTROLS, onData, onError),
    DEFAULT_UI_CONTROLS
  );
  const interestState = useFirestoreSubscription(
    (onData, onError) => subscribeCollection(collections.registrationInterest, onData, onError),
    []
  );
  const [controlSaving, setControlSaving] = useState("");
  const interestEntries = interestState.data || [];

  async function updateRegistrationPortal(registrationOpen) {
    if (!window.confirm(`Are you sure you want to ${registrationOpen ? "open" : "close"} the registration portal on the live website?`)) {
      return;
    }

    setControlSaving("registrationOpen");
    try {
      await saveSettingsDoc(
        settingsDocs.uiControls,
        { ...uiControlsState.data, registrationOpen },
        actor,
        `Updated registrationOpen`,
        uiControlsState.data
      );
      notify?.(`Registration portal ${registrationOpen ? "opened" : "closed"}.`, "success");
    } finally {
      setControlSaving("");
    }
  }

  async function updateInterestButton(showInterestButton) {
    if (!window.confirm(`Are you sure you want to ${showInterestButton ? "show" : "hide"} the I'm Interested button on the live website?`)) {
      return;
    }

    setControlSaving("showInterestButton");
    try {
      await saveSettingsDoc(
        settingsDocs.uiControls,
        { ...uiControlsState.data, showInterestButton },
        actor,
        `Updated showInterestButton`,
        uiControlsState.data
      );
      notify?.(`I'm Interested button ${showInterestButton ? "shown" : "hidden"}.`, "success");
    } finally {
      setControlSaving("");
    }
  }

  if (uiControlsState.loading || interestState.loading) {
    return <SectionSkeleton blocks={2} />;
  }

  if (uiControlsState.error || interestState.error) {
    return <div className="section-card form-error">{uiControlsState.error || interestState.error}</div>;
  }

  return (
    <SectionCard
      title="Registration Controls"
      subtitle="Open or close the public registration portal independently from voting controls."
    >
      <div className="grid-two">
        <div className="stack-lg">
          <RealtimeControlCard
            label="Registration Portal"
            description="Enable or disable the public registration form instantly."
            checked={Boolean(uiControlsState.data?.registrationOpen)}
            loading={controlSaving === "registrationOpen"}
            onChange={updateRegistrationPortal}
          />
          <RealtimeControlCard
            label="I'm Interested Button"
            description="Show or hide the interest button below the registration payment action."
            checked={uiControlsState.data?.showInterestButton !== false}
            loading={controlSaving === "showInterestButton"}
            onChange={updateInterestButton}
          />
        </div>
        <PreviewPanel title="Registration Status Preview">
          <div className={`status-chip ${uiControlsState.data?.registrationOpen ? "is-open" : "is-closed"}`}>
            {uiControlsState.data?.registrationOpen ? "Registration Open" : "Registration Closed"}
          </div>
          <div className={`status-chip ${uiControlsState.data?.showInterestButton !== false ? "is-open" : "is-closed"}`}>
            {interestEntries.length} Interested
          </div>
          <p>
            {uiControlsState.data?.registrationOpen
              ? "The website registration form is enabled for participants."
              : (uiControlsState.data?.registrationClosedMessage || "AUDITIONS OPEN ON 20th APRIL")}
          </p>
          <p>
            {uiControlsState.data?.showInterestButton !== false
              ? "The interest button is visible on the registration page."
              : "The interest button is hidden from the registration page."}
          </p>
        </PreviewPanel>
      </div>
    </SectionCard>
  );
}

function VotingSection({ actor, notify }) {
  const votingDocState = useFirestoreSubscription(
    (onData, onError) => subscribeContentDoc(contentDocs.voting, onData, onError),
    defaultVotingContent
  );
  const uiControlsState = useFirestoreSubscription(
    (onData, onError) => subscribeSettingsDoc(settingsDocs.uiControls, DEFAULT_UI_CONTROLS, onData, onError),
    DEFAULT_UI_CONTROLS
  );
  const eventSignalsState = useFirestoreSubscription(
    (onData, onError) => subscribeSettingsDoc(settingsDocs.events, DEFAULT_EVENT_SIGNALS, onData, onError),
    DEFAULT_EVENT_SIGNALS
  );
  const teamsState = useFirestoreSubscription(
    (onData, onError) => subscribeVisibleTeams(onData, onError),
    []
  );
  const [draft, setDraft] = useState(defaultVotingContent);
  const [lastSaved, setLastSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [controlSaving, setControlSaving] = useState("");
  const [partyBusy, setPartyBusy] = useState(false);

  useEffect(() => {
    if (votingDocState.data) setDraft(clone(votingDocState.data));
  }, [votingDocState.data]);

  const rankedTeams = useMemo(() => rankTeams(teamsState.data || []), [teamsState.data]);
  const leaderboardColumns = useMemo(() => buildLeaderboardColumns(teamsState.data || []), [teamsState.data]);
  const leaderboardRows = useMemo(() => {
    const rowCount = Math.max(...leaderboardColumns.map((column) => column.items.length), 0);
    return Array.from({ length: rowCount }, (_, index) => ({
      rank: index + 1,
      items: leaderboardColumns.map((column) => column.items[index] || null)
    }));
  }, [leaderboardColumns]);

  async function saveVotingDoc() {
    if (!promptOverwrite()) return;
    setSaving(true);
    try {
      await saveContentDoc(contentDocs.voting, draft, actor, "Updated voting page content", votingDocState.data);
      setLastSaved({ type: "doc", section: contentDocs.voting, targetId: contentDocs.voting, previousValue: votingDocState.data });
      notify?.("Voting page content saved successfully.", "success");
    } finally {
      setSaving(false);
    }
  }

  async function toggleUiControl(key, value) {
    const labelMap = {
      showVotes: "vote counts",
      showLeaderboard: "leaderboard",
      registrationOpen: "registration portal",
    };
    const label = labelMap[key] || "website setting";
    if (!window.confirm(`Are you sure you want to ${value ? "show" : "hide"} ${label} on the live website?`)) {
      return;
    }
    setControlSaving(key);
    try {
      await saveSettingsDoc(
        settingsDocs.uiControls,
        { ...uiControlsState.data, [key]: value },
        actor,
        `Updated ${key}`,
        uiControlsState.data
      );
      notify?.(`${label.charAt(0).toUpperCase() + label.slice(1)} ${value ? "enabled" : "hidden"}.`, "success");
    } finally {
      setControlSaving("");
    }
  }

  async function handlePartyBlast() {
    setPartyBusy(true);
    try {
      await saveSettingsDoc(
        settingsDocs.events,
        { ...eventSignalsState.data, partyBlast: Date.now() },
        actor,
        "Triggered celebration blast",
        eventSignalsState.data
      );
      notify?.("Celebration event triggered.", "success");
      window.setTimeout(() => setPartyBusy(false), 1400);
    } catch (error) {
      setPartyBusy(false);
      notify?.(error.message || "Unable to trigger celebration.", "error");
      throw error;
    }
  }

  if (votingDocState.loading || uiControlsState.loading || teamsState.loading || eventSignalsState.loading) {
    return <SectionSkeleton blocks={4} />;
  }

  if (votingDocState.error || uiControlsState.error || teamsState.error || eventSignalsState.error) {
    return <div className="section-card form-error">{votingDocState.error || uiControlsState.error || teamsState.error || eventSignalsState.error}</div>;
  }

  return (
    <div className="stack-lg">
      <SectionCard
        title="Voting Controls"
        subtitle="Control live vote display, leaderboard visibility, celebration triggers, and page messaging in real time."
        actions={
          <>
            <button type="button" className="ghost-button" onClick={() => setDraft(clone(votingDocState.data || defaultVotingContent))}>
              Cancel
            </button>
            <button type="button" className="ghost-button" disabled={!lastSaved} onClick={() => lastSaved && restorePreviousState({ ...lastSaved, actor })}>
              Undo Last Change
            </button>
            <button type="button" className="primary-button" onClick={saveVotingDoc} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </>
        }
      >
        <div className="grid-two">
          <div className="stack-lg">
            <div className="control-grid">
              <RealtimeControlCard
                label="Show Vote Count"
                description="Turn live vote totals on or off across the website."
                checked={Boolean(uiControlsState.data?.showVotes)}
                loading={controlSaving === "showVotes"}
                onChange={(value) => toggleUiControl("showVotes", value)}
              />
              <RealtimeControlCard
                label="Show Leaderboard"
                description="Make the public leaderboard visible or hide it instantly."
                checked={uiControlsState.data?.showLeaderboard !== false}
                loading={controlSaving === "showLeaderboard"}
                onChange={(value) => toggleUiControl("showLeaderboard", value)}
              />
              <button type="button" className={`celebration-button ${partyBusy ? "is-firing" : ""}`} onClick={handlePartyBlast} disabled={partyBusy}>
                {partyBusy ? "Celebration Triggered" : "Trigger Celebration"}
              </button>
            </div>

            <label className="toggle-row">
              <span>Main Voting Switch</span>
              <input type="checkbox" checked={Boolean(draft.votingOpen)} onChange={(event) => setDraft((current) => ({ ...current, votingOpen: event.target.checked }))} />
            </label>
            <FormField label="Hero Title">
              <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
            </FormField>
            <FormField label="Hero Subtitle">
              <textarea rows={2} value={draft.subtitle} onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))} />
            </FormField>
            <FormField label="Voting Closed Message">
              <textarea rows={3} value={draft.closedMessage} onChange={(event) => setDraft((current) => ({ ...current, closedMessage: event.target.value }))} />
            </FormField>
            <FormField label="Voting Rules Text">
              <textarea rows={4} value={draft.rulesText} onChange={(event) => setDraft((current) => ({ ...current, rulesText: event.target.value }))} />
            </FormField>
            <FormField label="Announcement">
              <textarea rows={3} value={draft.announcement} onChange={(event) => setDraft((current) => ({ ...current, announcement: event.target.value }))} />
            </FormField>
          </div>
          <PreviewPanel title="Voting Status Preview">
            <h2>{draft.title}</h2>
            <p>{draft.subtitle}</p>
            <div className={`status-chip ${draft.votingOpen ? "is-open" : "is-closed"}`}>
              {draft.votingOpen ? "Voting Open" : "Voting Closed"}
            </div>
            <p>{draft.votingOpen ? draft.rulesText : draft.closedMessage}</p>
            {draft.announcement ? <p className="announcement-box">{draft.announcement}</p> : null}
            <div className="preview-meta-grid">
              <div className="preview-meta-card">
                <span>Vote Count</span>
                <strong>{uiControlsState.data?.showVotes ? "Visible" : "Hidden"}</strong>
              </div>
              <div className="preview-meta-card">
                <span>Leaderboard</span>
                <strong>{uiControlsState.data?.showLeaderboard ? "Visible" : "Hidden"}</strong>
              </div>
            </div>
          </PreviewPanel>
        </div>
      </SectionCard>

      <SectionCard title="Votes Management" subtitle="Live rankings sorted by vote count and highlighted for the top 3.">
        <div className="votes-board">
          {rankedTeams.length ? rankedTeams.map((team) => (
            <article key={team.id} className={`vote-rank-card ${team.rank <= 3 ? `is-top-${team.rank}` : ""}`}>
              <div className="vote-rank-badge">#{team.rank}</div>
              <div className="vote-rank-copy">
                <strong>{team.name}</strong>
                <span>{team.categoryLabel}</span>
              </div>
              <div className="vote-rank-count">{Number(team.votes || 0)}</div>
            </article>
          )) : <p className="muted">No data available.</p>}
        </div>
      </SectionCard>

      <SectionCard title="Leaderboard Preview" subtitle="Grouped category rankings shown on the website.">
        {rankedTeams.length ? (
          <>
            <div className="leaderboard-preview-grid">
              {leaderboardColumns.map((column) => (
                <div key={column.key} className="leaderboard-preview-column">
                  <div className="leaderboard-preview-head">{column.label}</div>
                  <div className="stack-sm">
                    {column.items.slice(0, 5).map((item) => (
                      <div key={item.id} className={`leaderboard-preview-card ${item.rank <= 3 ? "is-featured" : ""}`}>
                        <span className="leaderboard-preview-rank">#{item.rank}</span>
                        <strong>{item.name}</strong>
                        <small>{Number(item.votes || 0)} votes</small>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="leaderboard-matrix-wrap">
              <div className="leaderboard-matrix">
                <div className="leaderboard-matrix-header">
                  <div className="leaderboard-matrix-rank">Rank</div>
                  {leaderboardColumns.map((column) => (
                    <div key={column.key} className="leaderboard-matrix-cell head">
                      {column.label}
                    </div>
                  ))}
                </div>
                {leaderboardRows.map((row) => (
                  <div key={row.rank} className={`leaderboard-matrix-row ${row.rank <= 3 ? "is-top-row" : ""}`}>
                    <div className="leaderboard-matrix-rank">
                      <span>#{row.rank}</span>
                    </div>
                    {row.items.map((item, index) => (
                      <div key={`${row.rank}-${leaderboardColumns[index].key}`} className={`leaderboard-matrix-cell ${item ? "" : "is-empty"}`}>
                        {item ? (
                          <>
                            <strong>{item.name}</strong>
                            <small>{Number(item.votes || 0)} votes</small>
                          </>
                        ) : (
                          <span>-</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="muted">No data available.</p>
        )}
      </SectionCard>
    </div>
  );
}

function SponsorsSection({ actor }) {
  const { data, loading, error } = useFirestoreSubscription(
    (onData, onError) => subscribeCollection(collections.sponsors, onData, onError),
    []
  );
  const [lastSaved, setLastSaved] = useState(null);

  const sponsorItems = useMemo(
    () => (data || [])
      .filter((item) => item.recordType !== "lead")
      .map((item, index) => ({
        id: item.id,
        name: item.name || "",
        logo: item.logo || item.image || "",
        isVisible: item.isVisible ?? item.visible ?? true,
        order: Number(item.order ?? item.sortOrder ?? index + 1)
      }))
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0)),
    [data]
  );

  async function saveItem(item, previousValue) {
    if (!promptOverwrite()) return;
    const nextItem = {
      id: item.id,
      name: item.name || "Untitled Sponsor",
      logo: item.logo || "",
      isVisible: item.isVisible !== false,
      order: Number(item.order || 0)
    };
    await saveCollectionItem(collections.sponsors, nextItem, actor, `Updated sponsor ${nextItem.name}`, previousValue);
    setLastSaved({ type: "collection", section: collections.sponsors, targetId: item.id, previousValue });
  }

  async function addSponsor() {
    const item = {
      id: `sponsor-${Date.now()}`,
      name: "New Sponsor",
      logo: "",
      isVisible: true,
      order: sponsorItems.length + 1
    };
    await saveCollectionItem(collections.sponsors, item, actor, "Added sponsor", null);
  }

  async function removeSponsor(item) {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    await deleteCollectionItem(collections.sponsors, item, actor);
  }

  async function reorder(item, direction) {
    const index = sponsorItems.findIndex((entry) => entry.id === item.id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= sponsorItems.length) return;
    const next = clone(sponsorItems);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    await Promise.all(
      next.map((entry, position) =>
        saveCollectionItem(
          collections.sponsors,
          {
            id: entry.id,
            name: entry.name || "Untitled Sponsor",
            logo: entry.logo || "",
            isVisible: entry.isVisible !== false,
            order: position + 1
          },
          actor,
          `Reordered sponsor ${entry.name}`,
          sponsorItems.find((itemData) => itemData.id === entry.id)
        )
      )
    );
  }

  async function setAllVisibility(isVisible) {
    if (!window.confirm(`${isVisible ? "Unhide" : "Hide"} all sponsors?`)) return;
    await Promise.all(
      sponsorItems.map((item) =>
        saveCollectionItem(
          collections.sponsors,
          {
            id: item.id,
            name: item.name || "Untitled Sponsor",
            logo: item.logo || "",
            isVisible,
            order: Number(item.order || 0)
          },
          actor,
          `${isVisible ? "Unhid" : "Hid"} sponsor ${item.name}`,
          item
        )
      )
    );
  }

  if (loading) return <SectionSkeleton blocks={3} />;
  if (error) return <div className="section-card form-error">{error}</div>;

  return (
    <SectionCard
      title="Sponsors Management"
      subtitle="Add, hide, show, delete, and reorder sponsor logos on the website."
      actions={
        <>
          <button type="button" className="ghost-button" disabled={!lastSaved} onClick={() => lastSaved && restorePreviousState({ ...lastSaved, actor })}>
            Undo Last Change
          </button>
          <button type="button" className="ghost-button" onClick={() => setAllVisibility(false)} disabled={!sponsorItems.length}>
            Hide All
          </button>
          <button type="button" className="ghost-button" onClick={() => setAllVisibility(true)} disabled={!sponsorItems.length}>
            Unhide All
          </button>
          <button type="button" className="primary-button" onClick={addSponsor}>
            Add Sponsor
          </button>
        </>
      }
    >
      <div className="stack-lg">
        <div className="admin-sponsor-summary">
          <span>Total: {sponsorItems.length}</span>
          <span>Visible: {sponsorItems.filter((item) => item.isVisible !== false).length}</span>
          <span>Hidden: {sponsorItems.filter((item) => item.isVisible === false).length}</span>
        </div>

        {sponsorItems.length ? sponsorItems.map((item) => (
          <div key={item.id} className="admin-sponsor-card">
            <div className="admin-sponsor-preview">
              {item.logo ? <img src={item.logo} alt={`${item.name} logo`} /> : <span>{String(item.name || "SP").slice(0, 2).toUpperCase()}</span>}
            </div>
            <EditableCollectionCard
              title={`${item.name || "Untitled Sponsor"} - ${item.isVisible !== false ? "Visible" : "Hidden"} - Order ${item.order || 0}`}
              item={item}
              fields={[
                { key: "name", label: "Sponsor Name" },
                { key: "logo", label: "Logo Image URL" },
                { key: "order", label: "Order", type: "number" }
              ]}
              toggleField="isVisible"
              toggleLabel="Visible on sponsors page"
              onSave={saveItem}
              onDelete={removeSponsor}
              extraActions={
                <>
                  <button type="button" className="mini-button" onClick={() => saveItem({ ...item, isVisible: item.isVisible === false }, item)}>
                    {item.isVisible !== false ? "Hide" : "Unhide"}
                  </button>
                  <button type="button" className="mini-button" onClick={() => reorder(item, -1)}>
                    Up
                  </button>
                  <button type="button" className="mini-button" onClick={() => reorder(item, 1)}>
                    Down
                  </button>
                </>
              }
            />
          </div>
        )) : (
          <p className="muted">No data available.</p>
        )}
      </div>
    </SectionCard>
  );
}

function RulesSection({ actor }) {
  const rulesState = useFirestoreSubscription(
    (onData, onError) => subscribeContentDoc(contentDocs.rules, onData, onError),
    defaultRulesContent
  );
  const versionsState = useFirestoreSubscription(
    (onData, onError) => subscribeRuleVersions(onData, onError),
    []
  );
  const [draft, setDraft] = useState(defaultRulesContent);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    if (rulesState.data) setDraft(clone(rulesState.data));
  }, [rulesState.data]);

  async function save() {
    if (!promptOverwrite()) return;
    await saveContentDoc(
      contentDocs.rules,
      { ...draft, currentVersion: Number(draft.currentVersion || 1) + 1 },
      actor,
      "Updated rules and regulations",
      rulesState.data
    );
    setLastSaved({ type: "doc", section: contentDocs.rules, targetId: contentDocs.rules, previousValue: rulesState.data });
  }

  if (rulesState.loading) return <SectionSkeleton blocks={2} />;
  if (rulesState.error) return <div className="section-card form-error">{rulesState.error}</div>;

  return (
    <SectionCard
      title="Rules & Regulations"
      subtitle="Rich text editing with saved history to prevent accidental loss."
      actions={
        <>
          <button type="button" className="ghost-button" onClick={() => setDraft(clone(rulesState.data || defaultRulesContent))}>
            Cancel
          </button>
          <button type="button" className="ghost-button" disabled={!lastSaved} onClick={() => lastSaved && restorePreviousState({ ...lastSaved, actor })}>
            Undo Last Change
          </button>
          <button type="button" className="primary-button" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="grid-two">
        <div className="stack-lg">
          <FormField label="Rules Title">
            <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
          </FormField>
          <RichTextEditor value={draft.content} onChange={(value) => setDraft((current) => ({ ...current, content: value }))} />
          <FormField label="Rulebook PDF URL">
            <input value={draft.rulebookUrl || ""} onChange={(event) => setDraft((current) => ({ ...current, rulebookUrl: event.target.value }))} />
          </FormField>
        </div>
        <div className="stack-lg">
          <PreviewPanel title={`Rules Preview v${draft.currentVersion || 1}`}>
            <h2>{draft.title}</h2>
            <div dangerouslySetInnerHTML={{ __html: draft.content }} />
          </PreviewPanel>
          <div className="section-card inset-card">
            <h3>Saved Versions</h3>
            <div className="stack-sm">
              {versionsState.data.map((item) => (
                <div key={item.id} className="log-row">
                  <strong>v{item.version}</strong>
                  <span>{formatDate(item.createdAt)}</span>
                  <span>{item.createdBy || "-"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function DataHubSection({ notify }) {
  const { user } = useAuth();
  const actor = user?.email || "admin";
  const registrationsState = useFirestoreSubscription(
    (onData, onError) => subscribeCollection(collections.registrations, onData, onError),
    []
  );
  const contactsState = useFirestoreSubscription(
    (onData, onError) => subscribeCollection(collections.contacts, onData, onError),
    []
  );
  const sponsorLeadsState = useFirestoreSubscription(
    (onData, onError) => subscribeSponsorLeads(onData, onError),
    []
  );
  const interestState = useFirestoreSubscription(
    (onData, onError) => subscribeCollection(collections.registrationInterest, onData, onError),
    []
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [statusBusy, setStatusBusy] = useState("");
  const debouncedQuery = useDebouncedValue(query);
  const registrations = registrationsState.data || [];
  const contacts = contactsState.data || [];
  const sponsorLeads = sponsorLeadsState.data || [];
  const interestRows = interestState.data || [];
  const loading = registrationsState.loading || contactsState.loading || sponsorLeadsState.loading || interestState.loading;
  const error = registrationsState.error || contactsState.error || sponsorLeadsState.error || interestState.error;

  const filteredRegistrations = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase();

    return registrations.filter((row) => {
      const matchesQuery = !normalizedQuery || [
        row.name,
        row.email,
        row.phone,
        row.teamName,
        row.folderName,
        row.category,
      ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
      const currentStatus = normalizeRegistrationStatus(row.status || row.submissionStatus);
      const matchesStatus = statusFilter === "all" ? true : currentStatus === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [debouncedQuery, registrations, statusFilter]);

  const groupedRegistrations = useMemo(
    () => groupRegistrationsByFolder(filteredRegistrations),
    [filteredRegistrations]
  );

  async function handleStatusChange(item, status) {
    const busyKey = `${item.id}:${status}`;
    setStatusBusy(busyKey);
    try {
      await updateRegistrationStatus(item.id, status, actor);
    } catch (statusError) {
      notify?.(statusError.message || "Failed to update status.", "error");
      return;
    } finally {
      setStatusBusy("");
    }
    notify?.(`Registration marked as ${status}.`, "success");
  }

  function downloadFile(url) {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function downloadAllAssets(item) {
    getRegistrationAssets(item).forEach((asset, index) => {
      window.setTimeout(() => downloadFile(asset.url), index * 120);
    });
  }

  if (loading) return <SectionSkeleton blocks={3} />;
  if (error) return <div className="section-card form-error">{error}</div>;

  return (
    <div className="stack-lg">
      <SectionCard
        title="Registrations"
        subtitle="Folder-style review for each user with download links and quick approval."
        actions={
          <div className="table-toolbar">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search registrations..."
              aria-label="Search registrations"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter registration status">
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        }
      >
        <div className="stack-md">
          {groupedRegistrations.length ? groupedRegistrations.map((group) => (
            <article key={group.folderKey} className="registration-folder-card">
              <div className="registration-folder-head">
                <div>
                  <p className="eyebrow">Folder</p>
                  <h3>{group.folderLabel}</h3>
                  <p className="muted">{group.items[0]?.folderPath || "-"}</p>
                </div>
                <span className="folder-count">{group.items.length} submission{group.items.length > 1 ? "s" : ""}</span>
              </div>

              <div className="stack-md">
                {group.items.map((item) => {
                  const assets = getRegistrationAssets(item);
                  const status = normalizeRegistrationStatus(item.status || item.submissionStatus);
                  const isStatusBusy = statusBusy.startsWith(`${item.id}:`);

                  return (
                    <div key={item.id} className="registration-entry-card">
                      <div className="registration-entry-head">
                        <div className="stack-sm">
                          <strong>{item.name || "-"}</strong>
                          <span className="muted">{item.email || "-"}</span>
                          <span className="muted">Submitted {formatDate(item.createdAt)}</span>
                        </div>
                        <span className={`status-chip status-pill status-pill-${status}`}>
                          {status}
                        </span>
                      </div>

                      <div className="registration-meta-grid">
                        <div><span>Name</span><strong>{item.name || "-"}</strong></div>
                        <div><span>Email</span><strong>{item.email || "-"}</strong></div>
                        <div><span>Phone</span><strong>{item.phone || "-"}</strong></div>
                        <div><span>Category</span><strong>{item.category || item.danceStyle || "-"}</strong></div>
                        <div><span>Minor</span><strong>{item.isMinor ? "Yes" : "No"}</strong></div>
                        <div><span>Guardian</span><strong>{item.parentName || "-"}</strong></div>
                        <div><span>Guardian Phone</span><strong>{item.parentPhone || "-"}</strong></div>
                        <div><span>Guardian Email</span><strong>{item.parentEmail || "-"}</strong></div>
                      </div>

                      <div className="registration-files-list">
                        {assets.length ? assets.map((asset) => (
                          <div key={asset.key} className="registration-file-row">
                            <div>
                              <strong>{asset.label}</strong>
                              <span>{asset.type}</span>
                            </div>
                            <button type="button" className="mini-button" onClick={() => downloadFile(asset.url)}>
                              Download
                            </button>
                          </div>
                        )) : (
                          <p className="muted">No uploaded files available.</p>
                        )}
                      </div>

                      <div className="button-row">
                        <button type="button" className="toolbar-button" onClick={() => downloadAllAssets(item)}>
                          Download All
                        </button>
                        <button
                          type="button"
                          className="primary-button"
                          disabled={isStatusBusy}
                          onClick={() => handleStatusChange(item, "approved")}
                        >
                          {statusBusy === `${item.id}:approved` ? "Approving..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          disabled={isStatusBusy}
                          onClick={() => handleStatusChange(item, "rejected")}
                        >
                          {statusBusy === `${item.id}:rejected` ? "Rejecting..." : "Reject"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          )) : (
            <p className="muted">No registrations found.</p>
          )}
        </div>
      </SectionCard>

      <DataTableCard
        title="Contacts"
        subtitle="Recent website enquiries."
        rows={contacts}
        defaultSortKey="createdAt"
        columns={[
          { key: "name", label: "Name" },
          { key: "subject", label: "Subject" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "createdAt", label: "Received", render: (row) => formatDate(row.createdAt) }
        ]}
      />
      <DataTableCard
        title="Sponsor Leads"
        subtitle="Recent sponsor enquiries from the website."
        rows={sponsorLeads}
        defaultSortKey="createdAt"
        columns={[
          { key: "contactPerson", label: "Contact" },
          { key: "company", label: "Company", render: (row) => row.company || row.companyName || "-" },
          { key: "email", label: "Email" },
          { key: "interest", label: "Interest", render: (row) => row.interest || row.category || "-" },
          { key: "createdAt", label: "Received", render: (row) => formatDate(row.createdAt) }
        ]}
      />
      <DataTableCard
        title="Registration Interest"
        subtitle="People who tapped I'm Interested on the registration page."
        rows={interestRows}
        defaultSortKey="createdAt"
        columns={[
          { key: "name", label: "Name", render: (row) => row.name || "Interested visitor" },
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email" },
          { key: "category", label: "Category" },
          { key: "createdAt", label: "Recorded", render: (row) => formatDate(row.createdAt) }
        ]}
      />
    </div>
  );
}

function ActivitySection({ actor }) {
  const { data, loading, error } = useFirestoreSubscription(
    (onData, onError) => subscribeActivity(onData, onError),
    []
  );

  const grouped = useMemo(() => data.slice(0, 40), [data]);

  if (loading) return <SectionSkeleton blocks={2} />;
  if (error) return <div className="section-card form-error">{error}</div>;

  return (
    <SectionCard title="Activity Log" subtitle={`Recent changes made through the admin panel by ${actor}.`}>
      <div className="stack-sm">
        {grouped.length ? grouped.map((item) => (
          <div key={item.id} className="log-row activity-row">
            <strong>{item.action}</strong>
            <span>{item.section}</span>
            <span>{item.actor}</span>
            <span>{formatDate(item.createdAt)}</span>
          </div>
        )) : <p className="muted">No changes logged yet.</p>}
      </div>
    </SectionCard>
  );
}

function EditableCollectionCard({
  title,
  item,
  fields,
  toggleField,
  toggleLabel,
  liveToggles,
  onSave,
  onDelete,
  extraActions,
  saving = false,
  deleting = false
}) {
  const [draft, setDraft] = useState(item);

  useEffect(() => {
    setDraft(item);
  }, [item]);

  return (
    <div className="editor-block hover-card">
      <div className="split-row">
        <h3>{title}</h3>
        <div className="button-row">
          {extraActions}
          {onDelete ? (
            <button type="button" className="danger-button" onClick={() => onDelete(item)} disabled={deleting || saving}>
              {deleting ? "Deleting..." : "Delete"}
            </button>
          ) : null}
        </div>
      </div>
      {fields.map((field) => (
        <FormField key={field.key} label={field.label}>
          {field.multiline ? (
            <textarea
              rows={3}
              value={draft[field.key] ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
            />
          ) : (
            <input
              type={field.type || "text"}
              value={draft[field.key] ?? ""}
              onChange={(event) => setDraft((current) => ({
                ...current,
                [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value
              }))}
            />
          )}
        </FormField>
      ))}
      {toggleField ? (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={Boolean(draft[toggleField])}
            onChange={(event) => setDraft((current) => ({ ...current, [toggleField]: event.target.checked }))}
          />
          <span>{toggleLabel}</span>
        </label>
      ) : null}
      {Array.isArray(liveToggles) && liveToggles.length ? (
        <div className="button-row">
          {liveToggles.map((toggle) => (
            <button
              key={toggle.key}
              type="button"
              className={`switch ${toggle.checked ? "is-on" : ""}`}
              onClick={() => toggle.onChange(!toggle.checked)}
              disabled={Boolean(toggle.disabled)}
              aria-pressed={toggle.checked}
              title={toggle.label}
            >
              <span className="switch-thumb" />
              <span className="sr-only">{toggle.label}</span>
            </button>
          ))}
          {liveToggles.map((toggle) => (
            <span key={`${toggle.key}-label`} className="muted">
              {toggle.label}: {toggle.checked ? "On" : "Off"}
            </span>
          ))}
        </div>
      ) : null}
      <div className="button-row">
        <button type="button" className="ghost-button" onClick={() => setDraft(item)} disabled={saving || deleting}>
          Cancel
        </button>
        <button type="button" className="primary-button" onClick={() => onSave(draft, item)} disabled={saving || deleting}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function RealtimeControlCard({ label, description, checked, onChange, loading }) {
  return (
    <div className="control-card hover-card">
      <div>
        <strong>{label}</strong>
        <p className="muted">{description}</p>
      </div>
      <button
        type="button"
        className={`switch ${checked ? "is-on" : ""}`}
        onClick={() => onChange(!checked)}
        disabled={loading}
        aria-pressed={checked}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}

function Snackbar({ notice, onDismiss }) {
  if (!notice) {
    return null;
  }

  return (
    <div className={`snackbar snackbar-${notice.tone || "info"}`} role="status" aria-live="polite">
      <span>{notice.message}</span>
      <button type="button" className="snackbar-close" onClick={onDismiss} aria-label="Dismiss notification">
        Close
      </button>
    </div>
  );
}

function DataTableCard({ title, subtitle, rows, columns, defaultSortKey }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [direction, setDirection] = useState("desc");
  const debouncedQuery = useDebouncedValue(query);

  const filteredRows = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase();
    const baseRows = normalizedQuery
      ? rows.filter((row) =>
          columns.some((column) =>
            String(column.render ? column.render(row) : row?.[column.key] || "")
              .toLowerCase()
              .includes(normalizedQuery)
          )
        )
      : rows;

    return sortRows(baseRows, sortKey, direction);
  }, [columns, debouncedQuery, direction, rows, sortKey]);

  function handleSort(key) {
    if (sortKey === key) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setDirection("asc");
  }

  return (
    <SectionCard
      title={title}
      subtitle={subtitle}
      actions={
        <div className="table-toolbar">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search..."
            aria-label={`Search ${title}`}
          />
        </div>
      }
    >
      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>
                  <button type="button" className="table-sort-button" onClick={() => handleSort(column.key)}>
                    {column.label}
                    {sortKey === column.key ? <span>{direction === "asc" ? "Up" : "Down"}</span> : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length ? filteredRows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render ? column.render(row) : row?.[column.key] || "-"}</td>
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={columns.length} className="table-empty">
                  No matching records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function StatCard({ title, value, detail, loading }) {
  if (loading) {
    return (
      <div className="stat-card skeleton-card">
        <div className="skeleton-line short" />
        <div className="skeleton-line medium" />
        <div className="skeleton-line short" />
      </div>
    );
  }

  return (
    <div className="stat-card hover-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function SectionSkeleton({ blocks = 3 }) {
  return (
    <div className="section-card">
      <div className="section-card-head">
        <div className="stack-sm">
          <div className="skeleton-line medium" />
          <div className="skeleton-line long" />
        </div>
      </div>
      <div className="skeleton-grid">
        {Array.from({ length: blocks }, (_, index) => (
          <div key={index} className="skeleton-card">
            <div className="skeleton-line medium" />
            <div className="skeleton-line long" />
            <div className="skeleton-line long" />
            <div className="skeleton-line short" />
          </div>
        ))}
      </div>
    </div>
  );
}
