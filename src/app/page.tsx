"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import type {
  Ability,
  AbilityKey,
  Attack,
  CharacterSheet,
  DetailEntry,
  EquipmentItem,
  NpcNote,
  PanelId,
} from "@/lib/character-sheet";
import { normalizeCharacterSheet } from "@/lib/character-sheet";

const STORAGE_KEY = "dnd-tracker-character";
const SAVE_DELAY_MS = 700;
const builtInJournalTags = [
  "session",
  "quest",
  "loot",
  "rumor",
  "location",
  "combat",
] as const;

type SaveState = "loading" | "saving" | "saved" | "error";
type ProficiencyKey = keyof CharacterSheet["proficiencies"];
type AppTab = "sheet" | "inventory" | "notes" | "journal" | "npcs";
type JournalView = "all" | "pinned" | "untagged";

const inventoryCategories = [
  { id: "weapons", label: "Weapons" },
  { id: "consumables", label: "Consumables" },
  { id: "gear", label: "Gear" },
  { id: "valuables", label: "Valuables" },
  { id: "quest", label: "Quest / Misc" },
] as const;

const abilityOrder: AbilityKey[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

const emptyAttack = (): Attack => ({
  name: "",
  damage: "",
  stat: "",
  range: "",
});

const emptyDetailEntry = (): DetailEntry => ({
  title: "",
  description: "",
});

const emptyEquipment = (): EquipmentItem => ({
  name: "",
  count: "",
  description: "",
  category: "gear",
});

const emptyTracker = () => ({
  name: "",
  current: "",
  max: "",
});

const emptyNpc = (): NpcNote => ({
  name: "",
  notes: "",
});

function totalModifierFor(score: number, bonus: number) {
  const modifier = Math.floor((score - 10) / 2) + bonus;
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

function updatedSheet(
  current: CharacterSheet,
  update: (sheet: CharacterSheet) => CharacterSheet,
) {
  const next = update(current);
  return {
    ...next,
    meta: {
      ...next.meta,
      updatedAt: new Date().toISOString(),
    },
  };
}

function newerSheet(localSheet: CharacterSheet | null, serverSheet: CharacterSheet) {
  if (!localSheet) {
    return { selected: serverSheet, localWasNewer: false };
  }

  const localTime = Date.parse(localSheet.meta.updatedAt);
  const serverTime = Date.parse(serverSheet.meta.updatedAt);

  if (Number.isNaN(localTime) || localTime >= serverTime) {
    return { selected: localSheet, localWasNewer: true };
  }

  return { selected: serverSheet, localWasNewer: false };
}

function tabFromLocationSearch() {
  if (typeof window === "undefined") {
    return "sheet" as AppTab;
  }

  const value = new URLSearchParams(window.location.search).get("tab");
  if (
    value === "inventory" ||
    value === "notes" ||
    value === "journal" ||
    value === "npcs"
  ) {
    return value;
  }

  return "sheet";
}

export default function Home() {
  const [sheet, setSheet] = useState<CharacterSheet | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [saveMessage, setSaveMessage] = useState("Loading character...");
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("sheet");
  const [selectedNpcIndex, setSelectedNpcIndex] = useState(0);
  const [journalDraftContent, setJournalDraftContent] = useState("");
  const [journalDraftTags, setJournalDraftTags] = useState<string[]>([]);
  const [journalCustomTag, setJournalCustomTag] = useState("");
  const [editingJournalEntryId, setEditingJournalEntryId] = useState<string | null>(null);
  const [journalView, setJournalView] = useState<JournalView>("all");
  const [activeJournalTag, setActiveJournalTag] = useState<string | null>(null);

  const hasSkippedInitialSave = useRef(false);

  async function persistSheet(nextSheet: CharacterSheet) {
    const response = await fetch("/api/character", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(nextSheet),
    });

    if (!response.ok) {
      throw new Error("Failed to save your sheet to the local JSON file.");
    }
  }

  useEffect(() => {
    setActiveTab(tabFromLocationSearch());
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeTab === "sheet") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", activeTab);
    }

    window.history.replaceState({}, "", url);
  }, [activeTab]);

  useEffect(() => {
    let isMounted = true;

    async function loadSheet() {
      try {
        const [serverResponse, localDraftRaw] = await Promise.all([
          fetch("/api/character", { cache: "no-store" }),
          Promise.resolve(window.localStorage.getItem(STORAGE_KEY)),
        ]);

        if (!serverResponse.ok) {
          throw new Error("Failed to load the character data from the server.");
        }

        const serverData = normalizeCharacterSheet(await serverResponse.json());

        if (!serverData) {
          throw new Error("Server character data is invalid.");
        }

        const localDraft = localDraftRaw ? JSON.parse(localDraftRaw) : null;
        const validatedLocalDraft = normalizeCharacterSheet(localDraft);
        const { selected, localWasNewer } = newerSheet(
          validatedLocalDraft,
          serverData,
        );

        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));

        if (!isMounted) {
          return;
        }

        setSheet(selected);
        setSelectedNpcIndex(Math.min(0, Math.max(selected.npcs.length - 1, 0)));
        setHydrated(true);
        setSaveState("saved");
        setSaveMessage("All changes saved locally and on your machine.");

        if (localWasNewer) {
          setSaveState("saving");
          setSaveMessage("Syncing your newer browser draft to disk...");
          await persistSheet(selected);

          if (!isMounted) {
            return;
          }

          setSaveState("saved");
          setSaveMessage("Recovered your newer local draft and synced it.");
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to load the sheet.";
        setSaveState("error");
        setSaveMessage(message);
      }
    }

    void loadSheet();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!sheet || !hydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sheet));

    if (!hasSkippedInitialSave.current) {
      hasSkippedInitialSave.current = true;
      return;
    }

    setSaveState("saving");
    setSaveMessage("Saving your latest changes...");

    const timeout = window.setTimeout(() => {
      void persistSheet(sheet)
        .then(() => {
          setSaveState("saved");
          setSaveMessage("All changes saved locally and on your machine.");
        })
        .catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : "Save failed, but your browser draft is still safe.";
          setSaveState("error");
          setSaveMessage(message);
        });
    }, SAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [hydrated, sheet]);

  useEffect(() => {
    if (!sheet) {
      return;
    }

    if (sheet.npcs.length === 0) {
      setSelectedNpcIndex(0);
      return;
    }

    setSelectedNpcIndex((current) =>
      Math.min(Math.max(current, 0), sheet.npcs.length - 1),
    );
  }, [sheet]);

  function applyUpdate(update: (current: CharacterSheet) => CharacterSheet) {
    setSheet((current) => (current ? updatedSheet(current, update) : current));
  }

  function addAttack() {
    applyUpdate((current) => ({
      ...current,
      attacks: [...current.attacks, emptyAttack()],
    }));
  }

  function addTrait() {
    applyUpdate((current) => ({
      ...current,
      traits: [...current.traits, emptyDetailEntry()],
    }));
  }

  function addFeat() {
    applyUpdate((current) => ({
      ...current,
      feats: [...current.feats, emptyDetailEntry()],
    }));
  }

  function addEquipment(category = "gear") {
    applyUpdate((current) => ({
      ...current,
      equipment: [...current.equipment, { ...emptyEquipment(), category }],
    }));
  }

  function addProficiency(kind: ProficiencyKey) {
    applyUpdate((current) => ({
      ...current,
      proficiencies: {
        ...current.proficiencies,
        [kind]: [...current.proficiencies[kind], ""],
      },
    }));
  }

  function addLanguage() {
    applyUpdate((current) => ({
      ...current,
      languages: [...current.languages, ""],
    }));
  }

  function addAttunement() {
    applyUpdate((current) => ({
      ...current,
      attunement: [...current.attunement, ""],
    }));
  }

  function addTracker() {
    applyUpdate((current) => ({
      ...current,
      trackers: [...current.trackers, emptyTracker()],
    }));
  }

  function addNpc() {
    applyUpdate((current) => ({
      ...current,
      npcs: [...current.npcs, emptyNpc()],
    }));
    setSelectedNpcIndex(sheet?.npcs.length ?? 0);
  }

  function publishJournalEntry() {
    const nextContent = journalDraftContent.trim();
    const nextTags = Array.from(new Set(journalDraftTags.map(normalizeTag).filter(Boolean)));

    if (!nextContent) {
      return;
    }

    applyUpdate((current) => ({
      ...current,
      journalEntries: [
        {
          title: "",
          content: nextContent,
          createdAt: new Date().toISOString(),
          tags: nextTags,
          pinned: false,
        },
        ...current.journalEntries,
      ],
    }));

    setJournalDraftContent("");
    setJournalDraftTags([]);
    setJournalCustomTag("");
  }

  function toggleJournalDraftTag(tag: string) {
    const normalized = normalizeTag(tag);

    setJournalDraftTags((current) =>
      current.includes(normalized)
        ? current.filter((entry) => entry !== normalized)
        : [...current, normalized],
    );
  }

  function addCustomJournalTag() {
    const normalized = normalizeTag(journalCustomTag);

    if (!normalized) {
      return;
    }

    setJournalDraftTags((current) =>
      current.includes(normalized) ? current : [...current, normalized],
    );
    setJournalCustomTag("");
  }

  const equipmentByCategory = useMemo(
    () =>
      inventoryCategories.map((category) => ({
        ...category,
        items: (sheet?.equipment ?? [])
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => (item.category || "gear") === category.id),
      })),
    [sheet?.equipment],
  );

  const journalEntries = useMemo(
    () =>
      [...(sheet?.journalEntries ?? [])].sort(
        (a, b) => {
          if (a.pinned !== b.pinned) {
            return a.pinned ? -1 : 1;
          }

          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
        },
      ),
    [sheet?.journalEntries],
  );

  const availableJournalTags = useMemo(() => {
    const discovered = new Set<string>(builtInJournalTags);

    for (const entry of sheet?.journalEntries ?? []) {
      for (const tag of entry.tags ?? []) {
        const normalized = normalizeTag(tag);
        if (normalized) {
          discovered.add(normalized);
        }
      }
    }

    return Array.from(discovered);
  }, [sheet?.journalEntries]);

  const filteredJournalEntries = useMemo(
    () =>
      journalEntries.filter((entry) => {
        const hasTagFilter = !!activeJournalTag;
        const matchesTag = hasTagFilter
          ? entry.tags.includes(activeJournalTag)
          : true;

        const matchesView =
          journalView === "all"
            ? true
            : journalView === "pinned"
              ? entry.pinned
              : entry.tags.length === 0;

        return matchesTag && matchesView;
      }),
    [activeJournalTag, journalEntries, journalView],
  );

  if (!sheet) {
    return (
      <main className={styles.page}>
        <section className={styles.loadingPanel}>
          <p className={styles.helperLabel}>D&D Tracker</p>
          <h1>Preparing your character sheet</h1>
          <p className={styles.helper}>{saveMessage}</p>
        </section>
      </main>
    );
  }

  const selectedNpc = sheet.npcs[selectedNpcIndex] ?? null;

  const panelContent: Record<PanelId, ReactNode> = {
    combat: (
      <section
        className={`${styles.panel} ${styles.playPanel} ${styles.tacticalPanel} ${styles.combatPanel}`}
      >
        <div className={styles.panelHeader}>
          <h2>Combat</h2>
        </div>
        <div className={styles.combatGrid}>
          {sheet.combat.map((item, index) => (
            <label key={item.label} className={styles.statCard}>
              <span>{shortStatLabel(item.label)}</span>
              <input
                value={item.value}
                onChange={(event) =>
                  applyUpdate((current) => ({
                    ...current,
                    combat: current.combat.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, value: event.target.value } : entry,
                    ),
                  }))
                }
              />
            </label>
          ))}
        </div>
      </section>
    ),
    abilities: (
      <section className={`${styles.panel} ${styles.playPanel}`}>
        <div className={styles.panelHeader}>
          <h2>Abilities</h2>
        </div>
        <div className={styles.table}>
          <div className={styles.tableHeader}>
            <span>Ability</span>
            <span>Mod</span>
            <span>Bonus</span>
            <span>Score</span>
          </div>
          {abilityOrder.map((key) => {
            const ability: Ability = sheet.abilities[key];
            const abilityScore = Number.isFinite(ability.value) ? ability.value : 0;
            const abilityBonus = Number.isFinite(ability.bonus) ? ability.bonus : 0;

            return (
              <div key={key} className={styles.abilityRow}>
                <span className={styles.rowLabel}>{ability.label}</span>
                <strong>{totalModifierFor(abilityScore, abilityBonus)}</strong>
                <input
                  type="number"
                  value={abilityBonus}
                  onChange={(event) =>
                    applyUpdate((current) => ({
                      ...current,
                      abilities: {
                        ...current.abilities,
                        [key]: {
                          ...current.abilities[key],
                          bonus: Number(event.target.value || "0"),
                        },
                      },
                    }))
                  }
                />
                <input
                  type="number"
                  value={abilityScore}
                  onChange={(event) =>
                    applyUpdate((current) => ({
                      ...current,
                      abilities: {
                        ...current.abilities,
                        [key]: {
                          ...current.abilities[key],
                          value: Number(event.target.value || "0"),
                        },
                      },
                    }))
                  }
                />
              </div>
            );
          })}
        </div>
      </section>
    ),
    trackers: (
      <section
        className={`${styles.panel} ${styles.playPanel} ${styles.tacticalPanel} ${styles.trackerPanel}`}
      >
        <div className={styles.panelHeader}>
          <h2>Trackers</h2>
          <button
            aria-label="Add tracker"
            className={styles.miniButton}
            onClick={addTracker}
            type="button"
          >
            +
          </button>
        </div>
        <div className={styles.table}>
          <div className={`${styles.tableHeader} ${styles.trackerRow}`}>
            <span>Name</span>
            <span>Now</span>
            <span>Max</span>
            <span />
          </div>
          {sheet.trackers.map((tracker, index) => (
            <div key={`tracker-${index}`} className={`${styles.tableRow} ${styles.trackerRow}`}>
              <input
                value={tracker.name}
                onChange={(event) =>
                  applyUpdate((current) => ({
                    ...current,
                    trackers: current.trackers.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, name: event.target.value } : entry,
                    ),
                  }))
                }
              />
              <input
                value={tracker.current}
                onChange={(event) =>
                  applyUpdate((current) => ({
                    ...current,
                    trackers: current.trackers.map((entry, entryIndex) =>
                      entryIndex === index
                        ? { ...entry, current: event.target.value }
                        : entry,
                    ),
                  }))
                }
              />
              <input
                value={tracker.max}
                onChange={(event) =>
                  applyUpdate((current) => ({
                    ...current,
                    trackers: current.trackers.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, max: event.target.value } : entry,
                    ),
                  }))
                }
              />
              <button
                aria-label={`Remove tracker ${tracker.name || index + 1}`}
                className={styles.iconButton}
                onClick={() =>
                  applyUpdate((current) => ({
                    ...current,
                    trackers: current.trackers.filter((_, entryIndex) => entryIndex !== index),
                  }))
                }
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>
    ),
    weapons: (
      <section className={`${styles.panel} ${styles.playPanel} ${styles.dataPanel}`}>
        <div className={styles.panelHeader}>
          <h2>Weapons</h2>
          <button
            aria-label="Add weapon"
            className={styles.miniButton}
            onClick={addAttack}
            type="button"
          >
            +
          </button>
        </div>
        <div className={styles.table}>
          <div className={`${styles.tableHeader} ${styles.attackRow}`}>
            <span>Name</span>
            <span>Damage</span>
            <span>Stat</span>
            <span>Range</span>
            <span />
          </div>
          {sheet.attacks.map((attack, index) => (
            <div key={`attack-${index}`} className={`${styles.tableRow} ${styles.attackRow}`}>
              <input
                value={attack.name}
                onChange={(event) =>
                  applyUpdate((current) => ({
                    ...current,
                    attacks: current.attacks.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, name: event.target.value } : entry,
                    ),
                  }))
                }
              />
              <input
                value={attack.damage}
                onChange={(event) =>
                  applyUpdate((current) => ({
                    ...current,
                    attacks: current.attacks.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, damage: event.target.value } : entry,
                    ),
                  }))
                }
              />
              <input
                value={attack.stat}
                onChange={(event) =>
                  applyUpdate((current) => ({
                    ...current,
                    attacks: current.attacks.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, stat: event.target.value } : entry,
                    ),
                  }))
                }
              />
              <input
                value={attack.range}
                onChange={(event) =>
                  applyUpdate((current) => ({
                    ...current,
                    attacks: current.attacks.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, range: event.target.value } : entry,
                    ),
                  }))
                }
              />
              <button
                aria-label={`Remove weapon ${attack.name || index + 1}`}
                className={styles.iconButton}
                onClick={() =>
                  applyUpdate((current) => ({
                    ...current,
                    attacks: current.attacks.filter((_, entryIndex) => entryIndex !== index),
                  }))
                }
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>
    ),
    features: (
      <section className={`${styles.panel} ${styles.playPanel} ${styles.dataPanel}`}>
        <div className={styles.panelHeader}>
          <h2>Features</h2>
        </div>
        <div className={styles.featureColumns}>
          <section className={styles.subsection}>
            <div className={styles.subsectionHeader}>
              <h3>Traits</h3>
              <button
                aria-label="Add trait"
                className={styles.miniButton}
                onClick={addTrait}
                type="button"
              >
                +
              </button>
            </div>
            <div className={styles.table}>
              {sheet.traits.map((trait, index) => (
                <div key={`trait-${index}`} className={`${styles.tableRow} ${styles.detailRow}`}>
                  <input
                    value={trait.title}
                    onChange={(event) =>
                      applyUpdate((current) => ({
                        ...current,
                        traits: current.traits.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, title: event.target.value } : entry,
                        ),
                      }))
                    }
                  />
                  <input
                    value={trait.description}
                    onChange={(event) =>
                      applyUpdate((current) => ({
                        ...current,
                        traits: current.traits.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, description: event.target.value }
                            : entry,
                        ),
                      }))
                    }
                  />
                  <button
                    aria-label={`Remove trait ${trait.title || index + 1}`}
                    className={styles.iconButton}
                    onClick={() =>
                      applyUpdate((current) => ({
                        ...current,
                        traits: current.traits.filter((_, entryIndex) => entryIndex !== index),
                      }))
                    }
                    type="button"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.subsection}>
            <div className={styles.subsectionHeader}>
              <h3>Feats</h3>
              <button
                aria-label="Add feat"
                className={styles.miniButton}
                onClick={addFeat}
                type="button"
              >
                +
              </button>
            </div>
            <div className={styles.table}>
              {sheet.feats.map((feat, index) => (
                <div key={`feat-${index}`} className={`${styles.tableRow} ${styles.detailRow}`}>
                  <input
                    value={feat.title}
                    onChange={(event) =>
                      applyUpdate((current) => ({
                        ...current,
                        feats: current.feats.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, title: event.target.value } : entry,
                        ),
                      }))
                    }
                  />
                  <input
                    value={feat.description}
                    onChange={(event) =>
                      applyUpdate((current) => ({
                        ...current,
                        feats: current.feats.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, description: event.target.value }
                            : entry,
                        ),
                      }))
                    }
                  />
                  <button
                    aria-label={`Remove feat ${feat.title || index + 1}`}
                    className={styles.iconButton}
                    onClick={() =>
                      applyUpdate((current) => ({
                        ...current,
                        feats: current.feats.filter((_, entryIndex) => entryIndex !== index),
                      }))
                    }
                    type="button"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    ),
  };

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroTitleBlock}>
          <h1>{sheet.hero.name || "Your hero"}</h1>
          <div className={styles.tabBar}>
            {([
              ["sheet", "Sheet"],
              ["inventory", "Inventory"],
              ["notes", "Notes"],
              ["journal", "Journal"],
              ["npcs", "NPCs"],
            ] as [AppTab, string][]).map(([tab, label]) => (
              <button
                key={tab}
                className={`${styles.tabButton} ${
                  activeTab === tab ? styles.tabButtonActive : ""
                }`}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.heroActions}>
          <div
            className={`${styles.saveBadge} ${
              saveState === "error" ? styles.saveError : ""
            }`}
            title={saveMessage}
          >
            <span className={styles.saveDot} />
            {saveState === "loading" && "Loading"}
            {saveState === "saving" && "Saving"}
            {saveState === "saved" && "Saved"}
            {saveState === "error" && "Save issue"}
          </div>
        </div>
      </section>

      {activeTab === "sheet" ? (
        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <section className={`${styles.sideCard} ${styles.identityCard}`}>
              <div className={styles.sideHeader}>
                <span className={styles.sideLabel}>Character</span>
                <span className={styles.sideMeta}>Low-touch info</span>
              </div>

              <label className={styles.sideField}>
                <span>Name</span>
                <input
                  value={sheet.hero.name}
                  onChange={(event) =>
                    applyUpdate((current) => ({
                      ...current,
                      hero: { ...current.hero, name: event.target.value },
                    }))
                  }
                />
              </label>

              <div className={styles.sideGrid}>
                {([
                  ["Class", "className"],
                  ["Subclass", "subclass"],
                  ["Level", "level"],
                  ["XP", "xp"],
                  ["Species", "ancestry"],
                  ["Background", "background"],
                ] as [string, keyof CharacterSheet["hero"]][]).map(([label, key]) => (
                  <label key={key} className={styles.sideField}>
                    <span>{label}</span>
                    <input
                      value={sheet.hero[key]}
                      onChange={(event) =>
                        applyUpdate((current) => ({
                          ...current,
                          hero: { ...current.hero, [key]: event.target.value },
                        }))
                      }
                    />
                  </label>
                ))}
                <label className={`${styles.sideField} ${styles.sideFieldWide}`}>
                  <span>Alignment</span>
                  <input
                    value={sheet.hero.alignment}
                    onChange={(event) =>
                      applyUpdate((current) => ({
                        ...current,
                        hero: { ...current.hero, alignment: event.target.value },
                      }))
                    }
                  />
                </label>
              </div>
            </section>

            <section className={`${styles.sideCard} ${styles.referenceCard}`}>
              <div className={styles.sideSectionHeader}>
                <h2>Proficiencies</h2>
              </div>
              {(Object.entries(sheet.proficiencies) as [ProficiencyKey, string[]][]).map(
                ([kind, items]) => (
                  <div key={kind} className={styles.sideGroup}>
                    <div className={styles.sideSubheader}>
                      <h3>{kind}</h3>
                      <button
                        aria-label={`Add ${kind} proficiency`}
                        className={styles.miniButton}
                        onClick={() => addProficiency(kind)}
                        type="button"
                      >
                        +
                      </button>
                    </div>
                    <div className={`${styles.sideList} ${styles.sideChipList}`}>
                      {items.map((item, index) => (
                        <div key={`${kind}-${index}`} className={`${styles.sideListRow} ${styles.sideChip}`}>
                          <input
                            value={item}
                            onChange={(event) =>
                              applyUpdate((current) => ({
                                ...current,
                                proficiencies: {
                                  ...current.proficiencies,
                                  [kind]: current.proficiencies[kind].map(
                                    (entry, entryIndex) =>
                                      entryIndex === index ? event.target.value : entry,
                                  ),
                                },
                              }))
                            }
                          />
                          <button
                            aria-label={`Remove ${kind} proficiency ${item || index + 1}`}
                            className={styles.iconButton}
                            onClick={() =>
                              applyUpdate((current) => ({
                                ...current,
                                proficiencies: {
                                  ...current.proficiencies,
                                  [kind]: current.proficiencies[kind].filter(
                                    (_, entryIndex) => entryIndex !== index,
                                  ),
                                },
                              }))
                            }
                            type="button"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </section>

            <section className={`${styles.sideCard} ${styles.referenceCard}`}>
              <div className={styles.sideSectionHeader}>
                <h2>Languages</h2>
                <button
                  aria-label="Add language"
                  className={styles.miniButton}
                  onClick={addLanguage}
                  type="button"
                >
                  +
                </button>
              </div>
              <div className={`${styles.sideList} ${styles.sideChipList}`}>
                {sheet.languages.map((item, index) => (
                  <div key={`language-${index}`} className={`${styles.sideListRow} ${styles.sideChip}`}>
                    <input
                      value={item}
                      onChange={(event) =>
                        applyUpdate((current) => ({
                          ...current,
                          languages: current.languages.map((entry, entryIndex) =>
                            entryIndex === index ? event.target.value : entry,
                          ),
                        }))
                      }
                    />
                    <button
                      aria-label={`Remove language ${item || index + 1}`}
                      className={styles.iconButton}
                      onClick={() =>
                        applyUpdate((current) => ({
                          ...current,
                          languages: current.languages.filter(
                            (_, entryIndex) => entryIndex !== index,
                          ),
                        }))
                      }
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className={`${styles.sideCard} ${styles.referenceCard}`}>
              <div className={styles.sideSectionHeader}>
                <h2>Attunement</h2>
                <button
                  aria-label="Add attuned item"
                  className={styles.miniButton}
                  onClick={addAttunement}
                  type="button"
                >
                  +
                </button>
              </div>
              <div className={`${styles.sideList} ${styles.sideChipList}`}>
                {sheet.attunement.map((item, index) => (
                  <div key={`attunement-${index}`} className={`${styles.sideListRow} ${styles.sideChip}`}>
                    <input
                      value={item}
                      onChange={(event) =>
                        applyUpdate((current) => ({
                          ...current,
                          attunement: current.attunement.map((entry, entryIndex) =>
                            entryIndex === index ? event.target.value : entry,
                          ),
                        }))
                      }
                    />
                    <button
                      aria-label={`Remove attuned item ${item || index + 1}`}
                      className={styles.iconButton}
                      onClick={() =>
                        applyUpdate((current) => ({
                          ...current,
                          attunement: current.attunement.filter(
                            (_, entryIndex) => entryIndex !== index,
                          ),
                        }))
                      }
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className={`${styles.sideCard} ${styles.referenceCard}`}>
              <div className={styles.sideSectionHeader}>
                <h2>Coin pouch</h2>
              </div>
              <div className={styles.sidebarCoins}>
                {(Object.entries(sheet.coins) as [keyof CharacterSheet["coins"], string][]).map(
                  ([coin, value]) => (
                    <label key={coin} className={styles.coinCard}>
                      <span>{coin.toUpperCase()}</span>
                      <input
                        value={value}
                        onChange={(event) =>
                          applyUpdate((current) => ({
                            ...current,
                            coins: {
                              ...current.coins,
                              [coin]: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                  ),
                )}
              </div>
            </section>
          </aside>

          <section className={styles.mainBoard}>
            <div className={styles.sheetGrid}>
              <div className={`${styles.gridSlot} ${styles.gridCombat}`}>{panelContent.combat}</div>
              <div className={`${styles.gridSlot} ${styles.gridAbilities}`}>
                {panelContent.abilities}
              </div>
              <div className={`${styles.gridSlot} ${styles.gridTrackers}`}>
                {panelContent.trackers}
              </div>
              <div className={`${styles.gridSlot} ${styles.gridWeapons}`}>{panelContent.weapons}</div>
              <div className={`${styles.gridSlot} ${styles.gridFeatures}`}>
                {panelContent.features}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "inventory" ? (
        <section className={styles.inventoryPanel}>
          <div className={styles.writerHeader}>
            <div>
              <p className={styles.helperLabel}>Inventory</p>
              <h2>Items and kit</h2>
            </div>
          </div>
          <div className={styles.inventoryGrid}>
            {equipmentByCategory.map((category) => (
              <section key={category.id} className={styles.inventoryCategory}>
                <div className={styles.inventoryHeader}>
                  <div>
                    <p className={styles.helperLabel}>{category.label}</p>
                    <h2>{category.items.length} item{category.items.length === 1 ? "" : "s"}</h2>
                  </div>
                  <button
                    aria-label={`Add ${category.label} item`}
                    className={styles.tabAction}
                    onClick={() => addEquipment(category.id)}
                    type="button"
                  >
                    Add item
                  </button>
                </div>
                <div className={styles.inventoryCategoryList}>
                  {category.items.map(({ item, index }) => (
                    <section key={`inventory-${index}`} className={styles.inventoryItem}>
                      <div className={styles.inventoryTopRow}>
                        <input
                          value={item.name}
                          onChange={(event) =>
                            applyUpdate((current) => ({
                              ...current,
                              equipment: current.equipment.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, name: event.target.value }
                                  : entry,
                              ),
                            }))
                          }
                          placeholder="Item name"
                        />
                        <input
                          value={item.count}
                          onChange={(event) =>
                            applyUpdate((current) => ({
                              ...current,
                              equipment: current.equipment.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, count: event.target.value }
                                  : entry,
                              ),
                            }))
                          }
                          placeholder="Qty"
                        />
                        <select
                          value={item.category || "gear"}
                          onChange={(event) =>
                            applyUpdate((current) => ({
                              ...current,
                              equipment: current.equipment.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, category: event.target.value }
                                  : entry,
                              ),
                            }))
                          }
                        >
                          {inventoryCategories.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          aria-label={`Remove item ${item.name || index + 1}`}
                          className={styles.tabCloseButton}
                          onClick={() =>
                            applyUpdate((current) => ({
                              ...current,
                              equipment: current.equipment.filter(
                                (_, entryIndex) => entryIndex !== index,
                              ),
                            }))
                          }
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={item.description}
                        onChange={(event) =>
                          applyUpdate((current) => ({
                            ...current,
                            equipment: current.equipment.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, description: event.target.value }
                                : entry,
                            ),
                          }))
                        }
                        placeholder="Description, origin, effect, or reminder..."
                      />
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "notes" ? (
        <section className={styles.writerPanel}>
          <div className={styles.writerHeader}>
            <div>
              <p className={styles.helperLabel}>Scratchpad</p>
              <h2>Notes</h2>
            </div>
            <p className={styles.helper}>{saveMessage}</p>
          </div>
          <label className={styles.writerField}>
            <span>Notes</span>
            <textarea
              rows={24}
              value={sheet.notes}
              onChange={(event) =>
                applyUpdate((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </label>
        </section>
      ) : null}

      {activeTab === "journal" ? (
        <section className={styles.journalPanel}>
          <div className={styles.writerHeader}>
            <div>
              <p className={styles.helperLabel}>Campaign log</p>
              <h2>Party feed</h2>
            </div>
            <p className={styles.helper}>Post short updates like a session timeline.</p>
          </div>
          <section className={styles.journalComposer}>
            <div className={styles.journalComposerAvatar}>
              {sheet.hero.name.trim().charAt(0) || "K"}
            </div>
            <div className={styles.journalComposerBody}>
              <textarea
                rows={4}
                className={styles.journalComposerTextarea}
                value={journalDraftContent}
                onChange={(event) => setJournalDraftContent(event.target.value)}
                placeholder="What's happening in the campaign?"
              />
              <div className={styles.journalTagRow}>
                {builtInJournalTags.map((tag) => (
                  <button
                    key={tag}
                    className={`${styles.tagChip} ${
                      journalDraftTags.includes(tag) ? styles.tagChipActive : ""
                    }`}
                    onClick={() => toggleJournalDraftTag(tag)}
                    type="button"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
              <div className={styles.journalCustomTagRow}>
                <input
                  value={journalCustomTag}
                  onChange={(event) => setJournalCustomTag(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomJournalTag();
                    }
                  }}
                  placeholder="Add custom tag"
                />
                <button
                  className={styles.miniButton}
                  onClick={addCustomJournalTag}
                  type="button"
                >
                  +
                </button>
              </div>
              {journalDraftTags.length > 0 ? (
                <div className={styles.journalSelectedTags}>
                  {journalDraftTags.map((tag) => (
                    <button
                      key={tag}
                      className={`${styles.tagChip} ${styles.tagChipActive}`}
                      onClick={() => toggleJournalDraftTag(tag)}
                      type="button"
                    >
                      #{tag} ×
                    </button>
                  ))}
                </div>
              ) : null}
              <div className={styles.journalComposerFooter}>
                <span className={styles.helper}>
                  Quick log, rumor, clue, loot, or cliffhanger.
                </span>
                <button
                  aria-label="Publish journal entry"
                  className={styles.tabAction}
                  disabled={!journalDraftContent.trim()}
                  onClick={publishJournalEntry}
                  type="button"
                >
                  Post
                </button>
              </div>
            </div>
          </section>
          <section className={styles.journalFilters}>
            <div className={styles.journalViewTabs}>
              {([
                ["all", "All"],
                ["pinned", "Pinned"],
                ["untagged", "Untagged"],
              ] as [JournalView, string][]).map(([view, label]) => (
                <button
                  key={view}
                  className={`${styles.filterChip} ${
                    journalView === view ? styles.filterChipActive : ""
                  }`}
                  onClick={() => setJournalView(view)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className={styles.journalTagFilters}>
              <button
                className={`${styles.filterChip} ${
                  activeJournalTag === null ? styles.filterChipActive : ""
                }`}
                onClick={() => setActiveJournalTag(null)}
                type="button"
              >
                All tags
              </button>
              {availableJournalTags.map((tag) => (
                <button
                  key={tag}
                  className={`${styles.filterChip} ${
                    activeJournalTag === tag ? styles.filterChipActive : ""
                  }`}
                  onClick={() => setActiveJournalTag(tag)}
                  type="button"
                >
                  #{tag}
                </button>
              ))}
            </div>
          </section>
          <div className={styles.journalWall}>
            {filteredJournalEntries.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.helperLabel}>Journal</p>
                <h2>No entries yet</h2>
                <p className={styles.helper}>
                  Drop in quick updates like session recaps, rumors, loot finds, or cliffhangers.
                </p>
              </div>
            ) : (
              filteredJournalEntries.map((entry) => {
                const actualIndex = sheet.journalEntries.findIndex(
                  (candidate) => candidate.createdAt === entry.createdAt,
                );

                return (
                  <article key={entry.createdAt} className={styles.journalEntry}>
                    <div className={styles.journalEntryAvatar}>
                      {sheet.hero.name.trim().charAt(0) || "K"}
                    </div>
                    <div className={styles.journalEntryBody}>
                      <div className={styles.journalMeta}>
                        <div className={styles.journalMetaText}>
                          <strong>{sheet.hero.name || "Your hero"}</strong>
                          <span>{journalHandleFor(sheet.hero.name)}</span>
                          <span>{formatEntryDate(entry.createdAt)}</span>
                          {entry.pinned ? <span className={styles.pinnedMarker}>Pinned</span> : null}
                        </div>
                        <div className={styles.journalEntryActions}>
                          <button
                            aria-label={`${entry.pinned ? "Unpin" : "Pin"} journal entry`}
                            className={`${styles.miniButton} ${
                              entry.pinned ? styles.miniButtonActive : ""
                            }`}
                            onClick={() =>
                              applyUpdate((current) => ({
                                ...current,
                                journalEntries: current.journalEntries.map((candidate, index) =>
                                  index === actualIndex
                                    ? { ...candidate, pinned: !candidate.pinned }
                                    : candidate,
                                ),
                              }))
                            }
                            type="button"
                          >
                            {entry.pinned ? "Unpin" : "Pin"}
                          </button>
                          <button
                            aria-label={`Edit journal entry ${entry.title || entry.createdAt}`}
                            className={styles.miniButton}
                            onClick={() =>
                              setEditingJournalEntryId((current) =>
                                current === entry.createdAt ? null : entry.createdAt,
                              )
                            }
                            type="button"
                          >
                            {editingJournalEntryId === entry.createdAt ? "✓" : "Edit"}
                          </button>
                          <button
                            aria-label={`Remove journal entry ${entry.title || entry.createdAt}`}
                            className={styles.tabCloseButton}
                            onClick={() =>
                              applyUpdate((current) => ({
                                ...current,
                                journalEntries: current.journalEntries.filter(
                                  (_, index) => index !== actualIndex,
                                ),
                              }))
                            }
                            type="button"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      {entry.tags.length > 0 ? (
                        <div className={styles.entryTagList}>
                          {entry.tags.map((tag) => (
                            <button
                              key={`${entry.createdAt}-${tag}`}
                              className={`${styles.tagChip} ${
                                activeJournalTag === tag ? styles.tagChipActive : ""
                              }`}
                              onClick={() => setActiveJournalTag(tag)}
                              type="button"
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {editingJournalEntryId === entry.createdAt ? (
                        <div className={styles.journalEditor}>
                          <textarea
                            rows={5}
                            value={entry.content}
                            onChange={(event) =>
                              applyUpdate((current) => ({
                                ...current,
                                journalEntries: current.journalEntries.map((candidate, index) =>
                                  index === actualIndex
                                    ? { ...candidate, content: event.target.value }
                                    : candidate,
                                ),
                              }))
                            }
                            placeholder="What happened?"
                          />
                        </div>
                      ) : (
                        <div className={styles.journalPost}>
                          <p>{entry.content}</p>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "npcs" ? (
        <section className={styles.npcPanel}>
          <aside className={styles.npcList}>
            <div className={styles.writerHeader}>
              <div>
                <p className={styles.helperLabel}>Reference</p>
                <h2>NPCs</h2>
              </div>
              <button
                aria-label="Add NPC"
                className={styles.tabAction}
                onClick={addNpc}
                type="button"
              >
                Add NPC
              </button>
            </div>
            <div className={styles.npcListItems}>
              {sheet.npcs.map((npc, index) => (
                <button
                  key={`npc-${index}`}
                  className={`${styles.npcListItem} ${
                    selectedNpcIndex === index ? styles.npcListItemActive : ""
                  }`}
                  onClick={() => setSelectedNpcIndex(index)}
                  type="button"
                >
                  {npc.name || `NPC ${index + 1}`}
                </button>
              ))}
            </div>
          </aside>

          <section className={styles.npcDetail}>
            {selectedNpc ? (
              <>
                <div className={styles.writerHeader}>
                  <div>
                    <p className={styles.helperLabel}>Character notes</p>
                    <h2>NPC details</h2>
                  </div>
                  <button
                    aria-label={`Remove NPC ${selectedNpc.name || selectedNpcIndex + 1}`}
                    className={styles.tabCloseButton}
                    onClick={() =>
                      applyUpdate((current) => ({
                        ...current,
                        npcs: current.npcs.filter((_, index) => index !== selectedNpcIndex),
                      }))
                    }
                    type="button"
                  >
                    ×
                  </button>
                </div>
                <label className={styles.writerField}>
                  <span>Name</span>
                  <input
                    value={selectedNpc.name}
                    onChange={(event) =>
                      applyUpdate((current) => ({
                        ...current,
                        npcs: current.npcs.map((entry, index) =>
                          index === selectedNpcIndex
                            ? { ...entry, name: event.target.value }
                            : entry,
                        ),
                      }))
                    }
                    placeholder="NPC name"
                  />
                </label>
                <label className={styles.writerField}>
                  <span>Notes</span>
                  <textarea
                    rows={18}
                    value={selectedNpc.notes}
                    onChange={(event) =>
                      applyUpdate((current) => ({
                        ...current,
                        npcs: current.npcs.map((entry, index) =>
                          index === selectedNpcIndex
                            ? { ...entry, notes: event.target.value }
                            : entry,
                        ),
                      }))
                    }
                    placeholder="Motives, secrets, rumors, voice, allies, debts..."
                  />
                </label>
              </>
            ) : (
              <div className={styles.emptyState}>
                <p className={styles.helperLabel}>NPCs</p>
                <h2>No characters yet</h2>
                <p className={styles.helper}>
                  Add an NPC to keep names, secrets, and reminders in one place.
                </p>
              </div>
            )}
          </section>
        </section>
      ) : null}
    </main>
  );
}

function shortStatLabel(label: string) {
  const map: Record<string, string> = {
    "Armor Class": "AC",
    "Current HP": "HP",
    "Temp HP": "Temp",
    Initiative: "Init",
    Speed: "Speed",
    Size: "Size",
    Proficiency: "Prof",
    "Passive Perception": "Passive",
  };

  return map[label] ?? label;
}

function formatEntryDate(value: string) {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function journalHandleFor(name: string) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 18) || "partylog";

  return `@${base}`;
}

function normalizeTag(value: string) {
  return value.trim().toLowerCase().replace(/^#+/, "").replace(/\s+/g, "-");
}
