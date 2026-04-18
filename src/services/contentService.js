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
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes
} from "firebase/storage";
import { db, storage } from "../firebase/config";
import {
  defaultCategories,
  defaultEventsContent,
  defaultJudges,
  defaultRulesContent,
  defaultSeasonContent,
  defaultVotingContent
} from "../data/defaultContent";

const CONTENT_COLLECTION = "adminContent";
const ACTIVITY_COLLECTION = "adminActivity";
const RULE_HISTORY_COLLECTION = "ruleVersions";

export const collections = {
  categories: "categories",
  teams: "teams",
  seasons: "seasons",
  judges: "judges",
  sponsors: "sponsors",
  registrations: "registrations",
  contacts: "contacts",
  registrationInterest: "registrationInterest",
  votes: "votes",
  posters: "posters",
  videos: "videos"
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
  await seedCollectionIfNeeded(collections.judges, defaultJudges, actor);

  const settingsRef = doc(db, "settings", settingsDocs.app);
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
  }

  await seedSettingsDocIfNeeded(settingsDocs.uiControls, {
      showVotes: false,
      showLeaderboard: true,
      registrationOpen: true,
      showInterestButton: true,
      registrationClosedMessage: "AUDITIONS OPEN ON 20th APRIL"
    },
    actor
  );

  await seedSettingsDocIfNeeded(
    settingsDocs.events,
    {
      partyBlast: null
    },
    actor
  );

}

async function seedSettingsDocIfNeeded(id, defaults, actor) {
  const ref = doc(db, "settings", id);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      ...defaults,
      seededAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: actor
    });
    return;
  }

  const current = snap.data() || {};
  const missingValues = Object.entries(defaults).reduce((accumulator, [key, value]) => {
    if (!Object.prototype.hasOwnProperty.call(current, key)) {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});

  if (Object.keys(missingValues).length) {
    await setDoc(ref, {
      ...missingValues,
      updatedAt: serverTimestamp(),
      updatedBy: actor
    }, { merge: true });
  }
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
  return onSnapshot(collection(db, name), (snap) => {
    const items = snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
    onData(sortCollectionItems(name, items));
  }, onError);
}

function sortCollectionItems(name, items) {
  const direction = (name === collections.registrations || name === collections.contacts || name === collections.votes) ? -1 : 1;
  const sortKey = (name === collections.posters || name === collections.videos || name === collections.sponsors)
    ? "order"
    : (name === collections.registrations || name === collections.contacts || name === collections.votes)
      ? "createdAt"
      : "name";

  return [...items].sort((left, right) => {
    const leftValue = left?.[sortKey] ?? left?.sortOrder ?? left?.createdAt ?? "";
    const rightValue = right?.[sortKey] ?? right?.sortOrder ?? right?.createdAt ?? "";

    if (leftValue?.seconds || rightValue?.seconds) {
      return ((leftValue?.seconds || 0) - (rightValue?.seconds || 0)) * direction;
    }

    if (typeof leftValue === "number" || typeof rightValue === "number") {
      return (Number(leftValue || 0) - Number(rightValue || 0)) * direction;
    }

    return String(leftValue || "").localeCompare(String(rightValue || "")) * direction;
  });
}

export function subscribePosters(onData, onError) {
  return subscribeCollection(collections.posters, onData, onError);
}

export function subscribeVideos(onData, onError) {
  return subscribeCollection(collections.videos, onData, onError);
}

function formatStorageName(value = "poster") {
  return String(value || "poster")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "poster";
}

