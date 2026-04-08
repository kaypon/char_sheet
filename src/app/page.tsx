"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";
import type {
  Ability,
  AbilityKey,
  Attack,
  CharacterSheet,
  DetailEntry,
  EquipmentItem,
} from "@/lib/character-sheet";
import { normalizeCharacterSheet } from "@/lib/character-sheet";

const STORAGE_KEY = "dnd-tracker-character";
const SAVE_DELAY_MS = 700;

type SaveState = "loading" | "saving" | "saved" | "error";

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
});

function modifierFor(score: number) {
  const modifier = Math.floor((score - 10) / 2);
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

function newerSheet(
  localSheet: CharacterSheet | null,
  serverSheet: CharacterSheet,
) {
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

export default function Home() {
  const [sheet, setSheet] = useState<CharacterSheet | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [saveMessage, setSaveMessage] = useState("Loading character...");
  const [hydrated, setHydrated] = useState(false);

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

  function addEquipment() {
    applyUpdate((current) => ({
      ...current,
      equipment: [...current.equipment, emptyEquipment()],
    }));
  }

  if (!sheet) {
    return (
      <main className={styles.page}>
        <section className={styles.loadingPanel}>
          <p className={styles.eyebrow}>D&D Tracker</p>
          <h1>Preparing your character sheet</h1>
          <p className={styles.subtitle}>{saveMessage}</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>D&D Tracker V1</p>
          <h1>{sheet.hero.name || "Your hero"}</h1>
          <p className={styles.subtitle}>
            Fast session edits with local autosave.
          </p>
        </div>

        <div className={styles.heroMeta}>
          <div
            className={`${styles.saveBadge} ${
              saveState === "error" ? styles.saveError : ""
            }`}
          >
            <span className={styles.saveDot} />
            {saveState === "loading" && "Loading"}
            {saveState === "saving" && "Saving"}
            {saveState === "saved" && "Saved"}
            {saveState === "error" && "Save issue"}
          </div>
          <p className={styles.helper}>{saveMessage}</p>
          <p className={styles.helper}>
            Last update: {new Date(sheet.meta.updatedAt).toLocaleString()}
          </p>
        </div>
      </section>

      <div className={styles.topGrid}>
        <section className={`${styles.panel} ${styles.compactPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Identity</p>
              <h2>Overview</h2>
            </div>
          </div>
          <div className={`${styles.heroGrid} ${styles.identityGrid}`}>
            <label className={styles.field}>
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
            <label className={styles.field}>
              <span>Ancestry</span>
              <input
                value={sheet.hero.ancestry}
                onChange={(event) =>
                  applyUpdate((current) => ({
                    ...current,
                    hero: { ...current.hero, ancestry: event.target.value },
                  }))
                }
              />
            </label>
            <label className={styles.field}>
              <span>Background</span>
              <input
                value={sheet.hero.background}
                onChange={(event) =>
                  applyUpdate((current) => ({
                    ...current,
                    hero: { ...current.hero, background: event.target.value },
                  }))
                }
              />
            </label>
            <label className={styles.field}>
              <span>Class</span>
              <input
                value={sheet.hero.className}
                onChange={(event) =>
                  applyUpdate((current) => ({
                    ...current,
                    hero: { ...current.hero, className: event.target.value },
                  }))
                }
              />
            </label>
            <label className={styles.field}>
              <span>Level</span>
              <input
                value={sheet.hero.level}
                onChange={(event) =>
                  applyUpdate((current) => ({
                    ...current,
                    hero: { ...current.hero, level: event.target.value },
                  }))
                }
              />
            </label>
            <label className={styles.field}>
              <span>XP</span>
              <input
                value={sheet.hero.xp}
                onChange={(event) =>
                  applyUpdate((current) => ({
                    ...current,
                    hero: { ...current.hero, xp: event.target.value },
                  }))
                }
              />
            </label>
            <label className={styles.field}>
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

        <section className={`${styles.panel} ${styles.compactPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Combat</p>
              <h2>Critical stats</h2>
            </div>
          </div>
          <div className={`${styles.statGrid} ${styles.compactStatGrid}`}>
            {sheet.combat.map((item, index) => (
              <label key={item.label} className={styles.statCard}>
                <span>{item.label}</span>
                <input
                  value={item.value}
                  onChange={(event) =>
                    applyUpdate((current) => ({
                      ...current,
                      combat: current.combat.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, value: event.target.value }
                          : entry,
                      ),
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.dashboardGrid}>
        <section className={`${styles.panel} ${styles.compactPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Abilities</p>
              <h2>Core stats</h2>
            </div>
          </div>
          <div className={styles.abilityGrid}>
            {abilityOrder.map((key) => {
              const ability: Ability = sheet.abilities[key];

              return (
                <label key={key} className={styles.abilityCard}>
                  <span>{ability.label}</span>
                  <strong>{modifierFor(ability.value)}</strong>
                  <input
                    type="number"
                    value={ability.value}
                    onChange={(event) =>
                      applyUpdate((current) => ({
                        ...current,
                        abilities: {
                          ...current.abilities,
                          [key]: {
                            ...current.abilities[key],
                            value: Number(event.target.value) || 0,
                          },
                        },
                      }))
                    }
                  />
                </label>
              );
            })}
          </div>
        </section>

        <section className={`${styles.panel} ${styles.compactPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Attacks</p>
              <h2>Weapons</h2>
            </div>
            <button className={styles.addButton} onClick={addAttack} type="button">
              Add weapon
            </button>
          </div>
          <div className={styles.repeatableList}>
            {sheet.attacks.map((attack, index) => (
              <div key={`attack-${index}`} className={styles.repeatableCard}>
                <div className={styles.repeatableHeader}>
                  <div />
                  <button
                    aria-label={`Remove weapon ${attack.name || index + 1}`}
                    className={styles.iconButton}
                    onClick={() =>
                      applyUpdate((current) => ({
                        ...current,
                        attacks: current.attacks.filter(
                          (_, attackIndex) => attackIndex !== index,
                        ),
                      }))
                    }
                    type="button"
                  >
                    ×
                  </button>
                </div>
                <div className={styles.attackFields}>
                  <label className={styles.field}>
                    <span>Name</span>
                    <input
                      value={attack.name}
                      onChange={(event) =>
                        applyUpdate((current) => ({
                          ...current,
                          attacks: current.attacks.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, name: event.target.value }
                              : entry,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Damage</span>
                    <input
                      value={attack.damage}
                      onChange={(event) =>
                        applyUpdate((current) => ({
                          ...current,
                          attacks: current.attacks.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, damage: event.target.value }
                              : entry,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Stat</span>
                    <input
                      value={attack.stat}
                      onChange={(event) =>
                        applyUpdate((current) => ({
                          ...current,
                          attacks: current.attacks.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, stat: event.target.value }
                              : entry,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Range</span>
                    <input
                      value={attack.range}
                      onChange={(event) =>
                        applyUpdate((current) => ({
                          ...current,
                          attacks: current.attacks.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, range: event.target.value }
                              : entry,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className={`${styles.panel} ${styles.compactPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Features</p>
              <h2>Traits and feats</h2>
            </div>
          </div>
          <div className={styles.stack}>
            <div className={styles.subsection}>
              <div className={styles.subsectionHeader}>
                <p className={styles.cardLabel}>Species traits</p>
                <button className={styles.addButton} onClick={addTrait} type="button">
                  Add trait
                </button>
              </div>
              <div className={styles.repeatableList}>
                {sheet.traits.map((trait, index) => (
                  <div key={`trait-${index}`} className={styles.repeatableCard}>
                    <div className={styles.repeatableHeader}>
                      <div />
                      <button
                        aria-label={`Remove trait ${trait.title || index + 1}`}
                        className={styles.iconButton}
                        onClick={() =>
                          applyUpdate((current) => ({
                            ...current,
                            traits: current.traits.filter(
                              (_, traitIndex) => traitIndex !== index,
                            ),
                          }))
                        }
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                    <div className={styles.stack}>
                      <label className={styles.field}>
                        <span>Title</span>
                        <input
                          value={trait.title}
                          onChange={(event) =>
                            applyUpdate((current) => ({
                              ...current,
                              traits: current.traits.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, title: event.target.value }
                                  : entry,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Description</span>
                        <textarea
                          rows={3}
                          value={trait.description}
                          onChange={(event) =>
                            applyUpdate((current) => ({
                              ...current,
                              traits: current.traits.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? {
                                      ...entry,
                                      description: event.target.value,
                                    }
                                  : entry,
                              ),
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.subsection}>
              <div className={styles.subsectionHeader}>
                <p className={styles.cardLabel}>Feats</p>
                <button className={styles.addButton} onClick={addFeat} type="button">
                  Add feat
                </button>
              </div>
              <div className={styles.repeatableList}>
                {sheet.feats.map((feat, index) => (
                  <div key={`feat-${index}`} className={styles.repeatableCard}>
                    <div className={styles.repeatableHeader}>
                      <div />
                      <button
                        aria-label={`Remove feat ${feat.title || index + 1}`}
                        className={styles.iconButton}
                        onClick={() =>
                          applyUpdate((current) => ({
                            ...current,
                            feats: current.feats.filter(
                              (_, featIndex) => featIndex !== index,
                            ),
                          }))
                        }
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                    <div className={styles.stack}>
                      <label className={styles.field}>
                        <span>Title</span>
                        <input
                          value={feat.title}
                          onChange={(event) =>
                            applyUpdate((current) => ({
                              ...current,
                              feats: current.feats.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, title: event.target.value }
                                  : entry,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Description</span>
                        <textarea
                          rows={3}
                          value={feat.description}
                          onChange={(event) =>
                            applyUpdate((current) => ({
                              ...current,
                              feats: current.feats.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? {
                                      ...entry,
                                      description: event.target.value,
                                    }
                                  : entry,
                              ),
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.panel} ${styles.compactPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Inventory</p>
              <h2>Equipment and coin pouch</h2>
            </div>
            <button
              className={styles.addButton}
              onClick={addEquipment}
              type="button"
            >
              Add item
            </button>
          </div>
          <div className={styles.stack}>
            <div className={styles.repeatableList}>
              {sheet.equipment.map((item, index) => (
                <div key={`equipment-${index}`} className={styles.repeatableCard}>
                  <div className={styles.repeatableHeader}>
                    <div />
                    <button
                      aria-label={`Remove equipment ${item.name || index + 1}`}
                      className={styles.iconButton}
                      onClick={() =>
                        applyUpdate((current) => ({
                          ...current,
                          equipment: current.equipment.filter(
                            (_, equipmentIndex) => equipmentIndex !== index,
                          ),
                        }))
                      }
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.equipmentFields}>
                    <label className={styles.field}>
                      <span>Name</span>
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
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Count</span>
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
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.coins}>
              {(
                Object.entries(sheet.coins) as [
                  keyof CharacterSheet["coins"],
                  string,
                ][]
              ).map(([coin, value]) => (
                <label key={coin} className={styles.coinField}>
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
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className={`${styles.panel} ${styles.notesPanel}`}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.eyebrow}>Notes</p>
            <h2>Scratchpad</h2>
          </div>
        </div>
        <label className={styles.field}>
          <span>Freeform notes</span>
          <textarea
            rows={3}
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
    </main>
  );
}
