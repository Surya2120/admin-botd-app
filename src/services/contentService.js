import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase/config";
import {
  defaultCategories,
  defaultContestants,
  defaultEventsContent,
  defaultJudges,
  defaultRulesContent,
  defaultSeasonContent,
  defaultSponsors,
  defaultVotingContent
} from "../data/defaultContent";

const CONTENT_COLLECTION = "adminContent";
const ACTIVITY_COLLECTION = "adminActivity";
const RULE_HISTORY_COLLECTION = "ruleVersions";

export const collections = {
  categories: "categories",
  contestants: "teams",
  judges: "judges",
  sponsors: "sponsors",
  registrations: "registrations",
  contacts: "contacts",
  votes: "votes"
};

export const contentDocs = {
  season: "seasonPage",
  rules: "rulesPage",
  events: "eventsPage",
  voting: "votingPage"
};

export const settingsDocs = {
  app: "app",
  home: "home",
  uiControls: "uiControls",
  events: "events"
};

function cloneDefault(defaultValue) {
  return JSON.parse(JSON.stringify(defaultValue));
}

export async function seedAdminContentIfNeeded(actor = "system") {
  const seeds = [
    { type: "doc", id: contentDocs.season, value: defaultSeasonContent },
    { type: "doc", id: contentDocs.rules, value: defaultRulesContent },
    { type: "doc", id: contentDocs.events, value: defaultEventsContent },
    { type: "doc", id: contentDocs.voting, value: defaultVotingContent }
  ];

  await Promise.all(
    seeds.map(async (seed) => {
      const ref = doc(db, CONTENT_COLLECTION, seed.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          ...cloneDefault(seed.value),
          seededAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: actor
        });
      }
    })
  );

  await seedCollectionIfNeeded(collections.categories, defaultCategories, actor);
  await seedCollectionIfNeeded(collections.contestants, defaultContestants, actor);
  await seedCollectionIfNeeded(collections.judges, defaultJudges, actor);
  await seedCollectionIfNeeded(collections.sponsors, defaultSponsors, actor);

  const settingsRef = doc(db, "settings", "app");
  const settingsSnap = await getDoc(settingsRef);
  if (!settingsSnap.exists()) {
    await setDoc(settingsRef, {
      votingOpen: false,
      activeCategory: "AG",
      votingEndTime: null,
      announcement: "",
      closedMessage: defaultVotingContent.closedMessage,
      rulesText: defaultVotingContent.rulesText,
      updatedAt: serverTimestamp(),
      updatedBy: actor
    });
  } else {
    await setDoc(
      settingsRef,
      {
        closedMessage: defaultVotingContent.closedMessage,
        rulesText: defaultVotingContent.rulesText,
        updatedAt: serverTimestamp(),
        updatedBy: actor
      },
      { merge: true }
    );
  }

  await setDoc(
    doc(db, "settings", settingsDocs.uiControls),
    {
      showVotes: false,
      showLeaderboard: true,
      updatedAt: serverTimestamp(),
      updatedBy: actor
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "settings", settingsDocs.events),
    {
      partyBlast: null,
      updatedAt: serverTimestamp(),
      updatedBy: actor
    },
    { merge: true }
  );
}

async function seedCollectionIfNeeded(name, items, actor) {
  const ref = collection(db, name);
  const snap = await getDocs(ref);
  if (!snap.empty) return;

  const batch = writeBatch(db);
  items.forEach((item) => {
    batch.set(doc(ref, item.id), {
      ...cloneDefault(item),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: actor
    });
  });
  await batch.commit();
}

export function subscribeContentDoc(id, onData, onError) {
  return onSnapshot(doc(db, CONTENT_COLLECTION, id), (snap) => {
    onData(snap.exists() ? snap.data() : null);
  }, onError);
}

export function subscribeSettingsDoc(id, fallbackValue, onData, onError) {
  return onSnapshot(doc(db, "settings", id), (snap) => {
    onData(snap.exists() ? snap.data() : fallbackValue);
  }, onError);
}

