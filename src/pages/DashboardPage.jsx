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
  deleteCollectionItem,
  fetchCollectionItems,
  restorePreviousState,
  saveCollectionItem,
  saveContentDoc,
  saveSettingsDoc,
  seedAdminContentIfNeeded,
  settingsDocs,
  subscribeActivity,
  subscribeCollection,
  subscribeContentDoc,
  subscribeRuleVersions,
  subscribeSettingsDoc,
  subscribeSponsorLeads,
  updateRegistrationStatus
} from "../services/contentService";
import {
  defaultCategories,
  defaultEventsContent,
  defaultJudges,
  defaultRulesContent,
  defaultSeasonContent,
  defaultSponsors,
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

const DEFAULT_UI_CONTROLS = { showVotes: false, showLeaderboard: true };
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

  const contestantsState = useFirestoreSubscription(
    (onData, onError) => subscribeCollection(collections.contestants, onData, onError),
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
    seedAdminContentIfNeeded(actor).catch((error) => {
      console.error("Failed to seed admin content", error);
    });
  }, [actor]);

  const rankedTeams = useMemo(() => rankTeams(contestantsState.data || []), [contestantsState.data]);
  const totalVotes = useMemo(
    () => rankedTeams.reduce((sum, team) => sum + Number(team.votes || 0), 0),
    [rankedTeams]
  );
  const visibilitySummary = useMemo(
    () => [
      uiControlsState.data?.showVotes ? "Votes live" : "Votes hidden",
      uiControlsState.data?.showLeaderboard ? "Leaderboard live" : "Leaderboard hidden",
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
          <StatCard title="Contestants Live" value={rankedTeams.length} detail="Synced from Firestore teams" loading={contestantsState.loading} />
          <StatCard title="Votes Recorded" value={totalVotes} detail="Realtime vote count summary" loading={contestantsState.loading} />
          <StatCard title="Recent Changes" value={(activityState.data || []).length} detail="Activity log entries" loading={activityState.loading} />
          <StatCard title="Vote Count Display" value={uiControlsState.data?.showVotes ? "On" : "Off"} detail="Website UI control" loading={uiControlsState.loading} />
        </section>

        {activeSection === "season" ? <SeasonSection actor={actor} /> : null}
        {activeSection === "categories" ? <CategoriesSection actor={actor} /> : null}
        {activeSection === "contestants" ? <ContestantsJudgesSection actor={actor} notify={notify} /> : null}
        {activeSection === "events" ? <EventsSection actor={actor} /> : null}
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

function ContestantsJudgesSection({ actor, notify }) {
  const contestantsState = useFirestoreSubscription(
    (onData, onError) => subscribeCollection(collections.contestants, onData, onError),
    []
  );
  const judgesState = useFirestoreSubscription(
    (onData, onError) => subscribeCollection(collections.judges, onData, onError),
    defaultJudges
  );
  const [lastSaved, setLastSaved] = useState(null);
  const [query, setQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const debouncedQuery = useDebouncedValue(query);

  async function saveContestant(item, previousValue) {
    if (!promptOverwrite()) return;
    await saveCollectionItem(collections.contestants, item, actor, `Updated contestant ${item.name}`, previousValue);
    setLastSaved({ type: "collection", section: collections.contestants, targetId: item.id, previousValue });
  }

  async function saveJudge(item, previousValue) {
    if (!promptOverwrite()) return;
    await saveCollectionItem(collections.judges, item, actor, `Updated judge ${item.name}`, previousValue);
    setLastSaved({ type: "collection", section: collections.judges, targetId: item.id, previousValue });
  }

  async function setAllTeamsVisibility(nextVisibility) {
    if (!promptOverwrite()) return;

    const items = contestantsState.data || [];
    await Promise.all(
      items.map((item) =>
        saveCollectionItem(
          collections.contestants,
          { ...item, isVisible: nextVisibility },
          actor,
          `${nextVisibility ? "Unhid" : "Hid"} team ${item.name}`,
          item
        )
      )
    );
    notify?.(nextVisibility ? "All teams unhidden successfully." : "All teams hidden successfully.", "success");
  }

  const groupedContestants = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase();
    return CATEGORY_META.map((category) => ({
      ...category,
      items: (contestantsState.data || []).filter((item) => {
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
  }, [contestantsState.data, debouncedQuery, visibilityFilter]);

  const allTeamsVisible = useMemo(
    () => (contestantsState.data || []).length > 0 && (contestantsState.data || []).every((item) => item.isVisible !== false),
    [contestantsState.data]
  );

  if (contestantsState.loading || judgesState.loading) return <SectionSkeleton blocks={4} />;
  if (contestantsState.error || judgesState.error) return <div className="section-card form-error">{contestantsState.error || judgesState.error}</div>;

  return (
    <div className="stack-lg">
      <SectionCard
        title="Contestants Control"
        subtitle="Edit every contestant individually, grouped by category for faster scanning."
        actions={
          <>
            <div className="table-toolbar">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search contestants..."
                aria-label="Search contestants"
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
              disabled={!(contestantsState.data || []).length}
            >
              {allTeamsVisible ? "Hide All Teams" : "Unhide All Teams"}
            </button>
            <button type="button" className="ghost-button" disabled={!lastSaved} onClick={() => lastSaved && restorePreviousState({ ...lastSaved, actor })}>
              Undo Last Change
            </button>
          </>
        }
      >
        <div className="stack-lg">
          {groupedContestants.map((group) => (
            <div key={group.key} className="stack-md">
              <div className="section-inline-head">
                <h3>{group.label}</h3>
                <span className="muted">{group.items.length} contestants</span>
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
                    toggleField="isVisible"
                    toggleLabel="Show team on website"
                    onSave={saveContestant}
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
  const contestantsState = useFirestoreSubscription(
    (onData, onError) => subscribeCollection(collections.contestants, onData, onError),
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

  const rankedTeams = useMemo(() => rankTeams(contestantsState.data || []), [contestantsState.data]);
  const leaderboardColumns = useMemo(() => buildLeaderboardColumns(contestantsState.data || []), [contestantsState.data]);
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
    const label = key === "showVotes" ? "vote counts" : "leaderboard";
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

  if (votingDocState.loading || uiControlsState.loading || contestantsState.loading || eventSignalsState.loading) {
    return <SectionSkeleton blocks={4} />;
  }

  if (votingDocState.error || uiControlsState.error || contestantsState.error || eventSignalsState.error) {
    return <div className="section-card form-error">{votingDocState.error || uiControlsState.error || contestantsState.error || eventSignalsState.error}</div>;
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
                {partyBusy ? "Celebration Triggered" : "Trigger Celebration 🎉"}
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

      <SectionCard title="Votes Management" subtitle="Live rankings from the teams collection, sorted by vote count and highlighted for the top 3.">
        <div className="votes-board">
          {rankedTeams.map((team) => (
            <article key={team.id} className={`vote-rank-card ${team.rank <= 3 ? `is-top-${team.rank}` : ""}`}>
              <div className="vote-rank-badge">#{team.rank}</div>
              <div className="vote-rank-copy">
                <strong>{team.name}</strong>
                <span>{team.categoryLabel}</span>
              </div>
              <div className="vote-rank-count">{Number(team.votes || 0)}</div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Leaderboard Preview" subtitle="Matches the website’s grouped leaderboard layout with realtime category rankings.">
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
      </SectionCard>
    </div>
  );
}

function SponsorsSection({ actor }) {
  const { data, loading, error } = useFirestoreSubscription(
    (onData, onError) => subscribeCollection(collections.sponsors, onData, onError),
    defaultSponsors
  );
  const [lastSaved, setLastSaved] = useState(null);

  const sponsorItems = useMemo(
    () => (data || []).filter((item) => item.recordType !== "lead"),
    [data]
  );

  async function saveItem(item, previousValue) {
    if (!promptOverwrite()) return;
    await saveCollectionItem(collections.sponsors, item, actor, `Updated sponsor ${item.name}`, previousValue);
    setLastSaved({ type: "collection", section: collections.sponsors, targetId: item.id, previousValue });
  }

  async function addSponsor() {
    const item = {
      id: `sponsor-${Date.now()}`,
      name: "New Sponsor",
      link: "",
      tier: "Silver",
      image: "",
      sortOrder: sponsorItems.length + 1,
      visible: true
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
          { ...entry, sortOrder: position + 1 },
          actor,
          `Reordered sponsor ${entry.name}`,
          sponsorItems.find((itemData) => itemData.id === entry.id)
        )
      )
    );
  }

  if (loading) return <SectionSkeleton blocks={3} />;
  if (error) return <div className="section-card form-error">{error}</div>;

  return (
    <SectionCard
      title="Sponsors Page Control"
      subtitle="Manage sponsor logos, names, links, tiers, visibility, and ordering."
      actions={
        <>
          <button type="button" className="ghost-button" disabled={!lastSaved} onClick={() => lastSaved && restorePreviousState({ ...lastSaved, actor })}>
            Undo Last Change
          </button>
          <button type="button" className="primary-button" onClick={addSponsor}>
            Add Sponsor
          </button>
        </>
      }
    >
      <div className="stack-lg">
        {sponsorItems.map((item) => (
          <EditableCollectionCard
            key={item.id}
            title={item.name}
            item={item}
            fields={[
              { key: "name", label: "Sponsor Name" },
              { key: "tier", label: "Tier" },
              { key: "link", label: "Website Link" },
              { key: "image", label: "Logo URL / Path" },
              { key: "sortOrder", label: "Sort Order", type: "number" }
            ]}
            toggleField="visible"
            toggleLabel="Visible on sponsors page"
            onSave={saveItem}
            onDelete={removeSponsor}
            extraActions={
              <>
                <button type="button" className="mini-button" onClick={() => reorder(item, -1)}>
                  Up
                </button>
                <button type="button" className="mini-button" onClick={() => reorder(item, 1)}>
                  Down
                </button>
              </>
            }
          />
        ))}
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
  const [registrations, setRegistrations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [sponsorLeads, setSponsorLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [statusBusy, setStatusBusy] = useState("");
  const debouncedQuery = useDebouncedValue(query);

  useEffect(() => {
    let active = true;

    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const [nextRegistrations, nextContacts, nextSponsorLeads] = await Promise.all([
          fetchCollectionItems(collections.registrations, {
            orderBy: { field: "createdAt", direction: "desc" },
            limit: 250,
          }),
          fetchCollectionItems(collections.contacts, {
            orderBy: { field: "createdAt", direction: "desc" },
            limit: 150,
          }),
          fetchCollectionItems(collections.sponsors, {
            where: { field: "recordType", operator: "==", value: "lead" },
            limit: 150,
          }),
        ]);

        if (!active) {
          return;
        }

        setRegistrations(nextRegistrations);
        setContacts(nextContacts);
        setSponsorLeads(
          [...nextSponsorLeads].sort((left, right) => {
            const leftSeconds = left?.createdAt?.seconds || 0;
            const rightSeconds = right?.createdAt?.seconds || 0;
            return rightSeconds - leftSeconds;
          })
        );
      } catch (loadError) {
        console.error("Failed to load data hub", loadError);
        if (active) {
          setError(loadError.message || "Failed to load submission data.");
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [refreshTick]);

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
      setRegistrations((current) =>
        current.map((row) => (row.id === item.id ? { ...row, status } : row))
      );
    } catch (statusError) {
      console.error("Failed to update registration status", statusError);
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
            <button
              type="button"
              className="toolbar-button"
              onClick={() => {
                setRefreshing(true);
                setRefreshTick((current) => current + 1);
                notify?.("Refreshing Data Hub...", "info");
              }}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
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
                          disabled={statusBusy === `${item.id}:approved`}
                          onClick={() => handleStatusChange(item, "approved")}
                        >
                          {statusBusy === `${item.id}:approved` ? "Approving..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          disabled={statusBusy === `${item.id}:rejected`}
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
        subtitle="Recent website enquiries loaded in a lightweight snapshot."
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
  onSave,
  onDelete,
  extraActions
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
            <button type="button" className="danger-button" onClick={() => onDelete(item)}>
              Delete
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
      <div className="button-row">
        <button type="button" className="ghost-button" onClick={() => setDraft(item)}>
          Cancel
        </button>
        <button type="button" className="primary-button" onClick={() => onSave(draft, item)}>
          Save
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