export async function uploadPosterImage(file, { actor = "admin", order = 1, isActive = true } = {}) {
  if (!file) {
    throw new Error("Choose a poster image before uploading.");
  }

  const extension = String(file.name || "poster.jpg").split(".").pop() || "jpg";
  const safeName = formatStorageName(file.name);
  const uniqueToken = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10);
  const posterId = `poster_${Date.now()}_${uniqueToken}`;
  const fullPath = `BOTD/posters/${posterId}_${safeName}.${extension}`;
  const imageRef = storageRef(storage, fullPath);
  const snapshot = await uploadBytes(imageRef, file, {
    contentType: file.type || "image/jpeg",
    cacheControl: "public,max-age=3600"
  });
  const imageUrl = await getDownloadURL(snapshot.ref);
  const poster = {
    id: posterId,
    imageUrl,
    imagePath: snapshot.ref.fullPath,
    isActive: Boolean(isActive),
    order: Number(order || 1),
    originalName: file.name || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: actor
  };

  await setDoc(doc(db, collections.posters, posterId), poster, { merge: true });
  await logActivity({
    actor,
    section: collections.posters,
    action: `Uploaded poster ${file.name || posterId}`,
    previousValue: null,
    nextValue: poster
  });

  return poster;
}

export async function updatePoster(item, actor, previousValue) {
  const posterId = item.id;
  if (!posterId) {
    throw new Error("Poster ID is missing.");
  }

  const nextValue = {
    imageUrl: item.imageUrl || "",
    imagePath: item.imagePath || "",
    isActive: item.isActive !== false,
    order: Number(item.order || 0),
    originalName: item.originalName || "",
    updatedAt: serverTimestamp(),
    updatedBy: actor
  };

  await setDoc(doc(db, collections.posters, posterId), nextValue, { merge: true });
  await logActivity({
    actor,
    section: collections.posters,
    action: `Updated poster ${posterId}`,
    previousValue,
    nextValue: { id: posterId, ...nextValue }
  });
}

export async function deletePoster(item, actor) {
  if (!item?.id) {
    return;
  }

  await deleteDoc(doc(db, collections.posters, item.id));

  if (item.imagePath) {
    try {
      await deleteObject(storageRef(storage, item.imagePath));
    } catch {
      // The Firestore record is already removed; ignore a missing storage file.
    }
  }

  await logActivity({
    actor,
    section: collections.posters,
    action: `Deleted poster ${item.id}`,
    previousValue: item,
    nextValue: null
  });
}

export async function uploadTestimonialVideo(file, { actor = "admin", order = 1, isActive = true } = {}) {
  if (!file) {
    throw new Error("Choose a video before uploading.");
  }

  const extension = String(file.name || "testimonial.mp4").split(".").pop() || "mp4";
  const safeName = formatStorageName(file.name);
  const uniqueToken = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10);
  const videoId = `video_${Date.now()}_${uniqueToken}`;
  const fullPath = `BOTD/videos/${videoId}_${safeName}.${extension}`;
  const videoRef = storageRef(storage, fullPath);
  const snapshot = await uploadBytes(videoRef, file, {
    contentType: file.type || "video/mp4",
    cacheControl: "public,max-age=3600"
  });
  const videoUrl = await getDownloadURL(snapshot.ref);
  const video = {
    id: videoId,
    videoUrl,
    videoPath: snapshot.ref.fullPath,
    isActive: Boolean(isActive),
    order: Number(order || 1),
    originalName: file.name || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: actor
  };

  await setDoc(doc(db, collections.videos, videoId), video, { merge: true });
  await logActivity({
    actor,
    section: collections.videos,
    action: `Uploaded testimonial video ${file.name || videoId}`,
    previousValue: null,
    nextValue: video
  });

  return video;
}

export async function updateTestimonialVideo(item, actor, previousValue) {
  const videoId = item.id;
  if (!videoId) {
    throw new Error("Video ID is missing.");
  }

  const nextValue = {
    videoUrl: item.videoUrl || "",
    videoPath: item.videoPath || "",
    isActive: item.isActive !== false,
    order: Number(item.order || 0),
    originalName: item.originalName || "",
    updatedAt: serverTimestamp(),
    updatedBy: actor
  };

  await setDoc(doc(db, collections.videos, videoId), nextValue, { merge: true });
  await logActivity({
    actor,
    section: collections.videos,
    action: `Updated testimonial video ${videoId}`,
    previousValue,
    nextValue: { id: videoId, ...nextValue }
  });
}

