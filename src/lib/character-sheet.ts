export type AbilityKey =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

export type Ability = {
  label: string;
  value: number;
  bonus: number;
};

export type CombatStat = {
  label: string;
  value: string;
};

export type Attack = {
  name: string;
  damage: string;
  stat: string;
  range: string;
};

export type DetailEntry = {
  title: string;
  description: string;
};

export type EquipmentItem = {
  name: string;
  count: string;
  description: string;
  category: string;
};

export type TrackerItem = {
  name: string;
  current: string;
  max: string;
};

export type NpcNote = {
  name: string;
  notes: string;
};

export type JournalEntry = {
  title: string;
  content: string;
  createdAt: string;
  tags: string[];
  pinned: boolean;
};

export type PanelId =
  | "combat"
  | "abilities"
  | "trackers"
  | "weapons"
  | "features";

export type PanelLayoutItem = {
  id: PanelId;
  span: 1 | 2;
};

export type CharacterSheet = {
  hero: {
    name: string;
    ancestry: string;
    background: string;
    className: string;
    subclass: string;
    level: string;
    xp: string;
    alignment: string;
  };
  combat: CombatStat[];
  abilities: Record<AbilityKey, Ability>;
  attacks: Attack[];
  traits: DetailEntry[];
  feats: DetailEntry[];
  equipment: EquipmentItem[];
  npcs: NpcNote[];
  journalEntries: JournalEntry[];
  proficiencies: {
    armor: string[];
    weapons: string[];
    tools: string[];
  };
  languages: string[];
  attunement: string[];
  trackers: TrackerItem[];
  coins: {
    cp: string;
    sp: string;
    ep: string;
    gp: string;
    pp: string;
  };
  notes: string;
  journal: string;
  layout: {
    items: PanelLayoutItem[];
  };
  meta: {
    updatedAt: string;
  };
};

const abilityKeys: AbilityKey[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

const panelIds: PanelId[] = [
  "combat",
  "abilities",
  "trackers",
  "weapons",
  "features",
];

const defaultItems: PanelLayoutItem[] = [
  { id: "combat", span: 1 },
  { id: "abilities", span: 1 },
  { id: "trackers", span: 1 },
  { id: "weapons", span: 1 },
  { id: "features", span: 1 },
];

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return isString(value) ? value : "";
}

function normalizeDetailEntry(value: unknown): DetailEntry | null {
  if (isString(value)) {
    const [title, ...rest] = value
      .split("\n")
      .map((part) => part.trim())
      .filter(Boolean);

    return {
      title: title ?? "",
      description: rest.join("\n"),
    };
  }

  if (!isObject(value)) {
    return null;
  }

  return {
    title: asString(value.title),
    description: asString(value.description),
  };
}

function normalizeEquipmentItem(value: unknown): EquipmentItem | null {
  if (isString(value)) {
    const match = value.match(/^(\d+)\s+(.+)$/);

    if (match) {
      return {
        count: match[1],
        name: match[2],
        description: "",
        category: "gear",
      };
    }

    return {
      count: "",
      name: value,
      description: "",
      category: "gear",
    };
  }

  if (!isObject(value)) {
    return null;
  }

  return {
    name: asString(value.name),
    count: asString(value.count),
    description: asString(value.description),
    category: asString(value.category) || "gear",
  };
}

function normalizeAttack(value: unknown): Attack | null {
  if (!isObject(value)) {
    return null;
  }

  return {
    name: asString(value.name),
    damage: asString(value.damage),
    stat: asString(value.stat),
    range: asString(value.range),
  };
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(asString).filter(Boolean);
}

function normalizeTracker(value: unknown): TrackerItem | null {
  if (!isObject(value)) {
    return null;
  }

  return {
    name: asString(value.name),
    current: asString(value.current),
    max: asString(value.max),
  };
}

function normalizeNpcNote(value: unknown): NpcNote | null {
  if (!isObject(value)) {
    return null;
  }

  return {
    name: asString(value.name),
    notes: asString(value.notes),
  };
}

function normalizeJournalEntry(value: unknown): JournalEntry | null {
  if (!isObject(value)) {
    return null;
  }

  return {
    title: asString(value.title),
    content: asString(value.content),
    createdAt: asString(value.createdAt) || new Date(0).toISOString(),
    tags: normalizeStringList(value.tags).map((tag) => tag.trim()).filter(Boolean),
    pinned: value.pinned === true,
  };
}

