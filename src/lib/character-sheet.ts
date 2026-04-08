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
};

export type CharacterSheet = {
  hero: {
    name: string;
    ancestry: string;
    background: string;
    className: string;
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
  coins: {
    cp: string;
    sp: string;
    ep: string;
    gp: string;
    pp: string;
  };
  notes: string;
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
      };
    }

    return {
      count: "",
      name: value,
    };
  }

  if (!isObject(value)) {
    return null;
  }

  return {
    name: asString(value.name),
    count: asString(value.count),
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

export function normalizeCharacterSheet(value: unknown): CharacterSheet | null {
  if (!isObject(value)) {
    return null;
  }

  const hero = isObject(value.hero) ? value.hero : {};
  const coins = isObject(value.coins) ? value.coins : {};
  const abilities = isObject(value.abilities) ? value.abilities : {};
  const meta = isObject(value.meta) ? value.meta : {};

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

  return {
    hero: {
      name: asString(hero.name),
      ancestry: asString(hero.ancestry),
      background: asString(hero.background),
      className: asString(hero.className),
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
    coins: {
      cp: asString(coins.cp),
      sp: asString(coins.sp),
      ep: asString(coins.ep),
      gp: asString(coins.gp),
      pp: asString(coins.pp),
    },
    notes: asString(value.notes),
    meta: {
      updatedAt: asString(meta.updatedAt) || new Date(0).toISOString(),
    },
  };
}

export function isCharacterSheet(value: unknown): value is CharacterSheet {
  return normalizeCharacterSheet(value) !== null;
}