export function subscribeCollection(name, onData, onError) {
  let ref;

  if (name === collections.sponsors) {
    ref = query(collection(db, name), orderBy("sortOrder", "asc"));
  } else if (name === collections.registrations || name === collections.contacts) {
    ref = query(collection(db, name), orderBy("createdAt", "desc"));
  } else if (name === collections.votes) {
    ref = query(collection(db, name), orderBy("createdAt", "desc"));
  } else {
    ref = query(collection(db, name), orderBy("name", "asc"));
  }

  return onSnapshot(ref, (snap) => {
    onData(snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
  }, onError);
}

export async function fetchCollectionItems(name, options = {}) {
  const collectionRef = collection(db, name);
  const baseConstraints = [];
  const limitConstraint = options.limit ? limit(options.limit) : null;

  if (options.where) {
    baseConstraints.push(where(options.where.field, options.where.operator, options.where.value));
  }

  const requestedOrder = options.orderBy
    || ((name === collections.registrations || name === collections.contacts)
      ? { field: "createdAt", direction: "desc" }
      : null);

  async function runQuery(includeOrderBy) {
    const constraints = [...baseConstraints];

    if (includeOrderBy && requestedOrder) {
      constraints.push(orderBy(requestedOrder.field, requestedOrder.direction || "asc"));
    }

    if (limitConstraint) {
      constraints.push(limitConstraint);
    }

    const ref = constraints.length ? query(collectionRef, ...constraints) : collectionRef;
    const snap = await getDocs(ref);
    return snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
  }

  try {
    return await runQuery(true);
  } catch (error) {
    const message = String(error?.message || "");
    const needsIndex = message.toLowerCase().includes("requires an index");

    if (!needsIndex || !requestedOrder) {
      throw error;
    }

    console.warn(`[BOTD Admin] Falling back to client-side sort for ${name}`, error);
    const items = await runQuery(false);
    const directionFactor = (requestedOrder.direction || "asc").toLowerCase() === "desc" ? -1 : 1;
    const sortedItems = [...items].sort((left, right) => {
      const leftValue = left?.[requestedOrder.field];
      const rightValue = right?.[requestedOrder.field];

      if (leftValue?.seconds || rightValue?.seconds) {
        return (((leftValue?.seconds || 0) - (rightValue?.seconds || 0)) * directionFactor);
      }

      if (typeof leftValue === "number" || typeof rightValue === "number") {
        return ((Number(leftValue || 0) - Number(rightValue || 0)) * directionFactor);
      }

      return String(leftValue || "").localeCompare(String(rightValue || "")) * directionFactor;
    });

    return options.limit ? sortedItems.slice(0, options.limit) : sortedItems;
  }
}

export function subscribeSponsorLeads(onData, onError) {
  const ref = query(collection(db, collections.sponsors), where("recordType", "==", "lead"));
  return onSnapshot(ref, (snap) => {
    onData(
      snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })).sort((left, right) => {
        const leftValue = left?.createdAt?.seconds || 0;
        const rightValue = right?.createdAt?.seconds || 0;
        return rightValue - leftValue;
      })
    );
  }, onError);
}