function normalizeLayout(value: unknown) {
  const items = isObject(value) && Array.isArray(value.items) ? value.items : [];
  const columns = isObject(value) && Array.isArray(value.columns) ? value.columns : [];
  const seen = new Set<PanelId>();

  const normalizedItems = items
    .map((item) => {
      if (!isObject(item) || !isString(item.id) || !panelIds.includes(item.id as PanelId)) {
        return null;
      }

      const panelId = item.id as PanelId;
      if (seen.has(panelId)) {
        return null;
      }

      seen.add(panelId);

      return {
        id: panelId,
        span: item.span === 2 ? 2 : 1,
      } satisfies PanelLayoutItem;
    })
    .filter((item): item is PanelLayoutItem => item !== null);

  if (normalizedItems.length > 0) {
    const missing = defaultItems.filter((item) => !seen.has(item.id));
    return {
      items: [...normalizedItems, ...missing],
    };
  }

  const flattenedColumns = columns.flatMap((column) =>
    Array.isArray(column) ? column : [],
  );

  for (const panelId of flattenedColumns) {
    if (!isString(panelId) || !panelIds.includes(panelId as PanelId)) {
      continue;
    }

    const typedPanelId = panelId as PanelId;
    if (seen.has(typedPanelId)) {
      continue;
    }

    seen.add(typedPanelId);
    normalizedItems.push({ id: typedPanelId, span: 1 });
  }

  const missing = defaultItems.filter((item) => !seen.has(item.id));
  return {
    items: [...normalizedItems, ...missing],
  };
}

export function normalizeCharacterSheet(value: unknown): CharacterSheet | null {
  if (!isObject(value)) {
    return null;
  }

  const hero = isObject(value.hero) ? value.hero : {};
  const coins = isObject(value.coins) ? value.coins : {};
  const abilities = isObject(value.abilities) ? value.abilities : {};
  const meta = isObject(value.meta) ? value.meta : {};
  const layout = normalizeLayout(isObject(value.layout) ? value.layout : null);
  const proficiencies = isObject(value.proficiencies) ? value.proficiencies : {};

  const normalizedAbilities = {} as Record<AbilityKey, Ability>;

  for (const key of abilityKeys) {
    const ability = isObject(abilities[key]) ? abilities[key] : {};
    const numericValue =
      typeof ability.value === "number"
        ? ability.value
        : Number(ability.value) || 0;

    normalizedAbilities[key] = {
      label: asString(ability.label) || key[0].toUpperCase() + key.slice(1),
      value: numericValue,
      bonus:
        typeof ability.bonus === "number"
          ? ability.bonus
          : Number(ability.bonus) || 0,
    };
  }

  const combat = Array.isArray(value.combat)
    ? value.combat
        .map((entry) => {
          if (!isObject(entry)) {
            return null;
          }

          return {
            label: asString(entry.label),
            value: asString(entry.value),
          };
        })
        .filter((entry): entry is CombatStat => entry !== null)
    : [];

  const attacks = Array.isArray(value.attacks)
    ? value.attacks
        .map(normalizeAttack)
        .filter((entry): entry is Attack => entry !== null)
    : [];

  const traits = Array.isArray(value.traits)
    ? value.traits
        .map(normalizeDetailEntry)
        .filter((entry): entry is DetailEntry => entry !== null)
    : [];

  const feats = Array.isArray(value.feats)
    ? value.feats
        .map(normalizeDetailEntry)
        .filter((entry): entry is DetailEntry => entry !== null)
    : [];

  const equipment = Array.isArray(value.equipment)
    ? value.equipment
        .map(normalizeEquipmentItem)
        .filter((entry): entry is EquipmentItem => entry !== null)
    : [];

  const npcs = Array.isArray(value.npcs)
    ? value.npcs
        .map(normalizeNpcNote)
        .filter((entry): entry is NpcNote => entry !== null)
    : [];

  const journalEntries = Array.isArray(value.journalEntries)
    ? value.journalEntries
        .map(normalizeJournalEntry)
        .filter((entry): entry is JournalEntry => entry !== null)
    : [];

  const trackers = Array.isArray(value.trackers)
    ? value.trackers
        .map(normalizeTracker)
        .filter((entry): entry is TrackerItem => entry !== null)
    : [];

  return {
    hero: {
      name: asString(hero.name),
      ancestry: asString(hero.ancestry),
      background: asString(hero.background),
      className: asString(hero.className),
      subclass: asString(hero.subclass),
      level: asString(hero.level),
      xp: asString(hero.xp),
      alignment: asString(hero.alignment),
    },
    combat,
    abilities: normalizedAbilities,
    attacks,
    traits,
    feats,
    equipment,
    npcs,
    journalEntries,
    proficiencies: {
      armor: normalizeStringList(proficiencies.armor),
      weapons: normalizeStringList(proficiencies.weapons),
      tools: normalizeStringList(proficiencies.tools),
    },
    languages: normalizeStringList(value.languages),
    attunement: normalizeStringList(value.attunement),
    trackers,
    coins: {
      cp: asString(coins.cp),
      sp: asString(coins.sp),
      ep: asString(coins.ep),
      gp: asString(coins.gp),
      pp: asString(coins.pp),
    },
    notes: asString(value.notes),
    journal: asString(value.journal),
    layout,
    meta: {
      updatedAt: asString(meta.updatedAt) || new Date(0).toISOString(),
    },
  };
}

export function isCharacterSheet(value: unknown): value is CharacterSheet {
  return normalizeCharacterSheet(value) !== null;
}