export async function deleteTestimonialVideo(item, actor) {
  if (!item?.id) {
    return;
  }

  await deleteDoc(doc(db, collections.videos, item.id));

  if (item.videoPath) {
    try {
      await deleteObject(storageRef(storage, item.videoPath));
    } catch {
      // The Firestore record is already removed; ignore a missing storage file.
    }
  }

  await logActivity({
    actor,
    section: collections.videos,
    action: `Deleted testimonial video ${item.id}`,
    previousValue: item,
    nextValue: null
  });
}

function normalizeTeam(id, value = {}) {
  const isVisible = value.isVisible ?? value.visible ?? true;
  const approved = value.approved ?? true;

  return {
    ...value,
    id,
    isVisible: isVisible !== false,
    visible: isVisible !== false,
    approved: approved !== false,
    categoryId: value.categoryId || value.category || "",
    votes: Number(value.votes || 0)
  };
}

function sortTeams(items) {
  return [...items].sort((left, right) => {
    const orderDifference = Number(left.sortOrder || left.order || 0) - Number(right.sortOrder || right.order || 0);
    if (orderDifference !== 0) return orderDifference;
    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

export function subscribeTeams(onData, onError) {
  return onSnapshot(
    collection(db, collections.teams),
    (snapshot) => {
      onData(sortTeams(snapshot.docs.map((docItem) => normalizeTeam(docItem.id, docItem.data()))));
    },
    onError
  );
}

export function subscribeVisibleTeams(onData, onError) {
  return onSnapshot(
    query(collection(db, collections.teams), where("isVisible", "==", true)),
    (snapshot) => {
      onData(sortTeams(snapshot.docs.map((docItem) => normalizeTeam(docItem.id, docItem.data()))));
    },
    onError
  );
}

export async function saveTeam(item, actor, activityLabel, previousValue) {
  const id = item.id || `team-${Date.now()}`;
  const nextValue = {
    ...item,
    id,
    isVisible: item.isVisible ?? item.visible ?? true,
    approved: item.approved !== false,
    updatedAt: serverTimestamp(),
    updatedBy: actor
  };

  delete nextValue.visible;
  await setDoc(doc(db, collections.teams, id), nextValue, { merge: true });

  await logActivity({
    actor,
    section: collections.teams,
    action: activityLabel,
    previousValue,
    nextValue
  });
}

export async function updateTeamFields(id, fields, actor, activityLabel, previousValue) {
  const normalizedFields = { ...fields };

  if (Object.prototype.hasOwnProperty.call(normalizedFields, "visible")) {
    normalizedFields.isVisible = normalizedFields.visible;
    delete normalizedFields.visible;
  }

  const nextValue = {
    ...normalizedFields,
    updatedAt: serverTimestamp(),
    updatedBy: actor
  };

  await updateDoc(doc(db, collections.teams, id), nextValue);

  await logActivity({
    actor,
    section: collections.teams,
    action: activityLabel,
    previousValue,
    nextValue: { ...(previousValue || {}), ...nextValue }
  });
}

export async function deleteTeam(item, actor) {
  await deleteDoc(doc(db, collections.teams, item.id));
  await logActivity({
    actor,
    section: collections.teams,
    action: `Deleted ${item.name || item.id}`,
    previousValue: item,
    nextValue: null
  });
}

export async function fetchCollectionItems(name, options = {}) {
  const collectionRef = collection(db, name);
  const baseConstraints = [];
  const limitConstraint = options.limit ? limit(options.limit) : null;

  if (options.where) {
    baseConstraints.push(where(options.where.field, options.where.operator, options.where.value));
  }

  const requestedOrder = options.orderBy
    || ((name === collections.registrations || name === collections.contacts || name === collections.registrationInterest)
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
    if (section === collections.teams) {
      const restoredValue = {
        ...previousValue,
        isVisible: previousValue.isVisible ?? previousValue.visible ?? true,
        restoredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: actor
      };
      delete restoredValue.visible;
      await setDoc(doc(db, collections.teams, targetId), restoredValue, { merge: true });
      await logActivity({
        actor,
        section,
        action: `Restored ${targetId}`,
        previousValue: null,
        nextValue: previousValue
      });
      return;
    }

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