export function subscribeActivity(onData, onError) {
  const ref = query(collection(db, ACTIVITY_COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(ref, (snap) => {
    onData(snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
  }, onError);
}

export function subscribeRuleVersions(onData, onError) {
  const ref = query(collection(db, RULE_HISTORY_COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(ref, (snap) => {
    onData(snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
  }, onError);
}

export async function saveContentDoc(id, data, actor, activityLabel, previousValue) {
  await setDoc(
    doc(db, CONTENT_COLLECTION, id),
    {
      ...data,
      updatedAt: serverTimestamp(),
      updatedBy: actor
    },
    { merge: true }
  );

  if (id === contentDocs.voting) {
    await setDoc(
      doc(db, "settings", "app"),
      {
        votingOpen: Boolean(data.votingOpen),
        announcement: data.announcement || "",
        closedMessage: data.closedMessage || "",
        rulesText: data.rulesText || "",
        updatedAt: serverTimestamp(),
        updatedBy: actor
      },
      { merge: true }
    );
  }

  if (id === contentDocs.rules) {
    await addDoc(collection(db, RULE_HISTORY_COLLECTION), {
      version: Number(data.currentVersion || 1),
      title: data.title,
      content: data.content,
      createdAt: serverTimestamp(),
      createdBy: actor
    });
  }

  await logActivity({
    actor,
    section: id,
    action: activityLabel,
    previousValue,
    nextValue: data
  });
}

export async function saveSettingsDoc(id, data, actor, activityLabel, previousValue) {
  await setDoc(
    doc(db, "settings", id),
    {
      ...data,
      updatedAt: serverTimestamp(),
      updatedBy: actor
    },
    { merge: true }
  );

  await logActivity({
    actor,
    section: `settings/${id}`,
    action: activityLabel,
    previousValue,
    nextValue: data
  });
}

export async function saveCollectionItem(name, item, actor, activityLabel, previousValue) {
  await setDoc(
    doc(db, name, item.id),
    {
      ...item,
      updatedAt: serverTimestamp(),
      updatedBy: actor
    },
    { merge: true }
  );

  await logActivity({
    actor,
    section: name,
    action: activityLabel,
    previousValue,
    nextValue: item
  });
}

export async function deleteCollectionItem(name, item, actor) {
  await deleteDoc(doc(db, name, item.id));
  await logActivity({
    actor,
    section: name,
    action: `Deleted ${item.name || item.title || item.id}`,
    previousValue: item,
    nextValue: null
  });
}

export async function restorePreviousState({ type, targetId, previousValue, actor, section }) {
  if (!previousValue) return;

  if (type === "doc") {
    await setDoc(
      doc(db, CONTENT_COLLECTION, targetId),
      {
        ...previousValue,
        restoredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: actor
      },
      { merge: true }
    );
  }

  if (type === "collection") {
    await setDoc(
      doc(db, section, targetId),
      {
        ...previousValue,
        restoredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: actor
      },
      { merge: true }
    );
  }

  if (type === "settings") {
    await setDoc(
      doc(db, "settings", targetId),
      {
        ...previousValue,
        restoredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: actor
      },
      { merge: true }
    );
  }

  await logActivity({
    actor,
    section,
    action: `Restored ${targetId}`,
    previousValue: null,
    nextValue: previousValue
  });
}

async function logActivity({ actor, section, action, previousValue, nextValue }) {
  await addDoc(collection(db, ACTIVITY_COLLECTION), {
    actor,
    section,
    action,
    previousValue: previousValue ?? null,
    nextValue: nextValue ?? null,
    createdAt: serverTimestamp()
  });
}

export async function bumpRuleVersion(actor) {
  const ref = doc(db, CONTENT_COLLECTION, contentDocs.rules);
  const snap = await getDoc(ref);
  const currentVersion = snap.exists() ? Number(snap.data().currentVersion || 1) : 1;
  await updateDoc(ref, {
    currentVersion: increment(1),
    updatedAt: serverTimestamp(),
    updatedBy: actor
  });
  return currentVersion + 1;
}

export async function updateRegistrationStatus(registrationId, status, actor) {
  const registrationRef = doc(db, collections.registrations, registrationId);
  const previousSnap = await getDoc(registrationRef);
  const previousValue = previousSnap.exists() ? { id: previousSnap.id, ...previousSnap.data() } : null;

  await updateDoc(registrationRef, {
    status,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
  });

  await logActivity({
    actor,
    section: collections.registrations,
    action: `Marked registration ${registrationId} as ${status}`,
    previousValue,
    nextValue: { ...(previousValue || {}), status },
  });
}
